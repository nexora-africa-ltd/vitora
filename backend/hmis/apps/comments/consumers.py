"""
WebSocket Consumer for Clinical Comments.

Provides real-time updates for comment threads attached to
encounters, lab orders, and prescriptions.

Group naming: comments_{content_type}_{object_id}
Example: comments_encounter_42, comments_laborder_7
"""

import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.contenttypes.models import ContentType

logger = logging.getLogger(__name__)

# Map URL segment to (app_label, model_name)
ENTITY_TYPE_MAP = {
    "encounter": ("encounters", "encounter"),
    "lab-order": ("laboratory", "laborder"),
    "prescription": ("pharmacy", "prescription"),
}


class CommentConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for real-time comment updates on a specific entity.

    Events broadcasted:
    - comment.created: New comment added
    - comment.updated: Comment edited
    - comment.deleted: Comment soft-deleted
    - comment.reaction_added: Reaction added
    - comment.reaction_removed: Reaction removed
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.entity_type = self.scope["url_route"]["kwargs"]["entity_type"]
        self.entity_id = self.scope["url_route"]["kwargs"]["entity_id"]

        # Validate entity type
        if self.entity_type not in ENTITY_TYPE_MAP:
            logger.warning(f"WebSocket rejected: invalid entity_type '{self.entity_type}'")
            await self.close()
            return

        # Validate entity exists
        exists = await self._entity_exists(self.entity_type, self.entity_id)
        if not exists:
            logger.warning(f"WebSocket rejected: {self.entity_type} {self.entity_id} not found")
            await self.close()
            return

        # Build group name from content_type model name (e.g., comments_encounter_42)
        app_label, model_name = ENTITY_TYPE_MAP[self.entity_type]
        self.room_group_name = f"comments_{model_name}_{self.entity_id}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        logger.info(f"WebSocket connected: comments {self.entity_type} {self.entity_id}")

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive_json(self, content):
        """Handle incoming messages (ping/pong only)."""
        if content.get("type") == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    # --- Event handlers (called by channel_layer.group_send) ---

    async def comment_created(self, event):
        """Broadcast new comment to connected clients."""
        await self.send_json({"event": "comment.created", "data": event["data"]})

    async def comment_updated(self, event):
        """Broadcast comment edit to connected clients."""
        await self.send_json({"event": "comment.updated", "data": event["data"]})

    async def comment_deleted(self, event):
        """Broadcast comment deletion to connected clients."""
        await self.send_json({"event": "comment.deleted", "data": event["data"]})

    async def comment_reaction_added(self, event):
        """Broadcast reaction added."""
        await self.send_json({"event": "comment.reaction_added", "data": event["data"]})

    async def comment_reaction_removed(self, event):
        """Broadcast reaction removed."""
        await self.send_json({"event": "comment.reaction_removed", "data": event["data"]})

    @database_sync_to_async
    def _entity_exists(self, entity_type: str, entity_id: str) -> bool:
        """Check if the target entity exists in the database."""
        app_label, model_name = ENTITY_TYPE_MAP[entity_type]
        try:
            ct = ContentType.objects.get(app_label=app_label, model=model_name)
            model_class = ct.model_class()
            return model_class.objects.filter(id=int(entity_id)).exists()
        except (ContentType.DoesNotExist, ValueError):
            return False
