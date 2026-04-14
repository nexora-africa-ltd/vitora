"""
Tests for Patient API endpoints.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the Patient API.
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()


@pytest.fixture
def api_client():
    """Provide REST framework API client."""
    return APIClient()


@pytest.fixture
def auth_user(db):
    """Create a test user for authentication."""
    return User.objects.create_user(
        username="apiuser",
        password="apipassword123",
        email="apiuser@test.com",
    )


@pytest.fixture
def auth_client(
    api_client, auth_user, sample_organization, sample_facility, sample_department, sample_role
):
    """Provide authenticated API client with multitenancy context."""
    from hmis.apps.core.models import StaffProfile

    StaffProfile.objects.get_or_create(
        user=auth_user,
        defaults={
            "employee_id": "API-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date.today(),
        },
    )
    api_client.force_authenticate(user=auth_user)
    return api_client


@pytest.fixture
def sample_patient_data(sample_county, sample_sub_county):
    """Provide sample patient data for creating patients."""
    return {
        "first_name": "John",
        "last_name": "Doe",
        "date_of_birth": "1990-01-01",
        "gender": "M",
        "county": sample_county.id,
        "sub_county": sample_sub_county.id,
    }


@pytest.mark.integration
class TestPatientAPIEndpoints:
    """Test Patient API CRUD operations."""

    def test_list_patients(
        self, auth_client, sample_county, sample_sub_county, sample_organization
    ):
        """Test GET /api/patients/ - List all patients."""
        from hmis.apps.patients.models import Patient

        # Create some test patients
        Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )
        Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth=date(1985, 5, 15),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        response = auth_client.get("/api/patients/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_create_patient(self, auth_client, sample_patient_data):
        """Test POST /api/patients/ - Create a new patient."""
        response = auth_client.post("/api/patients/", sample_patient_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["first_name"] == "John"
        assert response.data["last_name"] == "Doe"
        assert response.data["mrn"] is not None

    def test_create_patient_missing_required_field(self, auth_client):
        """Test POST /api/patients/ - Fail when required field is missing."""
        invalid_data = {
            "first_name": "John",
            # Missing last_name, date_of_birth, and gender
        }

        response = auth_client.post("/api/patients/", invalid_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_retrieve_patient(self, auth_client, sample_organization):
        """Test GET /api/patients/{id}/ - Retrieve a specific patient."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        response = auth_client.get(f"/api/patients/{patient.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["first_name"] == "John"
        assert response.data["last_name"] == "Doe"
        assert response.data["mrn"] == patient.mrn

    def test_retrieve_nonexistent_patient(self, auth_client):
        """Test GET /api/patients/{id}/ - Fail when patient doesn't exist."""
        response = auth_client.get("/api/patients/999999/")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_patient(self, auth_client, sample_organization):
        """Test PUT /api/patients/{id}/ - Update a patient."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        updated_data = {
            "first_name": "John",
            "last_name": "Doe",
            "date_of_birth": "1990-01-01",
            "gender": "M",
            "phone_number": "+254712345678",
            "email": "john.doe@example.com",
        }

        response = auth_client.put(f"/api/patients/{patient.id}/", updated_data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["phone_number"] == "+254712345678"
        assert response.data["email"] == "john.doe@example.com"

    def test_partial_update_patient(self, auth_client, sample_organization):
        """Test PATCH /api/patients/{id}/ - Partially update a patient."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        partial_data = {"phone_number": "+254712345678"}

        response = auth_client.patch(f"/api/patients/{patient.id}/", partial_data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["phone_number"] == "+254712345678"
        assert response.data["first_name"] == "John"  # Original data preserved

    def test_delete_patient(self, auth_client, sample_organization):
        """Test DELETE /api/patients/{id}/ - Delete a patient."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        response = auth_client.delete(f"/api/patients/{patient.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify patient is deleted
        assert not Patient.objects.filter(id=patient.id).exists()

    def test_search_patients_by_name(self, auth_client, sample_organization):
        """Test GET /api/patients/?search=name - Search patients by name."""
        from hmis.apps.patients.models import Patient

        Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )
        Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth=date(1985, 5, 15),
            gender="F",
            organization=sample_organization,
        )

        response = auth_client.get("/api/patients/?search=John")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["first_name"] == "John"

    def test_filter_patients_by_gender(self, auth_client, sample_organization):
        """Test GET /api/patients/?gender=M - Filter patients by gender."""
        from hmis.apps.patients.models import Patient

        Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )
        Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth=date(1985, 5, 15),
            gender="F",
            organization=sample_organization,
        )

        response = auth_client.get("/api/patients/?gender=M")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["gender"] == "M"

    def test_pagination(self, auth_client, sample_organization):
        """Test GET /api/patients/?page=1&page_size=10 - Pagination works."""
        from hmis.apps.patients.models import Patient

        # Create 25 patients (more than default page size of 20)
        for i in range(25):
            Patient.objects.create(
                first_name=f"Patient{i}",
                last_name="Test",
                date_of_birth=date(1990, 1, 1),
                gender="M",
                organization=sample_organization,
            )

        response = auth_client.get("/api/patients/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data
        assert "count" in response.data
        assert response.data["count"] == 25
        assert len(response.data["results"]) == 20  # Default page size

    def test_pagination_out_of_range_returns_last_page(self, auth_client, sample_organization):
        """Test that requesting a page beyond available data returns last page, not 404."""
        from hmis.apps.patients.models import Patient

        # Create 5 patients (less than one page)
        for i in range(5):
            Patient.objects.create(
                first_name=f"Patient{i}",
                last_name="Test",
                date_of_birth=date(1990, 1, 1),
                gender="M",
                organization=sample_organization,
            )

        # Request page 10 which doesn't exist
        response = auth_client.get("/api/patients/?page=10")

        # Should return 200 with last page results, not 404
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 5  # Returns all items (last page)
        assert response.data["count"] == 5

    def test_pagination_custom_page_size(self, auth_client, sample_organization):
        """Test pagination with custom page_size parameter."""
        from hmis.apps.patients.models import Patient

        # Create 15 patients
        for i in range(15):
            Patient.objects.create(
                first_name=f"Patient{i}",
                last_name="Test",
                date_of_birth=date(1990, 1, 1),
                gender="M",
                organization=sample_organization,
            )

        # Request with page_size=5
        response = auth_client.get("/api/patients/?page_size=5")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 5
        assert response.data["count"] == 15

    def test_mrn_is_readonly(self, auth_client, sample_patient_data):
        """Test that MRN cannot be set manually via API."""
        data_with_mrn = sample_patient_data.copy()
        data_with_mrn["mrn"] = "CUSTOM-MRN-123"

        response = auth_client.post("/api/patients/", data_with_mrn, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        # MRN should be auto-generated, not the one we provided
        assert response.data["mrn"] != "CUSTOM-MRN-123"

    def test_create_patient_with_optional_fields(
        self, auth_client, sample_county, sample_sub_county
    ):
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
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        response = auth_client.post("/api/patients/", full_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["middle_name"] == "Michael"
        assert response.data["phone_number"] == "+254712345678"
        assert response.data["email"] == "john.doe@example.com"
        assert response.data["address"] == "123 Main St, Nairobi"
        assert response.data["national_id"] == "12345678"

    def test_patient_age_in_response(
        self, auth_client, sample_county, sample_sub_county, sample_organization
    ):
        """Test that patient age is included in API response."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        response = auth_client.get(f"/api/patients/{patient.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "age" in response.data
        assert isinstance(response.data["age"], int)

    def test_patient_full_name_in_response(
        self, auth_client, sample_county, sample_sub_county, sample_organization
    ):
        """Test that patient full name is included in API response."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        response = auth_client.get(f"/api/patients/{patient.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "full_name" in response.data
        assert response.data["full_name"] == "John Doe"


@pytest.mark.integration
class TestPatientDuplicateCheck:
    """Test Patient duplicate check endpoint."""

    def test_check_duplicate_with_exact_id_match(
        self, auth_client, sample_county, sample_sub_county, sample_organization
    ):
        """Test finding a duplicate by exact identification number."""
        from hmis.apps.patients.models import Patient

        # Create existing patient with ID
        Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth=date(1985, 5, 20),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_type="national_id",
            identification_number="12345678",
            organization=sample_organization,
        )

        response = auth_client.get(
            "/api/patients/check-duplicate/",
            {"identification_number": "12345678", "identification_type": "national_id"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_duplicate"] is True
        assert response.data["match_type"] == "exact_id"
        assert len(response.data["matches"]) == 1
        assert response.data["matches"][0]["full_name"] == "Jane Smith"
        assert response.data["matches"][0]["match_confidence"] == 100

    def test_check_duplicate_no_match(self, auth_client):
        """Test no duplicate found for unknown ID."""
        response = auth_client.get(
            "/api/patients/check-duplicate/",
            {"identification_number": "99999999", "identification_type": "national_id"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_duplicate"] is False
        assert response.data["match_type"] is None
        assert len(response.data["matches"]) == 0

    def test_check_duplicate_demographic_match(
        self, auth_client, sample_county, sample_sub_county, sample_organization
    ):
        """Test finding a duplicate by name + DOB + gender."""
        from hmis.apps.patients.models import Patient

        # Create existing patient
        Patient.objects.create(
            first_name="John",
            last_name="Kamau",
            date_of_birth=date(1990, 3, 15),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        response = auth_client.get(
            "/api/patients/check-duplicate/",
            {
                "first_name": "John",
                "last_name": "Kamau",
                "date_of_birth": "1990-03-15",
                "gender": "M",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_duplicate"] is True
        assert response.data["match_type"] == "demographic"
        assert len(response.data["matches"]) >= 1
        assert response.data["matches"][0]["full_name"] == "John Kamau"
        assert response.data["matches"][0]["match_confidence"] >= 85

    def test_check_duplicate_case_insensitive(
        self, auth_client, sample_county, sample_sub_county, sample_organization
    ):
        """Test that name matching is case-insensitive."""
        from hmis.apps.patients.models import Patient

        Patient.objects.create(
            first_name="Mary",
            last_name="Wanjiku",
            date_of_birth=date(1988, 7, 10),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        response = auth_client.get(
            "/api/patients/check-duplicate/",
            {
                "first_name": "MARY",
                "last_name": "wanjiku",
                "date_of_birth": "1988-07-10",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_duplicate"] is True
        assert response.data["matches"][0]["full_name"] == "Mary Wanjiku"

    def test_check_duplicate_requires_auth(self, api_client):
        """Test that endpoint requires authentication."""
        response = api_client.get(
            "/api/patients/check-duplicate/",
            {"identification_number": "12345678"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
