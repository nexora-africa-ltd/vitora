# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Scheduling views shift roster for Vitora HMIS.

What this file is for:
- Implement views shift roster logic for the scheduling domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from datetime import datetime, timedelta

from django.db import models
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    resolve_request_tenant,
)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import ReadRequiresModelPermission
from hmis.apps.scheduling.models import (
    Appointment,
    AssignmentDecision,
    AssignmentOverride,
    AssignmentRule,
    Resource,
    Schedule,
    Shift,
    ShiftSwapRequest,
)
from hmis.apps.scheduling.serializers import (
    AppointmentCancelSerializer,
    AppointmentCheckInSerializer,
    AppointmentCompleteSerializer,
    AppointmentConfirmSerializer,
    AppointmentCreateSerializer,
    AppointmentListSerializer,
    AppointmentNoShowSerializer,
    AppointmentSerializer,
    AppointmentStartSerializer,
    AvailabilityQuerySerializer,
    ResourceListSerializer,
    ResourceSerializer,
    ScheduleBreakSerializer,
    ScheduleCreateSerializer,
    ScheduleSerializer,
    SchedulingSettingsSerializer,
    ShiftCancelSerializer,
    ShiftCreateSerializer,
    ShiftListSerializer,
    ShiftSerializer,
    ShiftStartSerializer,
    ShiftSwapAcceptSerializer,
    ShiftSwapApproveSerializer,
    ShiftSwapCreateSerializer,
    ShiftSwapRejectSerializer,
    ShiftSwapRequestListSerializer,
    ShiftSwapRequestSerializer,
    ShiftTypeConfigSerializer,
    SlotCheckQuerySerializer,
    StaffConstraintSerializer,
    StaffWorkloadSerializer,
    WeeklyAvailabilityQuerySerializer,
)
from hmis.apps.scheduling.services import (
    check_slot_available,
    get_available_slots,
    get_weekly_availability,
)
from hmis.apps.scheduling.views_resources_appointments import ShiftFilter
from hmis.apps.scheduling.views_shift_analytics import ShiftAnalyticsExportMixin

logger = logging.getLogger(__name__)


class ManageSchedulesWritePermission(permissions.BasePermission):
    """Allow reads for all authenticated users; require ``scheduling.manage_schedules`` for writes.

    Lifecycle actions (start, complete, take-break, resume, cancel) are NOT
    gated — they are personal clock-in/out operations.
    """

    WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    # Personal clock-in/out actions that should NOT be gated
    PERSONAL_ACTIONS = {"start", "complete", "take_break", "resume", "cancel", "emergency_clock_in"}

    def has_permission(self, request, view):
        if request.method not in self.WRITE_METHODS:
            return True
        # Allow personal lifecycle actions
        action_name = getattr(view, "action", None)
        if action_name in self.PERSONAL_ACTIONS:
            return True
        # Superusers always pass
        if request.user and request.user.is_superuser:
            return True
        return request.user.has_perm("scheduling.manage_schedules")


class ShiftViewSet(
    ShiftAnalyticsExportMixin, TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet
):
    """
    ViewSet for managing staff shifts / duty roster.

    Endpoints:
        GET    /api/scheduling/shifts/              - List shifts (duty roster)
        POST   /api/scheduling/shifts/              - Create shift
        GET    /api/scheduling/shifts/{id}/         - Retrieve shift
        PATCH  /api/scheduling/shifts/{id}/         - Update shift
        DELETE /api/scheduling/shifts/{id}/         - Delete shift

    Lifecycle actions:
        POST   /api/scheduling/shifts/{id}/start/   - Start shift (clock in)
        POST   /api/scheduling/shifts/{id}/complete/ - Complete shift (clock out)
        POST   /api/scheduling/shifts/{id}/cancel/  - Cancel shift

    Aggregation:
        GET    /api/scheduling/shifts/staff-workload/ - Staff workload summary
    """

    queryset = Shift.objects.select_related(
        "staff_resource",
        "staff_resource__staff_profile",
        "staff_resource__staff_profile__primary_department",
        "staff_resource__department",
        "department",
        "created_by",
        "cancelled_by",
        "room",
        "clinic",
    )
    serializer_class = ShiftSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        ManageSchedulesWritePermission,
        ReadRequiresModelPermission,
    ]
    filterset_class = ShiftFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        """Get appropriate serializer class."""
        if self.action == "create":
            return ShiftCreateSerializer
        if self.action == "list":
            return ShiftListSerializer
        if self.action == "emergency_clock_in":
            from hmis.apps.scheduling.serializers import EmergencyClockInSerializer

            return EmergencyClockInSerializer
        return ShiftSerializer

    def get_queryset(self):
        """Annotate comments_count for list action."""
        qs = super().get_queryset()
        if self.action == "list":
            from django.contrib.contenttypes.models import ContentType

            from hmis.apps.comments.models import ClinicalComment

            shift_ct = ContentType.objects.get_for_model(Shift)
            qs = qs.annotate(
                comments_count=models.Subquery(
                    ClinicalComment.objects.filter(
                        content_type=shift_ct,
                        object_id=models.OuterRef("pk"),
                    )
                    .values("object_id")
                    .annotate(cnt=models.Count("id"))
                    .values("cnt"),
                    output_field=models.IntegerField(),
                )
            )
        return qs

    def perform_create(self, serializer):
        """Create shift with tenant scoping and audit."""
        shift = serializer.save(**self.get_tenant_save_kwargs())
        AuditLog.log(
            action="shift_create",
            user=self.request.user,
            resource_type="Shift",
            resource_id=shift.id,
            details={
                "staff_resource": shift.staff_resource.name,
                "shift_date": str(shift.shift_date),
            },
            ip_address=self._get_client_ip(),
        )

    def _get_client_ip(self) -> str:
        """Get client IP address from request."""
        xff = self.request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return self.request.META.get("REMOTE_ADDR", "")

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Start a shift (clock in).

        Accepts optional room_id and clinic_id in the request body to capture
        which room and clinic the clinician is serving in.

        If a clinic is specified (or auto-resolved from ClinicStaff), the system
        auto-opens today's ClinicSession if none is open yet.

        Blocks clock-in if the shift has already ended (now > shift end time).

        Checks facility punctuality settings — if enforce_punctuality is enabled
        and the staff member is more than late_cutoff_minutes late, clock-in is
        blocked unless the user has manage_schedules permission (admin override).
        """
        shift = self.get_object()

        now = timezone.now()

        # Block clock-in after shift end time
        shift_end_naive = datetime.combine(shift.shift_date, shift.end_time)
        # Night shifts: end_time < start_time means end is next day
        if shift.end_time <= shift.start_time:
            shift_end_naive += timedelta(days=1)
        shift_end_dt = (
            timezone.make_aware(shift_end_naive)
            if timezone.is_naive(shift_end_naive)
            else shift_end_naive
        )
        if now > shift_end_dt:
            return Response(
                {
                    "error": "Cannot clock in after shift end time. This shift has already ended.",
                    "code": "shift_ended",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Punctuality enforcement
        from hmis.apps.scheduling.models import SchedulingSettings

        settings = SchedulingSettings.objects.filter(facility=shift.facility).first()
        if settings and settings.enforce_punctuality and settings.late_cutoff_minutes:
            shift_start_dt = (
                timezone.make_aware(datetime.combine(shift.shift_date, shift.start_time))
                if timezone.is_naive(datetime.combine(shift.shift_date, shift.start_time))
                else datetime.combine(shift.shift_date, shift.start_time)
            )
            minutes_late = (now - shift_start_dt).total_seconds() / 60
            is_admin = request.user.has_perm("scheduling.manage_schedules")
            if minutes_late > settings.late_cutoff_minutes and not is_admin:
                return Response(
                    {
                        "error": (
                            f"Clock-in blocked: you are {int(minutes_late)} minutes late. "
                            f"Facility policy allows clock-in within {settings.late_cutoff_minutes} minutes "
                            f"of shift start. Contact a supervisor for an override."
                        ),
                        "code": "late_cutoff_exceeded",
                        "minutes_late": int(minutes_late),
                        "cutoff": settings.late_cutoff_minutes,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Validate optional room/clinic payload
        start_serializer = ShiftStartSerializer(
            data=request.data, context={"shift": shift, "request": request}
        )
        start_serializer.is_valid(raise_exception=True)

        room_id = start_serializer.validated_data.get("room_id")
        clinic_id = start_serializer.validated_data.get("clinic_id")
        clock_method = start_serializer.validated_data.get("method", "MANUAL")

        room = None
        clinic = None

        if room_id:
            room = Resource.objects.get(pk=room_id)

        if clinic_id:
            from hmis.apps.clinics.models import Clinic as ClinicModel

            clinic = ClinicModel.objects.get(pk=clinic_id)
        else:
            # Auto-resolve clinic from ClinicStaff (primary clinic)
            from hmis.apps.clinics.models import ClinicStaff

            staff_user = (
                shift.staff_resource.staff_profile.user
                if shift.staff_resource.staff_profile
                else None
            )
            if staff_user:
                primary_assignment = (
                    ClinicStaff.objects.filter(user=staff_user, is_primary=True, is_active=True)
                    .select_related("clinic")
                    .first()
                )
                if primary_assignment and primary_assignment.clinic.status == "ACTIVE":
                    clinic = primary_assignment.clinic

        try:
            shift.start_shift(room=room, clinic=clinic, method=clock_method)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Auto-open clinic session if needed
        session_auto_opened = False
        if clinic:
            session, created = clinic.get_or_create_session(shift.shift_date)
            if session.status == "SCHEDULED":
                session.open_session(request.user)
                session_auto_opened = True

        serializer = ShiftSerializer(shift)
        data = serializer.data
        data["session_auto_opened"] = session_auto_opened
        return Response(data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Complete a shift (clock out).

        If the shift is linked to a clinic, checks whether any other active/on-break
        shifts remain for that clinic today. If this was the last one, the clinic
        session is auto-closed.
        """
        shift = self.get_object()
        clinic = shift.clinic
        try:
            shift.complete_shift()
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Auto-close clinic session if this was the last active shift
        session_auto_closed = False
        if clinic:
            remaining = (
                Shift.objects.filter(
                    clinic=clinic,
                    shift_date=shift.shift_date,
                    status__in=["ACTIVE", "ON_BREAK"],
                )
                .exclude(pk=shift.pk)
                .exists()
            )
            if not remaining:
                from hmis.apps.clinics.models import ClinicSession

                session = ClinicSession.objects.filter(
                    clinic=clinic,
                    session_date=shift.shift_date,
                    status="OPEN",
                ).first()
                if session:
                    session.close_session(request.user)
                    session_auto_closed = True

        serializer = ShiftSerializer(shift)
        data = serializer.data
        data["session_auto_closed"] = session_auto_closed
        return Response(data)

    @action(detail=True, methods=["post"], url_path="take-break")
    def take_break(self, request, pk=None):
        """Take a break during an active shift."""
        shift = self.get_object()
        try:
            shift.take_break()
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ShiftSerializer(shift)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        """Resume shift from break."""
        shift = self.get_object()
        try:
            shift.resume_shift()
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ShiftSerializer(shift)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a shift."""
        shift = self.get_object()
        cancel_serializer = ShiftCancelSerializer(data=request.data)
        cancel_serializer.is_valid(raise_exception=True)
        try:
            shift.cancel(
                user=request.user,
                reason=cancel_serializer.validated_data.get("reason", ""),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ShiftSerializer(shift)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """
        Bulk-create shifts for a roster grid.

        Accepts an array of shift data objects. Validates each item,
        skips duplicates (same staff + date + shift_type), and returns
        counts of created/skipped/errors.

        Request body:
            { "shifts": [ { staff_resource, shift_date, start_time, end_time, shift_type, department?, notes? }, ... ] }
        """
        shifts_data = request.data.get("shifts", [])
        if not isinstance(shifts_data, list) or len(shifts_data) == 0:
            return Response(
                {"error": "Request body must contain a non-empty 'shifts' array"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(shifts_data) > 200:
            return Response(
                {"error": "Maximum 200 shifts per bulk request"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant_kwargs = self.get_tenant_save_kwargs()
        facility_filter = {k: v for k, v in tenant_kwargs.items() if k == "facility"}

        # Pre-fetch existing shifts for duplicate detection (single query)
        dates = {item.get("shift_date") for item in shifts_data if item.get("shift_date")}
        resource_ids = {
            item.get("staff_resource") for item in shifts_data if item.get("staff_resource")
        }
        existing_keys = set()
        if dates and resource_ids:
            existing_qs = (
                Shift.objects.filter(
                    staff_resource_id__in=resource_ids,
                    shift_date__in=dates,
                    **facility_filter,
                )
                .exclude(status="CANCELLED")
                .values_list("staff_resource_id", "shift_date", "shift_type")
            )
            existing_keys = {(r, str(d), t) for r, d, t in existing_qs}

        created, skipped, errors = [], [], []

        for idx, item in enumerate(shifts_data):
            serializer = ShiftCreateSerializer(data=item, context={"request": request})
            if not serializer.is_valid():
                errors.append({"index": idx, "errors": serializer.errors})
                continue

            vd = serializer.validated_data
            dup_key = (vd["staff_resource"].pk, str(vd["shift_date"]), vd["shift_type"])

            if dup_key in existing_keys:
                skipped.append(
                    {
                        "index": idx,
                        "reason": f"Shift already exists for this staff on {vd['shift_date']} ({vd['shift_type']})",
                    }
                )
                continue

            try:
                shift = serializer.save(**tenant_kwargs)
                created.append(shift.id)
                # Add to existing_keys so subsequent duplicates in the same batch are caught
                existing_keys.add(dup_key)
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                logger.exception("Failed to create shift at index %d in bulk_create", idx)
                errors.append({"index": idx, "errors": "Failed to create shift"})

        return Response(
            {
                "created": len(created),
                "skipped": len(skipped),
                "errors": len(errors),
                "created_ids": created,
                "skipped_details": skipped,
                "error_details": errors,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """
        Bulk-delete shifts by date range.

        Deletes all SCHEDULED shifts within [from_date, to_date] for
        the current facility.  Pass include_all=true to also delete
        ACTIVE, ON_BREAK, and COMPLETED shifts.  CANCELLED shifts are
        always excluded.

        Request body:
            { "from_date": "YYYY-MM-DD", "to_date": "YYYY-MM-DD",
              "include_all": false }
        """
        from datetime import date as date_type

        from_date_str = request.data.get("from_date")
        to_date_str = request.data.get("to_date")
        include_all = request.data.get("include_all", False)

        if not from_date_str or not to_date_str:
            return Response(
                {"error": "from_date and to_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from_date = date_type.fromisoformat(from_date_str)
            to_date = date_type.fromisoformat(to_date_str)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = self.get_queryset().filter(
            shift_date__gte=from_date,
            shift_date__lte=to_date,
        )
        qs = qs.exclude(status="CANCELLED") if include_all else qs.filter(status="SCHEDULED")

        count = qs.count()
        qs.delete()

        return Response({"deleted": count})

    @action(detail=False, methods=["get"], url_path="staff-workload")
    def staff_workload(self, request):
        """
        Get staff workload summary for a date range.

        Query params:
            from_date: Start date (required)
            to_date: End date (required)
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

        # Get all person resources for this facility
        facility = getattr(request, "facility", None)
        if not facility and hasattr(request.user, "staff_profile"):
            facility = request.user.staff_profile.primary_facility
        staff_resources = Resource.objects.filter(
            resource_type="PERSON",
            is_active=True,
            facility=facility,
        )

        # For each staff resource, aggregate shifts and appointments
        workload = []
        for resource in staff_resources:
            shifts = Shift.objects.filter(
                staff_resource=resource,
                shift_date__gte=from_date,
                shift_date__lte=to_date,
            ).exclude(status="CANCELLED")

            appointments = Appointment.objects.filter(
                resource=resource,
                scheduled_start__date__gte=from_date,
                scheduled_start__date__lte=to_date,
            ).exclude(status__in=["CANCELLED", "NO_SHOW"])

            shift_list = list(shifts)
            total_hours = sum(s.duration_hours for s in shift_list)
            active_count = sum(1 for s in shift_list if s.status == "ACTIVE")
            completed_count = sum(1 for s in shift_list if s.status == "COMPLETED")

            workload.append(
                {
                    "resource_id": resource.id,
                    "resource_name": resource.name,
                    "resource_code": resource.code,
                    "shift_count": len(shift_list),
                    "total_hours": round(total_hours, 1),
                    "appointment_count": appointments.count(),
                    "active_shifts": active_count,
                    "completed_shifts": completed_count,
                }
            )

        serializer = StaffWorkloadSerializer(workload, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="emergency-clock-in")
    def emergency_clock_in(self, request):
        """
        Emergency clock-in: create an ad-hoc shift and immediately start it.

        For staff who need to work but have no scheduled shift (e.g. called in
        for an emergency, covering for absent colleague). Requires a mandatory
        reason that is logged in the audit trail.

        Request body:
        {
            "reason": "Called in for emergency surgery cover",
            "shift_type": "DAY",           // optional, default DAY
            "duration_hours": 8.0,         // optional, default 8
            "room_id": 123,                // optional
            "clinic_id": 456,              // optional
            "method": "MANUAL"             // optional
        }
        """
        from hmis.apps.scheduling.serializers import EmergencyClockInSerializer

        resource = self._get_my_resource(request)
        if not resource:
            return Response(
                {
                    "error": "No scheduling resource found for your profile in this facility.",
                    "code": "no_resource",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Prevent duplicate: block if user already has an active shift today
        from datetime import date as date_type

        today = date_type.today()
        existing_active = Shift.objects.filter(
            staff_resource=resource,
            shift_date=today,
            status__in=["ACTIVE", "ON_BREAK"],
        ).exists()
        if existing_active:
            return Response(
                {
                    "error": "You already have an active shift today. Clock out first.",
                    "code": "already_active",
                },
                status=status.HTTP_409_CONFLICT,
            )

        facility = getattr(request, "facility", None)
        serializer = EmergencyClockInSerializer(
            data=request.data, context={"facility": facility, "request": request}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        now = timezone.now()
        duration_hours = data.get("duration_hours", 8.0)
        start_time = now.time().replace(microsecond=0)
        end_dt = now + timedelta(hours=duration_hours)
        end_time = end_dt.time().replace(microsecond=0)

        # Resolve room/clinic
        room = None
        clinic = None
        if data.get("room_id"):
            room = Resource.objects.get(pk=data["room_id"])
        if data.get("clinic_id"):
            from hmis.apps.clinics.models import Clinic as ClinicModel

            clinic = ClinicModel.objects.get(pk=data["clinic_id"])
        else:
            # Auto-resolve clinic from ClinicStaff
            from hmis.apps.clinics.models import ClinicStaff

            staff_user = resource.staff_profile.user if resource.staff_profile else None
            if staff_user:
                primary_assignment = (
                    ClinicStaff.objects.filter(user=staff_user, is_primary=True, is_active=True)
                    .select_related("clinic")
                    .first()
                )
                if primary_assignment and primary_assignment.clinic.status == "ACTIVE":
                    clinic = primary_assignment.clinic

        # Create the ad-hoc shift
        shift = Shift.objects.create(
            staff_resource=resource,
            shift_date=today,
            start_time=start_time,
            end_time=end_time,
            shift_type=data.get("shift_type", "DAY"),
            status="SCHEDULED",
            is_emergency=True,
            emergency_reason=data["reason"],
            created_by=request.user,
            facility=facility,
            organization=getattr(facility, "organization", None),
        )

        # Immediately clock in
        method = data.get("method", "MANUAL")
        shift.start_shift(room=room, clinic=clinic, method=method)

        # Auto-open clinic session if needed
        session_auto_opened = False
        if clinic:
            session, created = clinic.get_or_create_session(shift.shift_date)
            if session.status == "SCHEDULED":
                session.open_session(request.user)
                session_auto_opened = True

        # Audit log
        AuditLog.log(
            action="emergency_clock_in",
            user=request.user,
            resource_type="Shift",
            resource_id=shift.id,
            ip_address=self._get_client_ip(),
            details={
                "reason": data["reason"],
                "staff_resource": resource.name,
                "shift_date": str(today),
                "shift_type": shift.shift_type,
                "duration_hours": duration_hours,
                "room_id": room.id if room else None,
                "clinic_id": clinic.id if clinic else None,
            },
        )

        result_serializer = ShiftSerializer(shift)
        response_data = result_serializer.data
        response_data["session_auto_opened"] = session_auto_opened
        return Response(response_data, status=status.HTTP_201_CREATED)

    # ---- Personal / Clock-In Endpoints ----

    def _get_my_resource(self, request):
        """Resolve the scheduling Resource linked to the current user's StaffProfile."""
        staff_profile = getattr(request.user, "staff_profile", None)
        if not staff_profile:
            return None
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return None
        return Resource.objects.filter(
            staff_profile=staff_profile,
            facility=facility,
            resource_type="PERSON",
        ).first()

    @action(detail=False, methods=["get"], url_path="my-today")
    def my_today(self, request):
        """
        Get the current user's shift(s) for today.

        Returns a list of shifts plus an attendance_status field:
        - NO_SHIFT: no shift scheduled today
        - UPCOMING: shift hasn't started yet
        - SHOULD_CLOCK_IN: shift start time has passed, not yet clocked in
        - CLOCKED_IN: currently on duty
        - COMPLETED: shift done for the day
        """
        from datetime import date as date_type

        resource = self._get_my_resource(request)
        if not resource:
            return Response({"shifts": [], "attendance_status": "NO_SHIFT"})

        today = date_type.today()
        shifts = list(
            Shift.objects.filter(
                staff_resource=resource,
                shift_date=today,
            )
            .exclude(status="CANCELLED")
            .exclude(
                shift_type__in=[
                    "OFF",
                    "DAY_OFF",
                    "NIGHT_OFF",
                    "AFTERNOON_OFF",
                    "LEAVE",
                    "SICK_LEAVE",
                    "REST",
                ]
            )
            .order_by("start_time")
        )

        if not shifts:
            return Response({"shifts": [], "attendance_status": "NO_SHIFT"})

        # Determine overall attendance status from the primary (first) shift
        primary = shifts[0]
        now = timezone.now()
        shift_start_dt = (
            timezone.make_aware(datetime.combine(primary.shift_date, primary.start_time))
            if timezone.is_naive(datetime.combine(primary.shift_date, primary.start_time))
            else datetime.combine(primary.shift_date, primary.start_time)
        )

        if primary.status == "COMPLETED":
            att_status = "COMPLETED"
        elif primary.status == "ACTIVE":
            att_status = "CLOCKED_IN"
        elif primary.status == "ON_BREAK":
            att_status = "ON_BREAK"
        elif now >= shift_start_dt:
            att_status = "SHOULD_CLOCK_IN"
        else:
            att_status = "UPCOMING"

        serializer = ShiftSerializer(shifts, many=True)
        return Response(
            {
                "shifts": serializer.data,
                "attendance_status": att_status,
            }
        )

    @action(detail=False, methods=["get"], url_path="my-history")
    def my_history(self, request):
        """
        Get the current user's shift history (paginated) with attendance stats.

        Query params:
            from_date: Start date (optional, YYYY-MM-DD, default: 30 days ago)
            to_date:   End date (optional, YYYY-MM-DD, default: today)
            page / page_size: Pagination
        """
        from datetime import date as date_type
        from datetime import timedelta as td

        resource = self._get_my_resource(request)
        if not resource:
            return Response(
                {
                    "results": [],
                    "count": 0,
                    "stats": {
                        "total_shifts": 0,
                        "total_hours": 0,
                        "on_time_count": 0,
                        "late_count": 0,
                        "on_time_rate": 0,
                        "overtime_hours": 0,
                    },
                }
            )

        today = date_type.today()
        from_date_str = request.query_params.get("from_date")
        to_date_str = request.query_params.get("to_date")
        try:
            from_date = (
                date_type.fromisoformat(from_date_str) if from_date_str else today - td(days=30)
            )
            to_date = date_type.fromisoformat(to_date_str) if to_date_str else today
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shifts = (
            Shift.objects.filter(
                staff_resource=resource,
                shift_date__gte=from_date,
                shift_date__lte=to_date,
            )
            .exclude(status="CANCELLED")
            .exclude(
                shift_type__in=[
                    "OFF",
                    "DAY_OFF",
                    "NIGHT_OFF",
                    "AFTERNOON_OFF",
                    "LEAVE",
                    "SICK_LEAVE",
                    "REST",
                ]
            )
            .order_by("-shift_date", "-start_time")
        )

        # Compute attendance stats
        total_shifts = shifts.count()
        completed = shifts.filter(status="COMPLETED")

        total_hours = 0.0
        on_time_count = 0
        late_count = 0
        overtime_hours = 0.0
        late_threshold_minutes = 15

        for s in completed:
            # Duration from actual start/end
            if s.started_at and s.completed_at:
                actual_hours = (s.completed_at - s.started_at).total_seconds() / 3600
                total_hours += actual_hours
                # Overtime: actual hours - scheduled hours
                if s.duration_hours and actual_hours > s.duration_hours:
                    overtime_hours += actual_hours - s.duration_hours
            elif s.duration_hours:
                total_hours += s.duration_hours

            # Late check: started_at vs scheduled start
            if s.started_at:
                scheduled_start = (
                    timezone.make_aware(datetime.combine(s.shift_date, s.start_time))
                    if timezone.is_naive(datetime.combine(s.shift_date, s.start_time))
                    else datetime.combine(s.shift_date, s.start_time)
                )
                diff_minutes = (s.started_at - scheduled_start).total_seconds() / 60
                if diff_minutes > late_threshold_minutes:
                    late_count += 1
                else:
                    on_time_count += 1

        on_time_rate = (
            round((on_time_count / (on_time_count + late_count) * 100), 1)
            if (on_time_count + late_count) > 0
            else 0
        )

        # Paginate
        page_size = int(request.query_params.get("page_size", 20))
        page_num = int(request.query_params.get("page", 1))
        start = (page_num - 1) * page_size
        end = start + page_size
        page_shifts = shifts[start:end]

        serializer = ShiftListSerializer(page_shifts, many=True)
        return Response(
            {
                "results": serializer.data,
                "count": total_shifts,
                "stats": {
                    "total_shifts": total_shifts,
                    "total_hours": round(total_hours, 1),
                    "on_time_count": on_time_count,
                    "late_count": late_count,
                    "on_time_rate": on_time_rate,
                    "overtime_hours": round(overtime_hours, 1),
                },
            }
        )
