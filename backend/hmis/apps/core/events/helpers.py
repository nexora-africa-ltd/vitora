"""
Convenience helpers for publishing domain events from Django signal handlers.

Provides a single ``publish_event()`` function that constructs and publishes
a DomainEvent in one call, reducing boilerplate in signal handlers.
"""

import logging

from hmis.apps.core.events.base import DomainEvent
from hmis.apps.core.events.bus import get_event_bus

logger = logging.getLogger(__name__)


def publish_event(
    event_type: str,
    aggregate_type: str,
    aggregate_id: int | str,
    payload: dict | None = None,
    *,
    user_id: int | None = None,
    facility_id: int | None = None,
    organization_id: int | None = None,
    correlation_id: str | None = None,
) -> None:
    """
    Construct and publish a domain event (best-effort).

    Failures are logged but never raised — callers (signal handlers)
    must not break the save path.
    """
    try:
        kwargs: dict = {
            "event_type": event_type,
            "aggregate_type": aggregate_type,
            "aggregate_id": aggregate_id,
            "payload": payload or {},
        }
        if user_id is not None:
            kwargs["user_id"] = user_id
        if facility_id is not None:
            kwargs["facility_id"] = facility_id
        if organization_id is not None:
            kwargs["organization_id"] = organization_id
        if correlation_id is not None:
            kwargs["correlation_id"] = correlation_id

        event = DomainEvent(**kwargs)
        get_event_bus().publish(event)
    except Exception:
        logger.exception(
            "Failed to publish domain event %s for %s#%s",
            event_type,
            aggregate_type,
            aggregate_id,
        )
