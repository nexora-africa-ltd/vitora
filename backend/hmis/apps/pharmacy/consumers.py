"""
WebSocket Consumers for Pharmacy Queue.

Provides real-time updates for pharmacy prescription and stock events.
Clients connect to receive live updates about queue changes and stock alerts.

WebSocket endpoint: ws://localhost/ws/pharmacy/{facility_id}/queue/
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class PharmacyQueueConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for pharmacy queue real-time updates.

    Handles:
    - Connection management (connect/disconnect)
    - Joining/leaving facility-specific pharmacy channel groups
    - Broadcasting prescription and stock events to connected clients

    Events broadcasted:
    - pharmacy.prescription_created: New prescription received
    - pharmacy.dispensing_completed: Medication dispensed to patient
    - pharmacy.stock_critical: Drug stock critically low or out of stock
    - pharmacy.stock_low_warning: Drug stock below reorder level
    - pharmacy.prescription_expired: Prescription has expired
    - pharmacy.stats_updated: Pharmacy queue statistics updated
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.room_group_name = f"pharmacy_queue_{self.facility_id}"

        # Validate facility exists
        facility_exists = await self._facility_exists(self.facility_id)
        if not facility_exists:
            logger.warning(
                f"WebSocket connection rejected: facility {self.facility_id} not found"
            )
            await self.close()
            return

        # Join facility-specific pharmacy group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to pharmacy queue for facility {self.facility_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(
                f"WebSocket disconnected from pharmacy queue for facility {self.facility_id}"
            )

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

    async def pharmacy_update(self, event):
        """Handle pharmacy update events from channel layer."""
        await self.send_json(
            {
                "event": event["event"],
                "data": event["data"],
            }
        )

    async def pharmacy_prescription_created(self, event):
        """Handle prescription created event."""
        await self.pharmacy_update(event)

    async def pharmacy_dispensing_completed(self, event):
        """Handle dispensing completed event."""
        await self.pharmacy_update(event)

    async def pharmacy_stock_critical(self, event):
        """Handle stock critical event."""
        await self.pharmacy_update(event)

    async def pharmacy_stock_low_warning(self, event):
        """Handle stock low warning event."""
        await self.pharmacy_update(event)

    async def pharmacy_prescription_expired(self, event):
        """Handle prescription expired event."""
        await self.pharmacy_update(event)

    async def pharmacy_stats_updated(self, event):
        """Handle stats updated event."""
        await self.pharmacy_update(event)

    @database_sync_to_async
    def _facility_exists(self, facility_id):
        """Check if facility exists in database."""
        from hmis.apps.core.models import Facility

        return Facility.objects.filter(id=facility_id).exists()
