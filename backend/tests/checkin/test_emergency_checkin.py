"""
Tests for emergency destination check-in flow.

Validates that patients can be checked in to the Emergency Department
with proper KETA priority flagging and EMERGENCY encounter type.
"""

import pytest  # type: ignore
from rest_framework import status


@pytest.fixture
def emergency_checkin_data():
    """Base data for emergency check-in requests."""
    return {
        "destination": "EMERGENCY",
        "visit_reason": "NEW_COMPLAINT",
        "chief_complaint": "Severe chest pain",
        "notes": "Patient appears distressed",
    }


class TestEmergencyCheckinSerializer:
    """Tests for EMERGENCY destination validation in serializer."""

    def test_emergency_destination_accepted(
        self, authenticated_client, sample_patient, emergency_checkin_data
    ):
        """Should accept EMERGENCY as a valid destination."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            emergency_checkin_data,
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_emergency_destination_case_insensitive(self, authenticated_client, sample_patient):
        """Should accept 'emergency' (lowercase) as destination."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {"destination": "emergency", "visit_reason": "NEW_COMPLAINT"},
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_invalid_destination_rejected(self, authenticated_client, sample_patient):
        """Should reject invalid destination strings."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {"destination": "UNKNOWN", "visit_reason": "NEW_COMPLAINT"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestEmergencyCheckinRouting:
    """Tests for emergency check-in routing behavior."""

    def test_emergency_creates_emergency_encounter(
        self, authenticated_client, sample_patient, emergency_checkin_data
    ):
        """Should create an EMERGENCY encounter type."""
        from hmis.apps.encounters.models import Encounter

        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            emergency_checkin_data,
        )
        assert response.status_code == status.HTTP_201_CREATED

        encounter_id = response.data["encounter_id"]
        encounter = Encounter.objects.get(id=encounter_id)
        assert encounter.encounter_type == "EMERGENCY"

    def test_emergency_sets_visit_type_emergency(
        self, authenticated_client, sample_patient, emergency_checkin_data
    ):
        """Should force visit_type to EMERGENCY regardless of input."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            emergency_checkin_data,
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["visit_type"] == "EMERGENCY"

    def test_emergency_creates_waiting_queue_with_priority(
        self, authenticated_client, sample_patient, emergency_checkin_data
    ):
        """Should create WaitingQueue entry with EMERGENCY priority hint."""
        from hmis.apps.triage.models import WaitingQueue

        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            emergency_checkin_data,
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Find the waiting queue entry
        queue_entry = (
            WaitingQueue.objects.filter(
                patient=sample_patient,
            )
            .order_by("-created_at")
            .first()
        )
        assert queue_entry is not None
        assert queue_entry.priority_hint == "EMERGENCY"
        assert queue_entry.status == "WAITING_TRIAGE"

    def test_emergency_does_not_skip_triage(
        self, authenticated_client, sample_patient, emergency_checkin_data
    ):
        """ER patients must go through triage per KETA protocol."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            emergency_checkin_data,
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["skip_triage"] is False

    def test_emergency_destination_in_response(
        self, authenticated_client, sample_patient, emergency_checkin_data
    ):
        """Response should show EMERGENCY as destination."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            emergency_checkin_data,
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["destination"] == "EMERGENCY"

    def test_emergency_no_clinic_assigned(
        self, authenticated_client, sample_patient, emergency_checkin_data
    ):
        """ER check-in should not assign a clinic."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            emergency_checkin_data,
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["destination_clinic_id"] is None
        assert response.data["destination_clinic_name"] is None

    def test_emergency_with_chief_complaint(self, authenticated_client, sample_patient):
        """Should preserve chief complaint in encounter."""
        from hmis.apps.encounters.models import Encounter

        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": "EMERGENCY",
                "visit_reason": "NEW_COMPLAINT",
                "chief_complaint": "Difficulty breathing, SpO2 88%",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        encounter = Encounter.objects.get(id=response.data["encounter_id"])
        assert "Difficulty breathing" in encounter.chief_complaint


class TestEmergencyCheckinAuth:
    """Tests for authentication on emergency check-in."""

    def test_unauthenticated_emergency_checkin_fails(
        self, api_client, sample_patient, emergency_checkin_data
    ):
        """Should reject unauthenticated emergency check-in."""
        response = api_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            emergency_checkin_data,
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
