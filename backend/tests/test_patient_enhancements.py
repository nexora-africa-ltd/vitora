"""
Tests for DOB validation and registered_by tracking - Sprint 0.7

Following TDD principles: Write tests FIRST, then implement.
- Item d) DOB must not be in the future
- Item g) registered_by tracks which staff registered the patient
"""

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

User = get_user_model()


@pytest.mark.django_db
class TestDOBValidation:
    """Test suite for Date of Birth validation."""

    def test_valid_dob_in_past(self, sample_county, sample_sub_county):
        """Test that DOB in the past is valid."""
        from hmis.apps.patients.models import Patient

        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
        )
        # Should not raise
        patient.full_clean()

    def test_valid_dob_today(self, sample_county, sample_sub_county):
        """Test that DOB today (newborn) is valid."""
        from hmis.apps.patients.models import Patient

        patient = Patient(
            first_name="Newborn",
            last_name="Baby",
            date_of_birth=date.today(),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
        )
        # Should not raise
        patient.full_clean()

    def test_invalid_dob_in_future(self, sample_county, sample_sub_county):
        """Test that DOB in the future is invalid."""
        from hmis.apps.patients.models import Patient

        future_date = date.today() + timedelta(days=1)
        patient = Patient(
            first_name="Future",
            last_name="Patient",
            date_of_birth=future_date,
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        with pytest.raises(ValidationError) as exc_info:
            patient.full_clean()

        assert "date_of_birth" in str(exc_info.value)
        assert "future" in str(exc_info.value).lower()

    def test_invalid_dob_far_future(self, sample_county, sample_sub_county):
        """Test that DOB far in the future is invalid."""
        from hmis.apps.patients.models import Patient

        future_date = date.today() + timedelta(days=365)
        patient = Patient(
            first_name="Future",
            last_name="Patient",
            date_of_birth=future_date,
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        with pytest.raises(ValidationError) as exc_info:
            patient.full_clean()

        assert "date_of_birth" in str(exc_info.value)

    def test_dob_validation_on_api_create(self, authenticated_client):
        """Test DOB validation via API when creating patient."""
        future_date = (date.today() + timedelta(days=1)).isoformat()
        data = {
            "first_name": "Future",
            "last_name": "Patient",
            "date_of_birth": future_date,
            "gender": "M",
        }

        response = authenticated_client.post("/api/patients/", data, format="json")

        assert response.status_code == 400
        assert "date_of_birth" in response.data

    def test_dob_validation_on_api_update(self, authenticated_client, sample_patient):
        """Test DOB validation via API when updating patient."""
        future_date = (date.today() + timedelta(days=1)).isoformat()

        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/",
            {"date_of_birth": future_date},
            format="json",
        )

        assert response.status_code == 400
        assert "date_of_birth" in response.data


@pytest.mark.django_db
class TestRegisteredByTracking:
    """Test suite for staff registration tracking (registered_by field)."""

    def test_patient_has_registered_by_field(self):
        """Test that Patient model has registered_by field."""
        from hmis.apps.patients.models import Patient

        assert hasattr(Patient, "registered_by")

    def test_registered_by_auto_set_on_api_create(
        self, authenticated_client, test_user, sample_county, sample_sub_county
    ):
        """Test registered_by is auto-set to authenticated user on create."""
        data = {
            "first_name": "New",
            "last_name": "Patient",
            "date_of_birth": "1990-01-01",
            "gender": "M",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        response = authenticated_client.post("/api/patients/", data, format="json")

        assert response.status_code == 201
        assert response.data["registered_by"] == test_user.id
        assert response.data["registered_by_username"] == test_user.username

    def test_registered_by_not_changed_on_update(
        self, authenticated_client, test_user, sample_county, sample_sub_county
    ):
        """Test registered_by is not changed when patient is updated."""
        from hmis.apps.patients.models import Patient

        # Create a patient with a different registered_by user
        other_user = User.objects.create_user(
            username="other_staff",
            password="testpass123",
        )
        patient = Patient.objects.create(
            first_name="Existing",
            last_name="Patient",
            date_of_birth="1985-05-15",
            gender="F",
            registered_by=other_user,
            county=sample_county,
            sub_county=sample_sub_county,
        )

        # Update the patient as test_user
        response = authenticated_client.patch(
            f"/api/patients/{patient.id}/",
            {"first_name": "Updated"},
            format="json",
        )

        assert response.status_code == 200
        # registered_by should still be other_user, not test_user
        patient.refresh_from_db()
        assert patient.registered_by == other_user

    def test_registered_by_displayed_in_patient_details(
        self, authenticated_client, test_user, sample_county, sample_sub_county
    ):
        """Test registered_by info is included in patient details."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            registered_by=test_user,
            county=sample_county,
            sub_county=sample_sub_county,
        )

        response = authenticated_client.get(f"/api/patients/{patient.id}/")

        assert response.status_code == 200
        assert "registered_by" in response.data
        assert "registered_by_username" in response.data
        assert response.data["registered_by_username"] == test_user.username

    def test_registered_by_is_optional(self, sample_county, sample_sub_county):
        """Test registered_by can be null (for migrated data)."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Legacy",
            last_name="Patient",
            date_of_birth="1980-01-01",
            gender="M",
            registered_by=None,
            county=sample_county,
            sub_county=sample_sub_county,
        )

        assert patient.registered_by is None

    def test_registered_by_preserved_when_user_deleted(
        self, test_user, sample_county, sample_sub_county
    ):
        """Test patient record preserved when registering user is deleted."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            registered_by=test_user,
            county=sample_county,
            sub_county=sample_sub_county,
        )
        patient_id = patient.id

        # Delete the user
        test_user.delete()

        # Patient should still exist with registered_by set to NULL
        patient = Patient.objects.get(id=patient_id)
        assert patient.registered_by is None
