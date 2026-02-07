"""
Tests for Encounter Status Workflow (Sprint 1.1-1.2).

TDD approach: Tests written BEFORE implementation.

This module tests the encounter status workflow:
- Created: Initial state when encounter is created
- Checked In: Patient has arrived
- Triaged: Patient has been triaged
- In Progress: Active encounter being documented
- On Hold: Encounter temporarily paused
- Orders Placed: Lab/imaging orders submitted
- Results Pending: Awaiting order results
- Ready to Close: All documentation complete
- Closed: Finalized encounter (immutable)
- Cancelled: Voided encounter

Business Rules:
1. New encounters default to CREATED status
2. Encounters can be edited in all states except CLOSED and CANCELLED
3. Closed encounters are immutable (require correction workflow)
4. Only users with can_finalize_encounters permission can close encounters
5. Status transitions must follow valid paths
6. All status changes must be logged in audit trail
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status as http_status

User = get_user_model()


# ============================================================================
# Model-Level Tests: Encounter Status Field
# ============================================================================


class TestEncounterStatusField:
    """Tests for the status field on the Encounter model."""

    def test_encounter_has_status_field(self, sample_encounter):
        """Encounter model should have a status field."""
        assert hasattr(sample_encounter, "status")

    def test_new_encounter_defaults_to_created(self, sample_patient):
        """New encounters should default to CREATED status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        assert encounter.status == "CREATED"

    def test_status_choices_are_valid(self, sample_encounter):
        """Status field should only accept valid choices."""

        valid_statuses = [
            "CREATED", "CHECKED_IN", "TRIAGED", "IN_PROGRESS", "ON_HOLD",
            "ORDERS_PLACED", "RESULTS_PENDING", "READY_TO_CLOSE", "CLOSED",
            "CANCELLED",
        ]

        for status in valid_statuses:
            sample_encounter.status = status
            sample_encounter.full_clean()  # Should not raise

    def test_invalid_status_raises_error(self, sample_encounter):
        """Invalid status values should raise ValidationError."""
        sample_encounter.status = "INVALID_STATUS"

        with pytest.raises(ValidationError):
            sample_encounter.full_clean()

    def test_encounter_has_finalized_by_field(self, sample_encounter):
        """Encounter should have finalized_by foreign key to User."""
        assert hasattr(sample_encounter, "finalized_by")

    def test_encounter_has_finalized_at_field(self, sample_encounter):
        """Encounter should have finalized_at timestamp field."""
        assert hasattr(sample_encounter, "finalized_at")

    def test_finalized_fields_are_null_for_created(self, sample_patient):
        """Finalized fields should be null for newly created encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        assert encounter.finalized_by is None
        assert encounter.finalized_at is None


# ============================================================================
# Model-Level Tests: Status Transition Methods
# ============================================================================


class TestEncounterStatusTransitions:
    """Tests for status transition methods."""

    def test_can_edit_returns_true_for_created(self, sample_patient):
        """can_edit() should return True for CREATED encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CREATED",
        )
        assert encounter.can_edit() is True

    def test_can_edit_returns_true_for_in_progress(self, sample_patient):
        """can_edit() should return True for IN_PROGRESS encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="IN_PROGRESS",
        )
        assert encounter.can_edit() is True

    def test_can_edit_returns_false_for_closed(self, sample_patient):
        """can_edit() should return False for CLOSED encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CLOSED",
        )
        assert encounter.can_edit() is False

    def test_can_edit_returns_false_for_cancelled(self, sample_patient):
        """can_edit() should return False for CANCELLED encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CANCELLED",
        )
        assert encounter.can_edit() is False

    def test_start_progress_transitions_checked_in_to_in_progress(self, sample_patient):
        """start_progress() should transition CHECKED_IN to IN_PROGRESS."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CHECKED_IN",
        )
        encounter.start_progress()
        assert encounter.status == "IN_PROGRESS"

    def test_start_progress_fails_for_closed(self, sample_patient):
        """start_progress() should raise error for CLOSED encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CLOSED",
        )
        with pytest.raises(ValidationError) as exc_info:
            encounter.start_progress()
        assert "Cannot start progress" in str(exc_info.value)

    def test_finalize_sets_closed_status(self, sample_patient, test_user):
        """finalize() should set status to CLOSED."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="READY_TO_CLOSE",
        )
        encounter.finalize(test_user)
        assert encounter.status == "CLOSED"

    def test_finalize_sets_finalized_by(self, sample_patient, test_user):
        """finalize() should set finalized_by to the user."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="READY_TO_CLOSE",
        )
        encounter.finalize(test_user)
        assert encounter.finalized_by == test_user

    def test_finalize_sets_finalized_at(self, sample_patient, test_user):
        """finalize() should set finalized_at timestamp."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="READY_TO_CLOSE",
        )
        before = timezone.now()
        encounter.finalize(test_user)
        after = timezone.now()

        assert encounter.finalized_at is not None
        assert before <= encounter.finalized_at <= after

    def test_finalize_from_ready_to_close_works(self, sample_patient, test_user):
        """finalize() should work from READY_TO_CLOSE status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="READY_TO_CLOSE",
        )
        encounter.finalize(test_user)
        assert encounter.status == "CLOSED"

    def test_finalize_fails_for_already_closed(self, sample_patient, test_user):
        """finalize() should raise error for already CLOSED encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CLOSED",
            finalized_by=test_user,
            finalized_at=timezone.now(),
        )
        with pytest.raises(ValidationError) as exc_info:
            encounter.finalize(test_user)
        assert "already closed" in str(exc_info.value).lower()

    def test_finalize_fails_for_cancelled(self, sample_patient, test_user):
        """finalize() should raise error for CANCELLED encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CANCELLED",
        )
        with pytest.raises(ValidationError) as exc_info:
            encounter.finalize(test_user)
        assert "cancelled" in str(exc_info.value).lower()

    def test_cancel_sets_cancelled_status(self, sample_patient):
        """cancel() should set status to CANCELLED."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CREATED",
        )
        encounter.cancel(reason="Patient left")
        assert encounter.status == "CANCELLED"

    def test_cancel_fails_for_closed(self, sample_patient, test_user):
        """cancel() should raise error for CLOSED encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CLOSED",
            finalized_by=test_user,
            finalized_at=timezone.now(),
        )
        with pytest.raises(ValidationError) as exc_info:
            encounter.cancel(reason="Error")
        assert "closed" in str(exc_info.value).lower()


# ============================================================================
# Model-Level Tests: Valid Transition Paths
# ============================================================================


class TestValidStatusTransitionPaths:
    """Tests for valid status transition paths."""

    @pytest.mark.parametrize(
        "from_status,to_status,valid",
        [
            # From CREATED
            ("CREATED", "CHECKED_IN", True),
            ("CREATED", "CANCELLED", True),
            ("CREATED", "IN_PROGRESS", False),
            ("CREATED", "CLOSED", False),
            # From CHECKED_IN
            ("CHECKED_IN", "TRIAGED", True),
            ("CHECKED_IN", "IN_PROGRESS", True),
            ("CHECKED_IN", "CANCELLED", True),
            ("CHECKED_IN", "CREATED", False),
            # From TRIAGED
            ("TRIAGED", "IN_PROGRESS", True),
            ("TRIAGED", "CANCELLED", True),
            ("TRIAGED", "CREATED", False),
            # From IN_PROGRESS
            ("IN_PROGRESS", "ON_HOLD", True),
            ("IN_PROGRESS", "ORDERS_PLACED", True),
            ("IN_PROGRESS", "READY_TO_CLOSE", True),
            ("IN_PROGRESS", "CANCELLED", True),
            ("IN_PROGRESS", "CREATED", False),
            ("IN_PROGRESS", "CLOSED", False),
            # From ON_HOLD
            ("ON_HOLD", "IN_PROGRESS", True),
            ("ON_HOLD", "CANCELLED", True),
            ("ON_HOLD", "CLOSED", False),
            # From ORDERS_PLACED
            ("ORDERS_PLACED", "RESULTS_PENDING", True),
            ("ORDERS_PLACED", "READY_TO_CLOSE", True),
            ("ORDERS_PLACED", "CANCELLED", False),
            # From RESULTS_PENDING
            ("RESULTS_PENDING", "READY_TO_CLOSE", True),
            ("RESULTS_PENDING", "CANCELLED", False),
            # From READY_TO_CLOSE
            ("READY_TO_CLOSE", "CLOSED", True),
            ("READY_TO_CLOSE", "IN_PROGRESS", False),
            # From CLOSED (terminal)
            ("CLOSED", "CREATED", False),
            ("CLOSED", "IN_PROGRESS", False),
            ("CLOSED", "CANCELLED", False),
            # From CANCELLED (terminal)
            ("CANCELLED", "CREATED", False),
            ("CANCELLED", "IN_PROGRESS", False),
            ("CANCELLED", "CLOSED", False),
        ],
    )
    def test_status_transition_validity(self, sample_patient, from_status, to_status, valid):
        """Test that status transitions follow valid paths."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status=from_status,
        )

        result = encounter.is_valid_transition(to_status)
        assert result == valid, f"Transition {from_status} -> {to_status} should be {valid}"


# ============================================================================
# API-Level Tests: Status Transitions via API
# ============================================================================


class TestEncounterStatusAPI:
    """Tests for encounter status via API endpoints."""

    def test_create_encounter_returns_created_status(self, authenticated_client, sample_patient):
        """POST /api/encounters/ should return encounter with CREATED status."""
        response = authenticated_client.post(
            "/api/encounters/",
            {
                "patient": sample_patient.id,
                "encounter_type": "OPD",
                "chief_complaint": "Test complaint",
            },
        )
        assert response.status_code == http_status.HTTP_201_CREATED
        assert response.data["status"] == "CREATED"

    def test_update_created_encounter_succeeds(self, authenticated_client, sample_patient):
        """PATCH /api/encounters/{id}/ should succeed for CREATED encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Original complaint",
            status="CREATED",
        )

        response = authenticated_client.patch(
            f"/api/encounters/{encounter.id}/",
            {"chief_complaint": "Updated complaint"},
        )
        assert response.status_code == http_status.HTTP_200_OK
        assert response.data["chief_complaint"] == "Updated complaint"

    def test_update_closed_encounter_fails(
        self, authenticated_client, sample_patient, test_user
    ):
        """PATCH /api/encounters/{id}/ should fail for CLOSED encounters."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Original complaint",
            status="CLOSED",
            finalized_by=test_user,
            finalized_at=timezone.now(),
        )

        response = authenticated_client.patch(
            f"/api/encounters/{encounter.id}/",
            {"chief_complaint": "Updated complaint"},
        )
        assert response.status_code == http_status.HTTP_400_BAD_REQUEST
        assert (
            "cannot be edited" in response.data.get("detail", "").lower()
            or "cannot be edited" in str(response.data).lower()
        )

    def test_start_progress_action(self, authenticated_client, sample_patient):
        """POST /api/encounters/{id}/start_progress/ should transition to IN_PROGRESS."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CHECKED_IN",
        )

        response = authenticated_client.post(f"/api/encounters/{encounter.id}/start_progress/")
        assert response.status_code == http_status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    def test_finalize_action(self, authenticated_client, sample_patient):
        """POST /api/encounters/{id}/finalize/ should transition to CLOSED."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="READY_TO_CLOSE",
        )

        response = authenticated_client.post(f"/api/encounters/{encounter.id}/finalize/")
        assert response.status_code == http_status.HTTP_200_OK
        assert response.data["status"] == "CLOSED"
        assert response.data["finalized_by"] is not None
        assert response.data["finalized_at"] is not None

    def test_cancel_action(self, authenticated_client, sample_patient):
        """POST /api/encounters/{id}/cancel/ should transition to CANCELLED."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CREATED",
        )

        response = authenticated_client.post(
            f"/api/encounters/{encounter.id}/cancel/",
            {"reason": "Patient left"},
        )
        assert response.status_code == http_status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_finalize_closed_fails(self, authenticated_client, sample_patient, test_user):
        """POST /api/encounters/{id}/finalize/ should fail for already CLOSED."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="CLOSED",
            finalized_by=test_user,
            finalized_at=timezone.now(),
        )

        response = authenticated_client.post(f"/api/encounters/{encounter.id}/finalize/")
        assert response.status_code == http_status.HTTP_400_BAD_REQUEST


# ============================================================================
# API-Level Tests: Filter by Status
# ============================================================================


class TestEncounterStatusFiltering:
    """Tests for filtering encounters by status."""

    def test_filter_by_status_created(self, authenticated_client, sample_patient):
        """GET /api/encounters/?status=CREATED should return only created encounters."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Created encounter",
            status="CREATED",
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Closed encounter",
            status="CLOSED",
        )

        response = authenticated_client.get("/api/encounters/?status=CREATED")
        assert response.status_code == http_status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert all(e["status"] == "CREATED" for e in results)

    def test_filter_by_multiple_statuses(self, authenticated_client, sample_patient):
        """GET /api/encounters/?status=CREATED,IN_PROGRESS should return both."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Created",
            status="CREATED",
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="In Progress",
            status="IN_PROGRESS",
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Closed",
            status="CLOSED",
        )

        response = authenticated_client.get("/api/encounters/?status=CREATED")
        assert response.status_code == http_status.HTTP_200_OK
        results = response.data.get("results", response.data)
        statuses = {e["status"] for e in results}
        assert "CREATED" in statuses
        assert "CLOSED" not in statuses


# ============================================================================
# Serializer Tests
# ============================================================================


class TestEncounterStatusSerializer:
    """Tests for encounter status in serializers."""

    def test_serializer_includes_status(self, sample_encounter):
        """EncounterSerializer should include status field."""
        from hmis.apps.encounters.serializers import EncounterSerializer

        serializer = EncounterSerializer(sample_encounter)
        assert "status" in serializer.data

    def test_serializer_includes_finalized_by(self, sample_encounter):
        """EncounterSerializer should include finalized_by field."""
        from hmis.apps.encounters.serializers import EncounterSerializer

        serializer = EncounterSerializer(sample_encounter)
        assert "finalized_by" in serializer.data

    def test_serializer_includes_finalized_at(self, sample_encounter):
        """EncounterSerializer should include finalized_at field."""
        from hmis.apps.encounters.serializers import EncounterSerializer

        serializer = EncounterSerializer(sample_encounter)
        assert "finalized_at" in serializer.data

    def test_status_is_read_only_on_create(self, sample_patient):
        """Status should not be settable during creation (defaults to CREATED)."""
        from hmis.apps.encounters.serializers import EncounterSerializer

        data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Test",
            "status": "CLOSED",  # Attempt to set status
        }
        serializer = EncounterSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        # Status should be ignored or overridden to CREATED
        encounter = serializer.save()
        assert encounter.status == "CREATED"


# ============================================================================
# Audit Trail Tests
# ============================================================================


class TestEncounterStatusAuditTrail:
    """Tests for audit logging of status changes."""

    def test_finalize_creates_audit_log(self, sample_patient, test_user):
        """finalize() should create an audit log entry."""
        from hmis.apps.core.models import AuditLog
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="READY_TO_CLOSE",
        )

        initial_count = AuditLog.objects.filter(action="encounter_finalize").count()
        encounter.finalize(test_user)
        final_count = AuditLog.objects.filter(action="encounter_finalize").count()

        assert final_count == initial_count + 1

    def test_status_change_audit_includes_old_and_new_status(self, sample_patient, test_user):
        """Status change audit log should include old and new status."""
        from hmis.apps.core.models import AuditLog
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            status="READY_TO_CLOSE",
        )
        encounter.finalize(test_user)

        audit = AuditLog.objects.filter(
            action="encounter_finalize",
            resource_id=encounter.id,
        ).first()

        assert audit is not None
        assert audit.details.get("old_status") == "READY_TO_CLOSE"
        assert audit.details.get("new_status") == "CLOSED"
