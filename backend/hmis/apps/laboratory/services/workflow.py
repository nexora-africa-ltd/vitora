"""
Lab Order Workflow Service.

Manages state transitions for lab orders with validation and audit logging.
Follows the deliverables specification with improvements for error handling
and validation.
"""

from typing import Any

from django.contrib.auth import get_user_model
from django.utils import timezone

from hmis.apps.core.models import AuditLog
from hmis.apps.laboratory.models import LabOrder

User = get_user_model()


class InvalidTransitionError(Exception):
    """Raised when an invalid state transition is attempted."""
    pass


class LabOrderWorkflow:
    """
    Manages lab order state transitions.
    
    In-House Flow:
    ordered → collected → in_progress → completed
    
    External Flow:
    ordered → collected (sample sent) → completed (results received)
    
    Baseline: Follows deliverables spec code snippet from
    docs/sprint-1.5-1.6-track-b-lab-workflow-deliverables.md
    
    Improvements:
    - Enhanced error handling with specific error messages
    - Type hints for better code clarity
    - Comprehensive validation for each transition
    - Defensive programming for missing relationships
    """

    VALID_TRANSITIONS = {
        'ORDERED': ['SPECIMEN_COLLECTED', 'CANCELLED'],
        'SPECIMEN_COLLECTED': ['IN_PROGRESS', 'CANCELLED'],
        'IN_PROGRESS': ['COMPLETED', 'CANCELLED'],
        'COMPLETED': [],  # Terminal state
        'CANCELLED': [],  # Terminal state
    }

    def __init__(self, lab_order: LabOrder):
        """
        Initialize workflow for a lab order.
        
        Args:
            lab_order: LabOrder instance to manage
        """
        self.lab_order = lab_order

    def can_transition_to(self, new_status: str) -> bool:
        """
        Check if transition is valid.
        
        Args:
            new_status: Target status to transition to
            
        Returns:
            True if transition is allowed, False otherwise
        """
        current = self.lab_order.status
        return new_status in self.VALID_TRANSITIONS.get(current, [])

    def transition_to(self, new_status: str, user: User, **kwargs: Any) -> LabOrder:
        """
        Transition order to new status with validation.
        
        Args:
            new_status: Target status
            user: User performing the action
            **kwargs: Additional data (e.g., sample_id, cancellation_reason)
            
        Returns:
            Updated LabOrder
            
        Raises:
            InvalidTransitionError: If transition is not allowed
        """
        if not self.can_transition_to(new_status):
            raise InvalidTransitionError(
                f"Cannot transition from {self.lab_order.status} to {new_status}"
            )

        # Store previous status for audit log
        previous_status = self.lab_order.status

        # Perform transition with appropriate actions
        if new_status == 'SPECIMEN_COLLECTED':
            self._handle_collection(user, kwargs)
        elif new_status == 'IN_PROGRESS':
            self._handle_processing_start(user)
        elif new_status == 'COMPLETED':
            self._handle_completion(user, kwargs)
        elif new_status == 'CANCELLED':
            self._handle_cancellation(user, kwargs)

        # Update order status
        self.lab_order.status = new_status
        self.lab_order.save()

        # Create audit log
        AuditLog.log(
            action=f'lab_order_{new_status}',
            user=user,
            resource_type='LabOrder',
            resource_id=self.lab_order.id,
            details={
                'previous_status': previous_status,
                'new_status': new_status,
                **kwargs
            }
        )

        return self.lab_order

    def _handle_collection(self, user: User, kwargs: dict) -> None:
        """
        Handle sample collection.
        
        Args:
            user: User collecting the sample
            kwargs: Should contain 'sample_id' (optional)
        """
        if not hasattr(self.lab_order, 'queue_entry'):
            raise InvalidTransitionError(
                "Lab order must have an associated queue entry"
            )

        queue = self.lab_order.queue_entry
        queue.collect_sample(
            collector=user,
            sample_id=kwargs.get('sample_id', '')
        )

    def _handle_processing_start(self, user: User) -> None:
        """
        Handle processing start (in-house only).
        
        Args:
            user: Technician starting processing
            
        Raises:
            InvalidTransitionError: If order is not in-house
        """
        if self.lab_order.order_type != 'IN_HOUSE':
            raise InvalidTransitionError(
                "Only in-house orders can be marked as IN_PROGRESS"
            )

        if not hasattr(self.lab_order, 'queue_entry'):
            raise InvalidTransitionError(
                "Lab order must have an associated queue entry"
            )

        queue = self.lab_order.queue_entry
        queue.start_processing()
        queue.assigned_technician = user
        queue.save()

    def _handle_completion(self, user: User, kwargs: dict) -> None:
        """
        Handle order completion.
        
        Args:
            user: User completing the order
            kwargs: Additional completion data
            
        Raises:
            InvalidTransitionError: If no results exist
        """
        # Verify results exist (check if any order items have results)
        has_results = any(item.has_result() for item in self.lab_order.items.all())
        if not has_results:
            raise InvalidTransitionError(
                "Cannot complete order without results"
            )

        if hasattr(self.lab_order, 'queue_entry'):
            queue = self.lab_order.queue_entry
            queue.release_results(user)

        # Trigger notification
        self._notify_clinician()

    def _handle_cancellation(self, user: User, kwargs: dict) -> None:
        """
        Handle order cancellation.
        
        Args:
            user: User cancelling the order
            kwargs: Must contain 'cancellation_reason'
            
        Raises:
            InvalidTransitionError: If reason is missing
        """
        reason = kwargs.get('cancellation_reason', '')
        if not reason:
            raise InvalidTransitionError(
                "Cancellation requires a reason"
            )

        self.lab_order.cancellation_reason = reason
        self.lab_order.cancelled_by = user
        self.lab_order.cancelled_at = timezone.now()

    def _notify_clinician(self) -> None:
        """Send notification when results are ready."""
        from hmis.apps.laboratory.services.notifications import LabNotificationService
        service = LabNotificationService()
        service.send_result_notification(self.lab_order)
