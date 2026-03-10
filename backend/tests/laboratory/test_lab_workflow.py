"""
Tests for LabOrderWorkflow service.

This module tests the lab order state transition workflow service,
ensuring proper validation and audit logging.
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model

from hmis.apps.core.models import AuditLog
from hmis.apps.laboratory.services import InvalidTransitionError, LabOrderWorkflow

User = get_user_model()


@pytest.mark.django_db
class TestLabOrderWorkflow:
    """Tests for LabOrderWorkflow service class."""

    def test_valid_transition_ordered_to_collected(self, sample_lab_order, test_user):
        """Should allow transition from ORDERED to SPECIMEN_COLLECTED."""
        workflow = LabOrderWorkflow(sample_lab_order)

        assert workflow.can_transition_to("SPECIMEN_COLLECTED") is True

        updated_order = workflow.transition_to(
            "SPECIMEN_COLLECTED", user=test_user, sample_id="TUBE-12345"
        )

        assert updated_order.status == "SPECIMEN_COLLECTED"
        assert hasattr(updated_order, "queue_entry")
        assert updated_order.queue_entry.sample_id == "TUBE-12345"
        assert updated_order.queue_entry.specimen is not None
        assert updated_order.queue_entry.specimen.barcode == "TUBE-12345"

    def test_valid_transition_collected_to_in_progress(self, sample_lab_order, test_user):
        """Should allow transition from SPECIMEN_COLLECTED to IN_PROGRESS for in-house orders."""
        sample_lab_order.order_type = "IN_HOUSE"
        sample_lab_order.status = "SPECIMEN_COLLECTED"
        sample_lab_order.save()

        workflow = LabOrderWorkflow(sample_lab_order)

        assert workflow.can_transition_to("IN_PROGRESS") is True

        updated_order = workflow.transition_to("IN_PROGRESS", user=test_user)

        assert updated_order.status == "IN_PROGRESS"
        assert updated_order.queue_entry.queue_status == "PROCESSING"
        assert updated_order.queue_entry.assigned_technician == test_user

    def test_valid_transition_in_progress_to_completed(
        self, sample_lab_order, test_user, sample_lab_result
    ):
        """Should allow transition from IN_PROGRESS to COMPLETED when results exist."""
        sample_lab_order.status = "IN_PROGRESS"
        sample_lab_order.save()

        workflow = LabOrderWorkflow(sample_lab_order)

        assert workflow.can_transition_to("COMPLETED") is True

        updated_order = workflow.transition_to("COMPLETED", user=test_user)

        assert updated_order.status == "COMPLETED"
        assert updated_order.queue_entry.queue_status == "RELEASED"
        assert updated_order.queue_entry.released_at is not None

    def test_invalid_transition_ordered_to_completed(self, sample_lab_order, test_user):
        """Should reject transition from ORDERED directly to COMPLETED."""
        workflow = LabOrderWorkflow(sample_lab_order)

        assert workflow.can_transition_to("COMPLETED") is False

        with pytest.raises(InvalidTransitionError) as exc_info:
            workflow.transition_to("COMPLETED", user=test_user)

        assert "Cannot transition from ORDERED to COMPLETED" in str(exc_info.value)

    def test_invalid_transition_completed_to_anything(self, sample_lab_order, test_user):
        """Should reject any transition from COMPLETED (terminal state)."""
        sample_lab_order.status = "COMPLETED"
        sample_lab_order.save()

        workflow = LabOrderWorkflow(sample_lab_order)

        assert workflow.can_transition_to("SPECIMEN_COLLECTED") is False
        assert workflow.can_transition_to("IN_PROGRESS") is False
        assert workflow.can_transition_to("CANCELLED") is False

        with pytest.raises(InvalidTransitionError):
            workflow.transition_to("SPECIMEN_COLLECTED", user=test_user)

    def test_cancellation_requires_reason(self, sample_lab_order, test_user):
        """Should require cancellation reason."""
        workflow = LabOrderWorkflow(sample_lab_order)

        assert workflow.can_transition_to("CANCELLED") is True

        with pytest.raises(InvalidTransitionError) as exc_info:
            workflow.transition_to("CANCELLED", user=test_user)

        assert "reason" in str(exc_info.value).lower()

        # Should succeed with reason
        updated_order = workflow.transition_to(
            "CANCELLED", user=test_user, cancellation_reason="Patient declined test"
        )

        assert updated_order.status == "CANCELLED"
        assert updated_order.cancellation_reason == "Patient declined test"
        assert updated_order.cancelled_by == test_user

    def test_completion_requires_results(self, sample_lab_order, test_user):
        """Should reject completion if no results exist."""
        sample_lab_order.status = "IN_PROGRESS"
        sample_lab_order.save()

        workflow = LabOrderWorkflow(sample_lab_order)

        with pytest.raises(InvalidTransitionError) as exc_info:
            workflow.transition_to("COMPLETED", user=test_user)

        assert "results" in str(exc_info.value).lower()

    def test_in_progress_only_for_in_house(self, sample_lab_order, test_user):
        """Should reject IN_PROGRESS status for external orders."""
        sample_lab_order.order_type = "EXTERNAL"
        sample_lab_order.status = "SPECIMEN_COLLECTED"
        sample_lab_order.save()

        workflow = LabOrderWorkflow(sample_lab_order)

        with pytest.raises(InvalidTransitionError) as exc_info:
            workflow.transition_to("IN_PROGRESS", user=test_user)

        assert "in-house" in str(exc_info.value).lower()

    def test_transition_creates_audit_log(self, sample_lab_order, test_user):
        """Should create audit log entry for each transition."""
        initial_count = AuditLog.objects.count()

        workflow = LabOrderWorkflow(sample_lab_order)
        workflow.transition_to("SPECIMEN_COLLECTED", user=test_user, sample_id="TUBE-001")

        assert AuditLog.objects.count() == initial_count + 1

        log = AuditLog.objects.latest("timestamp")
        assert log.action == "lab_order_SPECIMEN_COLLECTED"
        assert log.user == test_user
        assert log.resource_type == "LabOrder"
        assert log.resource_id == sample_lab_order.id

    def test_completion_triggers_notification(
        self, sample_lab_order, test_user, sample_lab_result, mocker
    ):
        """Should trigger notification when results are completed."""
        sample_lab_order.status = "IN_PROGRESS"
        sample_lab_order.save()

        # Mock notification service method
        mock_send = mocker.patch(
            "hmis.apps.laboratory.services.notifications.LabNotificationService.send_result_notification"
        )

        workflow = LabOrderWorkflow(sample_lab_order)
        workflow.transition_to("COMPLETED", user=test_user)

        mock_send.assert_called_once_with(sample_lab_order)

    def test_sample_collection_records_user(self, sample_lab_order, test_user):
        """Should record collecting user during collection transition."""
        workflow = LabOrderWorkflow(sample_lab_order)
        workflow.transition_to("SPECIMEN_COLLECTED", user=test_user, sample_id="TUBE-999")

        sample_lab_order.refresh_from_db()
        queue = sample_lab_order.queue_entry

        assert queue.collected_by == test_user
        assert queue.collected_at is not None
        assert queue.sample_id == "TUBE-999"
        assert queue.specimen is not None
        assert queue.specimen.barcode == "TUBE-999"

    def test_processing_assigns_technician(self, sample_lab_order, test_user):
        """Should auto-assign technician during processing transition."""
        sample_lab_order.order_type = "IN_HOUSE"
        sample_lab_order.status = "SPECIMEN_COLLECTED"
        sample_lab_order.save()

        workflow = LabOrderWorkflow(sample_lab_order)
        workflow.transition_to("IN_PROGRESS", user=test_user)

        sample_lab_order.refresh_from_db()
        queue = sample_lab_order.queue_entry

        assert queue.assigned_technician == test_user
        assert queue.processing_started_at is not None
