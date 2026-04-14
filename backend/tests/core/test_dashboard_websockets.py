"""
TDD Tests for Dashboard WebSocket Consumer.

Tests for real-time dashboard projection broadcasts via WebSocket connections.
WebSocket endpoint: ws://localhost/ws/dashboard/{facility_id}/

Events broadcasted:
- stats_updated: Aggregated dashboard statistics changed
"""

import pytest
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator

from hmis.apps.core.models import County, Facility, Organization, SubCounty

# =============================================================================
# ASYNC HELPER FUNCTIONS
# =============================================================================


@database_sync_to_async
def create_test_organization():
    """Create a test organization (async-safe)."""
    org, _ = Organization.objects.get_or_create(
        name="Dashboard Test Org",
        defaults={"slug": "dashboard-test-org", "is_active": True, "is_verified": True},
    )
    return org


@database_sync_to_async
def create_test_facility(organization):
    """Create a test facility (async-safe)."""
    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(
        name="Westlands", defaults={"county": county}
    )
    facility, _ = Facility.objects.get_or_create(
        name="Dashboard Test Hospital",
        defaults={
            "organization": organization,
            "mfl_code": "DASH-001",
            "level": "3",
            "county": county,
            "sub_county": sub_county,
            "is_active": True,
        },
    )
    return facility


# =============================================================================
# CONSUMER CONNECTION TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestDashboardConsumerConnection:
    """Test WebSocket connection handling for dashboard."""

    async def test_connect_to_valid_facility_succeeds(self):
        """Should accept connection to valid facility dashboard endpoint."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/dashboard/{facility.id}/"
        )
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_facility_fails(self):
        """Should reject connection to non-existent facility."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(
            application, "/ws/dashboard/99999/"
        )
        connected, _ = await communicator.connect()

        assert connected is False

    async def test_connect_joins_facility_group(self):
        """Should join the facility-specific dashboard channel group on connect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/dashboard/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        group_name = f"dashboard_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "dashboard_stats_updated",
                "event": "stats_updated",
                "data": {"test": "data"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "stats_updated"
        assert response["data"] == {"test": "data"}

        await communicator.disconnect()

    async def test_disconnect_leaves_group(self):
        """Should leave channel group on disconnect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/dashboard/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        channel_layer = get_channel_layer()
        group_name = f"dashboard_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "dashboard_stats_updated",
                "event": "stats_updated",
                "data": {},
            },
        )

    async def test_ping_pong(self):
        """Should respond to ping with pong."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/dashboard/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.send_json_to({"type": "ping", "timestamp": 1234567890})
        response = await communicator.receive_json_from()
        assert response["type"] == "pong"
        assert response["timestamp"] == 1234567890

        await communicator.disconnect()

    async def test_invalid_json_returns_error(self):
        """Should handle invalid JSON gracefully."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/dashboard/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.send_to(text_data="not valid json{{{")
        response = await communicator.receive_json_from()
        assert "error" in response

        await communicator.disconnect()


# =============================================================================
# DASHBOARD EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestDashboardEventBroadcasts:
    """Test that dashboard stats events are properly broadcasted."""

    async def test_stats_updated_event(self):
        """Should broadcast aggregated stats updated event."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/dashboard/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"dashboard_{facility.id}",
            {
                "type": "dashboard_stats_updated",
                "event": "stats_updated",
                "data": {
                    "patients_today": 42,
                    "encounters_today": 35,
                    "pending_labs": 8,
                    "ward_occupancy": 75.5,
                    "pharmacy_queue": 12,
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "stats_updated"
        assert response["data"]["patients_today"] == 42
        assert response["data"]["ward_occupancy"] == 75.5

        await communicator.disconnect()

    async def test_stats_updated_with_empty_data(self):
        """Should broadcast stats updated event with empty data gracefully."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/dashboard/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"dashboard_{facility.id}",
            {
                "type": "dashboard_stats_updated",
                "event": "stats_updated",
                "data": {},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "stats_updated"
        assert response["data"] == {}

        await communicator.disconnect()

    async def test_multiple_clients_receive_broadcast(self):
        """Should broadcast stats to all connected clients."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        # Connect two clients
        communicator1 = WebsocketCommunicator(
            application, f"/ws/dashboard/{facility.id}/"
        )
        communicator2 = WebsocketCommunicator(
            application, f"/ws/dashboard/{facility.id}/"
        )

        connected1, _ = await communicator1.connect()
        connected2, _ = await communicator2.connect()
        assert connected1 is True
        assert connected2 is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"dashboard_{facility.id}",
            {
                "type": "dashboard_stats_updated",
                "event": "stats_updated",
                "data": {"patients_today": 10},
            },
        )

        response1 = await communicator1.receive_json_from()
        response2 = await communicator2.receive_json_from()

        assert response1["event"] == "stats_updated"
        assert response2["event"] == "stats_updated"
        assert response1["data"]["patients_today"] == 10
        assert response2["data"]["patients_today"] == 10

        await communicator1.disconnect()
        await communicator2.disconnect()
