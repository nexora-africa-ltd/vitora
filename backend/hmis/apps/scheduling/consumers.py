"""
WebSocket Consumers for Scheduling.

Provides real-time updates for appointment lifecycle and schedule change events.
Clients connect to receive live updates about appointment status changes,
schedule availability, and assignment engine decisions.

WebSocket endpoint: ws://localhost/ws/scheduling/{facility_id}/appointments/
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class SchedulingConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for scheduling real-time updates.

    Handles:
    - Connection management (connect/disconnect)
    - Joining/leaving facility-specific scheduling channel groups
    - Broadcasting appointment and schedule events to connected clients

    Events broadcasted:
    - scheduling.appointment_created: New appointment booked
    - scheduling.appointment_confirmed: Appointment confirmed
    - scheduling.appointment_checked_in: Patient checked in
    - scheduling.appointment_started: Consultation started
    - scheduling.appointment_completed: Appointment completed
    - scheduling.appointment_cancelled: Appointment cancelled
    - scheduling.appointment_no_show: Patient marked as no-show
    - scheduling.schedule_updated: Schedule/availability changed
    - scheduling.assignment_decided: Auto-assignment decision made
    - scheduling.stats_updated: Scheduling statistics updated
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.room_group_name = f"scheduling_{self.facility_id}"

        # Validate facility exists
        facility_exists = await self._facility_exists(self.facility_id)
        if not facility_exists:
            logger.warning(f"WebSocket connection rejected: facility {self.facility_id} not found")
            await self.close()
            return

        # Join facility-specific scheduling group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info(f"WebSocket connected to scheduling for facility {self.facility_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from scheduling for facility {self.facility_id}")

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

    async def scheduling_update(self, event):
        """Handle scheduling update events from channel layer."""
        await self.send_json(
            {
                "event": event["event"],
                "data": event["data"],
            }
        )

    async def scheduling_appointment_created(self, event):
        """Handle appointment created event."""
        await self.scheduling_update(event)

    async def scheduling_appointment_confirmed(self, event):
        """Handle appointment confirmed event."""
        await self.scheduling_update(event)

    async def scheduling_appointment_checked_in(self, event):
        """Handle appointment checked-in event."""
        await self.scheduling_update(event)

    async def scheduling_appointment_started(self, event):
        """Handle appointment started event."""
        await self.scheduling_update(event)

    async def scheduling_appointment_completed(self, event):
        """Handle appointment completed event."""
        await self.scheduling_update(event)

    async def scheduling_appointment_cancelled(self, event):
        """Handle appointment cancelled event."""
        await self.scheduling_update(event)

    async def scheduling_appointment_no_show(self, event):
        """Handle appointment no-show event."""
        await self.scheduling_update(event)

    async def scheduling_schedule_updated(self, event):
        """Handle schedule/availability updated event."""
        await self.scheduling_update(event)

    async def scheduling_assignment_decided(self, event):
        """Handle auto-assignment decision event."""
        await self.scheduling_update(event)

    async def scheduling_stats_updated(self, event):
        """Handle scheduling stats updated event."""
        await self.scheduling_update(event)

    # Shift swap events
    async def scheduling_swap_requested(self, event):
        """Handle shift swap requested event."""
        await self.scheduling_update(event)

    async def scheduling_swap_accepted(self, event):
        """Handle shift swap accepted event."""
        await self.scheduling_update(event)

    async def scheduling_swap_approved(self, event):
        """Handle shift swap approved event."""
        await self.scheduling_update(event)

    async def scheduling_swap_completed(self, event):
        """Handle shift swap completed event."""
        await self.scheduling_update(event)

    async def scheduling_swap_rejected(self, event):
        """Handle shift swap rejected event."""
        await self.scheduling_update(event)

    async def scheduling_swap_cancelled(self, event):
        """Handle shift swap cancelled event."""
        await self.scheduling_update(event)

    async def scheduling_swap_expired(self, event):
        """Handle shift swap expired event."""
        await self.scheduling_update(event)

    @database_sync_to_async
    def _facility_exists(self, facility_id):
        """Check if facility exists in database."""
        from hmis.apps.core.models import Facility

        return Facility.objects.filter(id=facility_id).exists()
