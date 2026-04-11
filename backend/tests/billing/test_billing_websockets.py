"""
TDD Tests for Billing WebSocket Integration.

Tests for real-time billing updates via WebSocket connections.
WebSocket endpoints:
- ws://localhost/ws/billing/{facility_id}/invoices/
- ws://localhost/ws/billing/{facility_id}/sha-claims/

Events broadcasted:
- billing.invoice_created: New invoice created
- billing.invoice_updated: Invoice totals or status changed
- billing.payment_received: Payment recorded against invoice
- billing.payment_reversed: Payment reversed or refunded
- billing.stats_updated: Billing statistics updated
- sha.claim_submitted: SHA claim submitted
- sha.claim_status_changed: SHA claim status changed
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
        name="Billing Test Org",
        defaults={"slug": "billing-test-org", "is_active": True, "is_verified": True},
    )
    return org


@database_sync_to_async
def create_test_facility(organization):
    """Create a test facility (async-safe)."""
    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(name="Westlands", defaults={"county": county})
    facility, _ = Facility.objects.get_or_create(
        name="Billing Test Hospital",
        defaults={
            "organization": organization,
            "mfl_code": "BILL-001",
            "level": "3",
            "county": county,
            "sub_county": sub_county,
            "is_active": True,
        },
    )
    return facility


# =============================================================================
# BILLING CONSUMER CONNECTION TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestBillingConsumerConnection:
    """Test WebSocket connection handling for billing."""

    async def test_connect_to_valid_facility_succeeds(self):
        """Should accept connection to valid facility billing channel."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/invoices/"
        )
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_facility_fails(self):
        """Should reject connection to non-existent facility."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/billing/99999/invoices/")
        connected, _ = await communicator.connect()

        assert connected is False

    async def test_connect_joins_billing_group(self):
        """Should join the facility-specific billing channel group on connect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/invoices/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        # Send a message to the group and verify it's received
        channel_layer = get_channel_layer()
        group_name = f"billing_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "billing.update",
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
            application, f"/ws/billing/{facility.id}/invoices/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        # Should not raise an error when sending to group after disconnect
        channel_layer = get_channel_layer()
        group_name = f"billing_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "billing.update",
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
            application, f"/ws/billing/{facility.id}/invoices/"
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
            application, f"/ws/billing/{facility.id}/invoices/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.send_to(text_data="not valid json{{{")
        response = await communicator.receive_json_from()
        assert "error" in response

        await communicator.disconnect()


# =============================================================================
# SHA CLAIM CONSUMER CONNECTION TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestSHAClaimConsumerConnection:
    """Test WebSocket connection handling for SHA claims."""

    async def test_connect_to_sha_claims_channel(self):
        """Should accept connection to valid facility SHA claims channel."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/sha-claims/"
        )
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_invalid_facility_sha_claims_fails(self):
        """Should reject connection to non-existent facility."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/billing/99999/sha-claims/")
        connected, _ = await communicator.connect()

        assert connected is False

    async def test_sha_claims_group_receives_events(self):
        """Should receive SHA claim events on the correct channel group."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/sha-claims/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        group_name = f"sha_claims_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "sha.update",
                "event": "claim_submitted",
                "data": {"claim_id": 1, "status": "submitted"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "claim_submitted"
        assert response["data"]["status"] == "submitted"

        await communicator.disconnect()


# =============================================================================
# BILLING EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestBillingEventBroadcasts:
    """Test that billing events are properly broadcasted."""

    async def test_invoice_created_event(self):
        """Should broadcast event when invoice is created."""
        from hmis.apps.billing.websockets import broadcast_billing_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/invoices/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_billing_event(
            facility_id=facility.id,
            event_type="invoice_created",
            data={
                "invoice_id": 1,
                "invoice_number": "INV-20260411-0001",
                "patient_name": "Jane Doe",
                "total": "2500.00",
                "status": "draft",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "invoice_created"
        assert response["data"]["invoice_number"] == "INV-20260411-0001"

        await communicator.disconnect()

    async def test_invoice_updated_event(self):
        """Should broadcast event when invoice is updated."""
        from hmis.apps.billing.websockets import broadcast_billing_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/invoices/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_billing_event(
            facility_id=facility.id,
            event_type="invoice_updated",
            data={
                "invoice_id": 1,
                "invoice_number": "INV-20260411-0001",
                "subtotal": "2500.00",
                "total": "2500.00",
                "balance": "1000.00",
                "status": "partial",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "invoice_updated"
        assert response["data"]["status"] == "partial"

        await communicator.disconnect()

    async def test_payment_received_event(self):
        """Should broadcast event when payment is received."""
        from hmis.apps.billing.websockets import broadcast_billing_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/invoices/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_billing_event(
            facility_id=facility.id,
            event_type="payment_received",
            data={
                "payment_id": 1,
                "invoice_id": 1,
                "amount": "1500.00",
                "method": "mpesa",
                "new_balance": "1000.00",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "payment_received"
        assert response["data"]["amount"] == "1500.00"

        await communicator.disconnect()

    async def test_payment_reversed_event(self):
        """Should broadcast event when payment is reversed."""
        from hmis.apps.billing.websockets import broadcast_billing_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/invoices/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_billing_event(
            facility_id=facility.id,
            event_type="payment_reversed",
            data={
                "payment_id": 1,
                "invoice_id": 1,
                "amount": "500.00",
                "reason": "Customer request",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "payment_reversed"
        assert response["data"]["reason"] == "Customer request"

        await communicator.disconnect()

    async def test_billing_stats_event(self):
        """Should broadcast billing stats update."""
        from hmis.apps.billing.websockets import broadcast_billing_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/invoices/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_billing_event(
            facility_id=facility.id,
            event_type="stats_updated",
            data={
                "pending_invoices": 15,
                "total_revenue_today": "45000.00",
                "outstanding_balance": "120000.00",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "stats_updated"
        assert response["data"]["pending_invoices"] == 15

        await communicator.disconnect()


# =============================================================================
# SHA CLAIM EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestSHAClaimEventBroadcasts:
    """Test that SHA claim events are properly broadcasted."""

    async def test_claim_submitted_event(self):
        """Should broadcast event when SHA claim is submitted."""
        from hmis.apps.billing.websockets import broadcast_sha_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/sha-claims/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_sha_event(
            facility_id=facility.id,
            event_type="claim_submitted",
            data={
                "claim_id": 1,
                "invoice_id": 1,
                "patient_name": "Jane Doe",
                "total_amount": "15000.00",
                "sha_reference": "SHA-2026-0001",
                "status": "submitted",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "claim_submitted"
        assert response["data"]["sha_reference"] == "SHA-2026-0001"

        await communicator.disconnect()

    async def test_claim_status_changed_event(self):
        """Should broadcast event when SHA claim status changes."""
        from hmis.apps.billing.websockets import broadcast_sha_event
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/billing/{facility.id}/sha-claims/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_sha_event(
            facility_id=facility.id,
            event_type="claim_status_changed",
            data={
                "claim_id": 1,
                "old_status": "submitted",
                "new_status": "approved",
                "sha_reference": "SHA-2026-0001",
                "total_amount": "15000.00",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "claim_status_changed"
        assert response["data"]["old_status"] == "submitted"
        assert response["data"]["new_status"] == "approved"

        await communicator.disconnect()


# =============================================================================
# SYNC BROADCAST HELPER TESTS
# =============================================================================


@pytest.mark.django_db
class TestBillingSyncBroadcastHelpers:
    """Test synchronous broadcast helper functions."""

    def test_broadcast_billing_event_sync_no_channel_layer(self):
        """Should handle missing channel layer gracefully."""
        from hmis.apps.billing.websockets import broadcast_billing_event_sync

        # Should not raise
        broadcast_billing_event_sync(
            facility_id=1,
            event_type="test",
            data={"test": True},
        )

    def test_broadcast_invoice_created_no_facility(self):
        """Should silently skip broadcast if invoice has no facility."""
        from unittest.mock import MagicMock

        from hmis.apps.billing.websockets import broadcast_invoice_created

        mock_invoice = MagicMock()
        mock_invoice.facility_id = None

        # Should not raise
        broadcast_invoice_created(mock_invoice)

    def test_broadcast_invoice_updated_no_facility(self):
        """Should silently skip broadcast if invoice has no facility."""
        from unittest.mock import MagicMock

        from hmis.apps.billing.websockets import broadcast_invoice_updated

        mock_invoice = MagicMock()
        mock_invoice.facility_id = None

        # Should not raise
        broadcast_invoice_updated(mock_invoice)

    def test_broadcast_payment_received_no_facility(self):
        """Should silently skip broadcast if payment's invoice has no facility."""
        from unittest.mock import MagicMock

        from hmis.apps.billing.websockets import broadcast_payment_received

        mock_payment = MagicMock()
        mock_payment.invoice.facility_id = None

        # Should not raise
        broadcast_payment_received(mock_payment)

    def test_broadcast_sha_claim_submitted_no_facility(self):
        """Should silently skip broadcast if claim has no facility."""
        from unittest.mock import MagicMock

        from hmis.apps.billing.websockets import broadcast_sha_claim_submitted

        mock_claim = MagicMock()
        mock_claim.facility_id = None

        # Should not raise
        broadcast_sha_claim_submitted(mock_claim)

    def test_broadcast_sha_claim_status_changed_helper(self):
        """Should call broadcast with correct event type and old/new status."""
        from unittest.mock import MagicMock, patch

        from hmis.apps.billing.websockets import broadcast_sha_claim_status_changed

        mock_claim = MagicMock()
        mock_claim.facility_id = 1
        mock_claim.id = 1
        mock_claim.claim_number = "CLM-001"
        mock_claim.status = "approved"
        mock_claim.sha_reference = "SHA-REF-001"
        mock_claim.total_amount = "15000.00"

        with patch(
            "hmis.apps.billing.websockets.broadcast_sha_event_sync"
        ) as mock_broadcast:
            broadcast_sha_claim_status_changed(mock_claim, old_status="submitted")

            mock_broadcast.assert_called_once()
            call_kwargs = mock_broadcast.call_args
            assert call_kwargs[1]["event_type"] == "claim_status_changed"
            assert call_kwargs[1]["data"]["old_status"] == "submitted"
            assert call_kwargs[1]["data"]["new_status"] == "approved"
