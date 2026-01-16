"""
Tests for Notification model in core app.

This module tests the Notification model functionality including:
- Notification creation and basic functionality
- Priority levels
- Read/unread status tracking
- Related object linkage
- Filtering and ordering
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone

from hmis.apps.core.models import Notification

User = get_user_model()


@pytest.mark.django_db
class TestNotificationModel:
    """Tests for Notification model."""

    def test_notification_created(self, test_user):
        """Should create notification with all required fields."""
        notification = Notification.objects.create(
            user=test_user,
            notification_type='lab_result',
            priority='normal',
            title='Lab Results Ready',
            message='Your lab results are now available.',
        )

        assert notification.id is not None
        assert notification.user == test_user
        assert notification.notification_type == 'lab_result'
        assert notification.priority == 'normal'
        assert notification.title == 'Lab Results Ready'
        assert not notification.is_read
        assert notification.read_at is None

    def test_notification_priorities(self, test_user):
        """Should support all priority levels."""
        priorities = ['low', 'normal', 'high', 'critical']

        for priority in priorities:
            notification = Notification.objects.create(
                user=test_user,
                notification_type='test',
                priority=priority,
                title=f'{priority.capitalize()} Priority',
                message='Test message',
            )
            assert notification.priority == priority

    def test_critical_notification(self, test_user):
        """Should create critical priority notification."""
        notification = Notification.objects.create(
            user=test_user,
            notification_type='lab_result',
            priority='critical',
            title='🚨 CRITICAL: Lab Results Ready',
            message='Critical lab values detected.',
        )

        assert notification.priority == 'critical'
        assert '🚨' in notification.title

    def test_related_object_linkage(self, test_user):
        """Should link notification to related object."""
        notification = Notification.objects.create(
            user=test_user,
            notification_type='lab_result',
            priority='normal',
            title='Lab Results Ready',
            message='Test results available',
            related_model='LabOrder',
            related_id=123,
            action_url='/encounters/1/lab/123/',
        )

        assert notification.related_model == 'LabOrder'
        assert notification.related_id == 123
        assert notification.action_url == '/encounters/1/lab/123/'

    def test_mark_as_read(self, test_user):
        """Should mark notification as read with timestamp."""
        notification = Notification.objects.create(
            user=test_user,
            notification_type='lab_result',
            priority='normal',
            title='Lab Results Ready',
            message='Test message',
        )

        assert not notification.is_read
        assert notification.read_at is None

        # Mark as read
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save()

        notification.refresh_from_db()
        assert notification.is_read
        assert notification.read_at is not None

    def test_filter_by_user(self):
        """Should filter notifications by user."""
        user1 = User.objects.create_user(username='user1', password='pass')
        user2 = User.objects.create_user(username='user2', password='pass')

        Notification.objects.create(
            user=user1,
            notification_type='lab_result',
            priority='normal',
            title='User 1 Notification',
            message='Message',
        )
        Notification.objects.create(
            user=user2,
            notification_type='lab_result',
            priority='normal',
            title='User 2 Notification',
            message='Message',
        )

        user1_notifications = Notification.objects.filter(user=user1)
        assert user1_notifications.count() == 1
        assert user1_notifications.first().title == 'User 1 Notification'

    def test_filter_unread(self, test_user):
        """Should filter unread notifications."""
        # Create read and unread notifications
        Notification.objects.create(
            user=test_user,
            notification_type='lab_result',
            priority='normal',
            title='Unread Notification',
            message='Message',
            is_read=False,
        )
        Notification.objects.create(
            user=test_user,
            notification_type='lab_result',
            priority='normal',
            title='Read Notification',
            message='Message',
            is_read=True,
            read_at=timezone.now(),
        )

        unread = Notification.objects.filter(user=test_user, is_read=False)
        assert unread.count() == 1
        assert unread.first().title == 'Unread Notification'

    def test_ordering_by_created_at_desc(self, test_user):
        """Should order notifications by creation time (newest first)."""
        # Create notifications in sequence
        notif1 = Notification.objects.create(
            user=test_user,
            notification_type='lab_result',
            priority='normal',
            title='First Notification',
            message='Message',
        )
        notif2 = Notification.objects.create(
            user=test_user,
            notification_type='lab_result',
            priority='normal',
            title='Second Notification',
            message='Message',
        )

        notifications = Notification.objects.filter(user=test_user)
        assert notifications.first() == notif2  # Newest first
        assert notifications.last() == notif1

    def test_notification_str_method(self, test_user):
        """Should have string representation."""
        notification = Notification.objects.create(
            user=test_user,
            notification_type='lab_result',
            priority='normal',
            title='Lab Results Ready',
            message='Message',
        )

        str_repr = str(notification)
        assert 'Lab Results Ready' in str_repr or test_user.username in str_repr
