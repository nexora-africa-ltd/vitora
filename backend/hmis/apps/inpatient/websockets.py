"""
WebSocket broadcast utilities for Inpatient module.

Provides async helper functions for broadcasting events to WebSocket channels.
"""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


async def broadcast_ward_event(ward_id: int, event_type: str, data: dict) -> None:
    """
    Broadcast an event to all clients connected to a ward channel.

    Args:
        ward_id: The ID of the ward
        event_type: Type of event (constraints_updated, capacity_changed, etc.)
        data: Event data payload
    """
    channel_layer = get_channel_layer()
    group_name = f"ward_{ward_id}"

    await channel_layer.group_send(
        group_name,
        {
            "type": "ward.update",
            "event": event_type,
            "data": data,
        },
    )
    logger.info(f"Broadcasted {event_type} event to ward {ward_id}")


async def broadcast_supervisor_alert(event_type: str, data: dict) -> None:
    """
    Broadcast an alert to all supervisor clients.

    Args:
        event_type: Type of alert event (critical_violation, etc.)
        data: Alert data payload
    """
    channel_layer = get_channel_layer()
    group_name = "supervisor_alerts"

    await channel_layer.group_send(
        group_name,
        {
            "type": "supervisor.alert",
            "event": event_type,
            "data": data,
        },
    )
    logger.info(f"Broadcasted supervisor alert: {event_type}")


def broadcast_ward_event_sync(ward_id: int, event_type: str, data: dict) -> None:
    """
    Synchronous wrapper for broadcast_ward_event.

    Use this in signal handlers and other sync contexts.
    """
    async_to_sync(broadcast_ward_event)(ward_id, event_type, data)


def broadcast_supervisor_alert_sync(event_type: str, data: dict) -> None:
    """
    Synchronous wrapper for broadcast_supervisor_alert.

    Use this in signal handlers and other sync contexts.
    """
    async_to_sync(broadcast_supervisor_alert)(event_type, data)
