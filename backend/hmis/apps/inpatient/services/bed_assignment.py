"""
Automatic Bed Assignment Service.

Phase A (MVP): First available bed assignment
Phase B: Rules-based assignment with scoring

Provides both simple (MVP) and rule-based bed assignment.
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
    from hmis.apps.patients.models import Patient


class NoBedAvailableError(Exception):
    """Raised when no beds are available for assignment."""

    pass


class BedAssignmentService:
    """
    Service for automatic bed assignment.

    Provides two assignment modes:
    1. MVP (Phase A): Simple first-available assignment
    2. Rule-Based (Phase B): Constraint + scoring based assignment

    Usage:
        # MVP mode (simple)
        service = BedAssignmentService()
        bed = service.auto_assign_bed(ward, user)

        # Rule-based mode (with patient context)
        result = service.rule_based_assign_bed(
            patient=patient,
            ward=ward,
            user=user,
            requires_isolation=True,
        )
        if result.success:
            bed = result.assigned_bed
    """

    def get_available_beds(self, ward: Ward) -> QuerySet[Bed]:
        """
        Get all available beds in a ward, ordered by bed number.

        Args:
            ward: The ward to query

        Returns:
            QuerySet of available Bed objects, ordered by bed_number
        """
        return Bed.objects.filter(ward=ward, status="AVAILABLE").order_by("bed_number")

    @transaction.atomic
    def auto_assign_bed(
        self,
        ward: Ward,
        user: User,
        ip_address: str = "0.0.0.0",
    ) -> Bed:
        """
        MVP: Automatically assign the first available bed in a ward.

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
            raise NoBedAvailableError(f"No available beds in ward {ward.code} ({ward.name})")

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
                "assignment_type": "automatic_mvp",
            },
            ip_address=ip_address,
        )

        return bed

    @transaction.atomic
    def rule_based_assign_bed(
        self,
        patient: Patient,
        ward: Ward,
        user: User,
        requires_isolation: bool = False,
        requires_oxygen: bool = False,
        requires_ventilator: bool = False,
        admission_type: str = "ELECTIVE",
        ip_address: str = "0.0.0.0",
        mark_as_occupied: bool = True,
    ):
        """
        Phase B: Assign bed using rules-based evaluation.

        Evaluates available beds against:
        - Ward compatibility constraints (gender, age, isolation)
        - Equipment requirements (oxygen, ventilator)
        - Active assignment rules (scoring, custom constraints)

        Args:
            patient: Patient being admitted
            ward: Target ward
            user: User performing the assignment
            requires_isolation: Whether patient needs isolation
            requires_oxygen: Whether patient needs oxygen
            requires_ventilator: Whether patient needs ventilator
            admission_type: Type of admission (ELECTIVE, EMERGENCY)
            ip_address: Client IP for audit
            mark_as_occupied: Whether to mark bed as occupied (default True)

        Returns:
            BedAssignmentRuleResult with assigned bed or error details
        """
        from hmis.apps.inpatient.services.bed_rules import bed_assignment_rule_evaluator

        result = bed_assignment_rule_evaluator.evaluate_beds_for_patient(
            patient=patient,
            ward=ward,
            requires_isolation=requires_isolation,
            requires_oxygen=requires_oxygen,
            requires_ventilator=requires_ventilator,
            admission_type=admission_type,
            user=user,
            ip_address=ip_address,
        )

        # Mark bed as occupied if assignment successful and flag is set
        if result.success and result.assigned_bed and mark_as_occupied:
            # Use select_for_update to prevent race conditions
            bed = (
                Bed.objects.filter(id=result.assigned_bed.id, status="AVAILABLE")
                .select_for_update(skip_locked=True)
                .first()
            )

            if bed is None:
                # Bed was grabbed by another request
                raise NoBedAvailableError(
                    f"Bed {result.assigned_bed.bed_number} was assigned to another patient"
                )

            bed.mark_occupied(user)
            # Update result with refreshed bed
            result.assigned_bed.refresh_from_db()

        return result


# Module-level singleton for convenience
bed_assignment_service = BedAssignmentService()
