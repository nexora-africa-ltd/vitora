"""
Tests for Web Push notification system.

Covers:
- PushSubscription model
- PushSubscription API endpoints (subscribe, list, delete, vapid-key)
- Push sending service
- Signal wiring (high/critical notifications trigger push)
"""

import json
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import Notification, PushSubscription

User = get_user_model()


@pytest.fixture
def push_subscription_data():
    """Valid push subscription payload."""
    return {
        "endpoint": "https://fcm.googleapis.com/fcm/send/test-subscription-123",
        "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfines",
        "auth": "tBHItJI5svbpC7xB7w",
    }


# ============================================================================
# Model Tests
# ============================================================================


@pytest.mark.django_db
class TestPushSubscriptionModel:
    """Tests for PushSubscription model."""

    def test_create_subscription(self, test_user, push_subscription_data):
        """Should create a push subscription for a user."""
        sub = PushSubscription.objects.create(
            user=test_user,
            **push_subscription_data,
        )
        assert sub.pk is not None
        assert sub.user == test_user
        assert sub.endpoint == push_subscription_data["endpoint"]
        assert sub.p256dh == push_subscription_data["p256dh"]
        assert sub.auth == push_subscription_data["auth"]
        assert sub.created_at is not None

    def test_unique_constraint_per_user_endpoint(self, test_user, push_subscription_data):
        """Should reject duplicate endpoint for same user."""
        from django.db import IntegrityError

        PushSubscription.objects.create(user=test_user, **push_subscription_data)
        with pytest.raises(IntegrityError):
            PushSubscription.objects.create(user=test_user, **push_subscription_data)

    def test_same_endpoint_different_users(self, db, push_subscription_data):
        """Should allow same endpoint for different users."""
        user1 = User.objects.create_user(username="pushuser1", password="pass123")
        user2 = User.objects.create_user(username="pushuser2", password="pass123")
        PushSubscription.objects.create(user=user1, **push_subscription_data)
        sub2 = PushSubscription.objects.create(user=user2, **push_subscription_data)
        assert sub2.pk is not None

    def test_str_representation(self, test_user, push_subscription_data):
        """Should return readable string representation."""
        sub = PushSubscription.objects.create(user=test_user, **push_subscription_data)
        assert test_user.username in str(sub)

    def test_cascade_delete_with_user(self, db, push_subscription_data):
        """Should delete subscriptions when user is deleted."""
        user = User.objects.create_user(username="deluser", password="pass123")
        PushSubscription.objects.create(user=user, **push_subscription_data)
        assert PushSubscription.objects.filter(user=user).count() == 1
        user.delete()
        assert (
            PushSubscription.objects.filter(endpoint=push_subscription_data["endpoint"]).count()
            == 0
        )


# ============================================================================
# API Tests
# ============================================================================


@pytest.mark.django_db
class TestPushSubscriptionAPI:
    """Tests for push subscription API endpoints."""

    def test_subscribe_creates_subscription(self, authenticated_client, push_subscription_data):
        """POST /api/push-subscriptions/ should create a subscription."""
        response = authenticated_client.post("/api/push-subscriptions/", push_subscription_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["endpoint"] == push_subscription_data["endpoint"]
        assert PushSubscription.objects.count() == 1

    def test_subscribe_upserts_existing(self, authenticated_client, push_subscription_data):
        """POST with same endpoint should update existing subscription."""
        authenticated_client.post("/api/push-subscriptions/", push_subscription_data)

        updated_data = {**push_subscription_data, "auth": "newAuthSecret"}
        response = authenticated_client.post("/api/push-subscriptions/", updated_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert PushSubscription.objects.count() == 1
        sub = PushSubscription.objects.first()
        assert sub.auth == "newAuthSecret"

    def test_subscribe_unauthenticated(self, api_client, push_subscription_data):
        """Should reject unauthenticated subscription."""
        response = api_client.post("/api/push-subscriptions/", push_subscription_data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_subscriptions(self, authenticated_client, push_subscription_data):
        """GET /api/push-subscriptions/ should list user's subscriptions."""
        authenticated_client.post("/api/push-subscriptions/", push_subscription_data)
        response = authenticated_client.get("/api/push-subscriptions/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_list_only_own_subscriptions(self, db, push_subscription_data):
        """Should only return subscriptions for the authenticated user."""
        user1 = User.objects.create_user(username="listuser1", password="pass123")
        user2 = User.objects.create_user(username="listuser2", password="pass123")
        PushSubscription.objects.create(user=user1, **push_subscription_data)
        PushSubscription.objects.create(
            user=user2,
            endpoint="https://fcm.googleapis.com/other",
            p256dh="otherkey",
            auth="otherauth",
        )

        client = APIClient()
        client.force_authenticate(user=user1)
        response = client.get("/api/push-subscriptions/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["endpoint"] == push_subscription_data["endpoint"]

    def test_delete_subscription(self, authenticated_client, test_user, push_subscription_data):
        """DELETE /api/push-subscriptions/{id}/ should remove subscription."""
        sub = PushSubscription.objects.create(user=test_user, **push_subscription_data)
        response = authenticated_client.delete(f"/api/push-subscriptions/{sub.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert PushSubscription.objects.count() == 0

    def test_vapid_key_endpoint(self, authenticated_client, settings):
        """GET /api/push-subscriptions/vapid-key/ should return the VAPID public key."""
        settings.VAPID_PUBLIC_KEY = "test-vapid-public-key"
        response = authenticated_client.get("/api/push-subscriptions/vapid-key/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["vapid_public_key"] == "test-vapid-public-key"

    def test_vapid_key_not_configured(self, authenticated_client, settings):
        """Should return 503 when VAPID key is not configured."""
        settings.VAPID_PUBLIC_KEY = ""
        response = authenticated_client.get("/api/push-subscriptions/vapid-key/")
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


# ============================================================================
# Push Service Tests
# ============================================================================


@pytest.mark.django_db
class TestPushService:
    """Tests for push notification sending service."""

    @patch("hmis.apps.core.services.push_service.webpush")
    def test_send_push_to_user_sends_to_all_subscriptions(
        self, mock_webpush, test_user, push_subscription_data, settings
    ):
        """Should send push to all user's subscriptions."""
        settings.VAPID_PRIVATE_KEY = "test-private-key"
        settings.VAPID_CLAIM_EMAIL = "mailto:test@test.com"

        PushSubscription.objects.create(user=test_user, **push_subscription_data)
        PushSubscription.objects.create(
            user=test_user,
            endpoint="https://fcm.googleapis.com/other-device",
            p256dh="otherkey",
            auth="otherauth",
        )

        from hmis.apps.core.services.push_service import send_push_to_user

        count = send_push_to_user(user=test_user, title="Test", body="Test body")
        assert count == 2
        assert mock_webpush.call_count == 2

    @patch("hmis.apps.core.services.push_service.webpush")
    def test_send_push_payload_format(
        self, mock_webpush, test_user, push_subscription_data, settings
    ):
        """Should send correctly formatted payload."""
        settings.VAPID_PRIVATE_KEY = "test-private-key"
        settings.VAPID_CLAIM_EMAIL = "mailto:test@test.com"

        PushSubscription.objects.create(user=test_user, **push_subscription_data)

        from hmis.apps.core.services.push_service import send_push_to_user

        send_push_to_user(
            user=test_user,
            title="Lab Ready",
            body="Your results are in",
            url="/lab/results/5",
        )

        call_kwargs = mock_webpush.call_args
        data = json.loads(call_kwargs.kwargs["data"])
        assert data["title"] == "Lab Ready"
        assert data["body"] == "Your results are in"
        assert data["data"]["url"] == "/lab/results/5"

    def test_send_push_no_vapid_key(self, test_user, push_subscription_data, settings):
        """Should skip sending when VAPID key not configured."""
        settings.VAPID_PRIVATE_KEY = ""
        PushSubscription.objects.create(user=test_user, **push_subscription_data)

        from hmis.apps.core.services.push_service import send_push_to_user

        count = send_push_to_user(user=test_user, title="Test", body="Test")
        assert count == 0

    def test_send_push_no_subscriptions(self, test_user, settings):
        """Should return 0 when user has no subscriptions."""
        settings.VAPID_PRIVATE_KEY = "test-private-key"

        from hmis.apps.core.services.push_service import send_push_to_user

        count = send_push_to_user(user=test_user, title="Test", body="Test")
        assert count == 0

    @patch("hmis.apps.core.services.push_service.webpush")
    def test_expired_subscription_cleanup(
        self, mock_webpush, test_user, push_subscription_data, settings
    ):
        """Should remove subscription on 410 Gone response."""
        from pywebpush import WebPushException

        settings.VAPID_PRIVATE_KEY = "test-private-key"
        settings.VAPID_CLAIM_EMAIL = "mailto:test@test.com"

        PushSubscription.objects.create(user=test_user, **push_subscription_data)

        mock_response = MagicMock()
        mock_response.status_code = 410
        mock_webpush.side_effect = WebPushException("Gone", response=mock_response)

        from hmis.apps.core.services.push_service import send_push_to_user

        count = send_push_to_user(user=test_user, title="Test", body="Test")
        assert count == 0
        assert PushSubscription.objects.count() == 0


# ============================================================================
# Signal Tests
# ============================================================================


@pytest.mark.django_db
class TestPushNotificationSignal:
    """Tests for push notification signal on Notification creation."""

    @patch("hmis.apps.core.services.push_service.send_push_to_user")
    def test_critical_notification_triggers_push(self, mock_push, test_user):
        """Creating a critical notification should trigger push."""
        Notification.objects.create(
            user=test_user,
            notification_type="lab_result",
            priority="critical",
            title="Critical Lab Result",
            message="Abnormal glucose level detected",
            action_url="/lab/results/1",
        )
        mock_push.assert_called_once()
        call_kwargs = mock_push.call_args.kwargs
        assert call_kwargs["user"] == test_user
        assert call_kwargs["title"] == "Critical Lab Result"
        assert call_kwargs["body"] == "Abnormal glucose level detected"
        assert call_kwargs["url"] == "/lab/results/1"

    @patch("hmis.apps.core.services.push_service.send_push_to_user")
    def test_high_notification_triggers_push(self, mock_push, test_user):
        """Creating a high priority notification should trigger push."""
        Notification.objects.create(
            user=test_user,
            notification_type="appointment",
            priority="high",
            title="Appointment Reminder",
            message="You have an appointment in 15 minutes",
        )
        mock_push.assert_called_once()

    @patch("hmis.apps.core.services.push_service.send_push_to_user")
    def test_normal_notification_does_not_trigger_push(self, mock_push, test_user):
        """Normal priority notifications should NOT trigger push."""
        Notification.objects.create(
            user=test_user,
            notification_type="system",
            priority="normal",
            title="System Update",
            message="New features available",
        )
        mock_push.assert_not_called()

    @patch("hmis.apps.core.services.push_service.send_push_to_user")
    def test_low_notification_does_not_trigger_push(self, mock_push, test_user):
        """Low priority notifications should NOT trigger push."""
        Notification.objects.create(
            user=test_user,
            notification_type="system",
            priority="low",
            title="FYI",
            message="Minor update",
        )
        mock_push.assert_not_called()

    @patch("hmis.apps.core.services.push_service.send_push_to_user")
    def test_notification_update_does_not_trigger_push(self, mock_push, test_user):
        """Updating an existing notification should NOT trigger push."""
        notification = Notification.objects.create(
            user=test_user,
            notification_type="lab_result",
            priority="critical",
            title="Critical Lab Result",
            message="Abnormal level",
        )
        mock_push.reset_mock()
        notification.mark_as_read()
        mock_push.assert_not_called()
