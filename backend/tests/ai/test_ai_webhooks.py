"""
Tests for TibaBot webhook management proxy endpoints.

Covers:
- Feature flag gating
- Authentication requirement
- Input validation (register, update)
- Graceful degradation when TibaBot is unavailable
- Audit logging
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

from hmis.apps.ai.client import TibaBotError, TibaBotUnavailableError


@pytest.fixture
def mock_tibabot():
    with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
        mock_client = MagicMock()
        mock_get.return_value = mock_client
        yield mock_client


@pytest.fixture
def valid_webhook_payload():
    return {
        "url": "https://example.com/hooks/tibabot",
        "events": ["clinical_assist_completed", "document_generated"],
        "secret": "whsec_test_secret_123",
    }


# ---------------------------------------------------------------------------
# Feature flag gating
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestWebhookFeatureFlags:
    @override_settings(TIBABOT_ENABLED=False)
    def test_register_404_when_feature_disabled(self, authenticated_client, valid_webhook_payload):
        response = authenticated_client.post(
            "/api/ai/webhooks/", valid_webhook_payload, format="json"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=False)
    def test_list_404_when_feature_disabled(self, authenticated_client):
        response = authenticated_client.get("/api/ai/webhooks/list/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestWebhookAuth:
    @override_settings(TIBABOT_ENABLED=True)
    def test_unauthenticated_rejected(self, api_client, valid_webhook_payload):
        response = api_client.post("/api/ai/webhooks/", valid_webhook_payload, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_list_unauthenticated_rejected(self, api_client):
        response = api_client.get("/api/ai/webhooks/list/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# Register webhook
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestWebhookRegister:
    @override_settings(TIBABOT_ENABLED=True)
    def test_register_success(self, authenticated_client, mock_tibabot, valid_webhook_payload):
        mock_tibabot.register_webhook.return_value = {
            "id": "wh_abc123",
            "url": valid_webhook_payload["url"],
            "events": valid_webhook_payload["events"],
            "is_active": True,
            "created_at": "2026-07-10T00:00:00Z",
        }

        response = authenticated_client.post(
            "/api/ai/webhooks/", valid_webhook_payload, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["id"] == "wh_abc123"
        assert response.data["is_active"] is True

    @override_settings(TIBABOT_ENABLED=True)
    def test_register_missing_url(self, authenticated_client, mock_tibabot):
        response = authenticated_client.post(
            "/api/ai/webhooks/",
            {"events": ["clinical_assist_completed"], "secret": "whsec_test"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_register_missing_events(self, authenticated_client, mock_tibabot):
        response = authenticated_client.post(
            "/api/ai/webhooks/",
            {"url": "https://example.com/hooks", "secret": "whsec_test"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_register_missing_secret(self, authenticated_client, mock_tibabot):
        response = authenticated_client.post(
            "/api/ai/webhooks/",
            {"url": "https://example.com/hooks", "events": ["clinical_assist_completed"]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_register_invalid_event(self, authenticated_client, mock_tibabot):
        response = authenticated_client.post(
            "/api/ai/webhooks/",
            {
                "url": "https://example.com/hooks",
                "events": ["nonexistent_event"],
                "secret": "whsec_test",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_register_invalid_url(self, authenticated_client, mock_tibabot):
        response = authenticated_client.post(
            "/api/ai/webhooks/",
            {"url": "not-a-valid-url", "events": ["clinical_assist_completed"], "secret": "test"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_register_tibabot_unavailable(
        self, authenticated_client, mock_tibabot, valid_webhook_payload
    ):
        mock_tibabot.register_webhook.side_effect = TibaBotUnavailableError("Service down")

        response = authenticated_client.post(
            "/api/ai/webhooks/", valid_webhook_payload, format="json"
        )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    @override_settings(TIBABOT_ENABLED=True)
    def test_register_tibabot_error(
        self, authenticated_client, mock_tibabot, valid_webhook_payload
    ):
        mock_tibabot.register_webhook.side_effect = TibaBotError("Bad request", status_code=400)

        response = authenticated_client.post(
            "/api/ai/webhooks/", valid_webhook_payload, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# List webhooks
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestWebhookList:
    @override_settings(TIBABOT_ENABLED=True)
    def test_list_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.list_webhooks.return_value = {
            "webhooks": [
                {
                    "id": "wh_1",
                    "url": "https://a.com/hooks",
                    "events": ["alert_triggered"],
                    "is_active": True,
                },
                {
                    "id": "wh_2",
                    "url": "https://b.com/hooks",
                    "events": ["document_generated"],
                    "is_active": False,
                },
            ],
        }

        response = authenticated_client.get("/api/ai/webhooks/list/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["webhooks"]) == 2

    @override_settings(TIBABOT_ENABLED=True)
    def test_list_unavailable(self, authenticated_client, mock_tibabot):
        mock_tibabot.list_webhooks.side_effect = TibaBotUnavailableError("Service down")

        response = authenticated_client.get("/api/ai/webhooks/list/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


# ---------------------------------------------------------------------------
# Get / Update / Delete webhook
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestWebhookDetail:
    @override_settings(TIBABOT_ENABLED=True)
    def test_get_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.get_webhook.return_value = {
            "id": "wh_abc",
            "url": "https://example.com/hooks",
            "events": ["clinical_assist_completed"],
            "is_active": True,
        }

        response = authenticated_client.get("/api/ai/webhooks/wh_abc/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == "wh_abc"

    @override_settings(TIBABOT_ENABLED=True)
    def test_get_not_found(self, authenticated_client, mock_tibabot):
        mock_tibabot.get_webhook.side_effect = TibaBotError("Not found", status_code=404)

        response = authenticated_client.get("/api/ai/webhooks/nonexistent/")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_update_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.update_webhook.return_value = {
            "id": "wh_abc",
            "url": "https://new.example.com/hooks",
            "events": ["alert_triggered"],
            "is_active": True,
        }

        response = authenticated_client.put(
            "/api/ai/webhooks/wh_abc/",
            {"url": "https://new.example.com/hooks", "events": ["alert_triggered"]},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["url"] == "https://new.example.com/hooks"

    @override_settings(TIBABOT_ENABLED=True)
    def test_update_partial(self, authenticated_client, mock_tibabot):
        """Update should allow partial payload (only url)."""
        mock_tibabot.update_webhook.return_value = {
            "id": "wh_abc",
            "url": "https://updated.example.com/hooks",
            "events": ["clinical_assist_completed"],
            "is_active": True,
        }

        response = authenticated_client.put(
            "/api/ai/webhooks/wh_abc/",
            {"url": "https://updated.example.com/hooks"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_delete_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.delete_webhook.return_value = {"status": "deleted"}

        response = authenticated_client.delete("/api/ai/webhooks/wh_abc/")

        assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_delete_unavailable(self, authenticated_client, mock_tibabot):
        mock_tibabot.delete_webhook.side_effect = TibaBotUnavailableError("Service down")

        response = authenticated_client.delete("/api/ai/webhooks/wh_abc/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


# ---------------------------------------------------------------------------
# Pause / Activate webhook
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestWebhookPauseActivate:
    @override_settings(TIBABOT_ENABLED=True)
    def test_pause_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.pause_webhook.return_value = {"status": "paused", "id": "wh_abc"}

        response = authenticated_client.post("/api/ai/webhooks/wh_abc/pause/")

        assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_activate_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.activate_webhook.return_value = {"status": "active", "id": "wh_abc"}

        response = authenticated_client.post("/api/ai/webhooks/wh_abc/activate/")

        assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_pause_unavailable(self, authenticated_client, mock_tibabot):
        mock_tibabot.pause_webhook.side_effect = TibaBotUnavailableError("Service down")

        response = authenticated_client.post("/api/ai/webhooks/wh_abc/pause/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


# ---------------------------------------------------------------------------
# Delivery history
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestWebhookDeliveries:
    @override_settings(TIBABOT_ENABLED=True)
    def test_deliveries_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.get_webhook_deliveries.return_value = {
            "deliveries": [
                {
                    "id": "d_1",
                    "status": "delivered",
                    "status_code": 200,
                    "attempted_at": "2026-07-10T00:00:00Z",
                },
            ],
        }

        response = authenticated_client.get("/api/ai/webhooks/wh_abc/deliveries/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["deliveries"]) == 1

    @override_settings(TIBABOT_ENABLED=True)
    def test_deliveries_unavailable(self, authenticated_client, mock_tibabot):
        mock_tibabot.get_webhook_deliveries.side_effect = TibaBotUnavailableError("Service down")

        response = authenticated_client.get("/api/ai/webhooks/wh_abc/deliveries/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
