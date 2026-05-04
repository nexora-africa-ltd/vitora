"""
Domain Events Infrastructure for Vitora HMIS.

Provides a lightweight, auditable domain event system that:
- Publishes events through an in-process event bus
- Persists events to an EventStore for durability and replay
- Supports synchronous subscriber handlers
- Provides decorators for clean event publishing and handling

Architecture:
- DomainEvent: Immutable event dataclass with metadata
- EventBus: Singleton publish/subscribe dispatcher
- EventStore: Persistent Django model for event storage and replay
"""

from hmis.apps.core.events.base import DomainEvent
from hmis.apps.core.events.bus import EventBus, get_event_bus
from hmis.apps.core.events.helpers import publish_event
from hmis.apps.core.events.types import (
    AIEvents,
    BillingEvents,
    ClinicalEvents,
    CommentEvents,
    CoreEvents,
    ImagingEvents,
    ImmunizationEvents,
    InpatientEvents,
    InventoryEvents,
    LaboratoryEvents,
    MCHEvents,
    OrganizationEvents,
    PharmacyEvents,
    SchedulingEvents,
    SurveillanceEvents,
    TheatreEvents,
)

__all__ = [
    "DomainEvent",
    "EventBus",
    "get_event_bus",
    "publish_event",
    "AIEvents",
    "BillingEvents",
    "ClinicalEvents",
    "CommentEvents",
    "CoreEvents",
    "ImagingEvents",
    "ImmunizationEvents",
    "InpatientEvents",
    "InventoryEvents",
    "LaboratoryEvents",
    "MCHEvents",
    "OrganizationEvents",
    "PharmacyEvents",
    "SchedulingEvents",
    "SurveillanceEvents",
    "TheatreEvents",
]
