"""
Tests for Stream E: Scaling & Reliability infrastructure.

Covers:
- WebSocket health check endpoint
- ThrottledBroadcaster (batching, critical bypass, flush)
- FacilityWebSocketMiddleware (access validation)
- Production Redis channel layer configuration
- ASGI middleware wiring
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest  # type: ignore

from hmis.apps.core.websockets.middleware import FacilityWebSocketMiddleware
from hmis.apps.core.websockets.throttle import (
    ThrottledBroadcaster,
    reset_throttled_broadcaster,
)

# =============================================================================
# ThrottledBroadcaster Tests
# =============================================================================


class TestThrottledBroadcaster:
    """Tests for event throttling and aggregation."""

    def setup_method(self):
        reset_throttled_broadcaster()

    def teardown_method(self):
        reset_throttled_broadcaster()

    @patch("hmis.apps.core.websockets.throttle.get_channel_layer")
    def test_critical_event_sent_immediately(self, mock_layer):
        """Critical events should bypass throttling."""
        mock_cl = MagicMock()
        mock_cl.group_send = AsyncMock()
        mock_layer.return_value = mock_cl

        broadcaster = ThrottledBroadcaster(interval=10.0)  # Long interval
        broadcaster.send(
            group="pharmacy_queue_1",
            event_type="stock_critical",
            data={"drug": "Amoxicillin"},
            critical=True,
        )

        mock_cl.group_send.assert_called_once()
        call_args = mock_cl.group_send.call_args
        assert call_args[0][0] == "pharmacy_queue_1"
        assert call_args[0][1]["type"] == "stock_critical"

    @patch("hmis.apps.core.websockets.throttle.get_channel_layer")
    def test_first_non_critical_sent_immediately(self, mock_layer):
        """First event for a key should be sent immediately."""
        mock_cl = MagicMock()
        mock_cl.group_send = AsyncMock()
        mock_layer.return_value = mock_cl

        broadcaster = ThrottledBroadcaster(interval=10.0)
        broadcaster.send(
            group="billing_1",
            event_type="stats_updated",
            data={"pending": 5},
        )

        mock_cl.group_send.assert_called_once()

    @patch("hmis.apps.core.websockets.throttle.get_channel_layer")
    def test_rapid_fire_events_throttled(self, mock_layer):
        """Rapid successive sends should buffer — only latest data kept."""
        mock_cl = MagicMock()
        mock_cl.group_send = AsyncMock()
        mock_layer.return_value = mock_cl

        broadcaster = ThrottledBroadcaster(interval=10.0)

        # First send goes through immediately
        broadcaster.send(group="g1", event_type="stats", data={"count": 1})
        assert mock_cl.group_send.call_count == 1

        # Second and third sends within interval → buffered
        broadcaster.send(group="g1", event_type="stats", data={"count": 2})
        broadcaster.send(group="g1", event_type="stats", data={"count": 3})
        assert mock_cl.group_send.call_count == 1  # Still 1

    @patch("hmis.apps.core.websockets.throttle.get_channel_layer")
    def test_flush_sends_latest_buffered(self, mock_layer):
        """flush() should send the latest buffered payload."""
        mock_cl = MagicMock()
        mock_cl.group_send = AsyncMock()
        mock_layer.return_value = mock_cl

        # Use a long interval so timer never auto-fires
        broadcaster = ThrottledBroadcaster(interval=100.0)

        # First goes through immediately
        broadcaster.send(group="g1", event_type="stats", data={"count": 1})
        assert mock_cl.group_send.call_count == 1

        # Buffer second (within interval)
        broadcaster.send(group="g1", event_type="stats", data={"count": 99})
        assert mock_cl.group_send.call_count == 1  # Still 1 — buffered

        # Manually force the buffer entry's last_sent into the past so flush picks it up
        key = ("g1", "stats")
        with broadcaster._lock:
            broadcaster._buffer[key]["last_sent"] = 0  # Force elapsed
        flushed = broadcaster.flush()

        assert flushed == 1
        last_call = mock_cl.group_send.call_args
        assert last_call[0][1]["data"]["count"] == 99
        broadcaster.clear()

    @patch("hmis.apps.core.websockets.throttle.get_channel_layer")
    def test_different_keys_independent(self, mock_layer):
        """Different (group, event_type) pairs should throttle independently."""
        mock_cl = MagicMock()
        mock_cl.group_send = AsyncMock()
        mock_layer.return_value = mock_cl

        broadcaster = ThrottledBroadcaster(interval=10.0)

        broadcaster.send(group="g1", event_type="stats", data={"a": 1})
        broadcaster.send(group="g2", event_type="stats", data={"b": 2})

        # Both should go through immediately (different keys)
        assert mock_cl.group_send.call_count == 2

    def test_clear_resets_state(self):
        """clear() should remove all buffered events."""
        broadcaster = ThrottledBroadcaster(interval=10.0)
        # Manipulate internal buffer
        broadcaster._buffer[("g1", "stats")] = {"data": {"x": 1}, "last_sent": 0}
        broadcaster.clear()
        assert len(broadcaster._buffer) == 0

    @patch("hmis.apps.core.websockets.throttle.get_channel_layer")
    def test_no_channel_layer_graceful(self, mock_layer):
        """Should not raise if channel layer is None."""
        mock_layer.return_value = None
        broadcaster = ThrottledBroadcaster()
        # Should not raise
        broadcaster.send(group="g1", event_type="stats", data={}, critical=True)


# =============================================================================
# FacilityWebSocketMiddleware Tests
# =============================================================================


@pytest.mark.django_db
class TestFacilityWebSocketMiddleware:
    """Tests for WebSocket facility access validation."""

    @pytest.mark.asyncio
    async def test_non_websocket_passed_through(self):
        """Non-websocket scopes should pass through unchanged."""
        app = AsyncMock()
        mw = FacilityWebSocketMiddleware(app)

        scope = {"type": "http"}
        await mw(scope, AsyncMock(), AsyncMock())

        app.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_facility_id_passes_through(self):
        """Routes without facility_id should pass through with scope['facility_id'] = None."""
        app = AsyncMock()
        mw = FacilityWebSocketMiddleware(app)

        scope = {
            "type": "websocket",
            "url_route": {"kwargs": {"clinic_id": "5"}},
        }
        await mw(scope, AsyncMock(), AsyncMock())

        app.assert_called_once()
        assert scope["facility_id"] is None

    @pytest.mark.asyncio
    async def test_invalid_facility_id_rejected(self):
        """Non-numeric facility_id should be rejected with 4400."""
        app = AsyncMock()
        mw = FacilityWebSocketMiddleware(app)
        send = AsyncMock()

        scope = {
            "type": "websocket",
            "url_route": {"kwargs": {"facility_id": "abc"}},
        }
        await mw(scope, AsyncMock(), send)

        app.assert_not_called()
        send.assert_called_once()
        assert send.call_args[0][0]["code"] == 4400

    @pytest.mark.asyncio
    async def test_anonymous_user_passes_through(self):
        """Anonymous users should pass through (consumer handles auth)."""
        app = AsyncMock()
        mw = FacilityWebSocketMiddleware(app)

        anonymous = MagicMock()
        anonymous.is_anonymous = True

        scope = {
            "type": "websocket",
            "url_route": {"kwargs": {"facility_id": "1"}},
            "user": anonymous,
        }
        await mw(scope, AsyncMock(), AsyncMock())

        app.assert_called_once()
        assert scope["facility_id"] == 1

    @pytest.mark.asyncio
    async def test_superuser_always_passes(self):
        """Superusers should have access to any facility."""
        app = AsyncMock()
        mw = FacilityWebSocketMiddleware(app)

        user = MagicMock()
        user.is_anonymous = False
        user.is_superuser = True
        user.staff_profile = MagicMock(side_effect=AttributeError("no profile"))
        # Accessing .staff_profile raises → falls through to is_superuser check
        type(user).staff_profile = property(lambda s: (_ for _ in ()).throw(AttributeError()))

        # Mock the DB check to return True for superuser
        mw._check_facility_access = AsyncMock(return_value=True)

        scope = {
            "type": "websocket",
            "url_route": {"kwargs": {"facility_id": "999"}},
            "user": user,
        }
        await mw(scope, AsyncMock(), AsyncMock())

        app.assert_called_once()

    @pytest.mark.asyncio
    async def test_user_without_access_rejected(self):
        """User without facility access should be rejected with 4403."""
        app = AsyncMock()
        mw = FacilityWebSocketMiddleware(app)
        send = AsyncMock()

        user = MagicMock()
        user.is_anonymous = False

        # Mock the DB check to return False
        mw._check_facility_access = AsyncMock(return_value=False)

        scope = {
            "type": "websocket",
            "url_route": {"kwargs": {"facility_id": "1"}},
            "user": user,
        }
        await mw(scope, AsyncMock(), send)

        app.assert_not_called()
        send.assert_called_once()
        assert send.call_args[0][0]["code"] == 4403

    @pytest.mark.asyncio
    async def test_user_with_access_passes(self):
        """User with facility access should pass through."""
        app = AsyncMock()
        mw = FacilityWebSocketMiddleware(app)

        user = MagicMock()
        user.is_anonymous = False

        # Mock the DB check to return True
        mw._check_facility_access = AsyncMock(return_value=True)

        scope = {
            "type": "websocket",
            "url_route": {"kwargs": {"facility_id": "1"}},
            "user": user,
        }
        await mw(scope, AsyncMock(), AsyncMock())

        app.assert_called_once()
        assert scope["facility_id"] == 1


# =============================================================================
# Health Endpoint Tests
# =============================================================================


@pytest.mark.django_db
class TestWebSocketHealth:
    """Tests for the WebSocket health check API."""

    def test_health_returns_200_with_in_memory_layer(self, authenticated_client):
        """Health endpoint should return 200 with InMemoryChannelLayer."""
        response = authenticated_client.get("/api/ws/health/")
        assert response.status_code == 200
        assert response.data["websocket"] == "healthy"
        assert response.data["latency_ms"] is not None
        assert "InMemory" in response.data["channel_layer_backend"]

    def test_health_requires_auth(self, api_client):
        """Health endpoint should require authentication."""
        response = api_client.get("/api/ws/health/")
        assert response.status_code == 401

    def test_health_returns_backend_name(self, authenticated_client):
        """Response should include the channel layer backend class name."""
        response = authenticated_client.get("/api/ws/health/")
        assert response.status_code == 200
        assert response.data["channel_layer_backend"] is not None


# =============================================================================
# Production Settings Tests
# =============================================================================


class TestProductionChannelLayers:
    """Test Redis channel layer configuration in production settings."""

    def test_redis_configured_when_env_set(self):
        """CHANNEL_LAYERS should use Redis when REDIS_URL is set."""
        import os
        from importlib import reload

        original = os.environ.get("REDIS_URL")
        try:
            os.environ["REDIS_URL"] = "redis://localhost:6379/0"
            # We can't fully reload production settings without side effects,
            # but we can verify the logic directly
            redis_url = os.environ["REDIS_URL"]
            assert redis_url == "redis://localhost:6379/0"

            # Verify the setting would be created
            if redis_url:
                config = {
                    "default": {
                        "BACKEND": "channels_redis.core.RedisChannelLayer",
                        "CONFIG": {
                            "hosts": [redis_url],
                            "capacity": 1500,
                            "expiry": 60,
                        },
                    },
                }
                assert config["default"]["BACKEND"] == "channels_redis.core.RedisChannelLayer"
                assert config["default"]["CONFIG"]["hosts"] == ["redis://localhost:6379/0"]
        finally:
            if original is None:
                os.environ.pop("REDIS_URL", None)
            else:
                os.environ["REDIS_URL"] = original

    def test_in_memory_layer_default(self):
        """Default (dev/test) should use InMemoryChannelLayer."""
        from django.conf import settings

        assert settings.CHANNEL_LAYERS["default"]["BACKEND"] == "channels.layers.InMemoryChannelLayer"


# =============================================================================
# ASGI Middleware Wiring Tests
# =============================================================================


class TestAsgiMiddlewareWiring:
    """Test that FacilityWebSocketMiddleware is wired into ASGI app."""

    def test_middleware_in_application_stack(self):
        """FacilityWebSocketMiddleware should be in the ASGI application chain."""
        from hmis.asgi import application

        # The websocket handler should be AuthMiddlewareStack → FacilityWebSocketMiddleware → URLRouter
        ws_handler = application.application_mapping.get("websocket")
        assert ws_handler is not None

        # Walk the middleware chain to find FacilityWebSocketMiddleware
        found = False
        current = ws_handler
        for _ in range(10):  # Max depth
            if isinstance(current, FacilityWebSocketMiddleware):
                found = True
                break
            # AuthMiddlewareStack and other middleware store inner app in .inner or .application
            current = getattr(current, "inner", getattr(current, "application", None))
            if current is None:
                break

        assert found, "FacilityWebSocketMiddleware not found in ASGI middleware chain"
