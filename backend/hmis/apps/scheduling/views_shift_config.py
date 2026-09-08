# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F401
"""Scheduling views shift config for Vitora HMIS.

What this file is for:
- Implement views shift config logic for the scheduling domain.

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
    DepartmentRosterSettingsSerializer,
    DepartmentShiftConfigSerializer,
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

logger = logging.getLogger(__name__)


class SchedulingSettingsViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for per-facility scheduling settings.

    GET    /api/scheduling/settings/       → list (returns 1 settings object or empty)
    POST   /api/scheduling/settings/       → create settings for the facility
    GET    /api/scheduling/settings/{id}/  → retrieve
    PATCH  /api/scheduling/settings/{id}/  → update
    GET    /api/scheduling/settings/current/ → get-or-create current facility settings
    """

    from hmis.apps.scheduling.models import SchedulingSettings

    queryset = SchedulingSettings.objects.all()
    serializer_class = SchedulingSettingsSerializer
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    tenant_scope = "facility"

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        """Get or create the scheduling settings for the current facility."""
        from hmis.apps.scheduling.models import SchedulingSettings

        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj, _created = SchedulingSettings.objects.get_or_create(
            facility=facility,
            defaults={"organization": getattr(facility, "organization", None)},
        )
        serializer = self.get_serializer(settings_obj)
        return Response(serializer.data)

    @action(detail=False, methods=["get", "post"], url_path="autofill-runs")
    def autofill_runs(self, request):
        """
        List or append weekly roster autofill run reports for current facility.

        GET  /api/scheduling/settings/autofill-runs/  -> latest-first list
        POST /api/scheduling/settings/autofill-runs/  -> append run payload
        """
        from hmis.apps.scheduling.models import SchedulingSettings

        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj, _created = SchedulingSettings.objects.get_or_create(
            facility=facility,
            defaults={"organization": getattr(facility, "organization", None)},
        )

        if request.method == "GET":
            runs = settings_obj.autofill_run_history or []
            return Response(runs)

        payload = request.data if isinstance(request.data, dict) else None
        if not payload:
            return Response(
                {"error": "Expected a JSON object payload"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        runs = list(settings_obj.autofill_run_history or [])
        run_entry = {
            "id": timezone.now().strftime("%Y%m%d%H%M%S%f"),
            "created_at": timezone.now().isoformat(),
            "week_start": payload.get("week_start"),
            "week_end": payload.get("week_end"),
            "strategy": payload.get("strategy"),
            "report": payload,
        }
        runs.insert(0, run_entry)
        settings_obj.autofill_run_history = runs[:100]
        settings_obj.save(update_fields=["autofill_run_history", "updated_at"])
        return Response(run_entry, status=status.HTTP_201_CREATED)


class ShiftTypeConfigViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for per-facility shift type time configurations.

    GET    /api/scheduling/shift-type-configs/              → list configs for facility
    POST   /api/scheduling/shift-type-configs/              → create config
    GET    /api/scheduling/shift-type-configs/{id}/         → retrieve
    PATCH  /api/scheduling/shift-type-configs/{id}/         → update
    DELETE /api/scheduling/shift-type-configs/{id}/         → delete
    GET    /api/scheduling/shift-type-configs/defaults/     → get all active configs (for shift creation)
    POST   /api/scheduling/shift-type-configs/bulk_upsert/  → create/update multiple configs at once
    """

    from hmis.apps.scheduling.models import ShiftTypeConfig

    queryset = ShiftTypeConfig.objects.all()
    serializer_class = ShiftTypeConfigSerializer
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    tenant_scope = "facility"

    def create(self, request, *args, **kwargs):
        """Create with tenant resolution before validation (for uniqueness check)."""
        self._resolve_tenant_context()
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["get"], url_path="defaults")
    def defaults(self, request):
        """
        Return a mapping of shift_type → {start_time, end_time, label, color}
        for all active configs at this facility.

        Used by the roster grid to auto-populate times when assigning shift types.
        """
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from hmis.apps.scheduling.models import ShiftTypeConfig

        configs = ShiftTypeConfig.objects.filter(facility=facility, is_active=True)
        result = {}
        for cfg in configs:
            result[cfg.shift_type] = {
                "start_time": cfg.start_time.strftime("%H:%M"),
                "end_time": cfg.end_time.strftime("%H:%M"),
                "label": cfg.display_label,
                "color": cfg.color,
            }
        return Response(result)

    @action(detail=False, methods=["post"], url_path="bulk_upsert")
    def bulk_upsert(self, request):
        """
        Create or update multiple shift type configs at once.

        Accepts a list of objects: [{shift_type, start_time, end_time, label?, color?, is_active?}]
        Updates existing configs (matched by facility + shift_type) or creates new ones.
        """
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items = request.data
        if not isinstance(items, list):
            return Response(
                {"error": "Expected a list of shift type configurations."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(items) > 20:
            return Response(
                {"error": "Maximum 20 configurations per request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from hmis.apps.scheduling.models import ShiftTypeConfig

        results = []
        errors = []
        for idx, item in enumerate(items):
            shift_type = item.get("shift_type")
            if not shift_type:
                errors.append({"index": idx, "error": "shift_type is required"})
                continue

            existing = ShiftTypeConfig.objects.filter(
                facility=facility, shift_type=shift_type
            ).first()

            serializer = self.get_serializer(instance=existing, data=item, partial=bool(existing))
            if serializer.is_valid():
                if existing:
                    serializer.save()
                else:
                    serializer.save(
                        facility=facility,
                        organization=getattr(facility, "organization", None),
                    )
                results.append(serializer.data)
            else:
                errors.append({"index": idx, "shift_type": shift_type, "errors": serializer.errors})

        response_data = {"created_or_updated": len(results), "results": results}
        if errors:
            response_data["errors"] = errors
            return Response(response_data, status=status.HTTP_207_MULTI_STATUS)
        return Response(response_data, status=status.HTTP_200_OK)


class DepartmentShiftConfigViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD and defaults for facility department shift type overrides."""

    from hmis.apps.scheduling.models import DepartmentShiftConfig

    queryset = DepartmentShiftConfig.objects.select_related("department")
    serializer_class = DepartmentShiftConfigSerializer
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    tenant_scope = "facility"

    def create(self, request, *args, **kwargs):
        """Resolve tenant context before serializer validates the department."""
        self._resolve_tenant_context()
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        """Persist the override in the request facility."""
        serializer.save(**self.get_tenant_save_kwargs())

    def get_queryset(self):
        """Optionally filter department override configs without crossing tenant scope."""
        queryset = super().get_queryset()
        department = self.request.query_params.get("department")
        if department:
            queryset = queryset.filter(department_id=department)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in {"true", "1"})
        return queryset

    def destroy(self, request, *args, **kwargs):
        """Delete only when the user holds the model delete permission."""
        if not request.user.has_perm("scheduling.delete_departmentshiftconfig"):
            return Response(
                {"detail": "You do not have permission to delete this resource."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="defaults")
    def defaults(self, request):
        """Return active overrides grouped by canonical department ID and shift type."""
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"}, status=status.HTTP_400_BAD_REQUEST
            )
        result = {}
        configs = self.get_queryset().filter(facility=facility, is_active=True)
        for config in configs:
            department_configs = result.setdefault(str(config.department_id), {})
            department_configs[config.shift_type] = {
                "start_time": config.start_time.strftime("%H:%M"),
                "end_time": config.end_time.strftime("%H:%M"),
                "label": config.display_label,
                "color": config.color,
                "min_staff": config.min_staff,
                "max_staff": config.max_staff,
            }
        return Response(result)


class DepartmentRosterSettingsViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD and defaults endpoint for canonical per-department repeating rotas."""

    from hmis.apps.scheduling.models import DepartmentRosterSettings

    queryset = DepartmentRosterSettings.objects.select_related("department")
    serializer_class = DepartmentRosterSettingsSerializer
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    tenant_scope = "facility"

    def create(self, request, *args, **kwargs):
        """Resolve facility context before serializer department validation."""
        self._resolve_tenant_context()
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        """Persist the rota in the current facility tenant."""
        serializer.save(**self.get_tenant_save_kwargs())

    def get_queryset(self):
        """Optionally filter canonical rotas by local department."""
        queryset = super().get_queryset()
        department = self.request.query_params.get("department")
        return queryset.filter(department_id=department) if department else queryset

    def destroy(self, request, *args, **kwargs):
        """Delete only when the user has the model delete permission."""
        if not request.user.has_perm("scheduling.delete_departmentrostersettings"):
            return Response(
                {"detail": "You do not have permission to delete this resource."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="defaults")
    def defaults(self, _request):
        """Return canonical rotas keyed by department ID for roster clients."""
        self._resolve_tenant_context()
        return Response(
            {
                str(setting.department_id): setting.repeating_shift_pattern
                for setting in self.get_queryset().filter(repeating_shift_pattern__isnull=False)
            }
        )


class StaffConstraintViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for staff scheduling constraints.

    GET    /api/scheduling/constraints/               → list constraints
    POST   /api/scheduling/constraints/               → create constraint
    GET    /api/scheduling/constraints/{id}/          → retrieve
    PATCH  /api/scheduling/constraints/{id}/          → update
    DELETE /api/scheduling/constraints/{id}/          → delete
    GET    /api/scheduling/constraints/?staff_resource=1  → filter by staff
    """

    from hmis.apps.scheduling.models import StaffConstraint

    queryset = StaffConstraint.objects.select_related("staff_resource").all()
    serializer_class = StaffConstraintSerializer
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    tenant_scope = "facility"

    def get_queryset(self):
        qs = super().get_queryset()
        staff_resource = self.request.query_params.get("staff_resource")
        if staff_resource:
            qs = qs.filter(staff_resource_id=staff_resource)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ("true", "1"))
        return qs

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())


# =============================================================================
# Shift Swap Request ViewSet
# =============================================================================
