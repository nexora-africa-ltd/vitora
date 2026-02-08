"""
Tests for Encounter API endpoints.

Following TDD principles, these tests define the expected behavior
of the Encounter API endpoints.
"""

from datetime import date
from decimal import Decimal

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
        username="encounteruser",
        password="encounterpassword123",
        email="encounteruser@test.com",
    )


@pytest.fixture
def auth_client(api_client, auth_user):
    """Provide authenticated API client."""
    api_client.force_authenticate(user=auth_user)
    return api_client


@pytest.fixture
def sample_patient():
    """Create a sample patient for encounter tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth=date(1990, 1, 1),
        gender="M",
    )


@pytest.fixture
def sample_encounter_data(sample_patient):
    """Provide sample encounter data."""
    return {
        "patient": sample_patient.id,
        "encounter_type": "OPD",
        "encounter_date": "2025-12-28",
        "chief_complaint": "Headache and fever",
    }


@pytest.fixture
def sample_encounter_with_vitals(sample_patient):
    """Provide sample encounter data with vital signs."""
    return {
        "patient": sample_patient.id,
        "encounter_type": "OPD",
        "encounter_date": "2025-12-28",
        "chief_complaint": "Routine checkup",
        "temperature": 37.5,
        "pulse": 75,
        "blood_pressure": "120/80",
        "respiratory_rate": 16,
        "weight": 70.0,
        "height": 175.0,
        "notes": "Patient appears healthy",
    }


@pytest.mark.integration
class TestEncounterAPIEndpoints:
    """Test Encounter API CRUD operations."""

    def test_list_encounters(self, auth_client, sample_patient):
        """Test GET /api/encounters/ - List all encounters."""
        from hmis.apps.encounters.models import Encounter

        # Create test encounters
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Chest pain",
        )

        response = auth_client.get("/api/encounters/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_list_encounters_empty(self, auth_client):
        """Test GET /api/encounters/ - Empty list when no encounters."""
        response = auth_client.get("/api/encounters/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 0

    def test_create_encounter(self, auth_client, sample_encounter_data):
        """Test POST /api/encounters/ - Create a new encounter."""
        response = auth_client.post("/api/encounters/", sample_encounter_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["encounter_type"] == "OPD"
        assert response.data["chief_complaint"] == "Headache and fever"
        assert response.data["id"] is not None

    def test_create_encounter_sets_created_by(self, auth_client, auth_user, sample_encounter_data):
        """POST /api/encounters/ should set created_by to request user and return it."""
        response = auth_client.post("/api/encounters/", sample_encounter_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["created_by"] == auth_user.id
        assert response.data["created_by_name"] in [auth_user.get_full_name(), auth_user.username]

    def test_create_encounter_with_vitals_source_tracking(self, auth_client, sample_patient):
        """POST /api/encounters/ should accept and return vitals source metadata."""
        payload = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "encounter_date": "2025-12-28",
            "chief_complaint": "Vitals source tracking",
            "vitals_source": "NURSING",
        }

        response = auth_client.post("/api/encounters/", payload, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["vitals_source"] == "NURSING"
        assert "vitals_recorded_by" in response.data
        assert "vitals_recorded_at" in response.data

    def test_create_encounter_with_vitals(self, auth_client, sample_encounter_with_vitals):
        """Test POST /api/encounters/ - Create encounter with vital signs."""
        response = auth_client.post("/api/encounters/", sample_encounter_with_vitals, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["temperature"] == "37.5"
        assert response.data["pulse"] == 75
        assert response.data["blood_pressure"] == "120/80"
        assert response.data["weight"] == "70.0"
        assert response.data["height"] == "175.0"
        # BMI should be calculated: 70 / (1.75^2) = 22.9
        assert response.data["bmi"] == 22.9

    def test_create_encounter_missing_required_field(self, auth_client, sample_patient):
        """Test POST /api/encounters/ - Fail when required field is missing."""
        invalid_data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            # Missing chief_complaint
        }

        response = auth_client.post("/api/encounters/", invalid_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "chief_complaint" in response.data

    def test_create_encounter_invalid_patient(self, auth_client):
        """Test POST /api/encounters/ - Fail with invalid patient ID."""
        invalid_data = {
            "patient": 99999,  # Non-existent patient
            "encounter_type": "OPD",
            "chief_complaint": "Test",
        }

        response = auth_client.post("/api/encounters/", invalid_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_retrieve_encounter(self, auth_client, sample_patient):
        """Test GET /api/encounters/{id}/ - Retrieve a specific encounter."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            temperature=Decimal("38.5"),
        )

        response = auth_client.get(f"/api/encounters/{encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["encounter_type"] == "OPD"
        assert response.data["chief_complaint"] == "Headache"
        assert response.data["patient_mrn"] == sample_patient.mrn

    def test_retrieve_nonexistent_encounter(self, auth_client):
        """Test GET /api/encounters/{id}/ - Fail when encounter doesn't exist."""
        response = auth_client.get("/api/encounters/999999/")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_encounter(self, auth_client, sample_patient):
        """Test PUT /api/encounters/{id}/ - Update an encounter."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
        )

        update_data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Headache with nausea",
            "notes": "Prescribed medication",
        }

        response = auth_client.put(f"/api/encounters/{encounter.id}/", update_data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["chief_complaint"] == "Headache with nausea"
        assert response.data["notes"] == "Prescribed medication"

    def test_partial_update_encounter(self, auth_client, sample_patient):
        """Test PATCH /api/encounters/{id}/ - Partial update an encounter."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
        )

        response = auth_client.patch(
            f"/api/encounters/{encounter.id}/",
            {"notes": "Follow-up recommended"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["notes"] == "Follow-up recommended"
        assert response.data["chief_complaint"] == "Headache"  # Unchanged

    def test_delete_encounter(self, auth_client, sample_patient):
        """Test DELETE /api/encounters/{id}/ - Delete an encounter with invoice.

        Since billing signals auto-create invoices for encounters,
        we need to delete the invoice first before deleting the encounter.
        """
        from hmis.apps.billing.models import Invoice
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
        )
        encounter_id = encounter.id

        # Delete the auto-created invoice first (billing signal creates one)
        Invoice.objects.filter(encounter=encounter).delete()

        response = auth_client.delete(f"/api/encounters/{encounter_id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Encounter.objects.filter(id=encounter_id).exists()

    def test_delete_encounter_with_invoice_returns_conflict(self, auth_client, sample_patient):
        """Test DELETE /api/encounters/{id}/ with invoice returns 409 Conflict."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
        )
        # Invoice is auto-created by billing signal, don't delete it

        response = auth_client.delete(f"/api/encounters/{encounter.id}/")

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "billing records" in response.data["detail"]


@pytest.mark.integration
class TestEncounterAPIFiltering:
    """Test Encounter API filtering and search capabilities."""

    def test_filter_by_patient(self, auth_client):
        """Test filtering encounters by patient ID."""
        from hmis.apps.encounters.models import Encounter
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

        Encounter.objects.create(patient=patient1, encounter_type="OPD", chief_complaint="Headache")
        Encounter.objects.create(
            patient=patient1, encounter_type="EMERGENCY", chief_complaint="Fever"
        )
        Encounter.objects.create(patient=patient2, encounter_type="OPD", chief_complaint="Cough")

        response = auth_client.get(f"/api/encounters/?patient={patient1.id}")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2
        for encounter in response.data["results"]:
            assert encounter["patient"] == patient1.id

    def test_filter_by_patient_mrn(self, auth_client, sample_patient):
        """Test filtering encounters by patient MRN."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient, encounter_type="OPD", chief_complaint="Test"
        )

        response = auth_client.get(f"/api/encounters/?patient_mrn={sample_patient.mrn}")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_filter_by_encounter_type(self, auth_client, sample_patient):
        """Test filtering encounters by type."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient, encounter_type="OPD", chief_complaint="Test1"
        )
        Encounter.objects.create(
            patient=sample_patient, encounter_type="EMERGENCY", chief_complaint="Test2"
        )

        response = auth_client.get("/api/encounters/?encounter_type=EMERGENCY")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["encounter_type"] == "EMERGENCY"

    def test_search_by_chief_complaint(self, auth_client, sample_patient):
        """Test searching encounters by chief complaint."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient, encounter_type="OPD", chief_complaint="Severe headache"
        )
        Encounter.objects.create(
            patient=sample_patient, encounter_type="OPD", chief_complaint="Chest pain"
        )

        response = auth_client.get("/api/encounters/?search=headache")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert "headache" in response.data["results"][0]["chief_complaint"].lower()

    def test_ordering_by_date(self, auth_client, sample_patient):
        """Test ordering encounters by date."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="First",
            encounter_date=date(2025, 12, 25),
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Second",
            encounter_date=date(2025, 12, 28),
        )

        # Default ordering is -encounter_date (descending)
        response = auth_client.get("/api/encounters/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2
        # Most recent should be first
        assert response.data["results"][0]["chief_complaint"] == "Second"


@pytest.mark.integration
class TestEncounterAPIValidation:
    """Test Encounter API validation rules."""

    def test_invalid_temperature(self, auth_client, sample_patient):
        """Test validation for temperature out of range."""
        invalid_data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Fever",
            "temperature": 50.0,  # Invalid: > 45°C
        }

        response = auth_client.post("/api/encounters/", invalid_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "temperature" in response.data

    def test_invalid_pulse(self, auth_client, sample_patient):
        """Test validation for pulse out of range."""
        invalid_data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Checkup",
            "pulse": 250,  # Invalid: > 200
        }

        response = auth_client.post("/api/encounters/", invalid_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "pulse" in response.data

    def test_invalid_blood_pressure_format(self, auth_client, sample_patient):
        """Test validation for blood pressure format."""
        invalid_data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Checkup",
            "blood_pressure": "120-80",  # Invalid format (should be 120/80)
        }

        response = auth_client.post("/api/encounters/", invalid_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "blood_pressure" in response.data

    def test_invalid_encounter_type(self, auth_client, sample_patient):
        """Test validation for invalid encounter type."""
        invalid_data = {
            "patient": sample_patient.id,
            "encounter_type": "INVALID",  # Not a valid choice
            "chief_complaint": "Test",
        }

        response = auth_client.post("/api/encounters/", invalid_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "encounter_type" in response.data

    def test_invalid_weight(self, auth_client, sample_patient):
        """Test validation for weight out of range."""
        invalid_data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Checkup",
            "weight": -10,  # Invalid: negative
        }

        response = auth_client.post("/api/encounters/", invalid_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "weight" in response.data


@pytest.mark.integration
class TestEncounterAPICriticalVitals:
    """Test critical vitals detection in API responses."""

    def test_has_critical_vitals_flag(self, auth_client, sample_patient):
        """Test that critical vitals are flagged in response."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="High fever",
            temperature=Decimal("40.0"),  # Critical: > 39°C
        )

        response = auth_client.get(f"/api/encounters/{encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_critical_vitals"] is True
        assert "fever" in response.data["alerts"].lower()

    def test_normal_vitals_not_flagged(self, auth_client, sample_patient):
        """Test that normal vitals are not flagged."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            temperature=Decimal("37.0"),
            pulse=75,
            respiratory_rate=16,
        )

        response = auth_client.get(f"/api/encounters/{encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_critical_vitals"] is False
        assert response.data["alerts"] == ""

    def test_bmi_calculation(self, auth_client, sample_patient):
        """Test BMI is calculated correctly."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            weight=Decimal("80.0"),
            height=Decimal("180.0"),
        )

        response = auth_client.get(f"/api/encounters/{encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        # BMI = 80 / (1.8^2) = 24.7
        assert response.data["bmi"] == 24.7

    def test_bmi_null_when_missing_data(self, auth_client, sample_patient):
        """Test BMI is null when weight or height missing."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            weight=Decimal("80.0"),
            # Missing height
        )

        response = auth_client.get(f"/api/encounters/{encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["bmi"] is None


@pytest.mark.integration
class TestEncounterAPIPagination:
    """Test Encounter API pagination."""

    def test_pagination(self, auth_client, sample_patient):
        """Test that encounters are paginated."""
        from hmis.apps.encounters.models import Encounter

        # Create 25 encounters (default page size is likely 20)
        for i in range(25):
            Encounter.objects.create(
                patient=sample_patient,
                encounter_type="OPD",
                chief_complaint=f"Test complaint {i}",
            )

        response = auth_client.get("/api/encounters/")

        assert response.status_code == status.HTTP_200_OK
        assert "count" in response.data
        assert response.data["count"] == 25
        assert "next" in response.data
        assert "results" in response.data
