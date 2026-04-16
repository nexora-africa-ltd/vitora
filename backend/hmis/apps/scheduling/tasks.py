"""
Celery tasks for scheduling attendance automation.

Phase 2:
- mark_absent_shifts: Mark SCHEDULED shifts as ABSENT if no clock-in 1hr after start
- auto_clock_out_stale_shifts: Auto-complete shifts still ACTIVE 2hr past end time
"""

import logging
from datetime import datetime, timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, ignore_result=True, max_retries=1)
def mark_absent_shifts(self):
    """
    Mark shifts as ABSENT if no clock-in within 1 hour of shift start.

    Runs periodically. Scans all SCHEDULED shifts where:
    - shift_date is today
    - shift start time was more than 60 minutes ago
    - status is still SCHEDULED (not clocked in, cancelled, etc.)

    Excludes OFF/REST/LEAVE shift types.
    """
    from hmis.apps.scheduling.models import Shift

    now = timezone.now()
    today = timezone.localdate()
    cutoff = now - timedelta(hours=1)

    non_working_types = {
        "OFF",
        "DAY_OFF",
        "NIGHT_OFF",
        "AFTERNOON_OFF",
        "LEAVE",
        "SICK_LEAVE",
        "REST",
    }

    candidates = Shift.objects.filter(
        shift_date=today,
        status="SCHEDULED",
    ).exclude(
        shift_type__in=non_working_types,
    )

    marked = 0
    for shift in candidates:
        shift_start_dt = (
            timezone.make_aware(datetime.combine(shift.shift_date, shift.start_time))
            if timezone.is_naive(datetime.combine(shift.shift_date, shift.start_time))
            else datetime.combine(shift.shift_date, shift.start_time)
        )

        if shift_start_dt <= cutoff:
            try:
                shift.mark_absent()
                marked += 1
                logger.info(
                    "Marked shift %d as ABSENT (staff: %s, date: %s)",
                    shift.id,
                    shift.staff_resource.name,
                    shift.shift_date,
                )
            except (ValueError, Exception) as e:
                logger.warning("Failed to mark shift %d as absent: %s", shift.id, e)

    if marked:
        logger.info("mark_absent_shifts: marked %d shifts as ABSENT", marked)
    return marked


@shared_task(bind=True, ignore_result=True, max_retries=1)
def auto_clock_out_stale_shifts(self):
    """
    Auto-complete shifts that are still ACTIVE or ON_BREAK 2 hours past shift end.

    Runs periodically. Scans shifts where:
    - status is ACTIVE or ON_BREAK
    - shift end time was more than 2 hours ago

    Sets auto_clocked_out=True so the system can distinguish manual vs auto clock-outs.
    """
    from hmis.apps.scheduling.models import Shift

    now = timezone.now()
    cutoff_delta = timedelta(hours=2)

    candidates = Shift.objects.filter(
        status__in=["ACTIVE", "ON_BREAK"],
    )

    completed = 0
    for shift in candidates:
        shift_end_naive = datetime.combine(shift.shift_date, shift.end_time)
        # Handle overnight shifts
        if shift.end_time <= shift.start_time:
            shift_end_naive += timedelta(days=1)
        shift_end_dt = (
            timezone.make_aware(shift_end_naive)
            if timezone.is_naive(shift_end_naive)
            else shift_end_naive
        )

        if now > shift_end_dt + cutoff_delta:
            try:
                shift.auto_complete()
                completed += 1
                logger.info(
                    "Auto-clocked-out shift %d (staff: %s, date: %s, ended: %s)",
                    shift.id,
                    shift.staff_resource.name,
                    shift.shift_date,
                    shift_end_dt,
                )
            except (ValueError, Exception) as e:
                logger.warning("Failed to auto-complete shift %d: %s", shift.id, e)

    if completed:
        logger.info("auto_clock_out_stale_shifts: auto-completed %d shifts", completed)
    return completed
