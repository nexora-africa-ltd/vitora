"""
Tests for Patient API endpoints.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the Patient API.
"""

from datetime import date

import pytest
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    """Provide REST framework API client."""
    return APIClient()


@pytest.fixture
def sample_patient_data():
    """Provide sample patient data for creating patients."""
    return {
        "first_name": "John",
        "last_name": "Doe",
        "date_of_birth": "1990-01-01",
        "gender": "M",
    }


@pytest.mark.integration
class TestPatientAPIEndpoints:
    """Test Patient API CRUD operations."""

    def test_list_patients(self, api_client):
        """Test GET /api/patients/ - List all patients."""
        from hmis.apps.patients.models import Patient

        # Create some test patients
        Patient.objects.create(
            first_name="John", last_name="Doe", date_of_birth=date(1990, 1, 1), gender="M"
        )
        Patient.objects.create(
            first_name="Jane", last_name="Smith", date_of_birth=date(1985, 5, 15), gender="F"
        )

        response = api_client.get("/api/patients/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_create_patient(self, api_client, sample_patient_data):
        """Test POST /api/patients/ - Create a new patient."""
        response = api_client.post("/api/patients/", sample_patient_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["first_name"] == "John"
        assert response.data["last_name"] == "Doe"
        assert response.data["mrn"] is not None

    def test_create_patient_missing_required_field(self, api_client):
        """Test POST /api/patients/ - Fail when required field is missing."""
        invalid_data = {
            "first_name": "John",
            # Missing last_name, date_of_birth, and gender
        }

        response = api_client.post("/api/patients/", invalid_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_retrieve_patient(self, api_client):
        """Test GET /api/patients/{id}/ - Retrieve a specific patient."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John", last_name="Doe", date_of_birth=date(1990, 1, 1), gender="M"
        )

        response = api_client.get(f"/api/patients/{patient.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["first_name"] == "John"
        assert response.data["last_name"] == "Doe"
        assert response.data["mrn"] == patient.mrn

    def test_retrieve_nonexistent_patient(self, api_client):
        """Test GET /api/patients/{id}/ - Fail when patient doesn't exist."""
        response = api_client.get("/api/patients/999999/")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_patient(self, api_client):
        """Test PUT /api/patients/{id}/ - Update a patient."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John", last_name="Doe", date_of_birth=date(1990, 1, 1), gender="M"
        )

        updated_data = {
            "first_name": "John",
            "last_name": "Doe",
            "date_of_birth": "1990-01-01",
            "gender": "M",
            "phone_number": "+254712345678",
            "email": "john.doe@example.com",
        }

        response = api_client.put(f"/api/patients/{patient.id}/", updated_data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["phone_number"] == "+254712345678"
        assert response.data["email"] == "john.doe@example.com"

    def test_partial_update_patient(self, api_client):
        """Test PATCH /api/patients/{id}/ - Partially update a patient."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John", last_name="Doe", date_of_birth=date(1990, 1, 1), gender="M"
        )

        partial_data = {"phone_number": "+254712345678"}

        response = api_client.patch(f"/api/patients/{patient.id}/", partial_data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["phone_number"] == "+254712345678"
        assert response.data["first_name"] == "John"  # Original data preserved

    def test_delete_patient(self, api_client):
        """Test DELETE /api/patients/{id}/ - Delete a patient."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John", last_name="Doe", date_of_birth=date(1990, 1, 1), gender="M"
        )

        response = api_client.delete(f"/api/patients/{patient.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify patient is deleted
        assert not Patient.objects.filter(id=patient.id).exists()

    def test_search_patients_by_name(self, api_client):
        """Test GET /api/patients/?search=name - Search patients by name."""
        from hmis.apps.patients.models import Patient

        Patient.objects.create(
            first_name="John", last_name="Doe", date_of_birth=date(1990, 1, 1), gender="M"
        )
        Patient.objects.create(
            first_name="Jane", last_name="Smith", date_of_birth=date(1985, 5, 15), gender="F"
        )

        response = api_client.get("/api/patients/?search=John")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["first_name"] == "John"

    def test_filter_patients_by_gender(self, api_client):
        """Test GET /api/patients/?gender=M - Filter patients by gender."""
        from hmis.apps.patients.models import Patient

        Patient.objects.create(
            first_name="John", last_name="Doe", date_of_birth=date(1990, 1, 1), gender="M"
        )
        Patient.objects.create(
            first_name="Jane", last_name="Smith", date_of_birth=date(1985, 5, 15), gender="F"
        )

        response = api_client.get("/api/patients/?gender=M")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["gender"] == "M"

    def test_pagination(self, api_client):
        """Test GET /api/patients/?page=1&page_size=10 - Pagination works."""
        from hmis.apps.patients.models import Patient

        # Create 55 patients (more than default page size of 50)
        for i in range(55):
            Patient.objects.create(
                first_name=f"Patient{i}",
                last_name="Test",
                date_of_birth=date(1990, 1, 1),
                gender="M",
            )

        response = api_client.get("/api/patients/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data
        assert "count" in response.data
        assert response.data["count"] == 55
        assert len(response.data["results"]) == 50  # Default page size

    def test_mrn_is_readonly(self, api_client, sample_patient_data):
        """Test that MRN cannot be set manually via API."""
        data_with_mrn = sample_patient_data.copy()
        data_with_mrn["mrn"] = "CUSTOM-MRN-123"

        response = api_client.post("/api/patients/", data_with_mrn, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        # MRN should be auto-generated, not the one we provided
        assert response.data["mrn"] != "CUSTOM-MRN-123"

    def test_create_patient_with_optional_fields(self, api_client):
        """Test creating patient with all fields including optional ones."""
        full_data = {
            "first_name": "John",
            "middle_name": "Michael",
            "last_name": "Doe",
            "date_of_birth": "1990-01-01",
            "gender": "M",
            "phone_number": "+254712345678",
            "email": "john.doe@example.com",
            "address": "123 Main St, Nairobi",
            "national_id": "12345678",
        }

        response = api_client.post("/api/patients/", full_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["middle_name"] == "Michael"
        assert response.data["phone_number"] == "+254712345678"
        assert response.data["email"] == "john.doe@example.com"
        assert response.data["address"] == "123 Main St, Nairobi"
        assert response.data["national_id"] == "12345678"

    def test_patient_age_in_response(self, api_client):
        """Test that patient age is included in API response."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John", last_name="Doe", date_of_birth=date(1990, 1, 1), gender="M"
        )

        response = api_client.get(f"/api/patients/{patient.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "age" in response.data
        assert isinstance(response.data["age"], int)

    def test_patient_full_name_in_response(self, api_client):
        """Test that patient full name is included in API response."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John", last_name="Doe", date_of_birth=date(1990, 1, 1), gender="M"
        )

        response = api_client.get(f"/api/patients/{patient.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "full_name" in response.data
        assert response.data["full_name"] == "John Doe"
