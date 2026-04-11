"""
EventStore — Persistent storage for domain events.

Provides durable event storage for auditing, replay, and projection rebuilding.
Events are stored as immutable records and can be replayed for debugging or
to rebuild read-model projections.

The EventStore model is managed by Django migrations and stored in the same
database as the rest of the application.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class EventStore(models.Model):
    """
    Persistent domain event store.

    Each record is an immutable event captured by the EventBus.
    Events are never updated or deleted in normal operation.

    Indexes optimized for:
    - Replay by aggregate (aggregate_type + aggregate_id + timestamp)
    - Replay by type (event_type + timestamp)
    - Correlation tracking (correlation_id)
    - Facility/org filtering for tenant-scoped replay
    """

    event_id = models.CharField(
        max_length=36,
        unique=True,
        help_text="UUID v4 identifier for this event instance.",
    )
    event_type = models.CharField(
        max_length=200,
        db_index=True,
        help_text="Dotted event type name (e.g. 'prescription.created').",
    )
    aggregate_type = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Model/entity that produced the event (e.g. 'Prescription').",
    )
    aggregate_id = models.CharField(
        max_length=100,
        help_text="Primary key of the aggregate instance.",
    )
    payload = models.JSONField(
        default=dict,
        help_text="Event-specific data.",
    )
    timestamp = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        help_text="When the event occurred.",
    )
    user_id = models.IntegerField(
        null=True,
        blank=True,
        help_text="User ID who triggered the event.",
    )
    facility_id = models.IntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Facility where the event originated.",
    )
    organization_id = models.IntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Organization scope for the event.",
    )
    correlation_id = models.CharField(
        max_length=36,
        db_index=True,
        help_text="UUID linking related events in a workflow.",
    )

    class Meta:
        ordering = ["timestamp", "id"]
        indexes = [
            models.Index(
                fields=["aggregate_type", "aggregate_id", "timestamp"],
                name="idx_event_aggregate_ts",
            ),
            models.Index(
                fields=["event_type", "timestamp"],
                name="idx_event_type_ts",
            ),
        ]
        verbose_name = "Domain Event"
        verbose_name_plural = "Domain Events"

    def __str__(self) -> str:
        return f"{self.event_type} [{self.aggregate_type}:{self.aggregate_id}] @ {self.timestamp}"

    @classmethod
    def replay(
        cls,
        event_type: str | None = None,
        aggregate_type: str | None = None,
        aggregate_id: str | None = None,
        facility_id: int | None = None,
        since: "timezone.datetime | None" = None,
        until: "timezone.datetime | None" = None,
    ):
        """
        Query stored events for replay.

        All filters are optional and combined with AND logic.

        Args:
            event_type: Filter by event type prefix (startswith)
            aggregate_type: Filter by aggregate type (exact match)
            aggregate_id: Filter by aggregate ID (exact match)
            facility_id: Filter by facility
            since: Events after this timestamp (inclusive)
            until: Events before this timestamp (inclusive)

        Returns:
            QuerySet of EventStore records ordered by timestamp.
        """
        qs = cls.objects.all()

        if event_type:
            qs = qs.filter(event_type__startswith=event_type)
        if aggregate_type:
            qs = qs.filter(aggregate_type=aggregate_type)
        if aggregate_id:
            qs = qs.filter(aggregate_id=str(aggregate_id))
        if facility_id:
            qs = qs.filter(facility_id=facility_id)
        if since:
            qs = qs.filter(timestamp__gte=since)
        if until:
            qs = qs.filter(timestamp__lte=until)

        return qs.order_by("timestamp", "id")
