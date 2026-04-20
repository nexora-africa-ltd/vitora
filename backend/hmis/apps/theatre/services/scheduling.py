"""Theatre scheduling service.

Bridges theatre booking with the shared scheduling module.
"""

from datetime import datetime, timedelta

from hmis.apps.scheduling.models import Resource, Shift
from hmis.apps.scheduling.services import check_slot_available as check_resource_slot_available
from hmis.apps.scheduling.services import get_available_slots as get_resource_available_slots
from hmis.apps.theatre.models import OperatingTheatre, SurgeryCase

ACTIVE_CASE_STATUSES = [
    SurgeryCase.CaseStatus.SCHEDULED,
    SurgeryCase.CaseStatus.PRE_OP,
    SurgeryCase.CaseStatus.IN_THEATRE,
    SurgeryCase.CaseStatus.IN_SURGERY,
]

SHIFT_COVERAGE_STATUSES = ["SCHEDULED", "ACTIVE", "ON_BREAK"]


def has_resource_schedule(theatre: OperatingTheatre) -> bool:
    return bool(
        theatre.scheduling_resource_id
        and theatre.scheduling_resource
        and theatre.scheduling_resource.get_schedules().exists()
    )


def _active_case_queryset(
    theatre: OperatingTheatre, target_date, exclude_case_id: int | None = None
):
    qs = SurgeryCase.objects.filter(
        theatre=theatre,
        scheduled_date=target_date,
        status__in=ACTIVE_CASE_STATUSES,
    )
    if exclude_case_id:
        qs = qs.exclude(pk=exclude_case_id)
    return qs


def _local_theatre_slots(theatre: OperatingTheatre, target_date) -> list[dict]:
    duration = theatre.slot_duration_minutes
    current = datetime.combine(target_date, theatre.operating_hours_start)
    end = datetime.combine(target_date, theatre.operating_hours_end)
    slots = []

    while current + timedelta(minutes=duration) <= end:
        slots.append(
            {
                "start_time": current.time(),
                "end_time": (current + timedelta(minutes=duration)).time(),
                "date": target_date,
            }
        )
        current += timedelta(minutes=duration)

    return slots


def _slot_has_case_conflict(
    theatre: OperatingTheatre, target_date, start_time, end_time, exclude_case_id=None
):
    slot_start = datetime.combine(target_date, start_time)
    slot_end = datetime.combine(target_date, end_time)
    for case in _active_case_queryset(theatre, target_date, exclude_case_id=exclude_case_id):
        case_start = datetime.combine(case.scheduled_date, case.scheduled_start_time)
        case_end = case_start + timedelta(minutes=case.estimated_duration_minutes)
        if slot_start < case_end and slot_end > case_start:
            return case
    return None


def get_available_slots(
    theatre: OperatingTheatre,
    target_date,
    duration_minutes: int | None = None,
    exclude_case_id: int | None = None,
) -> list[dict]:
    """Return available time slots for a theatre on a given date."""
    duration = duration_minutes or theatre.slot_duration_minutes
    source = "scheduling_resource" if has_resource_schedule(theatre) else "theatre_hours"
    raw_slots = (
        get_resource_available_slots(theatre.scheduling_resource, target_date)
        if source == "scheduling_resource"
        else _local_theatre_slots(theatre, target_date)
    )

    slots = []
    for slot in raw_slots:
        start_time = slot["start_time"]
        end_time = slot["end_time"]
        conflict = _slot_has_case_conflict(
            theatre,
            target_date,
            start_time,
            end_time,
            exclude_case_id=exclude_case_id,
        )
        slot_duration = int(
            (
                datetime.combine(target_date, end_time) - datetime.combine(target_date, start_time)
            ).total_seconds()
            / 60
        )
        slots.append(
            {
                "start_time": start_time.strftime("%H:%M"),
                "end_time": end_time.strftime("%H:%M"),
                "duration_minutes": slot_duration,
                "available": conflict is None and slot_duration >= duration,
                "blocked_reason": None if conflict is None else "Booked by another surgery case",
                "conflicting_case_number": None if conflict is None else conflict.case_number,
                "source": source,
            }
        )

    return slots


def check_slot_available(
    theatre: OperatingTheatre,
    scheduled_date,
    scheduled_start_time,
    estimated_duration_minutes: int,
    exclude_case_id: int | None = None,
) -> dict:
    source = "scheduling_resource" if has_resource_schedule(theatre) else "theatre_hours"
    if source == "scheduling_resource":
        schedule_result = check_resource_slot_available(
            theatre.scheduling_resource,
            scheduled_date,
            scheduled_start_time,
            estimated_duration_minutes,
        )
        if not schedule_result["available"]:
            schedule_result["source"] = source
            schedule_result["conflicts"] = []
            return schedule_result
    else:
        start_dt = datetime.combine(scheduled_date, scheduled_start_time)
        end_dt = start_dt + timedelta(minutes=estimated_duration_minutes)
        day_start = datetime.combine(scheduled_date, theatre.operating_hours_start)
        day_end = datetime.combine(scheduled_date, theatre.operating_hours_end)
        if start_dt < day_start or end_dt > day_end:
            return {
                "available": False,
                "reason": "Requested time falls outside theatre operating hours",
                "source": source,
                "conflicts": [],
            }

    conflicts = detect_theatre_conflicts(
        theatre,
        scheduled_date,
        scheduled_start_time,
        estimated_duration_minutes,
        exclude_case_id=exclude_case_id,
    )
    if conflicts:
        return {
            "available": False,
            "reason": "Theatre already allocated to another surgery case",
            "source": source,
            "conflicts": conflicts,
        }

    return {
        "available": True,
        "reason": None,
        "source": source,
        "conflicts": [],
    }


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
        status__in=ACTIVE_CASE_STATUSES,
    )
    if exclude_case_id:
        qs = qs.exclude(pk=exclude_case_id)

    conflicts = []
    for case in qs:
        case_start = datetime.combine(case.scheduled_date, case.scheduled_start_time)
        case_end = case_start + timedelta(minutes=case.estimated_duration_minutes)
        # Overlap check
        if start_dt < case_end and end_dt > case_start:
            conflicts.append(
                {
                    "case_number": case.case_number,
                    "scheduled_start_time": str(case.scheduled_start_time),
                    "estimated_duration_minutes": case.estimated_duration_minutes,
                }
            )

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
        surgery_case__status__in=ACTIVE_CASE_STATUSES,
    ).select_related("surgery_case")

    if exclude_case_id:
        qs = qs.exclude(surgery_case_id=exclude_case_id)

    conflicts = []
    for member in qs:
        case = member.surgery_case
        case_start = datetime.combine(case.scheduled_date, case.scheduled_start_time)
        case_end = case_start + timedelta(minutes=case.estimated_duration_minutes)
        if start_dt < case_end and end_dt > case_start:
            conflicts.append(
                {
                    "case_number": case.case_number,
                    "role": member.role,
                    "scheduled_start_time": str(case.scheduled_start_time),
                }
            )

    return conflicts


def _find_staff_resource(facility_id: int, user_id: int) -> Resource | None:
    return (
        Resource.objects.filter(
            facility_id=facility_id,
            resource_type="PERSON",
            is_active=True,
            staff_profile__user_id=user_id,
        )
        .select_related("staff_profile__user")
        .first()
    )


def get_staff_shift_coverage(
    surgery_case: SurgeryCase,
    staff_member_id: int,
    role: str = "",
) -> dict:
    staff_resource = _find_staff_resource(surgery_case.facility_id, staff_member_id)
    theatre_resource_id = surgery_case.theatre.scheduling_resource_id
    end_dt = datetime.combine(
        surgery_case.scheduled_date,
        surgery_case.scheduled_start_time,
    ) + timedelta(minutes=surgery_case.estimated_duration_minutes)
    start_dt = datetime.combine(surgery_case.scheduled_date, surgery_case.scheduled_start_time)

    if not staff_resource:
        return {
            "staff_member_id": staff_member_id,
            "role": role,
            "staff_resource_id": None,
            "has_staff_resource": False,
            "has_shift_coverage": False,
            "room_assignment_match": False,
            "shift_ids": [],
            "shift_statuses": [],
            "message": "No scheduling PERSON resource linked to this staff member at the case facility.",
        }

    overlapping_shifts = []
    for shift in Shift.objects.filter(
        staff_resource=staff_resource,
        shift_date=surgery_case.scheduled_date,
        status__in=SHIFT_COVERAGE_STATUSES,
    ).select_related("room"):
        shift_start = datetime.combine(shift.shift_date, shift.start_time)
        shift_end = datetime.combine(shift.shift_date, shift.end_time)
        if start_dt < shift_end and end_dt > shift_start:
            overlapping_shifts.append(shift)

    compatible_shifts = [
        shift
        for shift in overlapping_shifts
        if not shift.room_id or shift.room_id == theatre_resource_id
    ]
    has_shift_coverage = bool(compatible_shifts)
    room_assignment_match = bool(
        compatible_shifts or (overlapping_shifts and theatre_resource_id is None)
    )

    if not overlapping_shifts:
        message = "No overlapping scheduled shift found for the case window."
    elif not compatible_shifts:
        message = "Overlapping shift exists but is assigned to a different room."
    else:
        message = "Shift coverage confirmed."

    return {
        "staff_member_id": staff_member_id,
        "role": role,
        "staff_resource_id": staff_resource.pk,
        "has_staff_resource": True,
        "has_shift_coverage": has_shift_coverage,
        "room_assignment_match": room_assignment_match,
        "shift_ids": [shift.pk for shift in overlapping_shifts],
        "shift_statuses": [shift.status for shift in overlapping_shifts],
        "message": message,
    }


def get_case_scheduling_context(surgery_case: SurgeryCase) -> dict:
    slot_validation = check_slot_available(
        surgery_case.theatre,
        surgery_case.scheduled_date,
        surgery_case.scheduled_start_time,
        surgery_case.estimated_duration_minutes,
        exclude_case_id=surgery_case.pk,
    )
    members = [
        get_staff_shift_coverage(surgery_case, member.staff_member_id, member.role)
        for member in surgery_case.team_members.all()
    ]
    covered_members = sum(1 for member in members if member["has_shift_coverage"])

    return {
        "case_number": surgery_case.case_number,
        "scheduled_date": str(surgery_case.scheduled_date),
        "scheduled_start_time": surgery_case.scheduled_start_time.strftime("%H:%M:%S"),
        "estimated_duration_minutes": surgery_case.estimated_duration_minutes,
        "slot_validation": slot_validation,
        "theatre": {
            "id": surgery_case.theatre_id,
            "code": surgery_case.theatre.code,
            "name": surgery_case.theatre.name,
            "scheduling_resource_id": surgery_case.theatre.scheduling_resource_id,
            "scheduling_resource_name": (
                surgery_case.theatre.scheduling_resource.name
                if surgery_case.theatre.scheduling_resource_id
                else None
            ),
            "has_resource_schedule": has_resource_schedule(surgery_case.theatre),
        },
        "team_summary": {
            "total_members": len(members),
            "covered_members": covered_members,
            "coverage_complete": covered_members == len(members),
        },
        "members": members,
    }
