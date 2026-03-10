"""
Tests for Patient model.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the Patient model.
"""

from datetime import date, datetime

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.db import IntegrityError

pytestmark = pytest.mark.django_db


@pytest.mark.unit
class TestPatientModel:
    """Test Patient model functionality."""

    def test_patient_creation_with_required_fields(self):
        """Test creating a patient with all required fields."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        assert patient.id is not None
        assert patient.first_name == "John"
        assert patient.last_name == "Doe"
        assert patient.date_of_birth == date(1990, 1, 1)
        assert patient.gender == "M"
        assert patient.mrn is not None  # MRN should be auto-generated

    def test_mrn_auto_generation(self):
        """Test that MRN is automatically generated for new patients."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth=date(1985, 5, 15),
            gender="F",
        )

        assert patient.mrn is not None
        assert len(patient.mrn) > 0
        # MRN should follow format: MRN-YYYYMMDD-XXXX
        assert patient.mrn.startswith("MRN-")

    def test_mrn_uniqueness(self):
        """Test that MRN must be unique."""
        from hmis.apps.patients.models import Patient

        patient1 = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        # Trying to create another patient with the same MRN should fail
        with pytest.raises(IntegrityError):
            Patient.objects.create(
                first_name="Jane",
                last_name="Smith",
                date_of_birth=date(1985, 5, 15),
                gender="F",
                mrn=patient1.mrn,
            )

    def test_patient_full_name(self):
        """Test the full_name property."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        assert patient.full_name == "John Doe"

    def test_patient_age_calculation(self):
        """Test the age property calculates age correctly."""
        from hmis.apps.patients.models import Patient

        # Create a patient born 30 years ago
        birth_date = date(datetime.now().year - 30, 1, 1)
        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=birth_date,
            gender="M",
        )

        assert patient.age == 30

    def test_gender_validation(self, sample_county, sample_sub_county):
        """Test that gender field only accepts valid choices."""
        from hmis.apps.patients.models import Patient

        # Valid genders should work
        for gender in ["M", "F", "O"]:
            patient = Patient(
                first_name="Test",
                last_name="Patient",
                date_of_birth=date(1990, 1, 1),
                gender=gender,
                county=sample_county,
                sub_county=sample_sub_county,
            )
            patient.full_clean()  # Should not raise

    def test_invalid_gender_raises_error(self, sample_county, sample_sub_county):
        """Test that invalid gender raises validation error."""
        from hmis.apps.patients.models import Patient

        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="X",  # Invalid gender
            county=sample_county,
            sub_county=sample_sub_county,
        )

        with pytest.raises(ValidationError):
            patient.full_clean()

    def test_optional_fields(self):
        """Test that optional fields can be null/blank."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            # Optional fields not provided
        )

        assert patient.middle_name is None or patient.middle_name == ""
        assert patient.phone_number is None or patient.phone_number == ""
        assert patient.email is None or patient.email == ""
        assert patient.address is None or patient.address == ""
        assert patient.national_id is None or patient.national_id == ""

    def test_patient_with_optional_fields(self):
        """Test creating patient with all optional fields."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            middle_name="Michael",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            phone_number="+254712345678",
            email="john.doe@example.com",
            address="123 Main St, Nairobi",
            national_id="12345678",
        )

        assert patient.middle_name == "Michael"
        assert patient.phone_number == "+254712345678"
        assert patient.email == "john.doe@example.com"
        assert patient.address == "123 Main St, Nairobi"
        assert patient.national_id == "12345678"

    def test_patient_str_representation(self):
        """Test the string representation of patient."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        assert str(patient) == f"{patient.mrn} - John Doe"

    def test_patient_timestamps(self):
        """Test that created_at and updated_at are set automatically."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        assert patient.created_at is not None
        assert patient.updated_at is not None
        assert patient.created_at <= patient.updated_at

    def test_patient_update_timestamps(self):
        """Test that updated_at changes when patient is updated."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        original_updated_at = patient.updated_at

        # Update patient
        patient.phone_number = "+254712345678"
        patient.save()

        assert patient.updated_at > original_updated_at

    def test_date_of_birth_not_in_future(self):
        """Test that date of birth cannot be in the future."""
        from hmis.apps.patients.models import Patient

        future_date = date(datetime.now().year + 1, 1, 1)
        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth=future_date,
            gender="M",
        )

        with pytest.raises(ValidationError):
            patient.full_clean()

    def test_email_validation(self):
        """Test that email field validates email format."""
        from hmis.apps.patients.models import Patient

        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            email="invalid-email",  # Invalid email format
        )

        with pytest.raises(ValidationError):
            patient.full_clean()

    def test_multiple_patients_different_mrns(self):
        """Test that multiple patients get different MRNs."""
        from hmis.apps.patients.models import Patient

        patient1 = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        patient2 = Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth=date(1985, 5, 15),
            gender="F",
        )

        assert patient1.mrn != patient2.mrn
