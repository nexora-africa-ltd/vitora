"""
Notification creation helpers.

Provides utility functions for creating in-app notifications from
signal handlers across all apps. Centralizes notification creation
patterns to ensure consistency and reduce boilerplate.

Usage:
    from hmis.apps.core.services.notification_service import notify_user, notify_staff_for_resource

    notify_user(user, "shift_assigned", "normal", "New Shift Assigned", "You have a shift on Monday")
"""

import logging
from typing import Optional

from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
User = get_user_model()


def notify_user(
    user,
    notification_type: str,
    priority: str,
    title: str,
    message: str,
    related_model: str = "",
    related_id: int | None = None,
    action_url: str = "",
    *,
    deduplicate: bool = False,
) -> Optional["Notification"]:  # noqa: F821
    """
    Create an in-app notification for a user.

    Args:
        user: User instance to notify
        notification_type: e.g. 'shift_assigned', 'lab_result', 'prescription_ready'
        priority: 'low', 'normal', 'high', 'critical'
        title: Short title (<= 200 chars)
        message: Full message body
        related_model: Model name (e.g. 'Shift', 'LabOrder')
        related_id: PK of the related object
        action_url: Frontend URL to navigate on click
        deduplicate: If True, skip if an identical unread notification already exists

    Returns:
        Created Notification instance, or None if deduplicated
    """
    from hmis.apps.core.models import Notification

    if not user or (hasattr(user, "is_anonymous") and user.is_anonymous):
        return None

    if deduplicate:
        exists = Notification.objects.filter(
            user=user,
            notification_type=notification_type,
            related_model=related_model,
            related_id=related_id,
            is_read=False,
        ).exists()
        if exists:
            return None

    try:
        return Notification.objects.create(
            user=user,
            notification_type=notification_type,
            priority=priority,
            title=title[:200],
            message=message[:1000],
            related_model=related_model,
            related_id=related_id,
            action_url=action_url,
        )
    except Exception:
        logger.exception("Failed to create notification for user %s", user)
        return None


def notify_users(
    users,
    notification_type: str,
    priority: str,
    title: str,
    message: str,
    related_model: str = "",
    related_id: int | None = None,
    action_url: str = "",
) -> int:
    """
    Create notifications for multiple users (bulk).

    Returns the number of notifications created.
    """
    from hmis.apps.core.models import Notification

    notifications = []
    for user in users:
        if not user or (hasattr(user, "is_anonymous") and user.is_anonymous):
            continue
        notifications.append(
            Notification(
                user=user,
                notification_type=notification_type,
                priority=priority,
                title=title[:200],
                message=message[:1000],
                related_model=related_model,
                related_id=related_id,
                action_url=action_url,
            )
        )

    if notifications:
        Notification.objects.bulk_create(notifications)
    return len(notifications)


def get_user_from_staff_resource(staff_resource):
    """Resolve User from a scheduling Resource (staff_resource → staff_profile → user)."""
    staff_profile = getattr(staff_resource, "staff_profile", None)
    if staff_profile:
        return staff_profile.user
    return None
