"""
Throttled WebSocket broadcaster.

Aggregates rapid-fire broadcast events into batched sends with a configurable
interval. Critical events (lab alerts, emergency) bypass throttling entirely.

Usage:
    from hmis.apps.core.websockets.throttle import get_throttled_broadcaster

    broadcaster = get_throttled_broadcaster()
    broadcaster.send(group="pharmacy_queue_1", event_type="stats_updated",
                     data={...}, critical=False)

Non-critical events are buffered per (group, event_type) key and flushed
at most once per ``interval`` seconds.  Only the **latest** payload is kept
(last-write-wins) because stats/queue-count updates are idempotent snapshots,
not deltas.
"""

import logging
import threading
import time
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

# Default throttle interval in seconds (500ms for non-critical)
DEFAULT_INTERVAL = 0.5


class ThrottledBroadcaster:
    """
    Batched WebSocket broadcaster with per-key throttling.

    Thread-safe.  Each unique (group, event_type) pair is throttled
    independently.  Only the latest payload is retained between flushes.

    Critical events are sent immediately without throttling.
    """

    def __init__(self, interval: float = DEFAULT_INTERVAL):
        self._interval = interval
        self._lock = threading.Lock()
        # {(group, event_type): {"data": payload, "last_sent": float}}
        self._buffer: dict[tuple[str, str], dict[str, Any]] = {}
        self._timer: threading.Timer | None = None
        self._running = False

    @property
    def interval(self) -> float:
        return self._interval

    def send(
        self,
        group: str,
        event_type: str,
        data: dict[str, Any],
        *,
        critical: bool = False,
    ) -> None:
        """
        Queue or immediately send a broadcast.

        Args:
            group: Channel layer group name.
            event_type: WebSocket event type (e.g. 'stats_updated').
            data: Payload dict to send.
            critical: If True, bypass throttling and send immediately.
        """
        if critical:
            self._send_now(group, event_type, data)
            return

        key = (group, event_type)
        now = time.monotonic()

        with self._lock:
            entry = self._buffer.get(key)
            if entry is None or (now - entry.get("last_sent", 0)) >= self._interval:
                # No pending buffer or interval elapsed → send immediately
                self._buffer[key] = {"data": data, "last_sent": now}
                self._send_now(group, event_type, data)
                self._buffer[key]["last_sent"] = now
            else:
                # Buffer the latest payload for next flush
                entry["data"] = data
                self._ensure_timer()

    def flush(self) -> int:
        """
        Flush all buffered events.

        Returns the number of events flushed.
        """
        now = time.monotonic()
        to_send: list[tuple[str, str, dict]] = []

        with self._lock:
            for key, entry in list(self._buffer.items()):
                elapsed = now - entry.get("last_sent", 0)
                if elapsed >= self._interval and entry.get("data") is not None:
                    group, event_type = key
                    to_send.append((group, event_type, entry["data"]))
                    entry["last_sent"] = now
                    entry["data"] = None  # Mark as flushed

            # Restart timer if there are still buffered items with pending data
            has_pending = any(e.get("data") is not None for e in self._buffer.values())
            if has_pending:
                self._schedule_timer()
            else:
                self._running = False

        for group, event_type, data in to_send:
            self._send_now(group, event_type, data)

        return len(to_send)

    def _send_now(self, group: str, event_type: str, data: dict) -> None:
        """Send a message to the channel layer group immediately."""
        try:
            channel_layer = get_channel_layer()
            if channel_layer is None:
                return
            async_to_sync(channel_layer.group_send)(
                group,
                {"type": event_type, "data": data},
            )
        except Exception:
            logger.debug(
                "Throttled broadcast failed for group=%s type=%s",
                group, event_type, exc_info=True,
            )

    def _ensure_timer(self) -> None:
        """Start a flush timer if not already running."""
        if not self._running:
            self._schedule_timer()

    def _schedule_timer(self) -> None:
        """Schedule the next flush cycle."""
        if self._timer is not None:
            self._timer.cancel()
        self._timer = threading.Timer(self._interval, self._on_timer)
        self._timer.daemon = True
        self._timer.start()
        self._running = True

    def _on_timer(self) -> None:
        """Timer callback — flush buffered events."""
        self.flush()

    def clear(self) -> None:
        """Clear all buffered events and stop timer (for testing)."""
        with self._lock:
            self._buffer.clear()
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None
            self._running = False


# Singleton
_broadcaster: ThrottledBroadcaster | None = None
_broadcaster_lock = threading.Lock()


def get_throttled_broadcaster(interval: float = DEFAULT_INTERVAL) -> ThrottledBroadcaster:
    """Get or create the singleton ThrottledBroadcaster."""
    global _broadcaster
    if _broadcaster is None:
        with _broadcaster_lock:
            if _broadcaster is None:
                _broadcaster = ThrottledBroadcaster(interval=interval)
    return _broadcaster


def reset_throttled_broadcaster() -> None:
    """Reset the singleton (for testing)."""
    global _broadcaster
    if _broadcaster is not None:
        _broadcaster.clear()
    _broadcaster = None
