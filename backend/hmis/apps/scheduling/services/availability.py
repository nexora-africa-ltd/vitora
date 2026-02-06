"""
Scheduling services for Vitora HMIS.

Phase 1: Core Scheduling Foundation

This module contains business logic for:
- Availability queries
- Conflict detection
- Slot generation

These services are separated from views for testability and reusability.
"""

from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.db.models import Q

from hmis.apps.scheduling.models import Appointment, Resource


def get_available_slots(
    resource: Resource,
    for_date: date,
    appointment_type: str | None = None,  # noqa: ARG001 - Reserved for future filtering
) -> list[dict[str, Any]]:
    """
    Get all available slots for a resource on a specific date.

    Combines schedule definitions with existing bookings to determine
    what slots are still available.

    Args:
        resource: The resource to check availability for
        for_date: The date to check
        appointment_type: Optional filter by appointment type

    Returns:
        List of available slot dictionaries with start_time, end_time, date
    """
    # Get applicable schedules for this date
    schedules = resource.get_schedules().filter(
        Q(schedule_type="RECURRING", day_of_week=for_date.weekday())
        | Q(schedule_type="ONE_TIME", specific_date=for_date)
    ).filter(
        effective_from__lte=for_date,
    ).filter(
        Q(effective_until__isnull=True) | Q(effective_until__gte=for_date)
    )

    # Generate all possible slots from schedules
    all_slots = []
    for schedule in schedules:
        slots = schedule.get_available_slots(for_date)
        all_slots.extend(slots)

    if not all_slots:
        return []

    # Get existing appointments for this date that block slots
    nairobi_tz = ZoneInfo("Africa/Nairobi")
    day_start = datetime.combine(for_date, time.min, tzinfo=nairobi_tz)
    day_end = datetime.combine(for_date, time.max, tzinfo=nairobi_tz)

    booked_appointments = Appointment.objects.filter(
        resource=resource,
        status__in=["CREATED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"],
        scheduled_start__gte=day_start,
        scheduled_start__lt=day_end,
    )

    # Filter out booked slots
    available_slots = []
    for slot in all_slots:
        slot_start = datetime.combine(for_date, slot["start_time"], tzinfo=nairobi_tz)
        slot_end = datetime.combine(for_date, slot["end_time"], tzinfo=nairobi_tz)

        # Check if any appointment overlaps with this slot
        is_booked = False
        for apt in booked_appointments:
            if apt.scheduled_start < slot_end and apt.scheduled_end > slot_start:
                is_booked = True
                break

        if not is_booked:
            available_slots.append(slot)

    return available_slots


def get_weekly_availability(
    resource: Resource,
    start_date: date,
    weeks: int = 1,
) -> dict[str, Any]:
    """
    Get weekly availability summary for a resource.

    Args:
        resource: The resource to check
        start_date: Week start date
        weeks: Number of weeks to return

    Returns:
        Dictionary with day names as keys and slot info as values
    """
    day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    result = {}

    current_date = start_date
    end_date = start_date + timedelta(weeks=weeks * 7)

    while current_date < end_date:
        day_key = day_names[current_date.weekday()]
        if day_key not in result:
            result[day_key] = {
                "date": current_date,
                "slots": [],
                "total_slots": 0,
                "available_slots": 0,
            }

        slots = get_available_slots(resource, current_date)
        result[day_key]["slots"].extend(slots)
        result[day_key]["available_slots"] = len(slots)

        # Get total possible slots from schedule
        schedules = resource.get_schedules().filter(day_of_week=current_date.weekday())
        for schedule in schedules:
            possible_slots = schedule.get_available_slots(current_date)
            result[day_key]["total_slots"] += len(possible_slots)

        current_date += timedelta(days=1)

    return result


def check_slot_available(
    resource: Resource,
    slot_date: date,
    start_time: time,
    duration_minutes: int,
) -> dict[str, Any]:
    """
    Check if a specific time slot is available.

    Args:
        resource: The resource to check
        slot_date: The date to check
        start_time: Slot start time
        duration_minutes: Duration in minutes

    Returns:
        Dictionary with available status and reason
    """
    nairobi_tz = ZoneInfo("Africa/Nairobi")
    slot_start = datetime.combine(slot_date, start_time, tzinfo=nairobi_tz)
    slot_end = slot_start + timedelta(minutes=duration_minutes)

    # Check if within resource schedule
    schedules = resource.get_schedules().filter(
        Q(schedule_type="RECURRING", day_of_week=slot_date.weekday())
        | Q(schedule_type="ONE_TIME", specific_date=slot_date)
    ).filter(
        effective_from__lte=slot_date,
        start_time__lte=start_time,
        end_time__gte=(datetime.combine(slot_date, start_time) + timedelta(minutes=duration_minutes)).time(),
    ).filter(
        Q(effective_until__isnull=True) | Q(effective_until__gte=slot_date)
    )

    if not schedules.exists():
        return {
            "available": False,
            "reason": "No schedule defined for this time slot",
        }

    # Check for conflicting appointments
    conflicts = Appointment.objects.filter(
        resource=resource,
        status__in=["CREATED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"],
        scheduled_start__lt=slot_end,
        scheduled_end__gt=slot_start,
    )

    if conflicts.exists():
        return {
            "available": False,
            "reason": "Time slot already booked",
            "conflicting_appointment": conflicts.first().appointment_number,
        }

    return {
        "available": True,
        "reason": None,
    }


def get_next_available_slot(
    resource: Resource,
    after_datetime: datetime = None,
    appointment_type: str = None,
) -> dict[str, Any] | None:
    """
    Find the next available slot for a resource.

    Args:
        resource: The resource to check
        after_datetime: Find slots after this time (default: now)
        appointment_type: Optional appointment type filter

    Returns:
        Next available slot or None
    """
    from django.utils import timezone

    if after_datetime is None:
        after_datetime = timezone.now()

    # Look up to 30 days ahead
    check_date = after_datetime.date()
    end_date = check_date + timedelta(days=30)

    while check_date <= end_date:
        slots = get_available_slots(resource, check_date, appointment_type)

        for slot in slots:
            nairobi_tz = ZoneInfo("Africa/Nairobi")
            slot_datetime = datetime.combine(
                check_date, slot["start_time"], tzinfo=nairobi_tz
            )
            if slot_datetime > after_datetime:
                return {
                    "date": check_date,
                    "start_time": slot["start_time"],
                    "end_time": slot["end_time"],
                }

        check_date += timedelta(days=1)

    return None


def get_resources_with_availability(
    resource_type: str = None,
    for_date: date = None,
    min_slots: int = 1,
) -> list[dict[str, Any]]:
    """
    Get resources that have availability on a given date.

    Args:
        resource_type: Filter by resource type (PERSON, PLACE, ASSET)
        for_date: Date to check availability
        min_slots: Minimum number of available slots required

    Returns:
        List of resources with their availability
    """
    from django.utils import timezone

    if for_date is None:
        for_date = timezone.now().date()

    resources = Resource.objects.filter(is_active=True)
    if resource_type:
        resources = resources.filter(resource_type=resource_type)

    result = []
    for resource in resources:
        slots = get_available_slots(resource, for_date)
        if len(slots) >= min_slots:
            result.append({
                "resource": resource,
                "available_slots": len(slots),
                "next_slot": slots[0] if slots else None,
            })

    return result
