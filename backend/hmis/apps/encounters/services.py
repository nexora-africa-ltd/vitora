"""
Services for encounters app.

Phase 2.3: Notification System - Patient Called notifications
Sprint 2 - Phase 2A: Encounter State Machine
"""

from typing import Optional

from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.core.models import AuditLog, Notification


class EncounterStateMachine:
    """
    Service for managing encounter state transitions.

    Validates transitions, updates encounter status, creates state
    history audit records, and logs to audit log.

    Sprint 2 - Phase 2A
    """

    @staticmethod
    def transition(
        encounter,
        to_status: str,
        user,
        reason: str = "",
        ip_address: Optional[str] = None,
    ) -> dict:
        """
        Transition an encounter to a new status.

        Args:
            encounter: The Encounter instance
            to_status: Target status
            user: User performing the transition
            reason: Optional reason for the transition
            ip_address: Optional IP address for audit

        Returns:
            dict with transition details

        Raises:
            ValidationError: If the transition is not valid
        """
        from hmis.apps.encounters.models import EncounterStateHistory

        from_status = encounter.status

        # Check terminal states
        if not encounter.VALID_TRANSITIONS.get(from_status):
            raise ValidationError(
                f"Encounter is in terminal state '{from_status}'. "
                "No transitions allowed."
            )

        # Validate transition
        if not encounter.is_valid_transition(to_status):
            valid_targets = encounter.VALID_TRANSITIONS.get(from_status, set())
            raise ValidationError(
                f"Invalid transition from '{from_status}' to '{to_status}'. "
                f"Valid transitions: {', '.join(sorted(valid_targets)) or 'none'}."
            )

        # Special handling for CLOSED
        if to_status == "CLOSED":
            encounter.finalized_by = user
            encounter.finalized_at = timezone.now()

        # Update status
        encounter.status = to_status
        update_fields = ["status", "updated_at"]
        if to_status == "CLOSED":
            update_fields.extend(["finalized_by", "finalized_at"])
        encounter.save(update_fields=update_fields)

        # Create state history entry
        EncounterStateHistory.objects.create(
            encounter=encounter,
            from_status=from_status,
            to_status=to_status,
            changed_by=user,
            reason=reason,
        )

        # Create audit log
        AuditLog.log(
            action="encounter_transition",
            user=user,
            resource_type="Encounter",
            resource_id=encounter.id,
            ip_address=ip_address,
            user_agent="",
            patient_id=encounter.patient_id,
            details={
                "from_status": from_status,
                "to_status": to_status,
                "reason": reason,
                "encounter_type": encounter.encounter_type,
            },
        )

        return {
            "id": encounter.id,
            "status": to_status,
            "previous_status": from_status,
            "transitioned_at": timezone.now().isoformat(),
            "transitioned_by": user.username,
        }


def create_patient_called_notification(encounter, called_by):
    """
    Create a notification when a patient is called for consultation.

    Args:
        encounter: The Encounter instance being called
        called_by: The User who called the patient

    Returns:
        Notification: The created notification instance
    """
    patient = encounter.patient
    patient_name = f"{patient.first_name} {patient.last_name}"
    patient_mrn = patient.mrn

    # Create notification for staff in waiting room / reception
    # For now, we create one for the calling user (can be expanded)
    notification = Notification.objects.create(
        user=called_by,
        notification_type="patient_called",
        priority="high",
        title=f"Patient Called: {patient_name}",
        message=f"Patient {patient_name} (MRN: {patient_mrn}) has been called for consultation.",
        related_model="Encounter",
        related_id=encounter.id,
        action_url=f"/encounters/{encounter.id}",
    )

    return notification


def broadcast_patient_called_notification(encounter, called_by, target_users=None):
    """
    Broadcast patient called notification to multiple users.

    Args:
        encounter: The Encounter instance being called
        called_by: The User who called the patient
        target_users: Optional list of users to notify. If None, defaults to
                      users with waiting room view permission.

    Returns:
        list[Notification]: List of created notifications
    """
    from django.contrib.auth import get_user_model

    get_user_model()  # Validates the model is available

    patient = encounter.patient
    patient_name = f"{patient.first_name} {patient.last_name}"
    patient_mrn = patient.mrn

    # If no target users specified, find users with appropriate permissions
    if target_users is None:
        # For now, notify the caller. In production, could check for:
        # - Users with 'view_waiting_room' permission
        # - Users in 'reception' group
        # - Users assigned to the same department
        target_users = [called_by]

    notifications = []
    for user in target_users:
        notification = Notification.objects.create(
            user=user,
            notification_type="patient_called",
            priority="high",
            title=f"Patient Called: {patient_name}",
            message=f"Patient {patient_name} (MRN: {patient_mrn}) has been called for consultation by {called_by.get_full_name() or called_by.username}.",
            related_model="Encounter",
            related_id=encounter.id,
            action_url=f"/encounters/{encounter.id}",
        )
        notifications.append(notification)

    return notifications
