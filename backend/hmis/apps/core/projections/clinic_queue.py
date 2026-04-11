"""
Clinic Queue Projection.

Maintains a denormalized ClinicQueueStats record per (facility, clinic)
by processing clinic visit domain events.
"""

import logging

from django.utils import timezone

from hmis.apps.core.events.base import DomainEvent
from hmis.apps.core.events.types import ClinicalEvents
from hmis.apps.core.projections.base import Projection
from hmis.apps.core.projections.models import ClinicQueueStats

logger = logging.getLogger(__name__)

# Statuses that count as "waiting"
_WAITING_STATUSES = {"REGISTERED", "WAITING", "CALLED"}
_TERMINAL_STATUSES = {"COMPLETED", "CANCELLED", "NO_SHOW", "REFERRED"}


class ClinicQueueProjection(Projection):
    """
    Projects clinic visit events into ClinicQueueStats read model.

    Tracks per clinic:
    - waiting_count: patients in REGISTERED / WAITING / CALLED
    - in_consultation_count: patients IN_CONSULTATION
    - completed_today / no_show_today: terminal states
    """

    event_types = [
        ClinicalEvents.CLINIC_VISIT_CREATED,
        ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED,
    ]

    def handle_event(self, event: DomainEvent) -> None:
        """Update ClinicQueueStats from a clinic visit event."""
        payload = event.payload
        clinic_id = payload.get("clinic_id")
        facility_id = event.facility_id

        if not clinic_id or not facility_id:
            return

        stats, _ = ClinicQueueStats.objects.get_or_create(
            facility_id=facility_id,
            clinic_id=clinic_id,
        )

        if event.event_type == ClinicalEvents.CLINIC_VISIT_CREATED:
            stats.waiting_count += 1

        elif event.event_type == ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED:
            old_status = payload.get("old_status", "")
            new_status = payload.get("new_status", "")

            # Leaving waiting → decrement waiting count
            if old_status in _WAITING_STATUSES and new_status not in _WAITING_STATUSES:
                stats.waiting_count = max(0, stats.waiting_count - 1)

            # Entering consultation
            if new_status == "IN_CONSULTATION" and old_status != "IN_CONSULTATION":
                stats.in_consultation_count += 1

            # Leaving consultation
            if old_status == "IN_CONSULTATION" and new_status != "IN_CONSULTATION":
                stats.in_consultation_count = max(0, stats.in_consultation_count - 1)

            # Terminal states
            if new_status == "COMPLETED":
                stats.completed_today += 1
            elif new_status == "NO_SHOW":
                stats.no_show_today += 1

        stats.last_updated = timezone.now()
        stats.save()

        # Broadcast updated stats to WebSocket clients
        self._broadcast(stats)

    def _broadcast(self, stats: ClinicQueueStats) -> None:
        """Push updated stats to the clinic's WebSocket group."""
        try:
            from hmis.apps.clinics.websockets import broadcast_queue_stats

            broadcast_queue_stats(
                clinic_id=stats.clinic_id,
                stats={
                    "waiting_count": stats.waiting_count,
                    "in_consultation_count": stats.in_consultation_count,
                    "completed_today": stats.completed_today,
                    "no_show_today": stats.no_show_today,
                    "avg_wait_seconds": stats.avg_wait_seconds,
                    "longest_wait_seconds": stats.longest_wait_seconds,
                },
            )
        except Exception:
            logger.debug("Failed to broadcast clinic queue stats", exc_info=True)

    def reset(self, **filters) -> None:
        """Clear projection state."""
        qs = ClinicQueueStats.objects.all()
        if "facility_id" in filters:
            qs = qs.filter(facility_id=filters["facility_id"])
        qs.delete()
