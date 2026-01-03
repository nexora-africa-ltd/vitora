"""
Laboratory services for Vitora HMIS.

This module provides service layer for laboratory workflow management,
critical result alerts, and business logic.
"""

from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db.models import Q, QuerySet
from django.utils import timezone

from .models import LabOrder


class LabWorkflowService:
    """Service for managing lab order workflow."""

    @staticmethod
    def submit_order(order: LabOrder, user) -> LabOrder:
        """
        Submit order for processing.

        Args:
            order: LabOrder instance
            user: User submitting the order

        Returns:
            Updated LabOrder instance

        Raises:
            ValidationError: If order has no items
        """
        if not order.items.exists():
            raise ValidationError("Cannot submit order without test items")

        order.update_status("ORDERED", user)
        return order

    @staticmethod
    def collect_specimen(order: LabOrder, user) -> LabOrder:
        """
        Record specimen collection.

        Args:
            order: LabOrder instance
            user: User collecting the specimen

        Returns:
            Updated LabOrder instance
        """
        order.mark_specimen_collected(user)
        return order

    @staticmethod
    def start_processing(order: LabOrder, user) -> LabOrder:
        """
        Mark order as in progress.

        Args:
            order: LabOrder instance
            user: User starting processing

        Returns:
            Updated LabOrder instance
        """
        order.update_status("IN_PROGRESS", user)
        return order

    @staticmethod
    def complete_order(order: LabOrder, user) -> LabOrder:
        """
        Mark order as completed (all results in).

        Args:
            order: LabOrder instance
            user: User completing the order

        Returns:
            Updated LabOrder instance

        Raises:
            ValidationError: If not all results are in
        """
        if not order.is_complete():
            raise ValidationError("Cannot complete order - not all results are in")

        order.update_status("COMPLETED", user)
        return order

    @staticmethod
    def cancel_order(order: LabOrder, user, reason: str) -> LabOrder:
        """
        Cancel order with reason.

        Args:
            order: LabOrder instance
            user: User cancelling the order
            reason: Reason for cancellation

        Returns:
            Updated LabOrder instance
        """
        order.update_status("CANCELLED", user)
        order.clinical_notes += f"\n\nCANCELLED: {reason}"
        order.save()
        return order

    @staticmethod
    def reject_specimen(order: LabOrder, user, reason: str) -> LabOrder:
        """
        Reject specimen (hemolyzed, wrong container, etc.).

        Args:
            order: LabOrder instance
            user: User rejecting the specimen
            reason: Reason for rejection

        Returns:
            Updated LabOrder instance
        """
        order.update_status("REJECTED", user)
        order.clinical_notes += f"\n\nREJECTED: {reason}"
        order.save()
        return order


class LabAlertService:
    """Service for lab-related alerts."""

    @staticmethod
    def check_critical_results(order: LabOrder) -> list[str]:
        """
        Check for critical results requiring immediate attention.

        Args:
            order: LabOrder instance

        Returns:
            List of critical result alert messages
        """
        alerts = []

        for item in order.items.all():
            if item.has_result():
                result = item.result
                if result.is_critical():
                    test_name = item.test.name
                    value = result.get_formatted_value()
                    flag = result.result_flag.replace("_", " ").title()
                    alerts.append(f"{test_name}: {value} ({flag})")

        return alerts

    @staticmethod
    def notify_ordering_clinician(order: LabOrder) -> None:
        """
        Notify clinician when results are ready.
        
        Sends in-app notification and email for critical results.

        Args:
            order: LabOrder instance with completed results
        """
        from hmis.apps.laboratory.services.notifications import LabNotificationService

        service = LabNotificationService()
        service.send_result_notification(order)

    @staticmethod
    def get_overdue_orders(hours: int = 24) -> QuerySet:
        """
        Get orders exceeding expected TAT.

        Args:
            hours: Number of hours after which order is considered overdue

        Returns:
            QuerySet of overdue LabOrder instances
        """
        cutoff = timezone.now() - timedelta(hours=hours)

        return LabOrder.objects.filter(
            Q(status="IN_PROGRESS") | Q(status="SPECIMEN_COLLECTED"),
            ordered_at__lt=cutoff,
        )
