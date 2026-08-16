# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Views for L5 Reporting & Analytics."""

from datetime import date, timedelta

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant
from hmis.apps.core.openapi import SchemaFallbackSerializer
from hmis.apps.core.permissions import ReadRequiresModelPermission
from hmis.apps.laboratory.permissions import LaboratoryModuleRequired

from .engine import TATReportingEngine
from .models import TATSLATarget, TATSnapshot, WorkloadSnapshot
from .serializers import (
    TATSLATargetCreateSerializer,
    TATSLATargetSerializer,
    TATSnapshotSerializer,
    WorkloadSnapshotSerializer,
)


def _parse_date_range(request):
    """Parse start/end query params, default to last 7 days."""
    today = date.today()
    start_str = request.query_params.get("start")
    end_str = request.query_params.get("end")

    try:
        start_date = date.fromisoformat(start_str) if start_str else today - timedelta(days=7)
    except (ValueError, TypeError):
        start_date = today - timedelta(days=7)

    try:
        end_date = date.fromisoformat(end_str) if end_str else today
    except (ValueError, TypeError):
        end_date = today

    return start_date, end_date


class TATSLATargetViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for TAT SLA targets per test/priority."""

    queryset = TATSLATarget.objects.select_related("test")
    serializer_class = TATSLATargetSerializer
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, ReadRequiresModelPermission]
    tenant_scope = "facility"
    filterset_fields = ["test", "priority", "is_active"]

    def get_serializer_class(self):
        if self.action == "create":
            return TATSLATargetCreateSerializer
        return TATSLATargetSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())


class TATSnapshotViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only access to TAT snapshots (created by signals)."""

    queryset = TATSnapshot.objects.select_related(
        "lab_order", "test", "sla_target", "resulted_by", "verified_by"
    )
    serializer_class = TATSnapshotSerializer
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, ReadRequiresModelPermission]
    tenant_scope = "facility"
    filterset_fields = ["priority", "is_breach", "test"]

    @action(detail=False, methods=["get"])
    def breaches(self, request):
        """List only breached snapshots for the facility."""
        start_date, end_date = _parse_date_range(request)
        qs = self.get_queryset().filter(
            is_breach=True,
            ordered_at__date__gte=start_date,
            ordered_at__date__lte=end_date,
        )
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class WorkloadSnapshotViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only workload snapshots."""

    queryset = WorkloadSnapshot.objects.select_related("technician")
    serializer_class = WorkloadSnapshotSerializer
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, ReadRequiresModelPermission]
    tenant_scope = "facility"
    filterset_fields = ["date", "technician"]


def _get_facility_id(request):
    """Extract facility ID from request (resolved after DRF authentication)."""
    # DRF JWT auth runs inside the view, so middleware may not have resolved
    # the tenant yet. Call resolve_request_tenant to ensure it's set.
    resolve_request_tenant(request)
    facility = getattr(request, "facility", None)
    if facility:
        return facility.id
    # Fallback to query param
    fid = request.query_params.get("facility")
    if fid:
        return int(fid)
    return None


class LabReportingSchemaMixin:
    """Schema fallback helpers for APIViews used by drf-spectacular."""

    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return self.serializer_class

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": self.request, "format": self.format_kwarg, "view": self}


class SLAComplianceReportView(LabReportingSchemaMixin, APIView):
    """Enhanced SLA compliance report with percentiles."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, ReadRequiresModelPermission]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        facility_id = _get_facility_id(request)
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.sla_compliance_report(facility_id, start_date, end_date)
        return Response(data)


class TATTrendReportView(LabReportingSchemaMixin, APIView):
    """Daily TAT trend report."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, ReadRequiresModelPermission]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        facility_id = _get_facility_id(request)
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.tat_trend_report(facility_id, start_date, end_date)
        return Response(data)


class ActiveBreachesView(LabReportingSchemaMixin, APIView):
    """Real-time view of currently breached in-progress orders."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, ReadRequiresModelPermission]

    def get(self, request):
        facility_id = _get_facility_id(request)
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.active_breaches(facility_id)
        return Response(data)


class TechnicianEfficiencyView(LabReportingSchemaMixin, APIView):
    """Per-technician efficiency metrics."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, ReadRequiresModelPermission]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        facility_id = _get_facility_id(request)
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.technician_efficiency(facility_id, start_date, end_date)
        return Response(data)


class WorkloadKPIReportView(LabReportingSchemaMixin, APIView):
    """Workload KPI report from aggregated snapshots."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, ReadRequiresModelPermission]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        facility_id = _get_facility_id(request)
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.workload_kpi_report(facility_id, start_date, end_date)
        return Response(data)
