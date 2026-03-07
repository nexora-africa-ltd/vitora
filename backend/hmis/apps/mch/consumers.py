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