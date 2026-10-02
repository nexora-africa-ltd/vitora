# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for generic v1-to-v2 PII migration; run with pytest tests/core/test_reencrypt_pii_v2_command.py.

Exercises all-model encrypted descriptor discovery with Patient, EmergencyContact,
and StaffProfile records.
"""

from datetime import date
from io import StringIO

import pytest
from django.core.management import call_command

from hmis.apps.core.kms import get_kms_provider
from hmis.apps.core.models import Organization, SubscriptionPlan
from hmis.apps.core.pii_v2 import OrganizationPIIEncryptionService
from hmis.apps.patients.models import EmergencyContact, Patient


@pytest.fixture(autouse=True)
def enable_organization_pii_encryption(settings):
    """Enable v2 writes while exercising the migration command."""
    settings.ORGANIZATION_PII_ENCRYPTION_ENABLED = True


def create_legacy_patient(organization):
    """Create a patient whose direct PII storage is legacy ciphertext."""
    patient = Patient.objects.create(
        first_name="Legacy",
        last_name="Patient",
        date_of_birth=date(1990, 1, 1),
        gender="F",
        organization=organization,
    )
    kms = get_kms_provider()
    patient.national_id_encrypted = kms.encrypt_string("12345678")
    patient.national_id_hmac = kms.compute_hmac("12345678")
    patient.save(update_fields=["national_id_encrypted", "national_id_hmac"])
    return patient


@pytest.mark.django_db
class TestReencryptPIIV2Command:
    """The generic command discovers descriptor-backed encrypted fields safely."""

    def test_migrates_patient_contact_and_staff_pii(self, sample_organization, test_staff_profile):
        """All supported direct, patient-related, and staff PII fields are migrated."""
        patient = create_legacy_patient(sample_organization)
        contact = EmergencyContact.objects.create(
            patient=patient,
            full_name="Contact Person",
            relationship="friend",
        )
        staff = test_staff_profile
        kms = get_kms_provider()
        contact.phone_number_encrypted = kms.encrypt_string("+254700000001")
        staff.hwr_national_id_encrypted = kms.encrypt_string("99887766")
        staff.hwr_national_id_hmac = kms.compute_hmac("99887766")
        contact.save(update_fields=["phone_number_encrypted"])
        staff.save(update_fields=["hwr_national_id_encrypted", "hwr_national_id_hmac"])

        call_command("reencrypt_pii_v2", "--batch-size", "1", stdout=StringIO())

        patient.refresh_from_db()
        contact.refresh_from_db()
        staff.refresh_from_db()
        service = OrganizationPIIEncryptionService()
        assert patient.national_id_encrypted.startswith("v2.")
        assert contact.phone_number_encrypted.startswith("v2.")
        assert staff.hwr_national_id_encrypted.startswith("v2.")
        assert staff.hwr_national_id_hmac == service.compute_hmac(sample_organization, "99887766")

    def test_dry_run_and_organization_filter_leave_nonmatching_records_unchanged(
        self, sample_organization
    ):
        """Dry runs persist nothing and the organization selector scopes work."""
        patient = create_legacy_patient(sample_organization)
        other = Organization.objects.create(
            name="Other Migration Organization",
            slug="other-migration-organization",
            subscription_plan=SubscriptionPlan.objects.get(code="TEST_ALL_FEATURES"),
        )
        other_patient = create_legacy_patient(other)
        original = patient.national_id_encrypted

        call_command("reencrypt_pii_v2", "--dry-run", stdout=StringIO())

        patient.refresh_from_db()
        assert patient.national_id_encrypted == original

        call_command(
            "reencrypt_pii_v2",
            "--organization",
            str(sample_organization.pk),
            stdout=StringIO(),
        )

        patient.refresh_from_db()
        other_patient.refresh_from_db()
        assert patient.national_id_encrypted.startswith("v2.")
        assert not other_patient.national_id_encrypted.startswith("v2.")

        resumed_output = StringIO()
        call_command(
            "reencrypt_pii_v2",
            "--organization",
            str(sample_organization.pk),
            stdout=resumed_output,
        )
        assert "Migrated 0 record(s); skipped " in resumed_output.getvalue()

    def test_skips_unresolvable_records_and_reports_aggregate_counts(self, sample_organization):
        """Records with legacy PII but no resolvable tenant must not be rewritten."""
        patient = Patient.objects.create(
            first_name="Unresolved",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )
        patient.national_id_encrypted = get_kms_provider().encrypt_string("11223344")
        patient.save(update_fields=["national_id_encrypted"])
        output = StringIO()

        call_command("reencrypt_pii_v2", stdout=output)

        patient.refresh_from_db()
        assert not patient.national_id_encrypted.startswith("v2.")
        assert "unresolvable record(s)" in output.getvalue()

    def test_skips_unsupported_ciphertext_without_outputting_its_value(self, sample_organization):
        """Unreadable storage is retained and reported only as an aggregate count."""
        patient = create_legacy_patient(sample_organization)
        patient.national_id_encrypted = "not-a-ciphertext"
        patient.save(update_fields=["national_id_encrypted"])
        output = StringIO()

        call_command("reencrypt_pii_v2", stdout=output)

        patient.refresh_from_db()
        assert patient.national_id_encrypted == "not-a-ciphertext"
        assert "unsupported record(s)" in output.getvalue()
        assert "not-a-ciphertext" not in output.getvalue()
