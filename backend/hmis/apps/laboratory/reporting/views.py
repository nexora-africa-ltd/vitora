"""Views for L5 Reporting & Analytics."""

from datetime import date, timedelta

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin

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
    permission_classes = [IsAuthenticated]
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
    permission_classes = [IsAuthenticated]
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
    permission_classes = [IsAuthenticated]
    tenant_scope = "facility"
    filterset_fields = ["date", "technician"]


class SLAComplianceReportView(APIView):
    """Enhanced SLA compliance report with percentiles."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        facility_id = getattr(request, "facility_id", None) or request.query_params.get("facility")
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.sla_compliance_report(int(facility_id), start_date, end_date)
        return Response(data)


class TATTrendReportView(APIView):
    """Daily TAT trend report."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        facility_id = getattr(request, "facility_id", None) or request.query_params.get("facility")
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.tat_trend_report(int(facility_id), start_date, end_date)
        return Response(data)


class ActiveBreachesView(APIView):
    """Real-time view of currently breached in-progress orders."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        facility_id = getattr(request, "facility_id", None) or request.query_params.get("facility")
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.active_breaches(int(facility_id))
        return Response(data)


class TechnicianEfficiencyView(APIView):
    """Per-technician efficiency metrics."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        facility_id = getattr(request, "facility_id", None) or request.query_params.get("facility")
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.technician_efficiency(int(facility_id), start_date, end_date)
        return Response(data)


class WorkloadKPIReportView(APIView):
    """Workload KPI report from aggregated snapshots."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        facility_id = getattr(request, "facility_id", None) or request.query_params.get("facility")
        if not facility_id:
            return Response({"error": "Facility context required"}, status=400)
        data = TATReportingEngine.workload_kpi_report(int(facility_id), start_date, end_date)
        return Response(data)
