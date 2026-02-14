"""
TDD Tests for Encounter State Machine (Sprint 2 - Phase 2A).

Tests the enhanced encounter status lifecycle:
- Extended status choices (CHECKED_IN, TRIAGED, ON_HOLD, etc.)
- State transition validation
- EncounterStateMachine service
- /api/encounters/{id}/transition/ endpoint
- EncounterStateHistory audit table
"""

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.encounters.models import Encounter

# =============================================================================
# Phase 2A: Encounter State Machine
# =============================================================================


class TestEncounterExtendedStatusChoices:
    """Tests for extended encounter status field choices."""

    def test_encounter_has_extended_status_choices(self, sample_encounter):
        """Should support all 10 status values from the state machine."""
        expected_statuses = {
            "CREATED",
            "CHECKED_IN",
            "TRIAGED",
            "IN_PROGRESS",
            "ON_HOLD",
            "ORDERS_PLACED",
            "RESULTS_PENDING",
            "READY_TO_CLOSE",
            "CLOSED",
            "CANCELLED",
        }
        actual_statuses = {choice[0] for choice in Encounter.STATUS_CHOICES}
        assert expected_statuses == actual_statuses

    def test_new_encounter_defaults_to_created(self, sample_patient, authenticated_client):
        """New encounter should default to CREATED status."""
        response = authenticated_client.post(
            "/api/encounters/",
            {
                "patient": sample_patient.id,
                "encounter_type": "OPD",
                "chief_complaint": "Test complaint",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "CREATED"

    def test_encounter_status_stored_correctly(self, sample_encounter):
        """Should store the status field correctly."""
        sample_encounter.status = "CHECKED_IN"
        sample_encounter.save(update_fields=["status"])
        sample_encounter.refresh_from_db()
        assert sample_encounter.status == "CHECKED_IN"


class TestEncounterStateTransitions:
    """Tests for valid/invalid state transitions."""

    def test_valid_transitions_from_created(self, sample_encounter):
        """CREATED should transition to CHECKED_IN or CANCELLED."""
        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        assert sample_encounter.is_valid_transition("CHECKED_IN")
        assert sample_encounter.is_valid_transition("CANCELLED")
        # Invalid transitions
        assert not sample_encounter.is_valid_transition("CLOSED")
        assert not sample_encounter.is_valid_transition("IN_PROGRESS")
        assert not sample_encounter.is_valid_transition("TRIAGED")

    def test_valid_transitions_from_checked_in(self, sample_encounter):
        """CHECKED_IN should transition to TRIAGED, IN_PROGRESS, or CANCELLED."""
        sample_encounter.status = "CHECKED_IN"
        sample_encounter.save(update_fields=["status"])

        assert sample_encounter.is_valid_transition("TRIAGED")
        assert sample_encounter.is_valid_transition("IN_PROGRESS")
        assert sample_encounter.is_valid_transition("CANCELLED")
        # Invalid
        assert not sample_encounter.is_valid_transition("CREATED")
        assert not sample_encounter.is_valid_transition("CLOSED")

    def test_valid_transitions_from_triaged(self, sample_encounter):
        """TRIAGED should transition to IN_PROGRESS or CANCELLED."""
        sample_encounter.status = "TRIAGED"
        sample_encounter.save(update_fields=["status"])

        assert sample_encounter.is_valid_transition("IN_PROGRESS")
        assert sample_encounter.is_valid_transition("CANCELLED")
        assert not sample_encounter.is_valid_transition("CHECKED_IN")

    def test_valid_transitions_from_in_progress(self, sample_encounter):
        """IN_PROGRESS should transition to ON_HOLD, ORDERS_PLACED, READY_TO_CLOSE, or CANCELLED."""
        sample_encounter.status = "IN_PROGRESS"
        sample_encounter.save(update_fields=["status"])

        assert sample_encounter.is_valid_transition("ON_HOLD")
        assert sample_encounter.is_valid_transition("ORDERS_PLACED")
        assert sample_encounter.is_valid_transition("READY_TO_CLOSE")
        assert sample_encounter.is_valid_transition("CANCELLED")
        assert not sample_encounter.is_valid_transition("CREATED")
        assert not sample_encounter.is_valid_transition("CHECKED_IN")

    def test_valid_transitions_from_on_hold(self, sample_encounter):
        """ON_HOLD should transition back to IN_PROGRESS or CANCELLED."""
        sample_encounter.status = "ON_HOLD"
        sample_encounter.save(update_fields=["status"])

        assert sample_encounter.is_valid_transition("IN_PROGRESS")
        assert sample_encounter.is_valid_transition("CANCELLED")
        assert not sample_encounter.is_valid_transition("CLOSED")

    def test_valid_transitions_from_orders_placed(self, sample_encounter):
        """ORDERS_PLACED should transition to RESULTS_PENDING or READY_TO_CLOSE."""
        sample_encounter.status = "ORDERS_PLACED"
        sample_encounter.save(update_fields=["status"])

        assert sample_encounter.is_valid_transition("RESULTS_PENDING")
        assert sample_encounter.is_valid_transition("READY_TO_CLOSE")
        assert not sample_encounter.is_valid_transition("CANCELLED")

    def test_valid_transitions_from_results_pending(self, sample_encounter):
        """RESULTS_PENDING should transition to READY_TO_CLOSE."""
        sample_encounter.status = "RESULTS_PENDING"
        sample_encounter.save(update_fields=["status"])

        assert sample_encounter.is_valid_transition("READY_TO_CLOSE")
        assert not sample_encounter.is_valid_transition("IN_PROGRESS")

    def test_valid_transitions_from_ready_to_close(self, sample_encounter):
        """READY_TO_CLOSE should transition to CLOSED."""
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.save(update_fields=["status"])

        assert sample_encounter.is_valid_transition("CLOSED")
        assert not sample_encounter.is_valid_transition("IN_PROGRESS")

    def test_closed_is_terminal(self, sample_encounter):
        """CLOSED is terminal - no transitions allowed."""
        sample_encounter.status = "CLOSED"
        sample_encounter.save(update_fields=["status"])

        for target in [
            "CREATED",
            "CHECKED_IN",
            "TRIAGED",
            "IN_PROGRESS",
            "ON_HOLD",
            "CANCELLED",
        ]:
            assert not sample_encounter.is_valid_transition(target)

    def test_cancelled_is_terminal(self, sample_encounter):
        """CANCELLED is terminal - no transitions allowed."""
        sample_encounter.status = "CANCELLED"
        sample_encounter.save(update_fields=["status"])

        for target in [
            "CREATED",
            "CHECKED_IN",
            "IN_PROGRESS",
            "CLOSED",
        ]:
            assert not sample_encounter.is_valid_transition(target)


class TestEncounterStateMachineService:
    """Tests for EncounterStateMachine service."""

    def test_transition_valid_state(self, sample_encounter, test_user):
        """Should transition to valid state and return updated encounter."""
        from hmis.apps.encounters.services import EncounterStateMachine

        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        result = EncounterStateMachine.transition(
            encounter=sample_encounter,
            to_status="CHECKED_IN",
            user=test_user,
        )

        sample_encounter.refresh_from_db()
        assert sample_encounter.status == "CHECKED_IN"
        assert result["status"] == "CHECKED_IN"
        assert result["previous_status"] == "CREATED"

    def test_transition_invalid_state_raises(self, sample_encounter, test_user):
        """Should raise ValidationError for invalid transition."""
        from django.core.exceptions import ValidationError

        from hmis.apps.encounters.services import EncounterStateMachine

        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        with pytest.raises(ValidationError):
            EncounterStateMachine.transition(
                encounter=sample_encounter,
                to_status="CLOSED",
                user=test_user,
            )

    def test_transition_records_reason(self, sample_encounter, test_user):
        """Should record optional reason in state history."""
        from hmis.apps.encounters.services import EncounterStateMachine

        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        EncounterStateMachine.transition(
            encounter=sample_encounter,
            to_status="CHECKED_IN",
            user=test_user,
            reason="Patient arrived and verified",
        )

        from hmis.apps.encounters.models import EncounterStateHistory

        history = EncounterStateHistory.objects.filter(encounter=sample_encounter).first()
        assert history is not None
        assert history.reason == "Patient arrived and verified"
        assert history.from_status == "CREATED"
        assert history.to_status == "CHECKED_IN"
        assert history.changed_by == test_user

    def test_transition_from_closed_raises(self, sample_encounter, test_user):
        """Cannot transition from CLOSED terminal state."""
        from django.core.exceptions import ValidationError

        from hmis.apps.encounters.services import EncounterStateMachine

        sample_encounter.status = "CLOSED"
        sample_encounter.save(update_fields=["status"])

        with pytest.raises(ValidationError, match="terminal"):
            EncounterStateMachine.transition(
                encounter=sample_encounter,
                to_status="IN_PROGRESS",
                user=test_user,
            )

    def test_transition_creates_audit_log(self, sample_encounter, test_user):
        """Should create an audit log entry for the transition."""
        from hmis.apps.core.models import AuditLog
        from hmis.apps.encounters.services import EncounterStateMachine

        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        initial_count = AuditLog.objects.count()

        EncounterStateMachine.transition(
            encounter=sample_encounter,
            to_status="CHECKED_IN",
            user=test_user,
        )

        assert AuditLog.objects.count() > initial_count

    def test_close_encounter_records_finalized_by(self, sample_encounter, test_user):
        """Closing encounter should record finalized_by and finalized_at."""
        from hmis.apps.encounters.services import EncounterStateMachine

        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.save(update_fields=["status"])

        EncounterStateMachine.transition(
            encounter=sample_encounter,
            to_status="CLOSED",
            user=test_user,
        )

        sample_encounter.refresh_from_db()
        assert sample_encounter.status == "CLOSED"
        assert sample_encounter.finalized_by == test_user
        assert sample_encounter.finalized_at is not None


class TestEncounterStateHistory:
    """Tests for EncounterStateHistory audit model."""

    def test_state_history_created_on_transition(self, sample_encounter, test_user):
        """State history entry should be created for every transition."""
        from hmis.apps.encounters.models import EncounterStateHistory
        from hmis.apps.encounters.services import EncounterStateMachine

        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        EncounterStateMachine.transition(
            encounter=sample_encounter,
            to_status="CHECKED_IN",
            user=test_user,
        )

        history = EncounterStateHistory.objects.filter(encounter=sample_encounter)
        assert history.count() == 1
        entry = history.first()
        assert entry.from_status == "CREATED"
        assert entry.to_status == "CHECKED_IN"
        assert entry.changed_by == test_user
        assert entry.changed_at is not None

    def test_multiple_transitions_create_history_trail(self, sample_encounter, test_user):
        """Multiple transitions should build a full audit trail."""
        from hmis.apps.encounters.models import EncounterStateHistory
        from hmis.apps.encounters.services import EncounterStateMachine

        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        transitions = [
            ("CHECKED_IN", "Patient arrived"),
            ("TRIAGED", "Vitals taken"),
            ("IN_PROGRESS", "Consultation started"),
            ("READY_TO_CLOSE", "Consultation complete"),
            ("CLOSED", "Clinician signed off"),
        ]

        for to_status, reason in transitions:
            EncounterStateMachine.transition(
                encounter=sample_encounter,
                to_status=to_status,
                user=test_user,
                reason=reason,
            )

        history = EncounterStateHistory.objects.filter(encounter=sample_encounter).order_by(
            "changed_at"
        )
        assert history.count() == 5
        assert list(history.values_list("to_status", flat=True)) == [
            "CHECKED_IN",
            "TRIAGED",
            "IN_PROGRESS",
            "READY_TO_CLOSE",
            "CLOSED",
        ]

    def test_state_history_str_representation(self, sample_encounter, test_user):
        """State history __str__ should show from → to."""
        from hmis.apps.encounters.models import EncounterStateHistory
        from hmis.apps.encounters.services import EncounterStateMachine

        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        EncounterStateMachine.transition(
            encounter=sample_encounter,
            to_status="CHECKED_IN",
            user=test_user,
        )

        entry = EncounterStateHistory.objects.first()
        assert "CREATED" in str(entry)
        assert "CHECKED_IN" in str(entry)


class TestEncounterTransitionAPI:
    """Tests for POST /api/encounters/{id}/transition/ endpoint."""

    def test_transition_endpoint_success(self, authenticated_client, sample_encounter):
        """Should transition encounter and return updated data."""
        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/transition/",
            {"to_status": "CHECKED_IN", "reason": "Patient verified"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_encounter.id
        assert response.data["status"] == "CHECKED_IN"
        assert response.data["previous_status"] == "CREATED"
        assert response.data["transitioned_at"] is not None

    def test_transition_endpoint_invalid_status(self, authenticated_client, sample_encounter):
        """Should return 400 for invalid transition."""
        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/transition/",
            {"to_status": "CLOSED"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_transition_endpoint_missing_status(self, authenticated_client, sample_encounter):
        """Should return 400 when to_status is missing."""
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/transition/",
            {},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_transition_endpoint_requires_auth(self, api_client, sample_encounter):
        """Should require authentication."""
        response = api_client.post(
            f"/api/encounters/{sample_encounter.id}/transition/",
            {"to_status": "CHECKED_IN"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_transition_full_lifecycle(self, authenticated_client, sample_encounter):
        """Should support transitioning through full encounter lifecycle."""
        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        lifecycle = [
            "CHECKED_IN",
            "TRIAGED",
            "IN_PROGRESS",
            "ORDERS_PLACED",
            "RESULTS_PENDING",
            "READY_TO_CLOSE",
            "CLOSED",
        ]

        for target_status in lifecycle:
            response = authenticated_client.post(
                f"/api/encounters/{sample_encounter.id}/transition/",
                {"to_status": target_status},
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["status"] == target_status

    def test_encounter_list_shows_status(self, authenticated_client, sample_encounter):
        """Encounter list should display current status."""
        sample_encounter.status = "IN_PROGRESS"
        sample_encounter.save(update_fields=["status"])

        response = authenticated_client.get("/api/encounters/")
        assert response.status_code == status.HTTP_200_OK

        encounter_data = next(
            (e for e in response.data["results"] if e["id"] == sample_encounter.id),
            None,
        )
        assert encounter_data is not None
        assert encounter_data["status"] == "IN_PROGRESS"

    def test_transition_endpoint_returns_state_history(
        self, authenticated_client, sample_encounter
    ):
        """Transition response should include transitioned_by info."""
        sample_encounter.status = "CREATED"
        sample_encounter.save(update_fields=["status"])

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/transition/",
            {"to_status": "CHECKED_IN"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "transitioned_by" in response.data


class TestEncounterCanEdit:
    """Tests for can_edit with extended statuses."""

    def test_can_edit_in_created(self, sample_encounter):
        """CREATED encounters can be edited."""
        sample_encounter.status = "CREATED"
        assert sample_encounter.can_edit()

    def test_can_edit_in_checked_in(self, sample_encounter):
        """CHECKED_IN encounters can be edited."""
        sample_encounter.status = "CHECKED_IN"
        assert sample_encounter.can_edit()

    def test_can_edit_in_progress(self, sample_encounter):
        """IN_PROGRESS encounters can be edited."""
        sample_encounter.status = "IN_PROGRESS"
        assert sample_encounter.can_edit()

    def test_cannot_edit_closed(self, sample_encounter):
        """CLOSED encounters cannot be edited."""
        sample_encounter.status = "CLOSED"
        assert not sample_encounter.can_edit()

    def test_cannot_edit_cancelled(self, sample_encounter):
        """CANCELLED encounters cannot be edited."""
        sample_encounter.status = "CANCELLED"
        assert not sample_encounter.can_edit()
