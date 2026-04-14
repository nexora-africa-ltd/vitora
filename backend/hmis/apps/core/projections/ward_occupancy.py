"""
Ward Occupancy Projection.

Maintains a denormalized WardOccupancyStats record per (facility, ward)
by processing inpatient domain events.
"""

import logging

from django.utils import timezone

from hmis.apps.core.events.base import DomainEvent
from hmis.apps.core.events.types import InpatientEvents
from hmis.apps.core.projections.base import Projection
from hmis.apps.core.projections.models import WardOccupancyStats

logger = logging.getLogger(__name__)


class WardOccupancyProjection(Projection):
    """
    Projects inpatient events into WardOccupancyStats read model.

    Tracks per ward:
    - occupied_beds / available_beds / occupancy_rate
    - admissions_today / discharges_today
    """

    event_types = [
        InpatientEvents.ADMISSION_CREATED,
        InpatientEvents.DISCHARGE_COMPLETED,
        InpatientEvents.WARD_CAPACITY_CHANGED,
    ]

    def handle_event(self, event: DomainEvent) -> None:
        """Update WardOccupancyStats from an inpatient event."""
        payload = event.payload
        ward_id = payload.get("ward_id")
        facility_id = event.facility_id

        if not ward_id or not facility_id:
            return

        stats, created = WardOccupancyStats.objects.get_or_create(
            facility_id=facility_id,
            ward_id=ward_id,
        )

        if created:
            stats.total_beds = payload.get("total_beds", 0)

        if event.event_type == InpatientEvents.ADMISSION_CREATED:
            stats.occupied_beds += 1
            stats.available_beds = max(0, stats.total_beds - stats.occupied_beds)
            stats.admissions_today += 1
            if stats.total_beds > 0:
                stats.occupancy_rate = round((stats.occupied_beds / stats.total_beds) * 100, 2)

        elif event.event_type == InpatientEvents.DISCHARGE_COMPLETED:
            stats.occupied_beds = max(0, stats.occupied_beds - 1)
            stats.available_beds = stats.total_beds - stats.occupied_beds
            stats.discharges_today += 1
            if stats.total_beds > 0:
                stats.occupancy_rate = round((stats.occupied_beds / stats.total_beds) * 100, 2)

        elif event.event_type == InpatientEvents.WARD_CAPACITY_CHANGED:
            stats.total_beds = payload.get("total_beds", stats.total_beds)
            stats.available_beds = max(0, stats.total_beds - stats.occupied_beds)
            if stats.total_beds > 0:
                stats.occupancy_rate = round((stats.occupied_beds / stats.total_beds) * 100, 2)

        stats.last_updated = timezone.now()
        stats.save()

        # Broadcast updated stats to WebSocket clients
        self._broadcast(stats)

    def _broadcast(self, stats: WardOccupancyStats) -> None:
        """Push updated stats to the inpatient WebSocket group."""
        try:
            from hmis.apps.inpatient.websockets import broadcast_ward_event_sync

            broadcast_ward_event_sync(
                ward_id=stats.ward_id,
                event_type="ward.capacity_changed",
                data={
                    "ward_id": stats.ward_id,
                    "total_beds": stats.total_beds,
                    "occupied_beds": stats.occupied_beds,
                    "available_beds": stats.available_beds,
                    "occupancy_rate": float(stats.occupancy_rate),
                    "admissions_today": stats.admissions_today,
                    "discharges_today": stats.discharges_today,
                },
            )
        except Exception:
            logger.debug("Failed to broadcast ward occupancy stats", exc_info=True)

    def reset(self, **filters) -> None:
        """Clear projection state."""
        qs = WardOccupancyStats.objects.all()
        if "facility_id" in filters:
            qs = qs.filter(facility_id=filters["facility_id"])
        qs.delete()
