"""
Tests for Encounter Consultation Queue API endpoints - Phase 2.

Sprint: Encounter Triage & Consultation Queue Implementation
TDD Focus: API endpoints for consultation queue workflow

Tests cover:
1. Serializer fields for triage/consultation status
2. POST /api/encounters/{id}/bypass-triage/ - Bypass triage for optional encounters
3. POST /api/encounters/{id}/call/ - Call patient to consultation
4. POST /api/encounters/{id}/start-consultation/ - Start consultation session
5. GET /api/encounters/consultation-queue/ - List consultation queue

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
        username="consultationuser",
        password="consultationpassword123",
        email="consultationuser@test.com",
        first_name="Dr",
        last_name="Test",
    )


@pytest.fixture
def second_user(db):
    """Create a second user for testing."""
    return User.objects.create_user(
        username="seconduser",
        password="secondpassword123",
        email="seconduser@test.com",
        first_name="Nurse",
        last_name="Helper",
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
            "employee_id": "QUEUE-0001",
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
def mandatory_encounter(sample_patient, sample_facility):
    """Create an OPD encounter (MANDATORY triage)."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Fever and headache",
        facility=sample_facility,
    )


@pytest.fixture
def optional_encounter(sample_patient, sample_facility):
    """Create a FOLLOW_UP encounter (OPTIONAL triage)."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="FOLLOW_UP",
        chief_complaint="Follow-up visit",
        facility=sample_facility,
    )


@pytest.fixture
def not_required_encounter(sample_patient, sample_facility):
    """Create a PROCEDURE encounter (NOT_REQUIRED triage)."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="PROCEDURE",
        chief_complaint="Scheduled minor procedure",
        facility=sample_facility,
    )


@pytest.fixture
def triaged_encounter(sample_patient, sample_facility):
    """Create an encounter with completed triage."""
    encounter = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Chest pain",
        triage_status="COMPLETED",
        facility=sample_facility,
    )
    return encounter


@pytest.fixture
def bypassed_encounter(sample_patient, auth_user, sample_facility):
    """Create an encounter with bypassed triage."""
    encounter = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="FOLLOW_UP",
        chief_complaint="Routine follow-up",
        triage_status="BYPASSED",
        triage_bypass_reason="STABLE_FOLLOW_UP",
        triage_bypassed_by=auth_user,
        triage_bypassed_at=timezone.now(),
        facility=sample_facility,
    )
    return encounter


# ============================================================================
# Serializer Field Tests
# ============================================================================


@pytest.mark.unit
class TestEncounterSerializerTriageFields:
    """Test that EncounterSerializer includes triage/consultation fields."""

    def test_serializer_includes_triage_requirement(self, auth_client, mandatory_encounter):
        """Serializer should include triage_requirement field."""
        response = auth_client.get(f"/api/encounters/{mandatory_encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "triage_requirement" in response.data
        assert response.data["triage_requirement"] == "MANDATORY"

    def test_serializer_includes_triage_status(self, auth_client, mandatory_encounter):
        """Serializer should include triage_status field."""
        response = auth_client.get(f"/api/encounters/{mandatory_encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "triage_status" in response.data
        assert response.data["triage_status"] == "PENDING"

    def test_serializer_includes_triage_bypass_fields(self, auth_client, bypassed_encounter):
        """Serializer should include triage bypass fields."""
        response = auth_client.get(f"/api/encounters/{bypassed_encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "triage_bypass_reason" in response.data
        assert "triage_bypassed_by" in response.data
        assert "triage_bypassed_at" in response.data
        assert response.data["triage_bypass_reason"] == "STABLE_FOLLOW_UP"

    def test_serializer_includes_consultation_status(self, auth_client, mandatory_encounter):
        """Serializer should include consultation_status field."""
        response = auth_client.get(f"/api/encounters/{mandatory_encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "consultation_status" in response.data
        assert response.data["consultation_status"] == "WAITING"

    def test_serializer_includes_called_at(self, auth_client, mandatory_encounter):
        """Serializer should include called_at field."""
        response = auth_client.get(f"/api/encounters/{mandatory_encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "called_at" in response.data

    def test_serializer_includes_consultation_started_at(self, auth_client, mandatory_encounter):
        """Serializer should include consultation_started_at field."""
        response = auth_client.get(f"/api/encounters/{mandatory_encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "consultation_started_at" in response.data

    def test_serializer_includes_can_enter_consultation(self, auth_client, triaged_encounter):
        """Serializer should include can_enter_consultation computed field."""
        response = auth_client.get(f"/api/encounters/{triaged_encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "can_enter_consultation" in response.data
        assert response.data["can_enter_consultation"] is True

    def test_not_required_encounter_shows_not_applicable(self, auth_client, not_required_encounter):
        """NOT_REQUIRED encounters should have triage_status=NOT_APPLICABLE."""
        response = auth_client.get(f"/api/encounters/{not_required_encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["triage_status"] == "NOT_APPLICABLE"
        assert response.data["can_enter_consultation"] is True


# ============================================================================
# Bypass Triage Endpoint Tests
# ============================================================================


@pytest.mark.integration
class TestBypassTriageEndpoint:
    """Test POST /api/encounters/{id}/bypass_triage/ endpoint."""

    def test_bypass_triage_success_for_optional(self, auth_client, optional_encounter, auth_user):
        """Should successfully bypass triage for OPTIONAL encounters."""
        response = auth_client.post(
            f"/api/encounters/{optional_encounter.id}/bypass_triage/",
            {"reason": "STABLE_FOLLOW_UP"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["triage_status"] == "BYPASSED"
        assert response.data["triage_bypass_reason"] == "STABLE_FOLLOW_UP"
        assert response.data["triage_bypassed_by"] == auth_user.id

    def test_bypass_triage_sets_timestamp(self, auth_client, optional_encounter):
        """Should set triage_bypassed_at timestamp."""
        before = timezone.now()
        response = auth_client.post(
            f"/api/encounters/{optional_encounter.id}/bypass_triage/",
            {"reason": "CHRONIC_CARE_REVIEW"},
        )
        after = timezone.now()

        assert response.status_code == status.HTTP_200_OK
        assert response.data["triage_bypassed_at"] is not None
        # Parse timestamp and verify it's within range
        from django.utils.dateparse import parse_datetime

        bypassed_at = parse_datetime(response.data["triage_bypassed_at"])
        assert before <= bypassed_at <= after

    def test_bypass_triage_fails_for_mandatory(self, auth_client, mandatory_encounter):
        """Should reject bypass for MANDATORY encounters."""
        response = auth_client.post(
            f"/api/encounters/{mandatory_encounter.id}/bypass_triage/",
            {"reason": "CONSULTANT_DECISION"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "mandatory" in response.data["detail"].lower()

    def test_bypass_triage_fails_without_reason(self, auth_client, optional_encounter):
        """Should require a bypass reason."""
        response = auth_client.post(
            f"/api/encounters/{optional_encounter.id}/bypass_triage/",
            {},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bypass_triage_fails_with_invalid_reason(self, auth_client, optional_encounter):
        """Should reject invalid bypass reasons."""
        response = auth_client.post(
            f"/api/encounters/{optional_encounter.id}/bypass_triage/",
            {"reason": "INVALID_REASON"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bypass_triage_fails_if_already_completed(self, auth_client, triaged_encounter):
        """Should reject bypass if triage already completed."""
        response = auth_client.post(
            f"/api/encounters/{triaged_encounter.id}/bypass_triage/",
            {"reason": "STABLE_FOLLOW_UP"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bypass_triage_requires_authentication(self, api_client, optional_encounter):
        """Should require authentication."""
        response = api_client.post(
            f"/api/encounters/{optional_encounter.id}/bypass_triage/",
            {"reason": "STABLE_FOLLOW_UP"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_bypass_triage_not_found(self, auth_client):
        """Should return 404 for non-existent encounter."""
        response = auth_client.post(
            "/api/encounters/99999/bypass_triage/",
            {"reason": "STABLE_FOLLOW_UP"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ============================================================================
# Call Patient Endpoint Tests
# ============================================================================


@pytest.mark.integration
class TestCallPatientEndpoint:
    """Test POST /api/encounters/{id}/call/ endpoint."""

    def test_call_patient_success(self, auth_client, triaged_encounter):
        """Should successfully call patient for consultation."""
        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/call/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "CALLED"
        assert response.data["called_at"] is not None

    def test_call_patient_sets_timestamp(self, auth_client, triaged_encounter):
        """Should set called_at timestamp."""
        before = timezone.now()
        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/call/")
        after = timezone.now()

        assert response.status_code == status.HTTP_200_OK
        from django.utils.dateparse import parse_datetime

        called_at = parse_datetime(response.data["called_at"])
        assert before <= called_at <= after

    def test_call_patient_fails_if_not_ready(self, auth_client, mandatory_encounter):
        """Should reject call if encounter not ready for consultation."""
        # mandatory_encounter has triage_status=PENDING, cannot enter consultation
        response = auth_client.post(f"/api/encounters/{mandatory_encounter.id}/call/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert (
            "triage" in response.data["detail"].lower()
            or "consultation" in response.data["detail"].lower()
        )

    def test_call_patient_works_for_bypassed(self, auth_client, bypassed_encounter):
        """Should allow calling patients with bypassed triage."""
        response = auth_client.post(f"/api/encounters/{bypassed_encounter.id}/call/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "CALLED"

    def test_call_patient_works_for_not_applicable(self, auth_client, not_required_encounter):
        """Should allow calling patients with NOT_APPLICABLE triage."""
        response = auth_client.post(f"/api/encounters/{not_required_encounter.id}/call/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "CALLED"

    def test_call_patient_can_recall(self, auth_client, triaged_encounter):
        """Should allow re-calling a patient."""
        # First call
        auth_client.post(f"/api/encounters/{triaged_encounter.id}/call/")

        # Re-call
        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/call/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "CALLED"

    def test_call_patient_fails_if_in_progress(self, auth_client, triaged_encounter):
        """Should reject call if consultation already in progress."""
        triaged_encounter.consultation_status = "IN_PROGRESS"
        triaged_encounter.save()

        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/call/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_call_patient_requires_authentication(self, api_client, triaged_encounter):
        """Should require authentication."""
        response = api_client.post(f"/api/encounters/{triaged_encounter.id}/call/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Start Consultation Endpoint Tests
# ============================================================================


@pytest.mark.integration
class TestStartConsultationEndpoint:
    """Test POST /api/encounters/{id}/start_consultation/ endpoint."""

    def test_start_consultation_success(self, auth_client, triaged_encounter):
        """Should successfully start consultation."""
        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/start_consultation/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "IN_PROGRESS"
        assert response.data["consultation_started_at"] is not None

    def test_start_consultation_sets_timestamp(self, auth_client, triaged_encounter):
        """Should set consultation_started_at timestamp."""
        before = timezone.now()
        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/start_consultation/")
        after = timezone.now()

        assert response.status_code == status.HTTP_200_OK
        from django.utils.dateparse import parse_datetime

        started_at = parse_datetime(response.data["consultation_started_at"])
        assert before <= started_at <= after

    def test_start_consultation_from_waiting(self, auth_client, triaged_encounter):
        """Should allow starting consultation from WAITING status."""
        assert triaged_encounter.consultation_status == "WAITING"

        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/start_consultation/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "IN_PROGRESS"

    def test_start_consultation_from_called(self, auth_client, triaged_encounter):
        """Should allow starting consultation from CALLED status."""
        triaged_encounter.consultation_status = "CALLED"
        triaged_encounter.save()

        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/start_consultation/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "IN_PROGRESS"

    def test_start_consultation_fails_if_not_ready(self, auth_client, mandatory_encounter):
        """Should reject if encounter not ready for consultation."""
        response = auth_client.post(f"/api/encounters/{mandatory_encounter.id}/start_consultation/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_start_consultation_fails_if_already_in_progress(self, auth_client, triaged_encounter):
        """Should reject if consultation already in progress."""
        triaged_encounter.consultation_status = "IN_PROGRESS"
        triaged_encounter.save()

        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/start_consultation/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_start_consultation_fails_if_completed(self, auth_client, triaged_encounter):
        """Should reject if consultation already completed."""
        triaged_encounter.consultation_status = "COMPLETED"
        triaged_encounter.save()

        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/start_consultation/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_start_consultation_requires_authentication(self, api_client, triaged_encounter):
        """Should require authentication."""
        response = api_client.post(f"/api/encounters/{triaged_encounter.id}/start_consultation/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Consultation Queue Endpoint Tests
# ============================================================================


@pytest.mark.integration
class TestConsultationQueueEndpoint:
    """Test GET /api/encounters/consultation_queue/ endpoint."""

    def test_consultation_queue_returns_list(self, auth_client):
        """Should return a list of encounters ready for consultation."""
        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data or isinstance(response.data, list)

    def test_consultation_queue_includes_triaged_encounters(self, auth_client, triaged_encounter):
        """Should include encounters with COMPLETED triage."""
        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert triaged_encounter.id in encounter_ids

    def test_consultation_queue_includes_bypassed_encounters(self, auth_client, bypassed_encounter):
        """Should include encounters with BYPASSED triage."""
        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert bypassed_encounter.id in encounter_ids

    def test_consultation_queue_includes_not_applicable_encounters(
        self, auth_client, not_required_encounter
    ):
        """Should include encounters with NOT_APPLICABLE triage."""
        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert not_required_encounter.id in encounter_ids

    def test_consultation_queue_excludes_pending_mandatory(self, auth_client, mandatory_encounter):
        """Should exclude MANDATORY encounters with PENDING triage."""
        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert mandatory_encounter.id not in encounter_ids

    def test_consultation_queue_excludes_in_progress_consultation(
        self, auth_client, triaged_encounter
    ):
        """Should exclude encounters with IN_PROGRESS consultation."""
        triaged_encounter.consultation_status = "IN_PROGRESS"
        triaged_encounter.save()

        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert triaged_encounter.id not in encounter_ids

    def test_consultation_queue_excludes_completed_consultation(
        self, auth_client, triaged_encounter
    ):
        """Should exclude encounters with COMPLETED consultation."""
        triaged_encounter.consultation_status = "COMPLETED"
        triaged_encounter.save()

        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert triaged_encounter.id not in encounter_ids

    def test_consultation_queue_includes_waiting_and_called(
        self, auth_client, sample_patient, second_patient, sample_facility
    ):
        """Should include both WAITING and CALLED encounters."""
        waiting = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Waiting",
            triage_status="COMPLETED",
            consultation_status="WAITING",
            facility=sample_facility,
        )
        called = Encounter.objects.create(
            patient=second_patient,
            encounter_type="OPD",
            chief_complaint="Called",
            triage_status="COMPLETED",
            consultation_status="CALLED",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert waiting.id in encounter_ids
        assert called.id in encounter_ids

    def test_consultation_queue_includes_patient_info(self, auth_client, triaged_encounter):
        """Should include patient information in queue items."""
        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        encounter_data = next(e for e in results if e["id"] == triaged_encounter.id)

        assert "patient_name" in encounter_data or "patient" in encounter_data
        assert "patient_mrn" in encounter_data or "patient" in encounter_data

    def test_consultation_queue_includes_wait_time(self, auth_client, triaged_encounter):
        """Should include wait time information."""
        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        encounter_data = next(e for e in results if e["id"] == triaged_encounter.id)

        # Should have some form of wait time indication
        assert "wait_time_minutes" in encounter_data or "created_at" in encounter_data

    def test_consultation_queue_sorted_by_priority(
        self, auth_client, sample_patient, second_patient, sample_facility
    ):
        """Should sort by triage priority (RED before GREEN)."""
        # Create encounters with different priorities
        # Note: Actual priority comes from TriageAssessment, but for this test
        # we'll verify the sorting mechanism works
        green = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Green priority",
            triage_status="COMPLETED",
            consultation_status="WAITING",
            facility=sample_facility,
        )
        # Sleep briefly to ensure different timestamps
        import time

        time.sleep(0.01)

        red = Encounter.objects.create(
            patient=second_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Emergency - Red priority",
            triage_status="COMPLETED",
            consultation_status="WAITING",
            facility=sample_facility,
        )

        response = auth_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        # Emergency encounters should appear before non-emergency
        emergency_idx = next((i for i, e in enumerate(results) if e["id"] == red.id), None)
        green_idx = next((i for i, e in enumerate(results) if e["id"] == green.id), None)

        if emergency_idx is not None and green_idx is not None:
            assert emergency_idx < green_idx

    def test_consultation_queue_filter_by_triage_status(
        self, auth_client, triaged_encounter, bypassed_encounter
    ):
        """Should support filtering by triage_status."""
        response = auth_client.get(
            "/api/encounters/consultation_queue/",
            {"triage_status": "COMPLETED"},
        )

        assert response.status_code == status.HTTP_200_OK
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert triaged_encounter.id in encounter_ids
        assert bypassed_encounter.id not in encounter_ids

    def test_consultation_queue_filter_by_consultation_status(
        self, auth_client, sample_patient, sample_facility
    ):
        """Should support filtering by consultation_status."""
        waiting = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Waiting",
            triage_status="COMPLETED",
            consultation_status="WAITING",
            facility=sample_facility,
        )

        response = auth_client.get(
            "/api/encounters/consultation_queue/",
            {"consultation_status": "WAITING"},
        )

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        for encounter in results:
            assert encounter["consultation_status"] == "WAITING"

    def test_consultation_queue_requires_authentication(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/encounters/consultation_queue/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Integration Tests - Full Workflow
# ============================================================================


@pytest.mark.integration
class TestConsultationQueueWorkflow:
    """Test full consultation queue workflow."""

    def test_full_optional_bypass_workflow(self, auth_client, optional_encounter, auth_user):
        """Test complete workflow: bypass triage -> call -> start consultation."""
        # 1. Bypass triage
        response = auth_client.post(
            f"/api/encounters/{optional_encounter.id}/bypass_triage/",
            {"reason": "STABLE_FOLLOW_UP"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["triage_status"] == "BYPASSED"

        # 2. Verify in queue
        response = auth_client.get("/api/encounters/consultation_queue/")
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert optional_encounter.id in encounter_ids

        # 3. Call patient
        response = auth_client.post(f"/api/encounters/{optional_encounter.id}/call/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "CALLED"

        # 4. Start consultation
        response = auth_client.post(f"/api/encounters/{optional_encounter.id}/start_consultation/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "IN_PROGRESS"

        # 5. Verify removed from queue
        response = auth_client.get("/api/encounters/consultation_queue/")
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert optional_encounter.id not in encounter_ids

    def test_full_triaged_workflow(self, auth_client, triaged_encounter):
        """Test complete workflow: already triaged -> call -> start consultation."""
        # 1. Verify in queue
        response = auth_client.get("/api/encounters/consultation_queue/")
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert triaged_encounter.id in encounter_ids

        # 2. Call patient
        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/call/")
        assert response.status_code == status.HTTP_200_OK

        # 3. Start consultation
        response = auth_client.post(f"/api/encounters/{triaged_encounter.id}/start_consultation/")
        assert response.status_code == status.HTTP_200_OK

        # 4. Verify removed from queue
        response = auth_client.get("/api/encounters/consultation_queue/")
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert triaged_encounter.id not in encounter_ids

    def test_direct_to_consultation_workflow(self, auth_client, not_required_encounter):
        """Test workflow for NOT_REQUIRED encounters: direct to call -> start."""
        # 1. Verify already in queue (NOT_APPLICABLE triage)
        response = auth_client.get("/api/encounters/consultation_queue/")
        encounter_ids = [e["id"] for e in response.data.get("results", response.data)]
        assert not_required_encounter.id in encounter_ids

        # 2. Call patient directly
        response = auth_client.post(f"/api/encounters/{not_required_encounter.id}/call/")
        assert response.status_code == status.HTTP_200_OK

        # 3. Start consultation
        response = auth_client.post(
            f"/api/encounters/{not_required_encounter.id}/start_consultation/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["consultation_status"] == "IN_PROGRESS"
