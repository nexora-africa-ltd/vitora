"""
Tests for Encounter Pre-Triage Queue API endpoint - Phase 4.2.

Sprint: Encounter Triage & Consultation Queue Implementation
TDD Focus: API endpoint for pre-triage queue workflow

Tests cover:
1. GET /api/encounters/pre_triage_queue/ - List encounters awaiting triage
   - Only shows encounters with triage_status=PENDING
   - Only shows encounters with triage_requirement in (MANDATORY, OPTIONAL)
   - Excludes NOT_REQUIRED encounters
   - Sorted by arrival time (created_at)

Following TDD methodology - these tests are written BEFORE implementation.
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient

pytestmark = pytest.mark.django_db

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def api_client():
    """Provide REST framework API client."""
    return APIClient()


@pytest.fixture
def auth_user(db):
    """Create a test user for authentication."""
    return User.objects.create_user(
        username="triageuser",
        password="triagepassword123",
        email="triageuser@test.com",
        first_name="Nurse",
        last_name="Triage",
    )


@pytest.fixture
def auth_client(
    api_client, auth_user, sample_organization, sample_facility, sample_department, sample_role
):
    """Provide authenticated API client with multitenancy context."""
    from datetime import date as date_cls

    from hmis.apps.core.models import StaffProfile

    StaffProfile.objects.get_or_create(
        user=auth_user,
        defaults={
            "employee_id": "PRETRIAGE-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date_cls.today(),
        },
    )
    api_client.force_authenticate(user=auth_user)
    return api_client


@pytest.fixture
def sample_patient(db, sample_organization):
    """Create a sample patient."""
    return Patient.objects.create(
        first_name="Jane",
        last_name="Doe",
        date_of_birth=date(1985, 5, 20),
        gender="F",
        organization=sample_organization,
    )


@pytest.fixture
def second_patient(db, sample_organization):
    """Create a second patient for queue testing."""
    return Patient.objects.create(
        first_name="John",
        last_name="Smith",
        date_of_birth=date(1990, 3, 15),
        gender="M",
        organization=sample_organization,
    )


@pytest.fixture
def third_patient(db, sample_organization):
    """Create a third patient for queue testing."""
    return Patient.objects.create(
        first_name="Alice",
        last_name="Johnson",
        date_of_birth=date(1975, 8, 10),
        gender="F",
        organization=sample_organization,
    )


# ============================================================================
# 1. Pre-Triage Queue Endpoint Tests
# ============================================================================


class TestPreTriageQueueEndpoint:
    """Tests for GET /api/encounters/pre_triage_queue/."""

    def test_pre_triage_queue_requires_authentication(self, api_client):
        """Should return 401 for unauthenticated requests."""
        response = api_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_pre_triage_queue_returns_pending_mandatory_encounters(
        self, auth_client, sample_patient,
        sample_facility,
    ):
        """Should include encounters with triage_status=PENDING and triage_requirement=MANDATORY."""
        # OPD = MANDATORY triage
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Headache",
            # triage_requirement and triage_status auto-set,
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["id"] == encounter.id
        assert results[0]["triage_status"] == "PENDING"
        assert results[0]["triage_requirement"] == "MANDATORY"

    def test_pre_triage_queue_returns_pending_optional_encounters(
        self, auth_client, sample_patient,
        sample_facility,
    ):
        """Should include encounters with triage_status=PENDING and triage_requirement=OPTIONAL."""
        # FOLLOW_UP = OPTIONAL triage
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            encounter_date=date.today(),
            chief_complaint="Follow-up visit",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["id"] == encounter.id
        assert results[0]["triage_status"] == "PENDING"
        assert results[0]["triage_requirement"] == "OPTIONAL"

    def test_pre_triage_queue_excludes_not_required_encounters(self, auth_client, sample_patient, sample_facility):
        """Should exclude encounters with triage_requirement=NOT_REQUIRED."""
        # PROCEDURE = NOT_REQUIRED triage
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="PROCEDURE",
            encounter_date=date.today(),
            chief_complaint="Scheduled procedure",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_pre_triage_queue_excludes_completed_triage(self, auth_client, sample_patient, sample_facility):
        """Should exclude encounters with triage_status=COMPLETED."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Headache",
            facility=sample_facility,
        )
        # Manually set to COMPLETED
        encounter.triage_status = "COMPLETED"
        encounter.save()

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_pre_triage_queue_excludes_bypassed_triage(
        self, auth_client, sample_patient, auth_user,
        sample_facility,
    ):
        """Should exclude encounters with triage_status=BYPASSED."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            encounter_date=date.today(),
            chief_complaint="Follow-up visit",
            facility=sample_facility,
        )
        # Bypass triage
        encounter.triage_status = "BYPASSED"
        encounter.triage_bypass_reason = "STABLE_FOLLOW_UP"
        encounter.triage_bypassed_by = auth_user
        encounter.triage_bypassed_at = timezone.now()
        encounter.save()

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_pre_triage_queue_excludes_not_applicable_triage(self, auth_client, sample_patient, sample_facility):
        """Should exclude encounters with triage_status=NOT_APPLICABLE."""
        # NOT_REQUIRED encounters auto-set to NOT_APPLICABLE
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="DAY_CASE",
            encounter_date=date.today(),
            chief_complaint="Day case procedure",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_pre_triage_queue_sorted_by_arrival_time(
        self, auth_client, sample_patient, second_patient, third_patient,
        sample_facility,
    ):
        """Should sort encounters by created_at (arrival time) ascending."""
        # Create encounters in specific order with delays
        encounter1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="First patient",
            facility=sample_facility,
        )

        encounter2 = Encounter.objects.create(
            patient=second_patient,
            encounter_type="EMERGENCY",
            encounter_date=date.today(),
            chief_complaint="Second patient",
            facility=sample_facility,
        )

        encounter3 = Encounter.objects.create(
            patient=third_patient,
            encounter_type="FOLLOW_UP",
            encounter_date=date.today(),
            chief_complaint="Third patient",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 3
        # Should be in order of creation (FIFO)
        assert results[0]["id"] == encounter1.id
        assert results[1]["id"] == encounter2.id
        assert results[2]["id"] == encounter3.id

    def test_pre_triage_queue_includes_patient_info(self, auth_client, sample_patient, sample_facility):
        """Should include patient name, MRN, age, gender in response."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Headache",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 1

        item = results[0]
        assert "patient_name" in item
        assert "patient_mrn" in item
        assert "patient_age" in item or "patient" in item
        assert "patient_gender" in item or "patient" in item

    def test_pre_triage_queue_includes_encounter_info(self, auth_client, sample_patient, sample_facility):
        """Should include encounter type, chief complaint, created_at."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Headache and fever",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 1

        item = results[0]
        assert item["encounter_type"] == "OPD"
        assert item["chief_complaint"] == "Headache and fever"
        assert "created_at" in item

    def test_pre_triage_queue_includes_wait_time(self, auth_client, sample_patient, sample_facility):
        """Should include calculated wait time in minutes."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Headache",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 1

        item = results[0]
        # wait_time_minutes should be present (at least 0)
        assert "wait_time_minutes" in item
        assert isinstance(item["wait_time_minutes"], int)
        assert item["wait_time_minutes"] >= 0

    def test_pre_triage_queue_includes_triage_requirement(
        self, auth_client, sample_patient, second_patient,
        sample_facility,
    ):
        """Should include triage_requirement field to distinguish MANDATORY vs OPTIONAL."""
        # MANDATORY
        encounter1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="OPD visit",
            facility=sample_facility,
        )

        # OPTIONAL
        encounter2 = Encounter.objects.create(
            patient=second_patient,
            encounter_type="FOLLOW_UP",
            encounter_date=date.today(),
            chief_complaint="Follow-up",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 2

        # Find each encounter
        opd_result = next(r for r in results if r["id"] == encounter1.id)
        followup_result = next(r for r in results if r["id"] == encounter2.id)

        assert opd_result["triage_requirement"] == "MANDATORY"
        assert followup_result["triage_requirement"] == "OPTIONAL"

    def test_pre_triage_queue_filter_by_triage_requirement(
        self, auth_client, sample_patient, second_patient,
        sample_facility,
    ):
        """Should support filtering by triage_requirement."""
        # MANDATORY
        encounter1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="OPD visit",
            facility=sample_facility,
        )

        # OPTIONAL
        encounter2 = Encounter.objects.create(
            patient=second_patient,
            encounter_type="FOLLOW_UP",
            encounter_date=date.today(),
            chief_complaint="Follow-up",
            facility=sample_facility,
        )

        # Filter for MANDATORY only
        response = auth_client.get("/api/encounters/pre_triage_queue/?triage_requirement=MANDATORY")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["id"] == encounter1.id

    def test_pre_triage_queue_filter_by_encounter_type(
        self, auth_client, sample_patient, second_patient,
        sample_facility,
    ):
        """Should support filtering by encounter_type."""
        # OPD
        encounter1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="OPD visit",
            facility=sample_facility,
        )

        # EMERGENCY
        encounter2 = Encounter.objects.create(
            patient=second_patient,
            encounter_type="EMERGENCY",
            encounter_date=date.today(),
            chief_complaint="Emergency",
            facility=sample_facility,
        )

        # Filter for EMERGENCY only
        response = auth_client.get("/api/encounters/pre_triage_queue/?encounter_type=EMERGENCY")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["id"] == encounter2.id

    def test_pre_triage_queue_empty_when_no_pending(self, auth_client, sample_patient, sample_facility):
        """Should return empty list when no encounters are pending triage."""
        # Create an encounter but complete its triage
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Headache",
            facility=sample_facility,
        )
        encounter.triage_status = "COMPLETED"
        encounter.save()

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_pre_triage_queue_excludes_in_progress_triage(self, auth_client, sample_patient, sample_facility):
        """Should exclude encounters with triage_status=IN_PROGRESS."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Headache",
            facility=sample_facility,
        )
        # Set to IN_PROGRESS
        encounter.triage_status = "IN_PROGRESS"
        encounter.save()

        response = auth_client.get("/api/encounters/pre_triage_queue/")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        # Should NOT include IN_PROGRESS (they're being triaged)
        assert len(results) == 0

    def test_pre_triage_queue_includes_in_progress_by_default(
        self, auth_client, sample_patient, second_patient,
        sample_facility,
    ):
        """
        By default, show both PENDING and IN_PROGRESS for triage staff
        to see the full pre-consultation queue.
        """
        # PENDING
        encounter1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="First patient",
            facility=sample_facility,
        )

        # IN_PROGRESS
        encounter2 = Encounter.objects.create(
            patient=second_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Second patient",
            facility=sample_facility,
        )
        encounter2.triage_status = "IN_PROGRESS"
        encounter2.save()

        response = auth_client.get("/api/encounters/pre_triage_queue/?include_in_progress=true")
        assert response.status_code == status.HTTP_200_OK

        results = response.data.get("results", response.data)
        assert len(results) == 2
