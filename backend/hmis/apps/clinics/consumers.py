"""
WebSocket Consumers for Clinic Queue.

Provides real-time updates for clinic queue events via WebSocket connections.
Clients connect to receive live updates about queue changes.

WebSocket endpoint: ws://localhost/ws/clinics/{clinic_id}/queue/
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class ClinicQueueConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for clinic queue real-time updates.

    Handles:
    - Connection management (connect/disconnect)
    - Joining/leaving clinic-specific channel groups
    - Broadcasting queue events to connected clients

    Events broadcasted:
    - queue.patient_added: New patient added to queue
    - queue.patient_called: Patient called
    - queue.consultation_started: Consultation started
    - queue.visit_completed: Visit completed
    - queue.patient_removed: Patient removed from queue
    - queue.stats_updated: Queue statistics updated
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.clinic_id = self.scope["url_route"]["kwargs"]["clinic_id"]
        self.room_group_name = f"clinic_queue_{self.clinic_id}"

        # Validate clinic exists
        clinic_exists = await self._clinic_exists(self.clinic_id)
        if not clinic_exists:
            logger.warning(f"WebSocket connection rejected: clinic {self.clinic_id} not found")
            await self.close()
            return

        # Join clinic-specific group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to clinic queue {self.clinic_id}")

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        # Leave clinic group
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from clinic queue {self.clinic_id}")

    async def receive(self, text_data=None, bytes_data=None):
        """
        Handle incoming WebSocket messages with error handling.

        Overrides the parent method to catch JSON decode errors.
        """
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
        """
        Handle incoming WebSocket messages.

        Currently, clients don't need to send messages - they only receive broadcasts.
        This method handles any incoming messages gracefully.
        """
        message_type = content.get("type", "unknown")
        logger.debug(f"Received WebSocket message: {message_type}")

        # Echo back acknowledgment (optional, useful for debugging)
        if message_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    async def queue_update(self, event):
        """
        Handle queue update events from channel layer.

        This is called when broadcast_queue_event sends to the group.
        """
        await self.send_json(
            {
                "event": event["event"],
                "data": event["data"],
            }
        )

    # Alias handlers for different event types
    async def queue_patient_added(self, event):
        """Handle patient added event."""
        await self.queue_update(event)

    async def queue_patient_called(self, event):
        """Handle patient called event."""
        await self.queue_update(event)

    async def queue_consultation_started(self, event):
        """Handle consultation started event."""
        await self.queue_update(event)

    async def queue_visit_completed(self, event):
        """Handle visit completed event."""
        await self.queue_update(event)

    async def queue_patient_removed(self, event):
        """Handle patient removed event."""
        await self.queue_update(event)

    async def queue_stats_updated(self, event):
        """Handle stats updated event."""
        await self.queue_update(event)

    @database_sync_to_async
    def _clinic_exists(self, clinic_id):
        """Check if clinic exists in database."""
        from hmis.apps.clinics.models import Clinic

        return Clinic.objects.filter(id=clinic_id).exists()
