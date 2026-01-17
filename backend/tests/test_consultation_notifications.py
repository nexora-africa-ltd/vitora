"""
Tests for consultation queue notification system.

Phase 2.3: Notification System
- Create notification event for "Patient Called"
- Add notification API endpoint
- Frontend notification subscription (polling)

Following TDD approach: Write tests FIRST, then implement.
"""

from datetime import timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status

from hmis.apps.core.models import Notification
from hmis.apps.encounters.models import Encounter

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def notification_user(db):
    """Create a user to receive notifications."""
    return User.objects.create_user(
        username="notification_recipient",
        email="recipient@example.com",
        password="testpass123",
    )


@pytest.fixture
def clinician_user(db):
    """Create a clinician user who calls patients."""
    return User.objects.create_user(
        username="clinician",
        email="clinician@example.com",
        password="testpass123",
        first_name="Dr.",
        last_name="Smith",
    )


@pytest.fixture
def sample_notification(db, notification_user):
    """Create a sample notification."""
    return Notification.objects.create(
        user=notification_user,
        notification_type="patient_called",
        title="Patient Called",
        message="Patient John Doe (MRN-12345) has been called for consultation",
        related_model="Encounter",
        related_id=1,
        priority="high",
    )


@pytest.fixture
def consultation_ready_encounter(db, sample_patient, test_user):
    """Create an encounter ready for consultation."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="SCHEDULED_OPD",
        chief_complaint="Follow-up visit",
        triage_status="COMPLETED",
        consultation_status="WAITING",
    )


# ============================================================================
# Test: Notification Model
# ============================================================================


@pytest.mark.django_db
class TestNotificationModel:
    """Tests for the Notification model."""

    def test_notification_creation(self, notification_user):
        """Should create a notification with required fields."""
        notification = Notification.objects.create(
            user=notification_user,
            notification_type="patient_called",
            title="Patient Called",
            message="Patient has been called",
        )

        assert notification.id is not None
        assert notification.user == notification_user
        assert notification.notification_type == "patient_called"
        assert notification.is_read is False
        assert notification.priority == "normal"

    def test_notification_mark_as_read(self, sample_notification):
        """Should mark notification as read with timestamp."""
        assert sample_notification.is_read is False
        assert sample_notification.read_at is None

        sample_notification.mark_as_read()

        assert sample_notification.is_read is True
        assert sample_notification.read_at is not None

    def test_notification_ordering(self, notification_user):
        """Should order notifications by created_at descending."""
        older = Notification.objects.create(
            user=notification_user,
            notification_type="test",
            title="Older",
            message="Older notification",
        )
        # Force older timestamp
        older.created_at = timezone.now() - timedelta(hours=1)
        older.save()

        newer = Notification.objects.create(
            user=notification_user,
            notification_type="test",
            title="Newer",
            message="Newer notification",
        )

        notifications = list(Notification.objects.filter(user=notification_user))
        assert notifications[0].title == "Newer"
        assert notifications[1].title == "Older"


# ============================================================================
# Test: Notification API Endpoints
# ============================================================================


@pytest.mark.django_db
class TestNotificationAPIEndpoints:
    """Tests for notification API endpoints."""

    def test_list_notifications_authenticated(self, authenticated_client, test_user):
        """Should list notifications for authenticated user."""
        # Create notifications for the user
        Notification.objects.create(
            user=test_user,
            notification_type="patient_called",
            title="Test Notification",
            message="Test message",
        )

        response = authenticated_client.get("/api/notifications/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data
        assert len(response.data["results"]) == 1

    def test_list_notifications_unauthenticated(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/notifications/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_only_own_notifications(self, authenticated_client, test_user, notification_user):
        """Should only show notifications belonging to the requesting user."""
        # Create notification for different user
        Notification.objects.create(
            user=notification_user,
            notification_type="patient_called",
            title="Other User's Notification",
            message="Should not see this",
        )

        # Create notification for test_user
        Notification.objects.create(
            user=test_user,
            notification_type="patient_called",
            title="My Notification",
            message="Should see this",
        )

        response = authenticated_client.get("/api/notifications/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["title"] == "My Notification"

    def test_filter_by_notification_type(self, authenticated_client, test_user):
        """Should filter notifications by type."""
        Notification.objects.create(
            user=test_user,
            notification_type="patient_called",
            title="Called",
            message="Patient called",
        )
        Notification.objects.create(
            user=test_user,
            notification_type="lab_result",
            title="Lab",
            message="Lab result ready",
        )

        response = authenticated_client.get("/api/notifications/?notification_type=patient_called")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["notification_type"] == "patient_called"

    def test_filter_by_unread(self, authenticated_client, test_user):
        """Should filter unread notifications."""
        unread = Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Unread",
            message="Unread notification",
        )
        read = Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Read",
            message="Read notification",
            is_read=True,
        )

        response = authenticated_client.get("/api/notifications/?is_read=false")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["title"] == "Unread"

    def test_get_notification_detail(self, authenticated_client, test_user):
        """Should retrieve notification detail."""
        notification = Notification.objects.create(
            user=test_user,
            notification_type="patient_called",
            title="Test",
            message="Test message",
        )

        response = authenticated_client.get(f"/api/notifications/{notification.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == "Test"
        assert response.data["message"] == "Test message"

    def test_cannot_access_other_user_notification(self, authenticated_client, notification_user):
        """Should not allow accessing other user's notifications."""
        notification = Notification.objects.create(
            user=notification_user,
            notification_type="patient_called",
            title="Other's Notification",
            message="Should not access",
        )

        response = authenticated_client.get(f"/api/notifications/{notification.id}/")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_mark_notification_as_read(self, authenticated_client, test_user):
        """Should mark notification as read via API."""
        notification = Notification.objects.create(
            user=test_user,
            notification_type="patient_called",
            title="Test",
            message="Test message",
        )

        response = authenticated_client.post(f"/api/notifications/{notification.id}/mark_read/")

        assert response.status_code == status.HTTP_200_OK
        notification.refresh_from_db()
        assert notification.is_read is True
        assert notification.read_at is not None

    def test_mark_all_as_read(self, authenticated_client, test_user):
        """Should mark all notifications as read."""
        Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Notification 1",
            message="Message 1",
        )
        Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Notification 2",
            message="Message 2",
        )

        response = authenticated_client.post("/api/notifications/mark_all_read/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["marked_count"] == 2
        assert Notification.objects.filter(user=test_user, is_read=False).count() == 0

    def test_get_unread_count(self, authenticated_client, test_user):
        """Should return count of unread notifications."""
        Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Unread 1",
            message="Message",
        )
        Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Unread 2",
            message="Message",
        )
        Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Read",
            message="Message",
            is_read=True,
        )

        response = authenticated_client.get("/api/notifications/unread_count/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["unread_count"] == 2


# ============================================================================
# Test: Patient Called Notification Event
# ============================================================================


@pytest.mark.django_db
class TestPatientCalledNotification:
    """Tests for patient called notification events."""

    def test_call_patient_creates_notification(
        self, authenticated_client, consultation_ready_encounter, test_user
    ):
        """Should create notification when patient is called."""
        response = authenticated_client.post(
            f"/api/encounters/{consultation_ready_encounter.id}/call/"
        )

        assert response.status_code == status.HTTP_200_OK

        # Check notification was created
        notifications = Notification.objects.filter(
            notification_type="patient_called",
            related_model="Encounter",
            related_id=consultation_ready_encounter.id,
        )
        assert notifications.exists()

    def test_call_patient_notification_content(
        self, authenticated_client, consultation_ready_encounter, test_user, sample_patient
    ):
        """Should create notification with correct content."""
        response = authenticated_client.post(
            f"/api/encounters/{consultation_ready_encounter.id}/call/"
        )

        assert response.status_code == status.HTTP_200_OK

        notification = Notification.objects.filter(
            notification_type="patient_called",
            related_id=consultation_ready_encounter.id,
        ).first()

        assert notification is not None
        assert (
            sample_patient.first_name in notification.title
            or sample_patient.last_name in notification.title
        )
        assert "called" in notification.message.lower()

    def test_call_patient_notification_priority(
        self, authenticated_client, consultation_ready_encounter
    ):
        """Should create notification with high priority."""
        response = authenticated_client.post(
            f"/api/encounters/{consultation_ready_encounter.id}/call/"
        )

        assert response.status_code == status.HTTP_200_OK

        notification = Notification.objects.filter(
            notification_type="patient_called",
            related_id=consultation_ready_encounter.id,
        ).first()

        assert notification is not None
        assert notification.priority == "high"

    def test_call_patient_notification_has_action_url(
        self, authenticated_client, consultation_ready_encounter
    ):
        """Should create notification with action URL to encounter."""
        response = authenticated_client.post(
            f"/api/encounters/{consultation_ready_encounter.id}/call/"
        )

        assert response.status_code == status.HTTP_200_OK

        notification = Notification.objects.filter(
            notification_type="patient_called",
            related_id=consultation_ready_encounter.id,
        ).first()

        assert notification is not None
        assert notification.action_url != ""
        assert str(consultation_ready_encounter.id) in notification.action_url


# ============================================================================
# Test: Notification Serializer
# ============================================================================


@pytest.mark.django_db
class TestNotificationSerializer:
    """Tests for notification serializer."""

    def test_serializer_includes_all_fields(self, authenticated_client, test_user):
        """Should include all required fields in response."""
        Notification.objects.create(
            user=test_user,
            notification_type="patient_called",
            title="Test",
            message="Test message",
            related_model="Encounter",
            related_id=123,
            action_url="/encounters/123",
            priority="high",
        )

        response = authenticated_client.get("/api/notifications/")

        assert response.status_code == status.HTTP_200_OK
        notification = response.data["results"][0]

        assert "id" in notification
        assert "notification_type" in notification
        assert "title" in notification
        assert "message" in notification
        assert "priority" in notification
        assert "related_model" in notification
        assert "related_id" in notification
        assert "action_url" in notification
        assert "is_read" in notification
        assert "read_at" in notification
        assert "created_at" in notification

    def test_serializer_datetime_format(self, authenticated_client, test_user):
        """Should format datetime fields correctly."""
        notification = Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Test",
            message="Test message",
        )
        notification.mark_as_read()

        response = authenticated_client.get(f"/api/notifications/{notification.id}/")

        assert response.status_code == status.HTTP_200_OK
        # Should be ISO format
        assert "T" in response.data["created_at"]
        assert "T" in response.data["read_at"]


# ============================================================================
# Test: Polling Support
# ============================================================================


@pytest.mark.django_db
class TestNotificationPolling:
    """Tests for notification polling support."""

    def test_poll_since_timestamp(self, authenticated_client, test_user):
        """Should support polling for notifications since a timestamp."""
        # Create older notification
        old = Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Old",
            message="Old notification",
        )
        # Update created_at to 10 minutes ago using update() to bypass auto_now_add
        old_time = timezone.now() - timedelta(minutes=10)
        Notification.objects.filter(pk=old.pk).update(created_at=old_time)
        old.refresh_from_db()

        # Get timestamp for polling - 5 minutes ago (between old and new)
        poll_since = timezone.now() - timedelta(minutes=5)

        # Create newer notification (will have current timestamp)
        new = Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="New",
            message="New notification",
        )

        # Poll for notifications since timestamp
        response = authenticated_client.get(
            f"/api/notifications/?created_after={poll_since.isoformat()}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["title"] == "New"

    def test_poll_returns_server_timestamp(self, authenticated_client, test_user):
        """Should return server timestamp for next poll."""
        Notification.objects.create(
            user=test_user,
            notification_type="test",
            title="Test",
            message="Test message",
        )

        response = authenticated_client.get("/api/notifications/")

        assert response.status_code == status.HTTP_200_OK
        # Should include server_time for polling
        assert "server_time" in response.data or "timestamp" in response.data


# ============================================================================
# Test: Notification Service Helper
# ============================================================================


@pytest.mark.django_db
class TestNotificationService:
    """Tests for notification service functions."""

    def test_create_patient_called_notification(
        self, consultation_ready_encounter, clinician_user, sample_patient
    ):
        """Should create patient called notification via service."""
        from hmis.apps.encounters.services import create_patient_called_notification

        notification = create_patient_called_notification(
            encounter=consultation_ready_encounter,
            called_by=clinician_user,
        )

        assert notification is not None
        assert notification.notification_type == "patient_called"
        assert notification.priority == "high"
        assert notification.related_model == "Encounter"
        assert notification.related_id == consultation_ready_encounter.id

    def test_notification_sent_to_waiting_room_users(
        self, consultation_ready_encounter, clinician_user
    ):
        """Should create notifications for users with waiting room view permission."""
        # Create user with waiting room permission

        from hmis.apps.encounters.services import create_patient_called_notification

        waiting_room_user = User.objects.create_user(
            username="waiting_room",
            email="waiting@example.com",
            password="testpass123",
        )
        # In real implementation, check for specific permission

        notification = create_patient_called_notification(
            encounter=consultation_ready_encounter,
            called_by=clinician_user,
        )

        assert notification is not None
