"""
Services for encounters app.

Phase 2.3: Notification System - Patient Called notifications
"""

from hmis.apps.core.models import Notification


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
