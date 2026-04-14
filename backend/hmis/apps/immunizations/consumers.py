"""
WebSocket Consumers for Immunizations.

Provides real-time updates for immunization administration and AEFI events.
Clients connect to receive live updates about vaccine administration and adverse events.

WebSocket endpoint: ws://localhost/ws/immunizations/{facility_id}/records/
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class ImmunizationConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for immunization real-time updates.

    Handles:
    - Connection management (connect/disconnect)
    - Joining/leaving facility-specific immunization channel groups
    - Broadcasting immunization events to connected clients

    Events broadcasted:
    - immunization.record_administered: Vaccine dose administered
    - immunization.aefi_reported: Adverse event following immunization reported
    - immunization.schedule_generated: Immunization schedule generated for patient
    - immunization.stats_updated: Immunization statistics updated
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.room_group_name = f"immunization_{self.facility_id}"

        # Validate facility exists
        facility_exists = await self._facility_exists(self.facility_id)
        if not facility_exists:
            logger.warning(f"WebSocket connection rejected: facility {self.facility_id} not found")
            await self.close()
            return

        # Join facility-specific immunization group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to immunizations for facility {self.facility_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(
                f"WebSocket disconnected from immunizations for facility {self.facility_id}"
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

    async def immunization_update(self, event):
        """Handle immunization update events from channel layer."""
        await self.send_json(
            {
                "event": event["event"],
                "data": event["data"],
            }
        )

    async def immunization_record_administered(self, event):
        """Handle vaccine administered event."""
        await self.immunization_update(event)

    async def immunization_aefi_reported(self, event):
        """Handle AEFI reported event."""
        await self.immunization_update(event)

    async def immunization_schedule_generated(self, event):
        """Handle schedule generated event."""
        await self.immunization_update(event)

    async def immunization_stats_updated(self, event):
        """Handle stats updated event."""
        await self.immunization_update(event)

    @database_sync_to_async
    def _facility_exists(self, facility_id):
        """Check if facility exists in database."""
        from hmis.apps.core.models import Facility

        return Facility.objects.filter(id=facility_id).exists()
