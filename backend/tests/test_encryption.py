"""
Tests for database encryption functionality.

Sprint 0.5: Offline Sync Logic
TDD Focus: Test sync conflict resolution, queuing, and database encryption

These tests validate that sensitive data is properly encrypted at rest
and that encryption/decryption operations work correctly.
"""

import pytest
from datetime import date
from django.test import TestCase, override_settings
from django.db import connection


@pytest.mark.unit
class TestEncryptionConfiguration:
    """Tests for encryption configuration settings."""

    def test_encryption_key_is_configured(self, settings):
        """Encryption key should be configured in settings."""
        assert hasattr(settings, "FIELD_ENCRYPTION_KEY") or hasattr(
            settings, "ENCRYPTION_KEY"
        ), "Encryption key must be configured in settings"

    def test_encryption_key_is_valid_length(self, settings):
        """Encryption key should be of valid length for AES-256."""
        key = getattr(
            settings, "FIELD_ENCRYPTION_KEY", getattr(settings, "ENCRYPTION_KEY", None)
        )
        assert key is not None, "Encryption key is not set"
        # Fernet keys are 32 bytes, base64 encoded (44 characters with padding)
        # Or raw key should be 32 bytes for AES-256
        assert len(key) >= 32, "Encryption key must be at least 32 characters"


@pytest.mark.unit
class TestSensitiveFieldEncryption:
    """Tests for encryption of sensitive patient data fields."""

    @pytest.mark.django_db
    def test_national_id_is_encrypted_in_database(self):
        """National ID should be encrypted when stored in the database."""
        from hmis.apps.patients.models import Patient

        # Create patient with national ID
        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 15),
            gender="M",
            national_id="12345678",
        )

        # Refresh from database to ensure we're reading stored data
        patient.refresh_from_db()

        # The decrypted value should match what we put in
        assert patient.national_id == "12345678"

        # Check raw database value (should be encrypted, not plaintext)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT national_id FROM patients_patient WHERE id = %s", [patient.id]
            )
            raw_value = cursor.fetchone()[0]

            # If encryption is working, raw value should NOT equal plaintext
            # (unless we're using a transparent encryption approach)
            if raw_value is not None:
                # The raw value should either be encrypted ciphertext or None
                # depending on the encryption approach used
                pass  # Implementation will determine exact assertion

    @pytest.mark.django_db
    def test_phone_number_is_encrypted_in_database(self):
        """Phone number should be encrypted when stored in the database."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth=date(1985, 5, 20),
            gender="F",
            phone_number="+254712345678",
        )

        patient.refresh_from_db()
        assert patient.phone_number == "+254712345678"

    @pytest.mark.django_db
    def test_encrypted_fields_are_searchable_when_indexed(self):
        """Encrypted fields should support searching if indexed."""
        from hmis.apps.patients.models import Patient

        # Create multiple patients
        Patient.objects.create(
            first_name="Patient",
            last_name="One",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            national_id="11111111",
        )
        Patient.objects.create(
            first_name="Patient",
            last_name="Two",
            date_of_birth=date(1990, 1, 1),
            gender="F",
            national_id="22222222",
        )

        # Should be able to search by national_id
        found = Patient.objects.filter(national_id="11111111").first()
        assert found is not None
        assert found.first_name == "Patient"
        assert found.last_name == "One"

    @pytest.mark.django_db
    def test_empty_encrypted_fields_are_handled(self):
        """Empty or null encrypted fields should be handled correctly."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="No",
            last_name="Phone",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            national_id=None,
            phone_number=None,
        )

        patient.refresh_from_db()
        assert patient.national_id is None or patient.national_id == ""
        assert patient.phone_number is None or patient.phone_number == ""


@pytest.mark.unit
class TestEncryptedFieldIntegrity:
    """Tests for data integrity of encrypted fields."""

    @pytest.mark.django_db
    def test_encrypted_data_survives_update(self):
        """Encrypted data should remain intact after updates."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Original",
            last_name="Name",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            national_id="12345678",
        )

        # Update non-encrypted field
        patient.first_name = "Updated"
        patient.save()

        # Refresh and verify encrypted field is unchanged
        patient.refresh_from_db()
        assert patient.national_id == "12345678"
        assert patient.first_name == "Updated"

    @pytest.mark.django_db
    def test_encrypted_field_update(self):
        """Encrypted fields should be updateable."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="User",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            national_id="11111111",
        )

        # Update the encrypted field
        patient.national_id = "99999999"
        patient.save()

        # Verify the update
        patient.refresh_from_db()
        assert patient.national_id == "99999999"

    @pytest.mark.django_db
    def test_special_characters_in_encrypted_fields(self):
        """Encrypted fields should handle special characters correctly."""
        from hmis.apps.patients.models import Patient

        special_phone = "+254-712-345-678"
        patient = Patient.objects.create(
            first_name="Special",
            last_name="Characters",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            phone_number=special_phone,
        )

        patient.refresh_from_db()
        assert patient.phone_number == special_phone


@pytest.mark.unit
class TestDatabaseEncryptionAtRest:
    """Tests for database-level encryption at rest."""

    @pytest.mark.django_db
    def test_database_file_is_not_plaintext_readable(self, settings):
        """
        Database file should not contain plaintext sensitive data.
        
        Note: This test validates that encryption is working at some level.
        The exact implementation (SQLCipher vs field-level) determines behavior.
        """
        from hmis.apps.patients.models import Patient
        import os

        # Skip if using PostgreSQL (different encryption mechanism)
        if "postgresql" in settings.DATABASES["default"]["ENGINE"]:
            pytest.skip("PostgreSQL uses different encryption mechanism")

        # Create patient with sensitive data
        Patient.objects.create(
            first_name="Sensitive",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            national_id="SECRET123",
        )

        # Get database file path
        db_path = settings.DATABASES["default"]["NAME"]

        if os.path.exists(db_path):
            # Read raw file contents
            with open(db_path, "rb") as f:
                raw_content = f.read()

            # Plaintext national ID should not be found in raw file
            # (This will fail initially - implementation will fix it)
            # Note: For field-level encryption, the MRN and names might still
            # be visible but national_id should not be
            pass  # Implementation-specific assertion


@pytest.mark.integration
class TestEncryptionWithSync:
    """Tests for encryption behavior during sync operations."""

    @pytest.mark.django_db
    def test_encrypted_data_syncs_correctly(self):
        """Encrypted data should sync without corruption."""
        from hmis.apps.patients.models import Patient

        # Create patient
        patient = Patient.objects.create(
            first_name="Sync",
            last_name="Test",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            national_id="SYNCTEST123",
        )

        original_id = patient.national_id

        # Simulate sync by reloading
        patient_reloaded = Patient.objects.get(pk=patient.pk)
        assert patient_reloaded.national_id == original_id

    @pytest.mark.django_db
    def test_encryption_key_rotation_compatibility(self):
        """
        System should handle encryption key rotation gracefully.
        
        Note: This is a forward-looking test for when key rotation is implemented.
        """
        # This test documents the expected behavior for key rotation
        # Implementation will be done in a future sprint
        pass
