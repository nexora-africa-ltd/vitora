"""
Abstract base class for read-model projections.

A Projection subscribes to one or more domain event types and maintains
a denormalized read model (Django model). When an event arrives, the
projection updates its state. Projections can be rebuilt from scratch
by replaying events from the EventStore.
"""

import logging
from abc import ABC, abstractmethod

from hmis.apps.core.events.base import DomainEvent

logger = logging.getLogger(__name__)


class Projection(ABC):
    """
    Abstract projection that turns domain events into read-model state.

    Subclasses must define:
    - ``event_types``: list of event type strings this projection handles
    - ``handle_event(event)``: update projection state for a single event
    - ``reset()``: clear all projection state (for rebuild)

    Optional overrides:
    - ``name``: human-readable name (defaults to class name)
    - ``on_registered()``: called when the projection is wired to the bus
    """

    #: Event types this projection subscribes to.
    event_types: list[str] = []

    @property
    def name(self) -> str:
        """Human-readable projection name."""
        return self.__class__.__name__

    @abstractmethod
    def handle_event(self, event: DomainEvent) -> None:
        """
        Process a single domain event and update projection state.

        This method must be idempotent — processing the same event twice
        should produce the same result.
        """

    @abstractmethod
    def reset(self, **filters) -> None:
        """
        Clear projection state, optionally scoped by filters.

        Called before rebuild to ensure a clean slate.

        Args:
            **filters: Optional scope (e.g. facility_id=1) to limit the reset.
        """

    def on_registered(self) -> None:
        """Hook called after the projection is wired to the EventBus."""

    def rebuild(self, **filters) -> int:
        """
        Rebuild projection state by replaying events from the EventStore.

        Args:
            **filters: Optional scope (e.g. facility_id=1, since=datetime).

        Returns:
            Number of events processed.
        """
        from hmis.apps.core.events.store import EventStore

        self.reset(**filters)

        count = 0
        for event_type in self.event_types:
            store_filters = {"event_type": event_type}
            if "facility_id" in filters:
                store_filters["facility_id"] = filters["facility_id"]
            if "organization_id" in filters:
                store_filters["organization_id"] = filters["organization_id"]
            if "since" in filters:
                store_filters["timestamp__gte"] = filters["since"]

            for stored in EventStore.objects.filter(**store_filters).order_by("timestamp"):
                event = DomainEvent(
                    event_type=stored.event_type,
                    aggregate_type=stored.aggregate_type,
                    aggregate_id=stored.aggregate_id,
                    payload=stored.payload or {},
                    timestamp=stored.timestamp,
                    user_id=stored.user_id,
                    facility_id=stored.facility_id,
                    organization_id=stored.organization_id,
                    correlation_id=stored.correlation_id or "",
                    event_id=str(stored.event_id),
                )
                self.handle_event(event)
                count += 1

        logger.info("Rebuilt %s: processed %d events", self.name, count)
        return count
