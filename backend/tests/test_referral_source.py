"""
Tests for Referral Source tracking - Sprint 0.7

Following TDD principles: Write tests FIRST, then implement.
Item f) Track how patients were referred to the facility
"""

import pytest
from django.core.exceptions import ValidationError


@pytest.mark.django_db
class TestReferralSourceModel:
    """Test suite for referral source fields in Patient model."""

    def test_patient_has_referral_source_field(self):
        """Test that Patient model has referral_source field."""
        from hmis.apps.patients.models import Patient

        assert hasattr(Patient, "referral_source")

    def test_patient_has_referred_from_facility_field(self):
        """Test that Patient model has referred_from_facility field."""
        from hmis.apps.patients.models import Patient

        assert hasattr(Patient, "referred_from_facility")

    def test_referral_source_choices(self, sample_county, sample_sub_county):
        """Test valid referral source choices."""
        from hmis.apps.patients.models import Patient

        # Test 'self' and 'clinic' without facility
        for choice in ["self", "clinic"]:
            patient = Patient(
                first_name="Test",
                last_name="Patient",
                date_of_birth="1990-01-01",
                gender="M",
                referral_source=choice,
                county=sample_county,
                sub_county=sample_sub_county,
            )
            patient.full_clean()  # Should not raise

        # Test 'other_facility' with facility name
        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            referral_source="other_facility",
            referred_from_facility="Some Hospital",
            county=sample_county,
            sub_county=sample_sub_county,
        )
        patient.full_clean()  # Should not raise

    def test_referral_source_default_is_self(self, sample_county, sample_sub_county):
        """Test referral source defaults to 'self'."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        assert patient.referral_source == "self"

    def test_referred_from_facility_optional_when_self(self, sample_county, sample_sub_county):
        """Test referred_from_facility is optional when referral_source is 'self'."""
        from hmis.apps.patients.models import Patient

        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            referral_source="self",
            referred_from_facility="",
            county=sample_county,
            sub_county=sample_sub_county,
        )
        patient.full_clean()  # Should not raise

    def test_referred_from_facility_required_when_other_facility(
        self, sample_county, sample_sub_county
    ):
        """Test referred_from_facility required when referral_source is 'other_facility'."""
        from hmis.apps.patients.models import Patient

        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            referral_source="other_facility",
            referred_from_facility="",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        with pytest.raises(ValidationError) as exc_info:
            patient.full_clean()

        assert "referred_from_facility" in str(exc_info.value)

    def test_referred_from_facility_with_valid_facility_name(
        self, sample_county, sample_sub_county
    ):
        """Test creating patient with valid facility name."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            referral_source="other_facility",
            referred_from_facility="Kenyatta National Hospital",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        assert patient.referred_from_facility == "Kenyatta National Hospital"


@pytest.mark.django_db
class TestReferralSourceAPI:
    """Test suite for referral source via API."""

    def test_create_patient_with_referral_source_self(
        self, authenticated_client, sample_county, sample_sub_county
    ):
        """Test creating patient with self referral."""
        data = {
            "first_name": "Self",
            "last_name": "Referral",
            "date_of_birth": "1990-01-01",
            "gender": "M",
            "referral_source": "self",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        response = authenticated_client.post("/api/patients/", data, format="json")

        assert response.status_code == 201
        assert response.data["referral_source"] == "self"

    def test_create_patient_with_clinic_referral(
        self, authenticated_client, sample_county, sample_sub_county
    ):
        """Test creating patient with clinic referral."""
        data = {
            "first_name": "Clinic",
            "last_name": "Referral",
            "date_of_birth": "1990-01-01",
            "gender": "F",
            "referral_source": "clinic",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        response = authenticated_client.post("/api/patients/", data, format="json")

        assert response.status_code == 201
        assert response.data["referral_source"] == "clinic"

    def test_create_patient_with_other_facility_referral(
        self, authenticated_client, sample_county, sample_sub_county
    ):
        """Test creating patient referred from another facility."""
        data = {
            "first_name": "Facility",
            "last_name": "Referral",
            "date_of_birth": "1990-01-01",
            "gender": "M",
            "referral_source": "other_facility",
            "referred_from_facility": "Moi Teaching Hospital",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        response = authenticated_client.post("/api/patients/", data, format="json")

        assert response.status_code == 201
        assert response.data["referral_source"] == "other_facility"
        assert response.data["referred_from_facility"] == "Moi Teaching Hospital"

    def test_api_requires_facility_when_other_facility(
        self, authenticated_client, sample_county, sample_sub_county
    ):
        """Test API validation: facility required when referral_source is 'other_facility'."""
        data = {
            "first_name": "Missing",
            "last_name": "Facility",
            "date_of_birth": "1990-01-01",
            "gender": "F",
            "referral_source": "other_facility",
            "referred_from_facility": "",  # Missing facility name
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        response = authenticated_client.post("/api/patients/", data, format="json")

        assert response.status_code == 400
        assert "referred_from_facility" in response.data

    def test_referral_source_in_patient_response(
        self, authenticated_client, sample_patient
    ):
        """Test referral source fields included in patient response."""
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/")

        assert response.status_code == 200
        assert "referral_source" in response.data
        assert "referred_from_facility" in response.data
