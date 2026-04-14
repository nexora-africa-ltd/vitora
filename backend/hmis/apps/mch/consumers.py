"""WebSocket consumers for MCH realtime features."""

import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer


class LabourPartographConsumer(AsyncJsonWebsocketConsumer):
    """Push realtime labour partograph updates to connected clients."""

    async def connect(self):
        self.partograph_id = self.scope["url_route"]["kwargs"]["partograph_id"]
        self.room_group_name = f"mch_partograph_{self.partograph_id}"

        if not await self._partograph_exists(self.partograph_id):
            await self.close()
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, _close_code):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data=None, _bytes_data=None):
        if text_data:
            try:
                content = json.loads(text_data)
                await self.receive_json(content)
            except json.JSONDecodeError:
                await self.send_json({"error": "Invalid JSON format"})

    async def receive_json(self, content):
        if content.get("type") == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    async def partograph_update(self, event):
        await self.send_json({"event": event["event"], "data": event["data"]})

    @database_sync_to_async
    def _partograph_exists(self, partograph_id):
        from hmis.apps.mch.models import LabourPartograph

        return LabourPartograph.objects.filter(id=partograph_id).exists()


class MCHFacilityConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for facility-level MCH events.

    Handles registration, delivery, ANC visit, and baby creation events
    that are not specific to a single partograph.

    Events broadcasted:
    - mch.registration_created: New MCH registration
    - mch.delivery_completed: Delivery completed
    - mch.anc_visit_created: ANC visit created
    - mch.baby_patient_created: Baby patient record created
    - mch.stats_updated: MCH statistics updated
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.room_group_name = f"mch_facility_{self.facility_id}"

        facility_exists = await self._facility_exists(self.facility_id)
        if not facility_exists:
            await self.close()
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data=None, _bytes_data=None):
        """Handle incoming WebSocket messages with error handling."""
        if text_data:
            try:
                content = json.loads(text_data)
                await self.receive_json(content)
            except json.JSONDecodeError:
                await self.send_json({"error": "Invalid JSON format"})

    async def receive_json(self, content):
        """Handle incoming WebSocket messages (read-only channel, ping/pong only)."""
        if content.get("type") == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    async def mch_update(self, event):
        """Handle MCH update events from channel layer."""
        await self.send_json({"event": event["event"], "data": event["data"]})

    async def mch_registration_created(self, event):
        """Handle registration created event."""
        await self.mch_update(event)

    async def mch_delivery_completed(self, event):
        """Handle delivery completed event."""
        await self.mch_update(event)

    async def mch_anc_visit_created(self, event):
        """Handle ANC visit created event."""
        await self.mch_update(event)

    async def mch_baby_patient_created(self, event):
        """Handle baby patient created event."""
        await self.mch_update(event)

    async def mch_stats_updated(self, event):
        """Handle stats updated event."""
        await self.mch_update(event)

    @database_sync_to_async
    def _facility_exists(self, facility_id):
        """Check if facility exists in database."""
        from hmis.apps.core.models import Facility

        return Facility.objects.filter(id=facility_id).exists()
