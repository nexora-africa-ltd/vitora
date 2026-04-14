"""
WebSocket Consumers for Imaging.

Provides real-time updates for imaging order lifecycle and result events.
Clients connect to receive live updates about order status and result completions.

WebSocket endpoint: ws://localhost/ws/imaging/{facility_id}/orders/
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class ImagingConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for imaging real-time updates.

    Handles:
    - Connection management (connect/disconnect)
    - Joining/leaving facility-specific imaging channel groups
    - Broadcasting imaging order and result events to connected clients

    Events broadcasted:
    - imaging.order_created: New imaging order placed
    - imaging.order_item_created: Order item added
    - imaging.result_completed: Imaging result/report finalized
    - imaging.stats_updated: Imaging statistics updated
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.room_group_name = f"imaging_{self.facility_id}"

        # Validate facility exists
        facility_exists = await self._facility_exists(self.facility_id)
        if not facility_exists:
            logger.warning(f"WebSocket connection rejected: facility {self.facility_id} not found")
            await self.close()
            return

        # Join facility-specific imaging group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to imaging for facility {self.facility_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from imaging for facility {self.facility_id}")

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

    async def imaging_update(self, event):
        """Handle imaging update events from channel layer."""
        await self.send_json(
            {
                "event": event["event"],
                "data": event["data"],
            }
        )

    async def imaging_order_created(self, event):
        """Handle order created event."""
        await self.imaging_update(event)

    async def imaging_order_item_created(self, event):
        """Handle order item created event."""
        await self.imaging_update(event)

    async def imaging_result_completed(self, event):
        """Handle result completed event."""
        await self.imaging_update(event)

    async def imaging_stats_updated(self, event):
        """Handle stats updated event."""
        await self.imaging_update(event)

    @database_sync_to_async
    def _facility_exists(self, facility_id):
        """Check if facility exists in database."""
        from hmis.apps.core.models import Facility

        return Facility.objects.filter(id=facility_id).exists()
