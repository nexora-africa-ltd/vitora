"""
Automatic Bed Assignment Service.

MVP Implementation - Phase A:
- First available bed assignment (ordered by bed_number)
- Row-level locking for race condition prevention
- Audit logging for all assignments

Future phases will add:
- Phase B: Rules-based assignment with scoring
- Phase C: Smart allocation with predictive features
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import QuerySet

from hmis.apps.core.models import AuditLog
from hmis.apps.inpatient.models import Bed

if TYPE_CHECKING:
    from django.contrib.auth.models import User

    from hmis.apps.inpatient.models import Ward


class NoBedAvailableError(Exception):
    """Raised when no beds are available for assignment."""

    pass


class BedAssignmentService:
    """
    Service for automatic bed assignment.

    MVP Features:
    - Assigns first available bed in a ward
    - Uses row-level locking to prevent race conditions
    - Deterministic ordering for predictable assignments
    - Full audit trail

    Usage:
        service = BedAssignmentService()
        bed = service.auto_assign_bed(ward, user)
    """

    def get_available_beds(self, ward: Ward) -> QuerySet[Bed]:
        """
        Get all available beds in a ward, ordered by bed number.

        Args:
            ward: The ward to query

        Returns:
            QuerySet of available Bed objects, ordered by bed_number
        """
        return (
            Bed.objects.filter(ward=ward, status="AVAILABLE")
            .order_by("bed_number")
        )

    @transaction.atomic
    def auto_assign_bed(
        self,
        ward: Ward,
        user: User,
        ip_address: str = "0.0.0.0",
    ) -> Bed:
        """
        Automatically assign the first available bed in a ward.

        Uses select_for_update with skip_locked to handle concurrent
        requests safely. The first available bed (ordered by bed_number)
        is assigned to prevent non-deterministic behavior.

        Args:
            ward: The ward to assign a bed from
            user: User performing the assignment (for audit)
            ip_address: Client IP for audit logging

        Returns:
            The assigned Bed object (status updated to OCCUPIED)

        Raises:
            NoBedAvailableError: If no beds are available in the ward
        """
        # Use select_for_update with skip_locked to prevent race conditions
        # skip_locked ensures concurrent requests don't block each other
        bed = (
            Bed.objects.filter(ward=ward, status="AVAILABLE")
            .select_for_update(skip_locked=True)
            .order_by("bed_number")
            .first()
        )

        if bed is None:
            raise NoBedAvailableError(
                f"No available beds in ward {ward.code} ({ward.name})"
            )

        # Mark as occupied
        bed.mark_occupied(user)

        # Create audit log
        AuditLog.log(
            action="bed_auto_assigned",
            user=user,
            resource_type="Bed",
            resource_id=bed.id,
            details={
                "ward": ward.code,
                "ward_name": ward.name,
                "bed_number": bed.bed_number,
                "assignment_type": "automatic",
            },
            ip_address=ip_address,
        )

        return bed


# Module-level singleton for convenience
bed_assignment_service = BedAssignmentService()
