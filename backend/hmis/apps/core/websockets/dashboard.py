"""
WebSocket Consumer for Dashboard Projections.

Provides real-time stats_updated broadcasts aggregated from
ClinicQueueProjection, WardOccupancyProjection, and PharmacyQueueProjection.

WebSocket endpoint: ws://localhost/ws/dashboard/{facility_id}/
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class DashboardConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for dashboard projection broadcasts.

    Receives forwarded stats_updated events from clinic, ward,
    and pharmacy projections and re-broadcasts to connected clients.

    Events broadcasted:
    - stats_updated: Aggregated stats changed
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.room_group_name = f"dashboard_{self.facility_id}"

        # Validate facility exists
        facility_exists = await self._facility_exists(self.facility_id)
        if not facility_exists:
            logger.warning(f"WebSocket connection rejected: facility {self.facility_id} not found")
            await self.close()
            return

        # Join facility-specific dashboard group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to dashboard for facility {self.facility_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from dashboard for facility {self.facility_id}")

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
        if content.get("type") == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    # -------------------------------------------------------------------------
    # Event handlers (called via channel layer group_send)
    # -------------------------------------------------------------------------

    async def dashboard_stats_updated(self, event):
        """Handle stats updated event from channel layer."""
        await self.send_json(
            {
                "event": "stats_updated",
                "data": event.get("data", {}),
            }
        )

    @database_sync_to_async
    def _facility_exists(self, facility_id):
        """Check if facility exists in database."""
        from hmis.apps.core.models import Facility

        return Facility.objects.filter(id=facility_id).exists()
