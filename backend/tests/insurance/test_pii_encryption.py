"""Tests for insurance PII encryption — member_number, policy_number, credentials."""

import pytest  # type: ignore

from hmis.apps.insurance.models import InsuranceProviderConfig, PatientInsurance


@pytest.mark.django_db
class TestPatientInsurancePIIEncryption:
    """Verify dual-write encryption of member_number and policy_number."""

    def test_save_encrypts_member_number(self, patient_insurance):
        """member_number_encrypted should be populated on save."""
        ins = patient_insurance
        ins.member_number = "MEM-12345"
        ins.save()
        ins.refresh_from_db()
        # Encrypted column is non-empty
        assert ins.member_number_encrypted != ""
        # Decrypt via property
        assert ins.member_number_pii == "MEM-12345"

    def test_save_encrypts_policy_number(self, patient_insurance):
        """policy_number_encrypted should be populated on save."""
        ins = patient_insurance
        ins.policy_number = "POL-99999"
        ins.save()
        ins.refresh_from_db()
        assert ins.policy_number_encrypted != ""
        assert ins.policy_number_pii == "POL-99999"

    def test_hmac_populated_for_member_number(self, patient_insurance):
        """member_number_hmac should be populated for lookups."""
        ins = patient_insurance
        ins.member_number = "HMAC-TEST-001"
        ins.save()
        ins.refresh_from_db()
        assert ins.member_number_hmac != ""
        # HMAC is deterministic
        from hmis.apps.core.kms import get_kms_provider

        expected_hmac = get_kms_provider().compute_hmac("HMAC-TEST-001")
        assert ins.member_number_hmac == expected_hmac

    def test_empty_member_number_clears_encrypted(self, patient_insurance):
        """Clearing member_number should clear encrypted fields."""
        ins = patient_insurance
        ins.member_number = "WILL-BE-CLEARED"
        ins.save()
        ins.refresh_from_db()
        assert ins.member_number_encrypted != ""
        # Now clear
        ins.member_number = ""
        ins.member_number_pii = ""
        ins.save()
        ins.refresh_from_db()
        assert ins.member_number_encrypted == ""
        assert ins.member_number_hmac == ""


@pytest.mark.django_db
class TestInsuranceProviderConfigCredentials:
    """Verify KMS-encrypted credential fields on InsuranceProviderConfig."""

    def test_encrypted_api_key_roundtrip(self, provider_config):
        """api_key property should encrypt/decrypt transparently."""
        config = provider_config
        config.api_key = "sk_test_abc123"
        config.save()
        config.refresh_from_db()
        assert config.api_key_encrypted != ""
        assert config.api_key == "sk_test_abc123"

    def test_encrypted_api_secret_roundtrip(self, provider_config):
        """api_secret property should encrypt/decrypt transparently."""
        config = provider_config
        config.api_secret = "secret_xyz789"
        config.save()
        config.refresh_from_db()
        assert config.api_secret_encrypted != ""
        assert config.api_secret == "secret_xyz789"

    def test_get_credentials_dict_from_encrypted_fields(self, provider_config):
        """get_credentials_dict should return decrypted values."""
        config = provider_config
        config.api_key = "key123"
        config.api_secret = "sec456"
        config.api_username = "user_test"
        config.api_password = "pass_test"
        config.save()
        config.refresh_from_db()

        creds = config.get_credentials_dict()
        assert creds == {
            "api_key": "key123",
            "api_secret": "sec456",
            "username": "user_test",
            "password": "pass_test",
        }

    def test_get_credentials_dict_fallback_to_legacy(self, provider_config):
        """Falls back to api_credentials JSONField when no encrypted fields set."""
        config = provider_config
        config.api_credentials = {"token": "legacy_token"}
        # Clear any encrypted fields
        config.api_key_encrypted = ""
        config.api_secret_encrypted = ""
        config.api_username_encrypted = ""
        config.api_password_encrypted = ""
        config.api_token_encrypted = ""
        config.save()
        config.refresh_from_db()

        creds = config.get_credentials_dict()
        assert creds == {"token": "legacy_token"}

    def test_encrypted_fields_take_precedence(self, provider_config):
        """Encrypted fields take precedence over legacy api_credentials."""
        config = provider_config
        config.api_credentials = {"api_key": "old_key"}
        config.api_key = "new_key"
        config.save()
        config.refresh_from_db()

        creds = config.get_credentials_dict()
        assert creds["api_key"] == "new_key"
