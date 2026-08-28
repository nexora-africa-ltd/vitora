# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F401
"""Scheduling views shift analytics for Vitora HMIS.

What this file is for:
- Implement views shift analytics logic for the scheduling domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from datetime import datetime, timedelta

from django.db import models
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.scheduling.models import Shift
from hmis.apps.scheduling.serializers import ShiftListSerializer, ShiftSerializer

logger = logging.getLogger(__name__)


class ShiftAnalyticsExportMixin:
    @action(detail=False, methods=["get"], url_path="cross-facility-conflicts")
    def cross_facility_conflicts(self, request):
        """
        Check for scheduling conflicts across facilities for multi-site staff.

        For each staff resource in the current facility's roster for the given
        date range, checks whether the linked StaffProfile has shifts at OTHER
        facilities on the same dates.

        Query params:
            from_date: Start date (required, YYYY-MM-DD)
            to_date:   End date   (required, YYYY-MM-DD)

        Returns a list of conflicts:
        [
          {
            "staff_resource_id": 42,
            "staff_resource_name": "Dr. Kamau",
            "staff_profile_id": 7,
            "shift_date": "2026-04-14",
            "this_facility_shift": { "shift_type": "DAY", "start_time": "07:00", "end_time": "19:00" },
            "other_facility": { "id": 3, "name": "Clinic B" },
            "other_shift": { "shift_type": "NIGHT", "start_time": "19:00", "end_time": "07:00" }
          }
        ]
        """
        from datetime import date as date_type

        from_date_str = request.query_params.get("from_date")
        to_date_str = request.query_params.get("to_date")
        if not from_date_str or not to_date_str:
            return Response(
                {"error": "from_date and to_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            from_date = date_type.fromisoformat(from_date_str)
            to_date = date_type.fromisoformat(to_date_str)
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the current facility from tenant context
        self._resolve_tenant_context()
        current_facility = getattr(request, "facility", None)
        if not current_facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get all shifts for this facility in the date range
        local_shifts = (
            Shift.objects.filter(
                facility=current_facility,
                shift_date__gte=from_date,
                shift_date__lte=to_date,
            )
            .exclude(status="CANCELLED")
            .select_related("staff_resource__staff_profile", "facility")
        )

        # Collect staff_profile IDs and build a lookup
        profile_to_local: dict[int, list] = {}
        for shift in local_shifts:
            sp = getattr(shift.staff_resource, "staff_profile", None)
            if sp:
                profile_to_local.setdefault(sp.pk, []).append(shift)

        if not profile_to_local:
            return Response([])

        # Query shifts at OTHER facilities (same organization) for these staff profiles
        current_org = current_facility.organization
        other_shifts = (
            Shift.objects.filter(
                staff_resource__staff_profile_id__in=profile_to_local.keys(),
                shift_date__gte=from_date,
                shift_date__lte=to_date,
                organization=current_org,
            )
            .exclude(status="CANCELLED")
            .exclude(facility=current_facility)
            .select_related("staff_resource__staff_profile", "facility")
        )

        # Build conflict list
        conflicts = []
        for other in other_shifts:
            sp_id = other.staff_resource.staff_profile_id
            for local in profile_to_local.get(sp_id, []):
                if local.shift_date == other.shift_date:
                    conflicts.append(
                        {
                            "staff_resource_id": local.staff_resource_id,
                            "staff_resource_name": local.staff_resource.name,
                            "staff_profile_id": sp_id,
                            "shift_date": str(other.shift_date),
                            "this_facility_shift": {
                                "shift_type": local.shift_type,
                                "start_time": str(local.start_time),
                                "end_time": str(local.end_time),
                            },
                            "other_facility": {
                                "id": other.facility_id,
                                "name": str(other.facility),
                            },
                            "other_shift": {
                                "shift_type": other.shift_type,
                                "start_time": str(other.start_time),
                                "end_time": str(other.end_time),
                            },
                        }
                    )

        return Response(conflicts)

    @action(detail=False, methods=["get"], url_path="attendance-trends")
    def attendance_trends(self, request):
        """
        Get weekly attendance trends for the current user.

        Returns aggregated data per ISO week for chart rendering:
        - week_start: Monday of the week (YYYY-MM-DD)
        - hours_worked: total actual hours worked
        - shifts_completed: number of completed shifts
        - on_time_rate: percentage of shifts that were on-time
        - late_count: shifts where clock-in was >15min late
        - overtime_hours: hours beyond scheduled duration

        Query params:
            weeks: Number of weeks to look back (default: 12, max: 52)
        """
        from collections import defaultdict
        from datetime import date as date_type
        from datetime import timedelta as td

        from hmis.apps.scheduling.models import Shift

        resource = self._get_my_resource(request)
        if not resource:
            return Response([])

        weeks = min(int(request.query_params.get("weeks", 12)), 52)
        today = date_type.today()
        # Align to Monday
        start_of_week = today - td(days=today.weekday())
        from_date = start_of_week - td(weeks=weeks - 1)

        non_working_types = {
            "OFF",
            "DAY_OFF",
            "NIGHT_OFF",
            "AFTERNOON_OFF",
            "LEAVE",
            "SICK_LEAVE",
            "REST",
        }
        shifts = (
            Shift.objects.filter(
                staff_resource=resource,
                shift_date__gte=from_date,
                shift_date__lte=today,
                status__in=["COMPLETED", "ACTIVE", "ON_BREAK"],
            )
            .exclude(shift_type__in=non_working_types)
            .order_by("shift_date")
        )

        # Group by ISO week
        week_data: dict = defaultdict(
            lambda: {
                "hours": 0.0,
                "shifts": 0,
                "on_time": 0,
                "late": 0,
                "overtime": 0.0,
            }
        )
        late_threshold = 15  # minutes

        for s in shifts:
            # Monday of that week
            week_monday = s.shift_date - td(days=s.shift_date.weekday())
            key = str(week_monday)
            bucket = week_data[key]

            if s.status == "COMPLETED":
                bucket["shifts"] += 1
                actual = s.actual_hours
                if actual is not None:
                    bucket["hours"] += actual
                    scheduled = s.duration_hours
                    if actual > scheduled:
                        bucket["overtime"] += actual - scheduled

                if s.late_minutes > late_threshold:
                    bucket["late"] += 1
                elif s.started_at:
                    bucket["on_time"] += 1

        # Build sorted result
        result = []
        for w in range(weeks):
            monday = from_date + td(weeks=w)
            key = str(monday)
            d = week_data.get(
                key,
                {
                    "hours": 0.0,
                    "shifts": 0,
                    "on_time": 0,
                    "late": 0,
                    "overtime": 0.0,
                },
            )
            total = d["on_time"] + d["late"]
            result.append(
                {
                    "week_start": key,
                    "hours_worked": round(d["hours"], 1),
                    "shifts_completed": d["shifts"],
                    "on_time_rate": round(d["on_time"] / total * 100, 1) if total > 0 else 0,
                    "late_count": d["late"],
                    "overtime_hours": round(d["overtime"], 1),
                }
            )

        return Response(result)

    @action(detail=False, methods=["get"], url_path="payroll-export")
    def payroll_export(self, request):
        """
        Export attendance data as CSV for payroll processing.

        Returns a CSV file with one row per completed shift:
        staff_name, staff_code, date, shift_type, scheduled_start, scheduled_end,
        clock_in, clock_out, scheduled_hours, actual_hours, break_minutes,
        late_minutes, overtime_minutes, auto_clocked_out

        Query params:
            from_date: Start date (required)
            to_date: End date (required)
        """
        import csv
        import io
        from datetime import date as date_type

        from django.http import HttpResponse

        from hmis.apps.scheduling.models import Shift

        from_date_str = request.query_params.get("from_date")
        to_date_str = request.query_params.get("to_date")

        if not from_date_str or not to_date_str:
            return Response(
                {"error": "from_date and to_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            from_date = date_type.fromisoformat(from_date_str)
            to_date = date_type.fromisoformat(to_date_str)
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only export for current facility
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        non_working_types = {
            "OFF",
            "DAY_OFF",
            "NIGHT_OFF",
            "AFTERNOON_OFF",
            "LEAVE",
            "SICK_LEAVE",
            "REST",
        }

        shifts = (
            Shift.objects.filter(
                facility=facility,
                shift_date__gte=from_date,
                shift_date__lte=to_date,
                status__in=["COMPLETED", "ABSENT"],
            )
            .exclude(shift_type__in=non_working_types)
            .select_related("staff_resource")
            .order_by("staff_resource__name", "shift_date", "start_time")
        )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Staff Name",
                "Staff Code",
                "Date",
                "Shift Type",
                "Scheduled Start",
                "Scheduled End",
                "Clock In",
                "Clock Out",
                "Scheduled Hours",
                "Actual Hours",
                "Break Minutes",
                "Late Minutes",
                "Overtime Minutes",
                "Status",
                "Auto Clocked Out",
            ]
        )

        for s in shifts:
            writer.writerow(
                [
                    s.staff_resource.name,
                    s.staff_resource.code,
                    str(s.shift_date),
                    s.shift_type,
                    str(s.start_time),
                    str(s.end_time),
                    str(s.started_at) if s.started_at else "",
                    str(s.completed_at) if s.completed_at else "",
                    s.duration_hours,
                    s.actual_hours if s.actual_hours is not None else "",
                    s.total_break_minutes,
                    s.late_minutes,
                    s.overtime_minutes,
                    s.status,
                    "Yes" if s.auto_clocked_out else "No",
                ]
            )

        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="payroll_{from_date}_{to_date}.csv"'
        )
        return response

    @action(detail=False, methods=["get"], url_path="on-duty")
    def on_duty(self, request):
        """
        Live on-duty overview for managers / charge nurses.

        Returns a summary of today's shift statuses grouped into:
        - clocked_in: staff currently ACTIVE or ON_BREAK
        - late: staff whose shift has started but not yet clocked in (SCHEDULED, past start_time)
        - absent: staff marked ABSENT
        - upcoming: staff with SCHEDULED shifts that haven't started yet

        Requires ``scheduling.manage_schedules`` permission.
        """
        if (
            not request.user.has_perm("scheduling.manage_schedules")
            and not request.user.is_superuser
        ):
            return Response(
                {"error": "Permission denied"},
                status=status.HTTP_403_FORBIDDEN,
            )

        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.localdate()
        now = timezone.localtime()
        current_timezone = timezone.get_current_timezone()

        non_working_types = {
            "OFF",
            "DAY_OFF",
            "NIGHT_OFF",
            "AFTERNOON_OFF",
            "LEAVE",
            "SICK_LEAVE",
            "REST",
        }

        shifts = (
            Shift.objects.filter(facility=facility, shift_date=today)
            .exclude(shift_type__in=non_working_types)
            .exclude(status="CANCELLED")
            .select_related(
                "staff_resource",
                "staff_resource__staff_profile",
                "department",
                "room",
                "clinic",
            )
            .order_by("start_time")
        )

        clocked_in = []
        late = []
        absent = []
        upcoming = []

        for shift in shifts:
            entry = {
                "shift_id": shift.id,
                "staff_name": shift.staff_resource.name,
                "staff_resource_id": shift.staff_resource_id,
                "shift_type": shift.shift_type,
                "start_time": str(shift.start_time),
                "end_time": str(shift.end_time),
                "status": shift.status,
                "department": (
                    shift.department.name
                    if shift.department
                    else (
                        shift.staff_resource.department.name
                        if shift.staff_resource.department
                        else ""
                    )
                ),
                "room_name": shift.room.name if shift.room else None,
                "clinic_name": shift.clinic.name if shift.clinic else None,
                "late_minutes": shift.late_minutes,
                "started_at": shift.started_at.isoformat() if shift.started_at else None,
            }

            if shift.status in ("ACTIVE", "ON_BREAK"):
                entry["on_break"] = shift.status == "ON_BREAK"
                clocked_in.append(entry)
            elif shift.status == "ABSENT":
                absent.append(entry)
            elif shift.status == "SCHEDULED":
                shift_start_dt = timezone.make_aware(
                    datetime.combine(shift.shift_date, shift.start_time),
                    current_timezone,
                )
                if now >= shift_start_dt:
                    entry["minutes_overdue"] = int((now - shift_start_dt).total_seconds() / 60)
                    late.append(entry)
                else:
                    entry["starts_in_minutes"] = int((shift_start_dt - now).total_seconds() / 60)
                    upcoming.append(entry)

        # Completed count (for context)
        completed_count = (
            Shift.objects.filter(facility=facility, shift_date=today, status="COMPLETED")
            .exclude(shift_type__in=non_working_types)
            .count()
        )

        return Response(
            {
                "clocked_in": clocked_in,
                "late": late,
                "absent": absent,
                "upcoming": upcoming,
                "summary": {
                    "clocked_in": len(clocked_in),
                    "late": len(late),
                    "absent": len(absent),
                    "upcoming": len(upcoming),
                    "completed": completed_count,
                    "total": len(clocked_in)
                    + len(late)
                    + len(absent)
                    + len(upcoming)
                    + completed_count,
                },
                "as_of": now.isoformat(),
            }
        )

    @action(detail=False, methods=["post"], url_path="qr-clock-in")
    def qr_clock_in(self, request):
        """
        Clock in via QR code scan.

        The QR code payload contains a facility-specific token. This endpoint
        validates the token and clocks in the current user's shift for today.

        Request body:
            { "qr_token": "<facility_id>:<rotating_hash>" }
        """
        import hashlib
        from datetime import date as date_type

        qr_token = request.data.get("qr_token", "")
        if not qr_token or ":" not in qr_token:
            return Response(
                {"error": "Invalid QR code", "code": "invalid_qr"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Parse facility_id:hash from QR token
        parts = qr_token.split(":", 1)
        try:
            qr_facility_id = int(parts[0])
        except (ValueError, IndexError):
            return Response(
                {"error": "Invalid QR code format", "code": "invalid_qr"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate rotating hash (based on facility_id + date + hour)
        from django.conf import settings as django_settings

        now = timezone.now()
        secret = getattr(django_settings, "SECRET_KEY", "vitora")
        expected_hash = hashlib.sha256(
            f"{qr_facility_id}:{now.strftime('%Y-%m-%d:%H')}:{secret}".encode()
        ).hexdigest()[:16]

        if parts[1] != expected_hash:
            # Also accept previous hour's hash for clock skew
            prev_hour = (now - timedelta(hours=1)).strftime("%Y-%m-%d:%H")
            prev_hash = hashlib.sha256(
                f"{qr_facility_id}:{prev_hour}:{secret}".encode()
            ).hexdigest()[:16]
            if parts[1] != prev_hash:
                return Response(
                    {"error": "QR code expired or invalid", "code": "qr_expired"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Resolve user's shift
        resource = self._get_my_resource(request)
        if not resource:
            return Response(
                {"error": "No scheduling resource linked to your profile"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify facility matches
        if resource.facility_id != qr_facility_id:
            return Response(
                {"error": "QR code is for a different facility", "code": "wrong_facility"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        non_working_types = {
            "OFF",
            "DAY_OFF",
            "NIGHT_OFF",
            "AFTERNOON_OFF",
            "LEAVE",
            "SICK_LEAVE",
            "REST",
        }
        today = date_type.today()
        shift = (
            Shift.objects.filter(
                staff_resource=resource,
                shift_date=today,
                status="SCHEDULED",
            )
            .exclude(shift_type__in=non_working_types)
            .order_by("start_time")
            .first()
        )

        if not shift:
            return Response(
                {"error": "No scheduled shift found for today", "code": "no_shift"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reuse clock-in logic but with QR method
        try:
            shift.start_shift(method="QR_CODE")
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ShiftSerializer(shift)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="qr-token")
    def qr_token(self, request):
        """
        Generate a rotating QR token for the current facility.

        Returns a token that rotates every hour. Display as QR code
        at the facility entrance for staff to scan.

        Only accessible to users with manage_schedules permission.
        """
        import hashlib

        from django.conf import settings as django_settings

        if not request.user.has_perm("scheduling.manage_schedules"):
            return Response(
                {"error": "Permission denied"},
                status=status.HTTP_403_FORBIDDEN,
            )

        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        secret = getattr(django_settings, "SECRET_KEY", "vitora")
        token_hash = hashlib.sha256(
            f"{facility.id}:{now.strftime('%Y-%m-%d:%H')}:{secret}".encode()
        ).hexdigest()[:16]

        qr_token = f"{facility.id}:{token_hash}"
        # Valid until the end of current hour
        valid_until = now.replace(minute=59, second=59, microsecond=0)

        return Response(
            {
                "qr_token": qr_token,
                "facility_id": facility.id,
                "facility_name": str(facility),
                "valid_until": valid_until.isoformat(),
                "generated_at": now.isoformat(),
            }
        )


# =============================================================================
# Scheduling Settings & Staff Constraints
# =============================================================================
