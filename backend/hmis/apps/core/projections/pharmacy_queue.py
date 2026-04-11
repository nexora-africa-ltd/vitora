"""
Pharmacy Queue Projection.

Maintains a denormalized PharmacyQueueStats record per facility
by processing pharmacy domain events.
"""

import logging

from django.utils import timezone

from hmis.apps.core.events.base import DomainEvent
from hmis.apps.core.events.types import PharmacyEvents
from hmis.apps.core.projections.base import Projection
from hmis.apps.core.projections.models import PharmacyQueueStats

logger = logging.getLogger(__name__)


class PharmacyQueueProjection(Projection):
    """
    Projects pharmacy events into PharmacyQueueStats read model.

    Tracks per facility:
    - pending_prescriptions: awaiting dispensing
    - dispensed_today: completed today
    - critical_stock_count / low_stock_count: stock alerts
    """

    event_types = [
        PharmacyEvents.PRESCRIPTION_CREATED,
        PharmacyEvents.DISPENSING_COMPLETED,
        PharmacyEvents.STOCK_CRITICAL,
        PharmacyEvents.STOCK_LOW_WARNING,
        PharmacyEvents.PRESCRIPTION_EXPIRED,
    ]

    def handle_event(self, event: DomainEvent) -> None:
        """Update PharmacyQueueStats from a pharmacy event."""
        facility_id = event.facility_id
        if not facility_id:
            return

        stats, _ = PharmacyQueueStats.objects.get_or_create(
            facility_id=facility_id,
        )

        if event.event_type == PharmacyEvents.PRESCRIPTION_CREATED:
            stats.pending_prescriptions += 1

        elif event.event_type == PharmacyEvents.DISPENSING_COMPLETED:
            stats.pending_prescriptions = max(0, stats.pending_prescriptions - 1)
            stats.dispensed_today += 1

        elif event.event_type == PharmacyEvents.PRESCRIPTION_EXPIRED:
            stats.pending_prescriptions = max(0, stats.pending_prescriptions - 1)

        elif event.event_type == PharmacyEvents.STOCK_CRITICAL:
            stats.critical_stock_count += 1

        elif event.event_type == PharmacyEvents.STOCK_LOW_WARNING:
            stats.low_stock_count += 1

        stats.last_updated = timezone.now()
        stats.save()

        # Broadcast updated stats to WebSocket clients
        self._broadcast(stats)

    def _broadcast(self, stats: PharmacyQueueStats) -> None:
        """Push updated stats to the pharmacy WebSocket group."""
        try:
            from hmis.apps.pharmacy.websockets import broadcast_pharmacy_stats

            broadcast_pharmacy_stats(
                facility_id=stats.facility_id,
                stats={
                    "pending_prescriptions": stats.pending_prescriptions,
                    "dispensed_today": stats.dispensed_today,
                    "critical_stock_count": stats.critical_stock_count,
                    "low_stock_count": stats.low_stock_count,
                },
            )
        except Exception:
            logger.debug("Failed to broadcast pharmacy queue stats", exc_info=True)

    def reset(self, **filters) -> None:
        """Clear projection state."""
        qs = PharmacyQueueStats.objects.all()
        if "facility_id" in filters:
            qs = qs.filter(facility_id=filters["facility_id"])
        qs.delete()
