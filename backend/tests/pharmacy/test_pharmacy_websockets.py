"""
TDD Tests for Pharmacy Queue WebSocket Integration.

Tests for real-time pharmacy queue updates via WebSocket connections.
WebSocket endpoint: ws://localhost/ws/pharmacy/{facility_id}/queue/

Events broadcasted:
- pharmacy.prescription_created: New prescription received
- pharmacy.dispensing_completed: Medication dispensed to patient
- pharmacy.stock_critical: Drug stock critically low or out of stock
- pharmacy.stock_low_warning: Drug stock below reorder level
- pharmacy.prescription_expired: Prescription has expired
- pharmacy.stats_updated: Pharmacy queue statistics updated
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
        name="Pharmacy Test Org",
        defaults={"slug": "pharmacy-test-org", "is_active": True, "is_verified": True},
    )
    return org


@database_sync_to_async
def create_test_facility(organization):
    """Create a test facility (async-safe)."""
    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(name="Westlands", defaults={"county": county})
    facility, _ = Facility.objects.get_or_create(
        name="Pharmacy Test Hospital",
        defaults={
            "organization": organization,
            "mfl_code": "PHARM-001",
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
class TestPharmacyQueueConsumerConnection:
    """Test WebSocket connection handling for pharmacy queue."""

    async def test_connect_to_valid_facility_succeeds(self):
        """Should accept connection to valid facility pharmacy queue."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_facility_fails(self):
        """Should reject connection to non-existent facility."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/pharmacy/99999/queue/")
        connected, _ = await communicator.connect()

        assert connected is False

    async def test_connect_joins_facility_group(self):
        """Should join the facility-specific pharmacy channel group on connect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        # Send a message to the group and verify it's received
        channel_layer = get_channel_layer()
        group_name = f"pharmacy_queue_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "pharmacy.update",
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

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        # Should not raise an error when sending to group after disconnect
        channel_layer = get_channel_layer()
        group_name = f"pharmacy_queue_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "pharmacy.update",
                "event": "test_event",
                "data": {},
            },
        )

    async def test_ping_pong(self):
        """Should respond to ping with pong."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
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
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.send_to(text_data="not valid json{{{")
        response = await communicator.receive_json_from()
        assert "error" in response

        await communicator.disconnect()


# =============================================================================
# PHARMACY EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestPharmacyEventBroadcasts:
    """Test that pharmacy events are properly broadcasted."""

    async def test_prescription_created_event(self):
        """Should broadcast event when prescription is created."""
        from hmis.apps.pharmacy.websockets import broadcast_pharmacy_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_pharmacy_event(
            facility_id=facility.id,
            event_type="prescription_created",
            data={
                "prescription_id": 1,
                "prescription_number": "RX-20260411-0001",
                "patient_name": "Jane Doe",
                "item_count": 3,
                "status": "PENDING",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "prescription_created"
        assert response["data"]["prescription_number"] == "RX-20260411-0001"
        assert response["data"]["patient_name"] == "Jane Doe"

        await communicator.disconnect()

    async def test_dispensing_completed_event(self):
        """Should broadcast event when dispensing is completed."""
        from hmis.apps.pharmacy.websockets import broadcast_pharmacy_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_pharmacy_event(
            facility_id=facility.id,
            event_type="dispensing_completed",
            data={
                "dispensing_id": 1,
                "patient_name": "John Doe",
                "drug_name": "Paracetamol 500mg",
                "quantity_dispensed": 20,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "dispensing_completed"
        assert response["data"]["drug_name"] == "Paracetamol 500mg"

        await communicator.disconnect()

    async def test_stock_critical_event(self):
        """Should broadcast event when stock is critically low."""
        from hmis.apps.pharmacy.websockets import broadcast_pharmacy_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_pharmacy_event(
            facility_id=facility.id,
            event_type="stock_critical",
            data={
                "drug_name": "Amoxicillin 500mg",
                "remaining_quantity": 0,
                "status": "OUT_OF_STOCK",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "stock_critical"
        assert response["data"]["remaining_quantity"] == 0

        await communicator.disconnect()

    async def test_stock_low_warning_event(self):
        """Should broadcast event when stock is below reorder level."""
        from hmis.apps.pharmacy.websockets import broadcast_pharmacy_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_pharmacy_event(
            facility_id=facility.id,
            event_type="stock_low_warning",
            data={
                "drug_name": "Amoxicillin 500mg",
                "remaining_quantity": 15,
                "reorder_level": 50,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "stock_low_warning"
        assert response["data"]["remaining_quantity"] == 15

        await communicator.disconnect()

    async def test_prescription_expired_event(self):
        """Should broadcast event when prescription expires."""
        from hmis.apps.pharmacy.websockets import broadcast_pharmacy_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_pharmacy_event(
            facility_id=facility.id,
            event_type="prescription_expired",
            data={
                "prescription_id": 1,
                "prescription_number": "RX-20260410-0001",
                "patient_name": "Jane Doe",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "prescription_expired"
        assert response["data"]["prescription_number"] == "RX-20260410-0001"

        await communicator.disconnect()

    async def test_stats_updated_event(self):
        """Should broadcast pharmacy stats update."""
        from hmis.apps.pharmacy.websockets import broadcast_pharmacy_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/pharmacy/{facility.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_pharmacy_event(
            facility_id=facility.id,
            event_type="stats_updated",
            data={
                "pending_count": 12,
                "avg_fulfillment_time": 15.3,
                "critical_stock_count": 2,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "stats_updated"
        assert response["data"]["pending_count"] == 12

        await communicator.disconnect()


# =============================================================================
# SYNC BROADCAST HELPER TESTS
# =============================================================================


@pytest.mark.django_db
class TestPharmacySyncBroadcastHelpers:
    """Test synchronous broadcast helper functions."""

    def test_broadcast_pharmacy_event_sync_no_channel_layer(self, settings):
        """Should handle missing channel layer gracefully."""
        # This tests that broadcast doesn't raise when no channel layer
        from hmis.apps.pharmacy.websockets import broadcast_pharmacy_event_sync

        # Should not raise
        broadcast_pharmacy_event_sync(
            facility_id=1,
            event_type="test",
            data={"test": True},
        )

    def test_broadcast_prescription_created_no_facility(self):
        """Should silently skip broadcast if prescription has no facility."""
        from unittest.mock import MagicMock

        from hmis.apps.pharmacy.websockets import broadcast_prescription_created

        mock_prescription = MagicMock()
        mock_prescription.facility_id = None

        # Should not raise
        broadcast_prescription_created(mock_prescription)

    def test_broadcast_dispensing_completed_no_facility(self):
        """Should silently skip broadcast if dispensing has no facility."""
        from unittest.mock import MagicMock

        from hmis.apps.pharmacy.websockets import broadcast_dispensing_completed

        mock_dispensing = MagicMock()
        mock_dispensing.facility_id = None

        # Should not raise
        broadcast_dispensing_completed(mock_dispensing)

    def test_broadcast_stock_critical_helper(self):
        """Should call broadcast with correct event type."""
        from unittest.mock import MagicMock, patch

        from hmis.apps.pharmacy.websockets import broadcast_stock_critical

        mock_batch = MagicMock()
        mock_batch.id = 1
        mock_batch.drug_id = 1
        mock_batch.drug.generic_name = "Paracetamol"
        mock_batch.batch_number = "BATCH-001"
        mock_batch.quantity_available = 0
        mock_batch.status = "OUT_OF_STOCK"

        with patch(
            "hmis.apps.pharmacy.websockets.broadcast_pharmacy_event_sync"
        ) as mock_broadcast:
            broadcast_stock_critical(mock_batch, facility_id=1)

            mock_broadcast.assert_called_once()
            call_kwargs = mock_broadcast.call_args
            assert call_kwargs[1]["event_type"] == "stock_critical"
            assert call_kwargs[1]["data"]["remaining_quantity"] == 0

    def test_broadcast_stock_low_warning_helper(self):
        """Should call broadcast with correct event type."""
        from unittest.mock import MagicMock, patch

        from hmis.apps.pharmacy.websockets import broadcast_stock_low_warning

        mock_batch = MagicMock()
        mock_batch.id = 1
        mock_batch.drug_id = 1
        mock_batch.drug.generic_name = "Amoxicillin"
        mock_batch.drug.reorder_level = 50
        mock_batch.batch_number = "BATCH-002"
        mock_batch.quantity_available = 10

        with patch(
            "hmis.apps.pharmacy.websockets.broadcast_pharmacy_event_sync"
        ) as mock_broadcast:
            broadcast_stock_low_warning(mock_batch, facility_id=1)

            mock_broadcast.assert_called_once()
            call_kwargs = mock_broadcast.call_args
            assert call_kwargs[1]["event_type"] == "stock_low_warning"
            assert call_kwargs[1]["data"]["remaining_quantity"] == 10
