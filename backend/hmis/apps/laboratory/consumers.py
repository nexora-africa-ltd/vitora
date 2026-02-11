"""
WebSocket Consumers for Laboratory.

Provides real-time updates for lab result events via WebSocket connections.
Clinicians connect to receive notifications about lab results for their patients.

WebSocket endpoints:
- ws://localhost/ws/lab/encounters/{encounter_id}/  - Lab updates for encounter
- ws://localhost/ws/lab/orders/{order_id}/  - Lab updates for specific order
- ws://localhost/ws/lab/clinician/  - All lab updates for ordering clinician
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class LabEncounterConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for lab updates related to an encounter.

    Handles:
    - Connection to encounter-specific lab channel
    - Broadcasting result events to connected clients

    Events broadcasted:
    - lab.result_entered: New result entered
    - lab.result_verified: Result verified by lab tech
    - lab.result_rejected: Result rejected
    - lab.critical_alert: Critical value detected
    - lab.order_completed: All results for order completed
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.encounter_id = self.scope["url_route"]["kwargs"]["encounter_id"]
        self.room_group_name = f"lab_encounter_{self.encounter_id}"

        # Validate encounter exists
        encounter_exists = await self._encounter_exists(self.encounter_id)
        if not encounter_exists:
            logger.warning(
                f"WebSocket connection rejected: encounter {self.encounter_id} not found"
            )
            await self.close()
            return

        # Join encounter-specific group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to lab encounter {self.encounter_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from lab encounter {self.encounter_id}")

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

    async def lab_update(self, event):
        """Handle lab update events from channel layer."""
        await self.send_json({"event": event["event"], "data": event["data"]})

    # Alias handlers for different event types
    async def lab_result_entered(self, event):
        """Handle result entered event."""
        await self.lab_update(event)

    async def lab_result_verified(self, event):
        """Handle result verified event."""
        await self.lab_update(event)

    async def lab_result_rejected(self, event):
        """Handle result rejected event."""
        await self.lab_update(event)

    async def lab_critical_alert(self, event):
        """Handle critical value alert event."""
        await self.lab_update(event)

    async def lab_order_completed(self, event):
        """Handle order completed event."""
        await self.lab_update(event)

    @database_sync_to_async
    def _encounter_exists(self, encounter_id):
        """Check if encounter exists in database."""
        from hmis.apps.encounters.models import Encounter

        return Encounter.objects.filter(id=encounter_id).exists()


class LabOrderConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for lab updates related to a specific order.

    Useful for lab technicians monitoring a specific order's progress.
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.order_id = self.scope["url_route"]["kwargs"]["order_id"]
        self.room_group_name = f"lab_order_{self.order_id}"

        # Validate order exists
        order_exists = await self._order_exists(self.order_id)
        if not order_exists:
            logger.warning(f"WebSocket connection rejected: order {self.order_id} not found")
            await self.close()
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        logger.info(f"WebSocket connected to lab order {self.order_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from lab order {self.order_id}")

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
        if message_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    async def lab_update(self, event):
        """Handle lab update events from channel layer."""
        await self.send_json({"event": event["event"], "data": event["data"]})

    async def lab_result_entered(self, event):
        await self.lab_update(event)

    async def lab_result_verified(self, event):
        await self.lab_update(event)

    async def lab_result_rejected(self, event):
        await self.lab_update(event)

    async def lab_critical_alert(self, event):
        await self.lab_update(event)

    @database_sync_to_async
    def _order_exists(self, order_id):
        """Check if lab order exists in database."""
        from hmis.apps.laboratory.models import LabOrder

        return LabOrder.objects.filter(id=order_id).exists()


class LabClinicianConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for clinician-specific lab notifications.

    A clinician receives updates for all orders they placed.
    Requires authentication.
    """

    async def connect(self):
        """Handle WebSocket connection."""
        user = self.scope.get("user")
        if not user or user.is_anonymous:
            logger.warning("WebSocket connection rejected: user not authenticated")
            await self.close()
            return

        self.user_id = user.id
        self.room_group_name = f"lab_clinician_{self.user_id}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        logger.info(f"WebSocket connected for clinician {self.user_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected for clinician {self.user_id}")

    async def receive(self, text_data=None, _bytes_data=None):
        """Handle incoming WebSocket messages."""
        if text_data:
            try:
                content = json.loads(text_data)
                await self.receive_json(content)
            except json.JSONDecodeError as e:
                await self.send_json({"error": "Invalid JSON format", "detail": str(e)})

    async def receive_json(self, content):
        """Handle incoming WebSocket messages (ping/pong)."""
        message_type = content.get("type", "unknown")
        if message_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    async def lab_update(self, event):
        """Handle lab update events from channel layer."""
        await self.send_json({"event": event["event"], "data": event["data"]})

    async def lab_result_verified(self, event):
        await self.lab_update(event)

    async def lab_critical_alert(self, event):
        await self.lab_update(event)

    async def lab_order_completed(self, event):
        await self.lab_update(event)
