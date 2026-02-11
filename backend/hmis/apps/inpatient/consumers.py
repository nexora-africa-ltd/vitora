"""
WebSocket Consumers for Inpatient module.

Provides real-time updates for ward compatibility events via WebSocket connections.
Supervisors can receive critical violation alerts.

WebSocket endpoints:
- ws://localhost/ws/inpatient/wards/{ward_id}/ - Ward compatibility updates
- ws://localhost/ws/inpatient/supervisor/alerts/ - Supervisor critical alerts
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class WardCompatibilityConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for ward compatibility real-time updates.

    Handles:
    - Connection management for ward-specific channels
    - Broadcasting ward constraint updates to connected clients
    - Broadcasting compatibility violation events

    Events broadcasted:
    - ward.constraints_updated: Ward constraints changed
    - ward.capacity_changed: Bed availability changed
    - ward.compatibility_violation: Constraint violation on admission
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.ward_id = self.scope["url_route"]["kwargs"]["ward_id"]
        self.room_group_name = f"ward_{self.ward_id}"

        # Validate ward exists
        ward_exists = await self._ward_exists(self.ward_id)
        if not ward_exists:
            logger.warning(f"WebSocket connection rejected: ward {self.ward_id} not found")
            await self.close()
            return

        # Join ward-specific group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to ward {self.ward_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from ward {self.ward_id}")

    async def receive(self, text_data=None, _bytes_data=None):
        """Handle incoming WebSocket messages with error handling."""
        if text_data:
            try:
                content = json.loads(text_data)
                await self.receive_json(content)
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON received: {e}")
                await self.send_json({"error": "Invalid JSON format", "detail": str(e)})

    async def receive_json(self, content):
        """Handle incoming WebSocket messages (ping/pong)."""
        message_type = content.get("type", "unknown")
        logger.debug(f"Received WebSocket message: {message_type}")

        if message_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    async def ward_update(self, event):
        """Handle ward update events from channel layer."""
        await self.send_json({"event": event["event"], "data": event["data"]})

    # Alias handlers for specific event types
    async def ward_constraints_updated(self, event):
        """Handle constraints updated event."""
        await self.ward_update(event)

    async def ward_capacity_changed(self, event):
        """Handle capacity changed event."""
        await self.ward_update(event)

    async def ward_compatibility_violation(self, event):
        """Handle compatibility violation event."""
        await self.ward_update(event)

    @database_sync_to_async
    def _ward_exists(self, ward_id):
        """Check if ward exists in database."""
        from hmis.apps.inpatient.models import Ward

        return Ward.objects.filter(id=ward_id).exists()


class SupervisorAlertConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for supervisor critical violation alerts.

    Handles:
    - Connection to supervisor alerts channel
    - Broadcasting critical violation alerts

    Events broadcasted:
    - supervisor.critical_alert: CRITICAL violation requiring supervisor attention
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.room_group_name = "supervisor_alerts"

        # Join supervisor alerts group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info("WebSocket connected to supervisor alerts")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info("WebSocket disconnected from supervisor alerts")

    async def receive(self, text_data=None, _bytes_data=None):
        """Handle incoming WebSocket messages with error handling."""
        if text_data:
            try:
                content = json.loads(text_data)
                await self.receive_json(content)
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON received: {e}")
                await self.send_json({"error": "Invalid JSON format", "detail": str(e)})

    async def receive_json(self, content):
        """Handle incoming WebSocket messages (ping/pong)."""
        message_type = content.get("type", "unknown")
        logger.debug(f"Received WebSocket message: {message_type}")

        if message_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    async def supervisor_alert(self, event):
        """Handle supervisor alert events from channel layer."""
        await self.send_json({"event": event["event"], "data": event["data"]})

    async def supervisor_critical_alert(self, event):
        """Handle critical alert event."""
        await self.supervisor_alert(event)
