"""Theatre reporting and analytics helpers."""

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from django.utils import timezone

ACTIVE_CASE_STATUSES = {"PRE_OP", "IN_THEATRE", "IN_SURGERY", "IN_PACU"}
ON_TIME_START_THRESHOLD_MINUTES = 15


def _combine_datetime(target_date, target_time):
    value = datetime.combine(target_date, target_time)
    if timezone.is_naive(value):
        return timezone.make_aware(value)
    return value


def _available_minutes(theatre, total_days: int) -> int:
    daily_minutes = int(
        (
            datetime.combine(date.today(), theatre.operating_hours_end)
            - datetime.combine(date.today(), theatre.operating_hours_start)
        ).total_seconds()
        / 60
    )
    return max(daily_minutes, 0) * total_days if theatre.is_active else 0


def _case_actual_duration_minutes(surgery_case) -> int:
    operative_note = getattr(surgery_case, "operative_note", None)
    if operative_note and operative_note.incision_time and operative_note.closure_time:
        return int(
            (operative_note.closure_time - operative_note.incision_time).total_seconds() / 60
        )
    return surgery_case.estimated_duration_minutes


def _case_start_anchor(surgery_case):
    operative_note = getattr(surgery_case, "operative_note", None)
    if operative_note and operative_note.incision_time:
        return operative_note.incision_time

    anesthesia_record = getattr(surgery_case, "anesthesia_record", None)
    if anesthesia_record and anesthesia_record.induction_time:
        return anesthesia_record.induction_time

    return None


def _case_turnaround_anchor(surgery_case):
    operative_note = getattr(surgery_case, "operative_note", None)
    if operative_note and operative_note.closure_time:
        return operative_note.closure_time

    pacu_record = getattr(surgery_case, "pacu_record", None)
    if pacu_record and pacu_record.arrival_time:
        return pacu_record.arrival_time

    return None


def _build_turnaround_series(
    cases_by_theatre: dict[int, list],
) -> tuple[list[float], dict[int, list[float]]]:
    all_turnarounds: list[float] = []
    by_theatre: dict[int, list[float]] = defaultdict(list)

    for theatre_id, theatre_cases in cases_by_theatre.items():
        ordered = sorted(
            theatre_cases, key=lambda item: (item.scheduled_date, item.scheduled_start_time)
        )
        for previous_case, next_case in zip(ordered, ordered[1:], strict=False):
            previous_ready = _case_turnaround_anchor(previous_case)
            if previous_ready is None:
                continue

            next_start = _combine_datetime(next_case.scheduled_date, next_case.scheduled_start_time)
            delta = (next_start - previous_ready).total_seconds() / 60
            if delta < 0:
                continue

            all_turnarounds.append(delta)
            by_theatre[theatre_id].append(delta)

    return all_turnarounds, by_theatre


def _resolve_primary_surgeon(surgery_case):
    for team_member in surgery_case.team_members.all():
        if team_member.role == "LEAD_SURGEON":
            return team_member.staff_member
    return surgery_case.requesting_doctor


def _resolve_anesthesiologist(surgery_case):
    anesthesia_record = getattr(surgery_case, "anesthesia_record", None)
    if anesthesia_record and anesthesia_record.anesthesiologist_id:
        return anesthesia_record.anesthesiologist

    for team_member in surgery_case.team_members.all():
        if team_member.role == "ANESTHESIOLOGIST":
            return team_member.staff_member

    return None


def _accumulate_workload(workload_map: dict[int, dict], clinician, surgery_case) -> None:
    if clinician is None:
        return

    entry = workload_map.setdefault(
        clinician.pk,
        {
            "clinician_id": clinician.pk,
            "clinician_name": clinician.get_full_name() or clinician.username,
            "case_count": 0,
            "completed_case_count": 0,
            "scheduled_minutes": 0,
            "actual_minutes": 0,
        },
    )
    entry["case_count"] += 1
    entry["completed_case_count"] += int(surgery_case.status == "DISCHARGED")
    entry["scheduled_minutes"] += surgery_case.estimated_duration_minutes
    entry["actual_minutes"] += _case_actual_duration_minutes(surgery_case)


def _serialize_workload(workload_map: dict[int, dict]) -> list[dict]:
    entries = list(workload_map.values())
    for entry in entries:
        entry["average_case_duration_minutes"] = round(
            entry["actual_minutes"] / entry["case_count"], 2
        )
    entries.sort(
        key=lambda item: (-item["case_count"], -item["scheduled_minutes"], item["clinician_name"])
    )
    return entries


def build_theatre_report_summary(*, cases, theatres, start_date, end_date):
    theatre_list = list(theatres)
    case_list = list(cases)
    total_days = max((end_date - start_date).days + 1, 1)

    cases_by_day: dict[str, list] = defaultdict(list)
    cases_by_theatre: dict[int, list] = defaultdict(list)
    status_breakdown = Counter(case.status for case in case_list)

    scheduled_minutes = 0
    actual_minutes = 0
    completed_case_count = 0
    cancelled_case_count = 0
    urgent_case_count = 0
    active_case_count = 0

    for surgery_case in case_list:
        cases_by_day[str(surgery_case.scheduled_date)].append(surgery_case)
        cases_by_theatre[surgery_case.theatre_id].append(surgery_case)
        scheduled_minutes += surgery_case.estimated_duration_minutes
        actual_minutes += _case_actual_duration_minutes(surgery_case)
        completed_case_count += int(surgery_case.status == "DISCHARGED")
        cancelled_case_count += int(surgery_case.status == "CANCELLED")
        urgent_case_count += int(surgery_case.priority != "ELECTIVE")
        active_case_count += int(surgery_case.status in ACTIVE_CASE_STATUSES)

    all_turnarounds, turnaround_by_theatre = _build_turnaround_series(cases_by_theatre)
    surgeon_workload: dict[int, dict] = {}
    anesthesiologist_workload: dict[int, dict] = {}
    on_time_measurements: list[float] = []
    available_minutes = sum(_available_minutes(theatre, total_days) for theatre in theatre_list)
    utilization_percent = (
        round((scheduled_minutes / available_minutes) * 100, 2) if available_minutes else 0.0
    )
    average_case_duration_minutes = (
        round((actual_minutes / len(case_list)), 2) if case_list else 0.0
    )
    average_turnaround_minutes = (
        round(sum(all_turnarounds) / len(all_turnarounds), 2) if all_turnarounds else 0.0
    )

    for surgery_case in case_list:
        start_anchor = _case_start_anchor(surgery_case)
        if start_anchor is not None:
            scheduled_start = _combine_datetime(
                surgery_case.scheduled_date, surgery_case.scheduled_start_time
            )
            on_time_measurements.append((start_anchor - scheduled_start).total_seconds() / 60)

        _accumulate_workload(surgeon_workload, _resolve_primary_surgeon(surgery_case), surgery_case)
        _accumulate_workload(
            anesthesiologist_workload, _resolve_anesthesiologist(surgery_case), surgery_case
        )

    on_time_case_count = sum(
        1
        for variance_minutes in on_time_measurements
        if variance_minutes <= ON_TIME_START_THRESHOLD_MINUTES
    )
    late_case_count = sum(
        1
        for variance_minutes in on_time_measurements
        if variance_minutes > ON_TIME_START_THRESHOLD_MINUTES
    )
    on_time_percent = (
        round((on_time_case_count / len(on_time_measurements)) * 100, 2)
        if on_time_measurements
        else 0.0
    )

    throughput_by_day = []
    current = start_date
    while current <= end_date:
        day_cases = cases_by_day.get(str(current), [])
        throughput_by_day.append(
            {
                "date": str(current),
                "case_count": len(day_cases),
                "completed_case_count": sum(1 for case in day_cases if case.status == "DISCHARGED"),
                "scheduled_minutes": sum(case.estimated_duration_minutes for case in day_cases),
            }
        )
        current += timedelta(days=1)

    utilization_by_theatre = []
    for theatre in theatre_list:
        theatre_cases = cases_by_theatre.get(theatre.id, [])
        theatre_scheduled_minutes = sum(case.estimated_duration_minutes for case in theatre_cases)
        theatre_actual_minutes = sum(_case_actual_duration_minutes(case) for case in theatre_cases)
        theatre_available_minutes = _available_minutes(theatre, total_days)
        theatre_turnarounds = turnaround_by_theatre.get(theatre.id, [])
        utilization_by_theatre.append(
            {
                "theatre_id": theatre.id,
                "theatre_code": theatre.code,
                "theatre_name": theatre.name,
                "case_count": len(theatre_cases),
                "completed_case_count": sum(
                    1 for case in theatre_cases if case.status == "DISCHARGED"
                ),
                "cancelled_case_count": sum(
                    1 for case in theatre_cases if case.status == "CANCELLED"
                ),
                "scheduled_minutes": theatre_scheduled_minutes,
                "actual_minutes": theatre_actual_minutes,
                "available_minutes": theatre_available_minutes,
                "utilization_percent": (
                    round((theatre_scheduled_minutes / theatre_available_minutes) * 100, 2)
                    if theatre_available_minutes
                    else 0.0
                ),
                "average_case_duration_minutes": (
                    round((theatre_actual_minutes / len(theatre_cases)), 2)
                    if theatre_cases
                    else 0.0
                ),
                "turnaround_average_minutes": (
                    round(sum(theatre_turnarounds) / len(theatre_turnarounds), 2)
                    if theatre_turnarounds
                    else 0.0
                ),
            }
        )

    utilization_by_theatre.sort(
        key=lambda item: (-item["utilization_percent"], item["theatre_name"])
    )

    return {
        "range": {
            "date_from": str(start_date),
            "date_to": str(end_date),
            "days": total_days,
        },
        "totals": {
            "case_count": len(case_list),
            "completed_case_count": completed_case_count,
            "cancelled_case_count": cancelled_case_count,
            "urgent_case_count": urgent_case_count,
            "active_case_count": active_case_count,
            "scheduled_minutes": scheduled_minutes,
            "actual_minutes": actual_minutes,
            "available_minutes": available_minutes,
            "utilization_percent": utilization_percent,
            "average_case_duration_minutes": average_case_duration_minutes,
            "average_daily_throughput": round(len(case_list) / total_days, 2),
        },
        "turnaround": {
            "cases_with_measurement_count": len(all_turnarounds),
            "average_minutes": average_turnaround_minutes,
        },
        "on_time_starts": {
            "measured_case_count": len(on_time_measurements),
            "on_time_case_count": on_time_case_count,
            "late_case_count": late_case_count,
            "threshold_minutes": ON_TIME_START_THRESHOLD_MINUTES,
            "percent": on_time_percent,
        },
        "throughput_by_day": throughput_by_day,
        "utilization_by_theatre": utilization_by_theatre,
        "surgeon_workload": _serialize_workload(surgeon_workload),
        "anesthesiologist_workload": _serialize_workload(anesthesiologist_workload),
        "status_breakdown": [
            {"status": status, "count": count} for status, count in sorted(status_breakdown.items())
        ],
    }
