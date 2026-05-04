"""
WebSocket Broadcast Utilities for Clinical Comments.

Provides synchronous helper functions for broadcasting comment events
from Django signals/views to connected WebSocket clients.
"""

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def _get_group_name(content_type_model: str, object_id: int) -> str:
    """Build the channel group name for a comment target."""
    return f"comments_{content_type_model}_{object_id}"


def broadcast_comment_event(
    content_type_model: str,
    object_id: int,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Broadcast a comment event to the WebSocket group for the target entity.

    Args:
        content_type_model: The model name (e.g., 'encounter', 'laborder', 'prescription')
        object_id: The target object's ID
        event_type: Event type suffix (created, updated, deleted, reaction_added, reaction_removed)
        data: Event payload
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.debug("No channel layer configured, skipping comment broadcast")
        return

    group_name = _get_group_name(content_type_model, object_id)

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": f"comment.{event_type}",
                "data": data,
            },
        )
    except Exception:
        logger.exception(f"Failed to broadcast comment event to group {group_name}")
