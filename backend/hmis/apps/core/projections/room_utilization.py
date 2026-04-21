"""
Room Utilization Projection.

Maintains a denormalized RoomUtilizationStats record per (facility, room, day)
by recomputing from the authoritative Shift and ClinicVisit tables when room-
relevant events arrive.
"""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from hmis.apps.core.events.base import DomainEvent
from hmis.apps.core.events.types import ClinicalEvents, SchedulingEvents
from hmis.apps.core.projections.base import Projection
from hmis.apps.core.projections.models import RoomUtilizationStats


def _minutes_between(start, end) -> int:
    if not start or not end or end <= start:
        return 0
    return max(0, int((end - start).total_seconds() / 60))


class RoomUtilizationProjection(Projection):
    """Project shift and clinic visit activity into room-level daily stats."""

    event_types = [
        SchedulingEvents.SHIFT_CREATED,
        SchedulingEvents.SHIFT_STARTED,
        SchedulingEvents.SHIFT_COMPLETED,
        SchedulingEvents.SHIFT_CANCELLED,
        SchedulingEvents.SHIFT_ABSENT,
        SchedulingEvents.SHIFT_AUTO_COMPLETED,
        SchedulingEvents.SHIFT_BREAK_STARTED,
        SchedulingEvents.SHIFT_BREAK_RESUMED,
        SchedulingEvents.SHIFT_EMERGENCY_CREATED,
        ClinicalEvents.CLINIC_VISIT_CREATED,
        ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED,
    ]

    def handle_event(self, event: DomainEvent) -> None:
        if event.aggregate_type == "Shift":
            self._handle_shift_event(event)
            return
        if event.aggregate_type == "ClinicVisit":
            self._handle_visit_event(event)

    def _handle_shift_event(self, event: DomainEvent) -> None:
        from hmis.apps.scheduling.models import Shift

        try:
            shift = Shift.objects.select_related("clinic").get(pk=event.aggregate_id)
        except Shift.DoesNotExist:
            return

        if not shift.room_id or not shift.shift_date or not shift.facility_id:
            return

        self._recompute(
            facility_id=shift.facility_id,
            room_id=shift.room_id,
            stat_date=shift.shift_date,
            clinic_id=shift.clinic_id,
        )

    def _handle_visit_event(self, event: DomainEvent) -> None:
        from hmis.apps.clinics.models import ClinicVisit

        try:
            visit = ClinicVisit.objects.select_related("session").get(pk=event.aggregate_id)
        except ClinicVisit.DoesNotExist:
            return

        if not visit.room_id or not visit.registered_at or not visit.facility_id:
            return

        self._recompute(
            facility_id=visit.facility_id,
            room_id=visit.room_id,
            stat_date=timezone.localdate(visit.registered_at),
            clinic_id=getattr(visit.session, "clinic_id", None),
        )

    def _recompute(self, facility_id: int, room_id: int, stat_date, clinic_id=None) -> None:
        from hmis.apps.clinics.models import ClinicVisit
        from hmis.apps.scheduling.models import Shift

        day_start = timezone.make_aware(
            timezone.datetime.combine(stat_date, timezone.datetime.min.time())
        )
        day_end = day_start + timedelta(days=1)

        shifts = Shift.objects.filter(
            facility_id=facility_id,
            room_id=room_id,
            shift_date=stat_date,
        )
        visits = ClinicVisit.objects.filter(
            facility_id=facility_id,
            room_id=room_id,
            registered_at__gte=day_start,
            registered_at__lt=day_end,
        ).select_related("session")

        if clinic_id:
            shifts = shifts.filter(Q(clinic_id=clinic_id) | Q(clinic_id__isnull=True))
            visits = visits.filter(
                Q(session__clinic_id=clinic_id) | Q(session__clinic_id__isnull=True)
            )

        staffed_minutes = 0
        active_clinicians_count = 0
        derived_clinic_id = clinic_id
        for shift in shifts:
            derived_clinic_id = derived_clinic_id or shift.clinic_id
            if shift.status in {"ACTIVE", "ON_BREAK"}:
                active_clinicians_count += 1

            end_ts = shift.completed_at
            if not end_ts and shift.started_at and shift.status in {"ACTIVE", "ON_BREAK"}:
                end_ts = timezone.now()
            if shift.started_at and end_ts:
                staffed_minutes += max(
                    0, _minutes_between(shift.started_at, end_ts) - shift.total_break_minutes
                )

        consultation_minutes = 0
        completed_visits = 0
        no_show_count = 0
        wait_minutes_total = 0
        wait_count = 0
        consultation_avg_total = 0
        consultation_avg_count = 0
        for visit in visits:
            derived_clinic_id = derived_clinic_id or getattr(visit.session, "clinic_id", None)
            if visit.consultation_started_at and visit.registered_at:
                wait_minutes_total += _minutes_between(
                    visit.registered_at, visit.consultation_started_at
                )
                wait_count += 1
            if visit.consultation_started_at and visit.completed_at:
                minutes = _minutes_between(visit.consultation_started_at, visit.completed_at)
                consultation_minutes += minutes
                consultation_avg_total += minutes
                consultation_avg_count += 1
            if visit.status == "COMPLETED":
                completed_visits += 1
            if visit.status == "NO_SHOW":
                no_show_count += 1

        utilization_rate = Decimal("0")
        if staffed_minutes > 0:
            utilization_rate = Decimal(
                str(round((consultation_minutes / staffed_minutes) * 100, 2))
            )

        avg_wait = Decimal("0")
        if wait_count > 0:
            avg_wait = Decimal(str(round(wait_minutes_total / wait_count, 2)))

        avg_consult = Decimal("0")
        if consultation_avg_count > 0:
            avg_consult = Decimal(str(round(consultation_avg_total / consultation_avg_count, 2)))

        stats, _ = RoomUtilizationStats.objects.get_or_create(
            facility_id=facility_id,
            room_id=room_id,
            stat_date=stat_date,
        )
        stats.clinic_id = derived_clinic_id
        stats.staffed_minutes = staffed_minutes
        stats.consultation_minutes = consultation_minutes
        stats.utilization_rate = utilization_rate
        stats.visits_completed = completed_visits
        stats.no_show_count = no_show_count
        stats.avg_wait_to_room_minutes = avg_wait
        stats.avg_consultation_minutes = avg_consult
        stats.active_clinicians_count = active_clinicians_count
        stats.last_updated = timezone.now()
        stats.save()

    def reset(self, **filters) -> None:
        qs = RoomUtilizationStats.objects.all()
        if "facility_id" in filters:
            qs = qs.filter(facility_id=filters["facility_id"])
        qs.delete()
