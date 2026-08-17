"""
Tests for core notification service helpers.

How to run:
    cd backend && poetry run pytest tests/core/test_notification_service.py -v

Inputs/args:
    No CLI args. Uses pytest fixtures and Django test database.
"""

import pytest

from hmis.apps.core.models import Notification
from hmis.apps.core.services.notification_service import notify_users


@pytest.mark.django_db
def test_notify_users_high_priority_triggers_push_signal(mocker, django_user_model):
    """High-priority bulk notifications should trigger push signal side effects."""
    user_one = django_user_model.objects.create_user(username="notify-user-1", password="secret123")
    user_two = django_user_model.objects.create_user(username="notify-user-2", password="secret123")

    push_mock = mocker.patch("hmis.apps.core.services.push_service.send_push_to_user")

    created = notify_users(
        users=[user_one, user_two],
        notification_type="triage_urgent",
        priority="high",
        title="Urgent triage case",
        message="Patient requires immediate review",
        related_model="Encounter",
        related_id=101,
        action_url="/encounters/101",
    )

    assert created == 2
    assert Notification.objects.filter(notification_type="triage_urgent").count() == 2
    assert push_mock.call_count == 2


@pytest.mark.django_db
def test_notify_users_invalid_priority_falls_back_to_normal(django_user_model):
    """Invalid priorities should not fail creation and should default to normal."""
    user = django_user_model.objects.create_user(username="notify-user-3", password="secret123")

    created = notify_users(
        users=[user],
        notification_type="system",
        priority="medium",  # Invalid choice on the model
        title="System update",
        message="Maintenance completed",
    )

    assert created == 1
    notification = Notification.objects.get(user=user, notification_type="system")
    assert notification.priority == Notification.Priority.NORMAL
