"""
Tests for PII encryption infrastructure (Phase D — plaintext columns dropped).

Covers:
- KMS compute_hmac
- Patient encrypted property read/write
- EmergencyContact encrypted property read/write
- AuditLog PII redaction
"""

import pytest  # type: ignore

from hmis.apps.core.kms import get_kms_provider
from hmis.apps.core.models import AuditLog
from hmis.apps.core.pii import REDACTED_PII_FIELDS, redact_pii
from hmis.apps.patients.models import EmergencyContact, Patient

# ============================================================================
# KMS HMAC Tests
# ============================================================================


class TestKMSComputeHmac:
    """Tests for KMS provider compute_hmac method."""

    def test_hmac_deterministic(self, db):
        """Same input produces same HMAC."""
        kms = get_kms_provider()
        h1 = kms.compute_hmac("34221265")
        h2 = kms.compute_hmac("34221265")
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex digest

    def test_hmac_different_inputs(self, db):
        """Different inputs produce different HMACs."""
        kms = get_kms_provider()
        h1 = kms.compute_hmac("34221265")
        h2 = kms.compute_hmac("12345678")
        assert h1 != h2

    def test_hmac_returns_hex_string(self, db):
        kms = get_kms_provider()
        result = kms.compute_hmac("test_value")
        assert all(c in "0123456789abcdef" for c in result)


# ============================================================================
# Patient PII Encryption Tests (Phase D — property descriptors)
# ============================================================================


class TestPatientPIIEncryption:
    """Tests for Patient model encrypted PII property descriptors."""

    @pytest.fixture
    def patient_with_pii(
        self, db, sample_county, sample_sub_county, sample_organization, sample_facility
    ):
        return Patient.objects.create(
            first_name="Salome",
            last_name="Kungu",
            date_of_birth="1985-05-20",
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            registered_at_facility=sample_facility,
            identification_number="34221265",
            phone_number="0769005262",
            email="test@example.com",
            address="123 Test Street, Nairobi",
            national_id="34221265",
            principal_national_id="11111111",
        )

    def test_save_encrypts_identification_number(self, patient_with_pii):
        """identification_number_encrypted should be populated on save."""
        assert patient_with_pii.identification_number_encrypted != ""
        assert patient_with_pii.identification_number_encrypted != "34221265"

    def test_save_populates_hmac(self, patient_with_pii):
        """identification_number_hmac should be populated on save."""
        assert patient_with_pii.identification_number_hmac != ""
        assert len(patient_with_pii.identification_number_hmac) == 64

    def test_save_encrypts_phone_number(self, patient_with_pii):
        assert patient_with_pii.phone_number_encrypted != ""
        assert patient_with_pii.phone_number_hmac != ""

    def test_save_encrypts_email(self, patient_with_pii):
        assert patient_with_pii.email_encrypted != ""

    def test_save_encrypts_address(self, patient_with_pii):
        assert patient_with_pii.address_encrypted != ""

    def test_save_encrypts_national_id(self, patient_with_pii):
        assert patient_with_pii.national_id_encrypted != ""

    def test_save_encrypts_principal_national_id(self, patient_with_pii):
        assert patient_with_pii.principal_national_id_encrypted != ""

    def test_property_read_decrypts(self, patient_with_pii):
        """Property descriptors should decrypt on read."""
        patient_with_pii.refresh_from_db()
        assert patient_with_pii.identification_number == "34221265"
        assert patient_with_pii.phone_number == "0769005262"
        assert patient_with_pii.email == "test@example.com"
        assert patient_with_pii.address == "123 Test Street, Nairobi"
        assert patient_with_pii.national_id == "34221265"
        assert patient_with_pii.principal_national_id == "11111111"

    def test_encrypted_value_decrypts_to_original(self, patient_with_pii):
        """Encrypted value should decrypt back to the original plaintext."""
        kms = get_kms_provider()
        decrypted = kms.decrypt_string(patient_with_pii.identification_number_encrypted)
        assert decrypted == "34221265"

    def test_hmac_matches_direct_compute(self, patient_with_pii):
        """HMAC stored on model should match direct compute_hmac result."""
        kms = get_kms_provider()
        expected = kms.compute_hmac("34221265")
        assert patient_with_pii.identification_number_hmac == expected

    def test_empty_fields_not_encrypted(
        self, db, sample_county, sample_sub_county, sample_organization, sample_facility
    ):
        """Empty/null fields should leave encrypted columns empty."""
        patient = Patient.objects.create(
            first_name="Empty",
            last_name="Test",
            date_of_birth="1990-01-01",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )
        assert patient.identification_number_encrypted == ""
        assert patient.identification_number_hmac == ""
        assert patient.phone_number_encrypted == ""
        assert patient.email_encrypted == ""

    def test_no_plaintext_columns_at_rest(self, patient_with_pii):
        """Phase D: plaintext columns do not exist in the database."""
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute("PRAGMA table_info(patients_patient)")
            columns = {row[1] for row in cursor.fetchall()}
        # These columns should NOT exist
        assert "identification_number" not in columns
        assert "phone_number" not in columns
        assert "email" not in columns
        assert "address" not in columns
        assert "national_id" not in columns
        assert "principal_national_id" not in columns
        # These SHOULD exist
        assert "identification_number_encrypted" in columns
        assert "identification_number_hmac" in columns

    def test_update_reencrypts(self, patient_with_pii):
        """Updating a field should re-encrypt."""
        old_enc = patient_with_pii.identification_number_encrypted
        old_hmac = patient_with_pii.identification_number_hmac

        patient_with_pii.identification_number = "99999999"
        patient_with_pii.save()

        patient_with_pii.refresh_from_db()
        assert patient_with_pii.identification_number_encrypted != old_enc
        assert patient_with_pii.identification_number_hmac != old_hmac
        assert patient_with_pii.identification_number == "99999999"


# ============================================================================
# EmergencyContact PII Encryption Tests
# ============================================================================


class TestEmergencyContactPIIEncryption:
    """Tests for EmergencyContact model encrypted PII property descriptors."""

    @pytest.fixture
    def contact(self, db, sample_patient):
        return EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="John Doe",
            relationship="spouse",
            phone_number="0712345678",
            alternative_phone="0798765432",
        )

    def test_save_encrypts_phone(self, contact):
        assert contact.phone_number_encrypted != ""

    def test_save_encrypts_alternative_phone(self, contact):
        assert contact.alternative_phone_encrypted != ""

    def test_encrypted_decrypts_correctly(self, contact):
        kms = get_kms_provider()
        assert kms.decrypt_string(contact.phone_number_encrypted) == "0712345678"

    def test_property_read_decrypts(self, contact):
        """Property descriptor should decrypt on read."""
        contact.refresh_from_db()
        assert contact.phone_number == "0712345678"
        assert contact.alternative_phone == "0798765432"

    def test_empty_alternative_not_encrypted(self, db, sample_patient):
        contact = EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="Jane Doe",
            relationship="sibling",
            phone_number="0712345678",
        )
        assert contact.alternative_phone_encrypted == ""


# ============================================================================
# AuditLog PII Redaction Tests
# ============================================================================


class TestAuditLogPIIRedaction:
    """Tests for PII redaction in AuditLog details."""

    def test_redact_top_level_fields(self):
        details = {
            "identification_number": "34221265",
            "phone_number": "0769005262",
            "action": "patient_create",
        }
        result = redact_pii(details)
        assert result["identification_number"] == "[REDACTED]"
        assert result["phone_number"] == "[REDACTED]"
        assert result["action"] == "patient_create"  # non-PII preserved

    def test_redact_nested_old_new_values(self):
        details = {
            "old_values": {"phone_number": "0712345678"},
            "new_values": {"phone_number": "0798765432"},
        }
        result = redact_pii(details)
        assert result["old_values"]["phone_number"] == "[REDACTED]"
        assert result["new_values"]["phone_number"] == "[REDACTED]"

    def test_redact_changes_key(self):
        details = {
            "changes": {"email": "old@test.com", "name": "John"},
        }
        result = redact_pii(details)
        assert result["changes"]["email"] == "[REDACTED]"
        assert result["changes"]["name"] == "John"  # non-PII preserved

    def test_no_mutation_without_pii(self):
        details = {"action": "login", "mrn": "MRN-20260101-0001"}
        result = redact_pii(details)
        assert result == {"action": "login", "mrn": "MRN-20260101-0001"}

    def test_non_dict_returns_unchanged(self):
        assert redact_pii("not a dict") == "not a dict"

    def test_audit_log_create_redacts_pii(self, db, test_user):
        """AuditLog.log() should redact PII in stored details."""
        log = AuditLog.log(
            action="patient_update",
            user=test_user,
            resource_type="Patient",
            resource_id=1,
            details={
                "old_values": {"phone_number": "0712345678"},
                "new_values": {"phone_number": "0798765432"},
                "field": "phone_number",
            },
        )
        assert log.details["old_values"]["phone_number"] == "[REDACTED]"
        assert log.details["new_values"]["phone_number"] == "[REDACTED]"
        assert log.details["field"] == "phone_number"  # key name preserved

    def test_all_pii_fields_covered(self):
        """Verify all expected PII fields are in REDACTED_PII_FIELDS."""
        expected = {
            "identification_number",
            "phone_number",
            "email",
            "national_id",
            "address",
            "alternative_phone",
            "principal_national_id",
            "hwr_national_id",
            "mpesa_phone",
            "emergency_contact_phone",
        }
        assert expected <= REDACTED_PII_FIELDS
