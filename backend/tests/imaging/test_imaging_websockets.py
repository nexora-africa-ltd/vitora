"""
TDD Tests for Imaging WebSocket Consumer.

Tests for real-time imaging order updates via WebSocket connections.
WebSocket endpoint: ws://localhost/ws/imaging/{facility_id}/orders/

Events broadcasted:
- imaging.order_created: New imaging order placed
- imaging.order_item_created: Order item added
- imaging.result_completed: Imaging result/report finalized
- imaging.stats_updated: Imaging statistics updated
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
        name="Imaging Test Org",
        defaults={"slug": "imaging-test-org", "is_active": True, "is_verified": True},
    )
    return org


@database_sync_to_async
def create_test_facility(organization):
    """Create a test facility (async-safe)."""
    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(name="Westlands", defaults={"county": county})
    facility, _ = Facility.objects.get_or_create(
        name="Imaging Test Hospital",
        defaults={
            "organization": organization,
            "mfl_code": "IMG-001",
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
class TestImagingConsumerConnection:
    """Test WebSocket connection handling for imaging."""

    async def test_connect_to_valid_facility_succeeds(self):
        """Should accept connection to valid facility imaging endpoint."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(application, f"/ws/imaging/{facility.id}/orders/")
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_facility_fails(self):
        """Should reject connection to non-existent facility."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/imaging/99999/orders/")
        connected, _ = await communicator.connect()

        assert connected is False

    async def test_connect_joins_facility_group(self):
        """Should join the facility-specific imaging channel group on connect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(application, f"/ws/imaging/{facility.id}/orders/")
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        group_name = f"imaging_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "imaging_update",
                "event": "test_event",
                "data": {"test": "data"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "test_event"
        assert response["data"] == {"test": "data"}

        await communicator.disconnect()

    async def test_disconnect_leaves_group(self):
        """Should leave channel group on disconnect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(application, f"/ws/imaging/{facility.id}/orders/")
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        # Should not raise an error when sending to group after disconnect
        channel_layer = get_channel_layer()
        group_name = f"imaging_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "imaging_update",
                "event": "test_event",
                "data": {},
            },
        )

    async def test_ping_pong(self):
        """Should respond to ping with pong."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(application, f"/ws/imaging/{facility.id}/orders/")
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

        communicator = WebsocketCommunicator(application, f"/ws/imaging/{facility.id}/orders/")
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.send_to(text_data="not valid json{{{")
        response = await communicator.receive_json_from()
        assert "error" in response

        await communicator.disconnect()


# =============================================================================
# IMAGING EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestImagingEventBroadcasts:
    """Test that imaging events are properly broadcasted."""

    async def test_order_created_event(self):
        """Should broadcast event when imaging order is created."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(application, f"/ws/imaging/{facility.id}/orders/")
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"imaging_{facility.id}",
            {
                "type": "imaging_order_created",
                "event": "imaging.order.created",
                "data": {
                    "id": 1,
                    "patient_name": "Jane Doe",
                    "modality": "X-RAY",
                    "status": "PENDING",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "imaging.order.created"
        assert response["data"]["modality"] == "X-RAY"
        assert response["data"]["status"] == "PENDING"

        await communicator.disconnect()

    async def test_order_item_created_event(self):
        """Should broadcast event when order item is added."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(application, f"/ws/imaging/{facility.id}/orders/")
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"imaging_{facility.id}",
            {
                "type": "imaging_order_item_created",
                "event": "imaging.order_item.created",
                "data": {
                    "id": 1,
                    "order_id": 1,
                    "study_type": "Chest PA",
                    "body_part": "Chest",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "imaging.order_item.created"
        assert response["data"]["study_type"] == "Chest PA"

        await communicator.disconnect()

    async def test_result_completed_event(self):
        """Should broadcast event when imaging result is finalized."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(application, f"/ws/imaging/{facility.id}/orders/")
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"imaging_{facility.id}",
            {
                "type": "imaging_result_completed",
                "event": "imaging.result.completed",
                "data": {
                    "id": 1,
                    "order_id": 1,
                    "findings": "No abnormalities detected",
                    "radiologist": "Dr. Kamau",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "imaging.result.completed"
        assert response["data"]["radiologist"] == "Dr. Kamau"

        await communicator.disconnect()

    async def test_stats_updated_event(self):
        """Should broadcast event when imaging stats are updated."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(application, f"/ws/imaging/{facility.id}/orders/")
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"imaging_{facility.id}",
            {
                "type": "imaging_stats_updated",
                "event": "imaging.stats.updated",
                "data": {
                    "pending": 5,
                    "completed_today": 12,
                    "total_orders": 150,
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "imaging.stats.updated"
        assert response["data"]["completed_today"] == 12

        await communicator.disconnect()
