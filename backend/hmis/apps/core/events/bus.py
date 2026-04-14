"""
Domain Event Bus.

In-process event dispatcher supporting synchronous publish/subscribe.
Events are persisted to EventStore before dispatching to subscribers,
ensuring durability even if a handler fails.

Usage:
    from hmis.apps.core.events import get_event_bus, DomainEvent

    bus = get_event_bus()

    # Subscribe
    bus.subscribe('prescription.created', handle_new_prescription)

    # Publish
    bus.publish(DomainEvent(
        event_type='prescription.created',
        aggregate_type='Prescription',
        aggregate_id=prescription.id,
        payload={'prescription_number': prescription.prescription_number},
        user_id=request.user.id,
        facility_id=prescription.facility_id,
    ))
"""

import logging
import threading
from collections import defaultdict
from collections.abc import Callable

from hmis.apps.core.events.base import DomainEvent

logger = logging.getLogger(__name__)

# Type alias for event handler functions
EventHandler = Callable[[DomainEvent], None]


class EventBus:
    """
    In-process domain event bus with persistent storage.

    Thread-safe singleton that:
    1. Persists events to EventStore (if available)
    2. Dispatches to registered subscriber handlers
    3. Logs handler failures without blocking other handlers

    Subscribers are called synchronously in registration order.
    A failing subscriber does not prevent other subscribers from executing.
    """

    def __init__(self):
        self._subscribers: dict[str, list[EventHandler]] = defaultdict(list)
        self._wildcard_subscribers: list[EventHandler] = []
        self._lock = threading.Lock()

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        """
        Register a handler for a specific event type.

        Args:
            event_type: Dotted event name (e.g. 'prescription.created')
                        Use '*' to subscribe to all events.
            handler: Callable that accepts a DomainEvent argument.
        """
        with self._lock:
            if event_type == "*":
                if handler not in self._wildcard_subscribers:
                    self._wildcard_subscribers.append(handler)
            else:
                if handler not in self._subscribers[event_type]:
                    self._subscribers[event_type].append(handler)

        logger.debug(f"Subscribed {handler.__name__} to '{event_type}'")

    def unsubscribe(self, event_type: str, handler: EventHandler) -> None:
        """
        Remove a handler for a specific event type.

        Args:
            event_type: Dotted event name or '*' for wildcard.
            handler: The handler to remove.
        """
        with self._lock:
            if event_type == "*":
                if handler in self._wildcard_subscribers:
                    self._wildcard_subscribers.remove(handler)
            else:
                if handler in self._subscribers[event_type]:
                    self._subscribers[event_type].remove(handler)

    def publish(self, event: DomainEvent) -> None:
        """
        Publish a domain event.

        Steps:
        1. Persist to EventStore (best-effort — logged on failure)
        2. Dispatch to type-specific subscribers
        3. Dispatch to wildcard subscribers

        Args:
            event: The DomainEvent to publish.
        """
        # 1. Persist to EventStore
        self._persist(event)

        # 2. Dispatch to type-specific handlers
        with self._lock:
            handlers = list(self._subscribers.get(event.event_type, []))
            wildcard_handlers = list(self._wildcard_subscribers)

        for handler in handlers:
            self._safe_call(handler, event)

        # 3. Dispatch to wildcard handlers
        for handler in wildcard_handlers:
            self._safe_call(handler, event)

    def clear(self) -> None:
        """Remove all subscribers. Primarily for testing."""
        with self._lock:
            self._subscribers.clear()
            self._wildcard_subscribers.clear()

    def _persist(self, event: DomainEvent) -> None:
        """Persist event to EventStore (best-effort)."""
        try:
            from hmis.apps.core.events.store import EventStore

            EventStore.objects.create(
                event_id=event.event_id,
                event_type=event.event_type,
                aggregate_type=event.aggregate_type,
                aggregate_id=str(event.aggregate_id),
                payload=event.payload,
                timestamp=event.timestamp,
                user_id=event.user_id,
                facility_id=event.facility_id,
                organization_id=event.organization_id,
                correlation_id=event.correlation_id,
            )
        except Exception as e:
            logger.error(f"Failed to persist event {event.event_type}: {e}")

    @staticmethod
    def _safe_call(handler: EventHandler, event: DomainEvent) -> None:
        """Call handler, logging any exception without re-raising."""
        try:
            handler(event)
        except Exception:
            logger.exception(
                f"Handler {handler.__name__} failed for event "
                f"{event.event_type} (aggregate={event.aggregate_type}:{event.aggregate_id})"
            )


# ---------------------------------------------------------------------------
# Singleton access
# ---------------------------------------------------------------------------

_event_bus: EventBus | None = None
_bus_lock = threading.Lock()


def get_event_bus() -> EventBus:
    """Get or create the global EventBus singleton."""
    global _event_bus
    if _event_bus is None:
        with _bus_lock:
            if _event_bus is None:
                _event_bus = EventBus()
    return _event_bus


def reset_event_bus() -> None:
    """Reset the global EventBus singleton. For testing only."""
    global _event_bus
    with _bus_lock:
        if _event_bus is not None:
            _event_bus.clear()
        _event_bus = None
