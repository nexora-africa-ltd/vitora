"""
DomainEvent base class.

Immutable event dataclass carrying all metadata needed for
auditing, correlation, and replay.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from django.utils import timezone


@dataclass(frozen=True)
class DomainEvent:
    """
    Base domain event.

    All domain events carry a standard set of metadata fields:

    Attributes:
        event_type: Dotted event name (e.g. 'prescription.created')
        aggregate_type: The model/entity that produced the event (e.g. 'Prescription')
        aggregate_id: The primary key of the aggregate instance
        payload: Arbitrary event data dict
        timestamp: When the event occurred (defaults to now)
        user_id: The user who triggered the event (optional)
        facility_id: The facility where the event originated (optional)
        organization_id: The organization scope (optional)
        correlation_id: UUID linking related events in a workflow
        event_id: Unique identifier for this specific event instance
    """

    event_type: str
    aggregate_type: str
    aggregate_id: int | str
    payload: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=timezone.now)
    user_id: int | None = None
    facility_id: int | None = None
    organization_id: int | None = None
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> dict:
        """Serialize event to a plain dict for storage or transport."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "aggregate_type": self.aggregate_type,
            "aggregate_id": self.aggregate_id,
            "payload": self.payload,
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "facility_id": self.facility_id,
            "organization_id": self.organization_id,
            "correlation_id": self.correlation_id,
        }
