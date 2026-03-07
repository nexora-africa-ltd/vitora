"""WebSocket broadcast helpers for MCH labour partographs."""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


async def broadcast_partograph_event(partograph_id: int, event_type: str, data: dict) -> None:
    """Broadcast an event to all listeners of a labour partograph."""
    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        f"mch_partograph_{partograph_id}",
        {
            "type": "partograph.update",
            "event": event_type,
            "data": data,
        },
    )


def broadcast_partograph_event_sync(partograph_id: int, event_type: str, data: dict) -> None:
    """Sync wrapper for the labour partograph broadcast helper."""
    async_to_sync(broadcast_partograph_event)(partograph_id, event_type, data)