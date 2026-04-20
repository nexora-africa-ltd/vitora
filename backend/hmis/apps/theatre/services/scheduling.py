"""
Theatre scheduling service.

Handles slot management, conflict detection, and theatre availability.
"""

from datetime import datetime, timedelta

from django.db.models import Q

from hmis.apps.theatre.models import OperatingTheatre, SurgeryCase


def get_available_slots(
    theatre: OperatingTheatre,
    target_date,
    duration_minutes: int | None = None,
) -> list[dict]:
    """Return available time slots for a theatre on a given date."""
    duration = duration_minutes or theatre.slot_duration_minutes

    booked = set(
        SurgeryCase.objects.filter(
            theatre=theatre,
            scheduled_date=target_date,
            status__in=[
                SurgeryCase.CaseStatus.SCHEDULED,
                SurgeryCase.CaseStatus.PRE_OP,
                SurgeryCase.CaseStatus.IN_THEATRE,
                SurgeryCase.CaseStatus.IN_SURGERY,
            ],
        ).values_list("scheduled_start_time", flat=True)
    )

    current = datetime.combine(target_date, theatre.operating_hours_start)
    end = datetime.combine(target_date, theatre.operating_hours_end)
    slots = []

    while current + timedelta(minutes=duration) <= end:
        t = current.time()
        slots.append({
            "start_time": t.strftime("%H:%M"),
            "end_time": (current + timedelta(minutes=duration)).time().strftime("%H:%M"),
            "duration_minutes": duration,
            "available": t not in booked,
        })
        current += timedelta(minutes=duration)

    return slots


def detect_theatre_conflicts(
    theatre: OperatingTheatre,
    scheduled_date,
    scheduled_start_time,
    estimated_duration_minutes: int,
    exclude_case_id: int | None = None,
) -> list[dict]:
    """
    Check for scheduling conflicts in a theatre.

    Returns list of conflicting cases.
    """
    start_dt = datetime.combine(scheduled_date, scheduled_start_time)
    end_dt = start_dt + timedelta(minutes=estimated_duration_minutes)

    qs = SurgeryCase.objects.filter(
        theatre=theatre,
        scheduled_date=scheduled_date,
        status__in=[
            SurgeryCase.CaseStatus.SCHEDULED,
            SurgeryCase.CaseStatus.PRE_OP,
            SurgeryCase.CaseStatus.IN_THEATRE,
            SurgeryCase.CaseStatus.IN_SURGERY,
        ],
    )
    if exclude_case_id:
        qs = qs.exclude(pk=exclude_case_id)

    conflicts = []
    for case in qs:
        case_start = datetime.combine(case.scheduled_date, case.scheduled_start_time)
        case_end = case_start + timedelta(minutes=case.estimated_duration_minutes)
        # Overlap check
        if start_dt < case_end and end_dt > case_start:
            conflicts.append({
                "case_number": case.case_number,
                "scheduled_start_time": str(case.scheduled_start_time),
                "estimated_duration_minutes": case.estimated_duration_minutes,
            })

    return conflicts


def detect_staff_conflicts(
    staff_member_id: int,
    scheduled_date,
    scheduled_start_time,
    estimated_duration_minutes: int,
    exclude_case_id: int | None = None,
) -> list[dict]:
    """
    Check if a staff member is already booked for another surgery.

    Returns list of conflicting cases.
    """
    from hmis.apps.theatre.models import SurgicalTeamMember

    start_dt = datetime.combine(scheduled_date, scheduled_start_time)
    end_dt = start_dt + timedelta(minutes=estimated_duration_minutes)

    qs = SurgicalTeamMember.objects.filter(
        staff_member_id=staff_member_id,
        surgery_case__scheduled_date=scheduled_date,
        surgery_case__status__in=[
            SurgeryCase.CaseStatus.SCHEDULED,
            SurgeryCase.CaseStatus.PRE_OP,
            SurgeryCase.CaseStatus.IN_THEATRE,
            SurgeryCase.CaseStatus.IN_SURGERY,
        ],
    ).select_related("surgery_case")

    if exclude_case_id:
        qs = qs.exclude(surgery_case_id=exclude_case_id)

    conflicts = []
    for member in qs:
        case = member.surgery_case
        case_start = datetime.combine(case.scheduled_date, case.scheduled_start_time)
        case_end = case_start + timedelta(minutes=case.estimated_duration_minutes)
        if start_dt < case_end and end_dt > case_start:
            conflicts.append({
                "case_number": case.case_number,
                "role": member.role,
                "scheduled_start_time": str(case.scheduled_start_time),
            })

    return conflicts
