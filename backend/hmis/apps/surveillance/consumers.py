"""
WebSocket Consumers for Disease Surveillance.

Provides real-time alerts for immediate reportable diseases and outbreak notifications.
Surveillance dashboard clients connect to receive live updates about new cases.

WebSocket endpoint: ws://localhost/ws/surveillance/alerts/
"""

import asyncio
import json
import logging
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

logger = logging.getLogger(__name__)


class SurveillanceAlertConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for surveillance alert real-time updates.

    Handles:
    - Connection management (connect/disconnect)
    - Broadcasting new case alerts to connected clients
    - Broadcasting outbreak threshold alerts
    - Periodic sync of pending/overdue case counts

    Events broadcasted:
    - surveillance.new_case: New notifiable case detected
    - surveillance.immediate_alert: Immediate reportable disease case
    - surveillance.outbreak_alert: Outbreak threshold exceeded
    - surveillance.overdue_alert: Notification deadline passed
    - surveillance.stats_update: Dashboard statistics refresh
    """

    # Periodic broadcast interval (seconds)
    BROADCAST_INTERVAL = 30

    async def connect(self):
        """Handle WebSocket connection."""
        self.room_group_name = "surveillance_alerts"
        self._task = None

        # Join surveillance alerts group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info("WebSocket connected to surveillance alerts")

        # Start periodic stats broadcast
        self._task = asyncio.create_task(self._periodic_broadcast())

        # Send initial stats immediately
        await self._send_current_stats()

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        # Cancel periodic task
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        # Leave surveillance group
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info("WebSocket disconnected from surveillance alerts")

    async def receive(self, text_data=None, _bytes_data=None):
        """Handle incoming WebSocket messages."""
        if text_data:
            try:
                content = json.loads(text_data)
                await self.receive_json(content)
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON received: {e}")
                await self.send_json({"error": "Invalid JSON format", "detail": str(e)})

    async def receive_json(self, content):
        """Handle incoming WebSocket messages."""
        message_type = content.get("type", "unknown")
        logger.debug(f"Received surveillance WebSocket message: {message_type}")

        if message_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})
        elif message_type == "refresh":
            # Client requesting immediate refresh
            await self._send_current_stats()

    async def _periodic_broadcast(self):
        """Periodically broadcast stats to all connected clients."""
        while True:
            try:
                await asyncio.sleep(self.BROADCAST_INTERVAL)
                await self._send_current_stats()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic surveillance broadcast: {e}")
                await asyncio.sleep(5)

    @database_sync_to_async
    def _get_stats(self) -> dict[str, Any]:
        """Get current surveillance statistics from database."""

        from .models import NotifiableCase, NotificationStatus, SurveillanceAlert

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Active cases pending notification
        pending_immediate = NotifiableCase.objects.filter(
            disease__category="IMMEDIATE",
            notification_status=NotificationStatus.PENDING,
        ).count()

        # Overdue notifications
        overdue = NotifiableCase.objects.filter(
            notification_deadline__lt=now,
            notification_status=NotificationStatus.PENDING,
        ).count()

        # Cases detected today
        cases_today = NotifiableCase.objects.filter(detected_at__gte=today_start).count()

        # Unacknowledged alerts
        unacknowledged_alerts = SurveillanceAlert.objects.filter(is_acknowledged=False).count()

        return {
            "pending_immediate": pending_immediate,
            "overdue_notifications": overdue,
            "cases_today": cases_today,
            "unacknowledged_alerts": unacknowledged_alerts,
            "timestamp": now.isoformat(),
        }

    async def _send_current_stats(self):
        """Send current surveillance stats to this client."""
        try:
            stats = await self._get_stats()
            await self.send_json(
                {
                    "type": "surveillance.stats_update",
                    "data": stats,
                }
            )
        except Exception as e:
            logger.error(f"Error sending surveillance stats: {e}")

    # =========================================================================
    # Group Message Handlers
    # =========================================================================

    async def surveillance_new_case(self, event):
        """Handle new case notification."""
        await self.send_json(
            {
                "type": "surveillance.new_case",
                "data": event["data"],
            }
        )

    async def surveillance_immediate_alert(self, event):
        """Handle immediate reportable disease alert."""
        await self.send_json(
            {
                "type": "surveillance.immediate_alert",
                "data": event["data"],
            }
        )

    async def surveillance_outbreak_alert(self, event):
        """Handle outbreak threshold alert."""
        await self.send_json(
            {
                "type": "surveillance.outbreak_alert",
                "data": event["data"],
            }
        )

    async def surveillance_overdue_alert(self, event):
        """Handle overdue notification alert."""
        await self.send_json(
            {
                "type": "surveillance.overdue_alert",
                "data": event["data"],
            }
        )

    async def surveillance_case_notified(self, event):
        """Handle case notification confirmation."""
        await self.send_json(
            {
                "type": "surveillance.case_notified",
                "data": event["data"],
            }
        )
