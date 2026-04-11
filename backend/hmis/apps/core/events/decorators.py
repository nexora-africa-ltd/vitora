"""
Decorators for domain event publishing and handling.

Provides clean syntax for declaring event publishers and subscribers:

    @publishes_event('prescription.created')
    def create_prescription(self, serializer):
        ...

    @handles_event('prescription.created')
    def send_to_pharmacy_queue(event):
        ...
"""

import functools
import logging

from hmis.apps.core.events.base import DomainEvent
from hmis.apps.core.events.bus import get_event_bus

logger = logging.getLogger(__name__)


def handles_event(event_type: str):
    """
    Decorator that registers a function as an event handler.

    The decorated function will be called whenever an event of the
    specified type is published to the event bus.

    Args:
        event_type: The event type to handle (e.g. 'prescription.created').
                    Use '*' for all events.

    Usage:
        @handles_event('prescription.created')
        def notify_pharmacy(event: DomainEvent):
            # event.payload has prescription details
            ...
    """

    def decorator(func):
        bus = get_event_bus()
        bus.subscribe(event_type, func)
        logger.debug(f"Registered handler {func.__name__} for '{event_type}'")
        return func

    return decorator


def publishes_event(event_type: str, aggregate_type: str = ""):
    """
    Decorator that publishes a domain event after the decorated function returns.

    The decorated function must return a dict with at least 'aggregate_id'
    and optionally 'payload', 'user_id', 'facility_id', 'organization_id'.

    If the function returns None, no event is published.

    Args:
        event_type: The event type to publish (e.g. 'prescription.created')
        aggregate_type: The aggregate type (e.g. 'Prescription'). If empty,
                        inferred from the class name if available.

    Usage:
        @publishes_event('prescription.created', aggregate_type='Prescription')
        def create_prescription(data):
            prescription = Prescription.objects.create(**data)
            return {
                'aggregate_id': prescription.id,
                'payload': {'prescription_number': prescription.prescription_number},
                'user_id': request.user.id,
                'facility_id': prescription.facility_id,
            }
    """

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)

            if result is None:
                return result

            if not isinstance(result, dict):
                return result

            agg_type = aggregate_type
            if not agg_type and args and hasattr(args[0], "__class__"):
                agg_type = args[0].__class__.__name__

            event = DomainEvent(
                event_type=event_type,
                aggregate_type=agg_type,
                aggregate_id=result.get("aggregate_id", 0),
                payload=result.get("payload", {}),
                user_id=result.get("user_id"),
                facility_id=result.get("facility_id"),
                organization_id=result.get("organization_id"),
            )

            bus = get_event_bus()
            bus.publish(event)

            return result

        return wrapper

    return decorator
