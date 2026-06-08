"""
WebSocket Consumer for Real-Time Sync Broadcast.

Endpoint: ws://hub/ws/sync/{facility_id}/

When a client pushes changes via POST /api/sync/push/, this consumer broadcasts
those changes to all other connected LAN clients in the same facility. This enables
near-real-time data propagation without each client polling the pull endpoint.

Protocol:
- Server → Client messages:
  {"type": "sync_changes", "changes": [...], "source_client_id": "...", "server_timestamp": "..."}
  {"type": "pong", "timestamp": "..."}

- Client → Server messages:
  {"type": "ping", "timestamp": "..."}
  {"type": "subscribe", "tables": ["patients_patient", ...]}  (optional filter)
"""

import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class SyncConsumer(AsyncJsonWebsocketConsumer):
    """Broadcasts sync changes to all facility LAN clients."""

    async def connect(self):
        """Join the facility sync group."""
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.group_name = f"sync_{self.facility_id}"
        self.subscribed_tables: set[str] | None = None  # None = all tables

        # Validate facility exists
        exists = await self._facility_exists(self.facility_id)
        if not exists:
            await self.close(code=4404)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info(
            "Sync client connected to facility %s (channel=%s)",
            self.facility_id,
            self.channel_name,
        )

    async def disconnect(self, close_code):
        """Leave the facility sync group."""
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            logger.info(
                "Sync client disconnected from facility %s (code=%s)",
                self.facility_id,
                close_code,
            )

    async def receive_json(self, content):
        """Handle client messages (ping, subscribe)."""
        msg_type = content.get("type")

        if msg_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

        elif msg_type == "subscribe":
            # Client can filter which tables they want to receive
            tables = content.get("tables")
            if isinstance(tables, list):
                self.subscribed_tables = set(tables)
            else:
                self.subscribed_tables = None  # Reset to all

    async def sync_broadcast(self, event):
        """
        Handle sync_broadcast group message.

        Called when a client pushes changes via the REST API.
        Forwards the changes to this WebSocket client.
        """
        source_client_id = event.get("source_client_id", "")
        changes = event.get("changes", [])
        server_timestamp = event.get("server_timestamp", "")

        # Filter by subscribed tables if the client set a subscription
        if self.subscribed_tables:
            changes = [c for c in changes if c.get("table") in self.subscribed_tables]

        # Don't send empty change lists
        if not changes:
            return

        await self.send_json(
            {
                "type": "sync_changes",
                "changes": changes,
                "source_client_id": source_client_id,
                "server_timestamp": server_timestamp,
            }
        )

    @database_sync_to_async
    def _facility_exists(self, facility_id):
        from hmis.apps.core.models import Facility

        return Facility.objects.filter(id=facility_id).exists()
