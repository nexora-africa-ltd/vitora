"""
WebSocket Consumers for Billing.

Provides real-time updates for invoice, payment, and SHA claim events.
Clients connect to receive live updates about billing state changes.

WebSocket endpoints:
- ws://localhost/ws/billing/{facility_id}/invoices/
- ws://localhost/ws/billing/{facility_id}/sha-claims/
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class BillingConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for billing real-time updates.

    Handles:
    - Connection management (connect/disconnect)
    - Joining/leaving facility-specific billing channel groups
    - Broadcasting invoice and payment events to connected clients

    Events broadcasted:
    - billing.invoice_created: New invoice created
    - billing.invoice_updated: Invoice totals or status changed
    - billing.payment_received: Payment recorded against invoice
    - billing.payment_reversed: Payment reversed or refunded
    - billing.stats_updated: Billing statistics updated
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.room_group_name = f"billing_{self.facility_id}"

        # Validate facility exists
        facility_exists = await self._facility_exists(self.facility_id)
        if not facility_exists:
            logger.warning(f"WebSocket connection rejected: facility {self.facility_id} not found")
            await self.close()
            return

        # Join facility-specific billing group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to billing for facility {self.facility_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from billing for facility {self.facility_id}")

    async def receive(self, text_data=None, _bytes_data=None):
        """Handle incoming WebSocket messages with error handling."""
        if text_data:
            try:
                content = json.loads(text_data)
                await self.receive_json(content)
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON received: {e}")
                await self.send_json(
                    {
                        "error": "Invalid JSON format",
                        "detail": str(e),
                    }
                )

    async def receive_json(self, content):
        """Handle incoming WebSocket messages (read-only channel, ping/pong only)."""
        message_type = content.get("type", "unknown")
        logger.debug(f"Received WebSocket message: {message_type}")

        if message_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    # -------------------------------------------------------------------------
    # Event handlers (called via channel layer group_send)
    # -------------------------------------------------------------------------

    async def billing_update(self, event):
        """Handle billing update events from channel layer."""
        await self.send_json(
            {
                "event": event["event"],
                "data": event["data"],
            }
        )

    async def billing_invoice_created(self, event):
        """Handle invoice created event."""
        await self.billing_update(event)

    async def billing_invoice_updated(self, event):
        """Handle invoice updated event."""
        await self.billing_update(event)

    async def billing_payment_received(self, event):
        """Handle payment received event."""
        await self.billing_update(event)

    async def billing_payment_reversed(self, event):
        """Handle payment reversed event."""
        await self.billing_update(event)

    async def billing_stats_updated(self, event):
        """Handle stats updated event."""
        await self.billing_update(event)

    @database_sync_to_async
    def _facility_exists(self, facility_id):
        """Check if facility exists in database."""
        from hmis.apps.core.models import Facility

        return Facility.objects.filter(id=facility_id).exists()


class SHAClaimConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for SHA claim real-time updates.

    Handles:
    - Connection management (connect/disconnect)
    - Joining/leaving facility-specific SHA claims channel groups
    - Broadcasting SHA claim lifecycle events to connected clients

    Events broadcasted:
    - sha.claim_submitted: Claim submitted to SHA
    - sha.claim_status_changed: Claim status changed (approved, rejected, etc.)
    - sha.stats_updated: SHA claims statistics updated
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.room_group_name = f"sha_claims_{self.facility_id}"

        # Validate facility exists
        facility_exists = await self._facility_exists(self.facility_id)
        if not facility_exists:
            logger.warning(f"WebSocket connection rejected: facility {self.facility_id} not found")
            await self.close()
            return

        # Join facility-specific SHA claims group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to SHA claims for facility {self.facility_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from SHA claims for facility {self.facility_id}")

    async def receive(self, text_data=None, _bytes_data=None):
        """Handle incoming WebSocket messages with error handling."""
        if text_data:
            try:
                content = json.loads(text_data)
                await self.receive_json(content)
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON received: {e}")
                await self.send_json(
                    {
                        "error": "Invalid JSON format",
                        "detail": str(e),
                    }
                )

    async def receive_json(self, content):
        """Handle incoming WebSocket messages (read-only channel, ping/pong only)."""
        message_type = content.get("type", "unknown")
        logger.debug(f"Received WebSocket message: {message_type}")

        if message_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    # -------------------------------------------------------------------------
    # Event handlers (called via channel layer group_send)
    # -------------------------------------------------------------------------

    async def sha_update(self, event):
        """Handle SHA update events from channel layer."""
        await self.send_json(
            {
                "event": event["event"],
                "data": event["data"],
            }
        )

    async def sha_claim_submitted(self, event):
        """Handle claim submitted event."""
        await self.sha_update(event)

    async def sha_claim_status_changed(self, event):
        """Handle claim status changed event."""
        await self.sha_update(event)

    async def sha_stats_updated(self, event):
        """Handle stats updated event."""
        await self.sha_update(event)

    @database_sync_to_async
    def _facility_exists(self, facility_id):
        """Check if facility exists in database."""
        from hmis.apps.core.models import Facility

        return Facility.objects.filter(id=facility_id).exists()
