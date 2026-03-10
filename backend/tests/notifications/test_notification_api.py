"""
TDD Tests for Notification API endpoints.

Tests for Sprint 1.x notification system:
- GET /api/notifications/ - List user notifications
- GET /api/notifications/unread_count/ - Get unread count for badge
- POST /api/notifications/{id}/mark_read/ - Mark single notification as read
- POST /api/notifications/mark_all_read/ - Mark all notifications as read
"""

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.core.models import Notification


@pytest.fixture
def sample_notification(test_user):
    """Create a sample notification for the test user."""
    return Notification.objects.create(
        user=test_user,
        notification_type="lab_result",
        priority=Notification.Priority.NORMAL,
        title="Lab Results Ready",
        message="Your CBC results are available for review.",
        related_model="LabOrder",
        related_id=123,
        action_url="/laboratory/orders/123",
    )


@pytest.fixture
def multiple_notifications(test_user):
    """Create multiple notifications for testing."""
    notifications = []
    for i in range(5):
        notif = Notification.objects.create(
            user=test_user,
            notification_type="lab_result" if i % 2 == 0 else "appointment",
            priority=Notification.Priority.HIGH if i == 0 else Notification.Priority.NORMAL,
            title=f"Test Notification {i}",
            message=f"This is test notification {i}",
            is_read=i >= 3,  # First 3 unread, last 2 read
        )
        notifications.append(notif)
    return notifications


class TestNotificationList:
    """Tests for GET /api/notifications/."""

    def test_list_notifications_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/notifications/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_notifications_returns_user_notifications(
        self, authenticated_client, sample_notification
    ):
        """Should return only current user's notifications."""
        response = authenticated_client.get("/api/notifications/")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["id"] == sample_notification.id
        assert results[0]["title"] == "Lab Results Ready"

    def test_list_notifications_excludes_other_users(
        self, authenticated_client, sample_notification, django_user_model
    ):
        """Should not return notifications for other users."""
        # Create notification for another user
        other_user = django_user_model.objects.create_user(
            username="otheruser", password="password123"
        )
        Notification.objects.create(
            user=other_user,
            notification_type="system",
            title="Other User Notification",
            message="This should not appear",
        )

        response = authenticated_client.get("/api/notifications/")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["title"] == "Lab Results Ready"

    def test_list_notifications_filter_by_is_read(
        self, authenticated_client, multiple_notifications
    ):
        """Should filter by is_read parameter."""
        # Get unread only
        response = authenticated_client.get("/api/notifications/?is_read=false")
        results = response.data.get("results", response.data)
        assert len(results) == 3  # First 3 are unread

        # Get read only
        response = authenticated_client.get("/api/notifications/?is_read=true")
        results = response.data.get("results", response.data)
        assert len(results) == 2  # Last 2 are read

    def test_list_notifications_filter_by_type(self, authenticated_client, multiple_notifications):
        """Should filter by notification_type parameter."""
        response = authenticated_client.get("/api/notifications/?notification_type=lab_result")

        results = response.data.get("results", response.data)
        assert len(results) == 3  # Notifications 0, 2, 4 are lab_result

    def test_list_includes_server_time(self, authenticated_client, sample_notification):
        """Should include server_time for polling support."""
        response = authenticated_client.get("/api/notifications/")

        assert response.status_code == status.HTTP_200_OK
        assert "server_time" in response.data

    def test_list_ordered_by_created_at_desc(self, authenticated_client, multiple_notifications):
        """Should return newest notifications first."""
        response = authenticated_client.get("/api/notifications/")

        results = response.data.get("results", response.data)
        # Verify descending order by checking titles (created in order 0-4)
        assert results[0]["title"] == "Test Notification 4"
        assert results[-1]["title"] == "Test Notification 0"


class TestUnreadCount:
    """Tests for GET /api/notifications/unread_count/."""

    def test_unread_count_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/notifications/unread_count/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_unread_count_returns_correct_count(self, authenticated_client, multiple_notifications):
        """Should return correct unread count."""
        response = authenticated_client.get("/api/notifications/unread_count/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["unread_count"] == 3  # First 3 are unread

    def test_unread_count_zero_when_all_read(self, authenticated_client, sample_notification):
        """Should return 0 when all notifications are read."""
        sample_notification.is_read = True
        sample_notification.save()

        response = authenticated_client.get("/api/notifications/unread_count/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["unread_count"] == 0

    def test_unread_count_zero_when_no_notifications(self, authenticated_client):
        """Should return 0 when user has no notifications."""
        response = authenticated_client.get("/api/notifications/unread_count/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["unread_count"] == 0


class TestMarkRead:
    """Tests for POST /api/notifications/{id}/mark_read/."""

    def test_mark_read_requires_auth(self, api_client, sample_notification):
        """Should reject unauthenticated requests."""
        response = api_client.post(f"/api/notifications/{sample_notification.id}/mark_read/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_mark_read_marks_notification(self, authenticated_client, sample_notification):
        """Should mark notification as read."""
        assert sample_notification.is_read is False

        response = authenticated_client.post(
            f"/api/notifications/{sample_notification.id}/mark_read/"
        )

        assert response.status_code == status.HTTP_200_OK
        sample_notification.refresh_from_db()
        assert sample_notification.is_read is True
        assert sample_notification.read_at is not None

    def test_mark_read_sets_read_at_timestamp(self, authenticated_client, sample_notification):
        """Should set read_at timestamp."""
        before = timezone.now()

        response = authenticated_client.post(
            f"/api/notifications/{sample_notification.id}/mark_read/"
        )

        sample_notification.refresh_from_db()
        assert sample_notification.read_at >= before

    def test_mark_read_cannot_access_other_users_notification(
        self, authenticated_client, django_user_model
    ):
        """Should not allow marking another user's notification."""
        other_user = django_user_model.objects.create_user(
            username="otheruser", password="password123"
        )
        other_notification = Notification.objects.create(
            user=other_user,
            notification_type="system",
            title="Other Notification",
            message="Test",
        )

        response = authenticated_client.post(
            f"/api/notifications/{other_notification.id}/mark_read/"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestMarkAllRead:
    """Tests for POST /api/notifications/mark_all_read/."""

    def test_mark_all_read_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/notifications/mark_all_read/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_mark_all_read_marks_all_unread(self, authenticated_client, multiple_notifications):
        """Should mark all unread notifications as read."""
        response = authenticated_client.post("/api/notifications/mark_all_read/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["marked_count"] == 3  # 3 were unread

        # Verify all are now read
        for notif in multiple_notifications:
            notif.refresh_from_db()
            assert notif.is_read is True

    def test_mark_all_read_returns_count(self, authenticated_client, multiple_notifications):
        """Should return count of marked notifications."""
        response = authenticated_client.post("/api/notifications/mark_all_read/")

        assert response.data["marked_count"] == 3

    def test_mark_all_read_only_affects_current_user(
        self, authenticated_client, sample_notification, django_user_model
    ):
        """Should only mark current user's notifications."""
        other_user = django_user_model.objects.create_user(
            username="otheruser", password="password123"
        )
        other_notification = Notification.objects.create(
            user=other_user,
            notification_type="system",
            title="Other Notification",
            message="Test",
            is_read=False,
        )

        authenticated_client.post("/api/notifications/mark_all_read/")

        other_notification.refresh_from_db()
        assert other_notification.is_read is False  # Should still be unread


class TestNotificationModel:
    """Tests for Notification model methods."""

    def test_mark_as_read_method(self, sample_notification):
        """Should mark notification as read with timestamp."""
        assert sample_notification.is_read is False
        assert sample_notification.read_at is None

        sample_notification.mark_as_read()

        assert sample_notification.is_read is True
        assert sample_notification.read_at is not None

    def test_mark_as_read_idempotent(self, sample_notification):
        """Should not update read_at if already read."""
        sample_notification.mark_as_read()
        first_read_at = sample_notification.read_at

        # Mark again
        sample_notification.mark_as_read()

        assert sample_notification.read_at == first_read_at

    def test_str_representation(self, sample_notification):
        """Should have meaningful string representation."""
        str_repr = str(sample_notification)
        assert "Lab Results Ready" in str_repr or "lab_result" in str_repr.lower()
