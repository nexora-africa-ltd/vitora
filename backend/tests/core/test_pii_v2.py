# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for organization-scoped v2 PII encryption; run with pytest tests/core/test_pii_v2.py."""

from datetime import date

import pytest
from django.test import override_settings

from hmis.apps.core.kms.local import LocalKMSProvider
from hmis.apps.core.models import OrganizationPIIKeyVersion
from hmis.apps.core.pii_v2 import OrganizationPIIEncryptionService


@pytest.mark.django_db
class TestOrganizationPIIEncryptionService:
    """Organization DEKs are wrapped and used for authenticated encryption."""

    def test_encrypt_creates_wrapped_key_registry_and_round_trips(self, sample_organization):
        """The registry must retain wrapped key material, never plaintext keys."""
        provider = LocalKMSProvider.generate_key()
        service = OrganizationPIIEncryptionService(LocalKMSProvider(provider))

        ciphertext = service.encrypt(
            sample_organization,
            "secret",
            model_label="patients.patient",
            field_name="national_id",
        )

        key_version = OrganizationPIIKeyVersion.objects.get(organization=sample_organization)
        assert ciphertext.startswith("v2.")
        assert key_version.version == 1
        assert key_version.wrapped_dek != ""
        assert key_version.wrapped_hmac_key != ""
        assert "secret" not in key_version.wrapped_dek
        assert (
            service.decrypt(
                sample_organization,
                ciphertext,
                model_label="patients.patient",
                field_name="national_id",
            )
            == "secret"
        )

    def test_ciphertext_cannot_be_decrypted_for_another_field(self, sample_organization):
        """AAD binds v2 values to their organization, model, and field."""
        service = OrganizationPIIEncryptionService(
            LocalKMSProvider(LocalKMSProvider.generate_key())
        )
        ciphertext = service.encrypt(
            sample_organization,
            "secret",
            model_label="patients.patient",
            field_name="national_id",
        )

        with pytest.raises(ValueError, match="v2 PII ciphertext"):
            service.decrypt(
                sample_organization,
                ciphertext,
                model_label="patients.patient",
                field_name="phone_number",
            )

    def test_independently_wrapped_hub_key_package_decrypts_cloud_ciphertext(
        self, sample_organization
    ):
        """A hub must import the same DEK under its own KMS wrapping key."""
        from hmis.apps.core.pii_v2 import import_organization_pii_key_package

        cloud_provider = LocalKMSProvider(LocalKMSProvider.generate_key())
        cloud_service = OrganizationPIIEncryptionService(cloud_provider)
        ciphertext = cloud_service.encrypt(
            sample_organization,
            "shared-secret",
            model_label="patients.patient",
            field_name="national_id",
        )
        package = cloud_service.export_active_key_package(sample_organization)

        OrganizationPIIKeyVersion.objects.filter(organization=sample_organization).delete()
        hub_provider = LocalKMSProvider(LocalKMSProvider.generate_key())
        imported = import_organization_pii_key_package(sample_organization, package, hub_provider)
        hub_service = OrganizationPIIEncryptionService(hub_provider)

        assert imported.version == package["version"]
        assert imported.wrapped_dek != package["dek"]
        assert (
            hub_service.decrypt(
                sample_organization,
                ciphertext,
                model_label="patients.patient",
                field_name="national_id",
            )
            == "shared-secret"
        )

    def test_activation_seed_imports_package_before_writing_contact_pii(
        self, sample_organization, sample_facility
    ):
        """The seed path must install the hub wrapper before encrypted org fields are saved."""
        from hmis.apps.licensing.bootstrap import seed_from_activation_payload

        cloud_provider = LocalKMSProvider(LocalKMSProvider.generate_key())
        cloud_service = OrganizationPIIEncryptionService(cloud_provider)
        ciphertext = cloud_service.encrypt(
            sample_organization,
            "cloud-value",
            model_label="patients.patient",
            field_name="national_id",
        )
        package = cloud_service.export_active_key_package(sample_organization)
        OrganizationPIIKeyVersion.objects.filter(organization=sample_organization).delete()

        payload = {
            "tier": "FREE",
            "features": {},
            "organization": {
                "id": sample_organization.id,
                "name": sample_organization.name,
                "slug": sample_organization.slug,
                "contact_email": "hub@example.test",
                "contact_phone": "+254700000001",
            },
            "facility": {
                "id": sample_facility.id,
                "name": sample_facility.name,
                "mfl_code": sample_facility.mfl_code,
                "level": sample_facility.level,
                "ownership": sample_facility.ownership,
                "county_id": sample_facility.county_id,
                "sub_county_id": sample_facility.sub_county_id,
                "modules": {},
            },
        }
        organization, _ = seed_from_activation_payload(payload, package)

        assert organization.contact_email == "hub@example.test"
        assert (
            OrganizationPIIEncryptionService().decrypt(
                organization,
                ciphertext,
                model_label="patients.patient",
                field_name="national_id",
            )
            == "cloud-value"
        )

    def test_hmac_candidates_include_active_and_retired_key_versions(self, sample_organization):
        """Lookup candidates must retain retired key indexes during key rotation."""
        provider = LocalKMSProvider(LocalKMSProvider.generate_key())
        service = OrganizationPIIEncryptionService(provider)
        old_hmac = service.compute_hmac(sample_organization, "12345678")
        package = service.export_active_key_package(sample_organization)
        package["version"] = 2
        package["hmac_key"] = service._encode(b"x" * 32)

        from hmis.apps.core.pii_v2 import import_organization_pii_key_package

        import_organization_pii_key_package(sample_organization, package, provider)
        candidates = service.hmac_candidates(sample_organization, "12345678")

        assert service.compute_hmac(sample_organization, "12345678") in candidates
        assert old_hmac in candidates
        assert len(candidates) == 2


@pytest.mark.django_db
class TestEncryptedPIIPropertyV2:
    """Tenant model properties write v2 and retain legacy v1 reads."""

    @override_settings(ORGANIZATION_PII_ENCRYPTION_ENABLED=True)
    def test_persisted_organization_patient_writes_v2(self, sample_organization):
        """A patient with a persisted organization must not receive a new v1 value."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="V2",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="F",
            organization=sample_organization,
            national_id="12345678",
        )

        patient.refresh_from_db()
        assert patient.national_id_encrypted.startswith("v2.")
        assert patient.national_id == "12345678"

    @override_settings(ORGANIZATION_PII_ENCRYPTION_ENABLED=True)
    def test_legacy_v1_ciphertext_remains_readable(self, sample_organization):
        """Existing Fernet ciphertext remains readable without data migration."""
        from hmis.apps.core.kms import get_kms_provider
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Legacy",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )
        patient.national_id_encrypted = get_kms_provider().encrypt_string("legacy-id")
        patient.save(update_fields=["national_id_encrypted"])

        patient.refresh_from_db()
        assert patient.national_id == "legacy-id"

    @override_settings(ORGANIZATION_PII_ENCRYPTION_ENABLED=True)
    def test_feature_gate_writes_organization_hmac_not_global_hmac(self, sample_organization):
        """New tenant PII indexes must not be derived from the global HMAC key."""
        from hmis.apps.core.kms import get_kms_provider
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Scoped",
            last_name="Index",
            date_of_birth=date(1990, 1, 1),
            gender="F",
            organization=sample_organization,
            national_id="12345678",
        )

        assert patient.national_id_hmac == OrganizationPIIEncryptionService().compute_hmac(
            sample_organization, "12345678"
        )
        assert patient.national_id_hmac != get_kms_provider().compute_hmac("12345678")
