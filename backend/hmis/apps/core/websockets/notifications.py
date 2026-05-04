"""
WebSocket Consumer for User Notifications.

Provides real-time notification delivery to connected users.
When a new Notification is created, the post_save signal sends it
to the user's personal channel group for instant display.

WebSocket endpoint: ws://localhost/ws/notifications/
"""

import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for per-user notification delivery.

    Each authenticated user joins a personal group: ``notifications_user_{id}``.
    When a Notification record is created, the signal handler broadcasts
    the notification payload to this group for instant delivery.

    Events broadcasted:
    - new_notification: A new notification was created for this user
    """

    async def connect(self):
        """Handle WebSocket connection — join user-specific group."""
        user = self.scope.get("user")
        if user is None or (hasattr(user, "is_anonymous") and user.is_anonymous):
            await self.close(code=4401)
            return

        self.user_id = user.id
        self.room_group_name = f"notifications_user_{self.user_id}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        logger.debug("Notification WS connected for user %s", self.user_id)

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.debug("Notification WS disconnected for user %s", self.user_id)

    async def receive_json(self, content):
        """Handle incoming messages (ping/pong only)."""
        if content.get("type") == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    # -------------------------------------------------------------------------
    # Event handlers (called via channel layer group_send)
    # -------------------------------------------------------------------------

    async def notification_new(self, event):
        """Handle new notification event — forward to WebSocket client."""
        await self.send_json(
            {
                "type": "new_notification",
                "notification": event["notification"],
            }
        )
