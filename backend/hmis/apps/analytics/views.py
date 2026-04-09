"""
Analytics API views.

Read-only endpoints for BI dashboards and trend analysis.
All endpoints are tenant-scoped via ``TenantScopedViewMixin``.
"""

from django_filters import rest_framework as django_filters
from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from hmis.apps.analytics.models import (
    DepartmentMonthlySummary,
    DiagnosisTrend,
    FacilityDailySummary,
    PatientDemographicSnapshot,
)
from hmis.apps.analytics.serializers import (
    DepartmentMonthlySummarySerializer,
    DiagnosisTrendSerializer,
    FacilityDailySummarySerializer,
    PatientDemographicSnapshotSerializer,
)
from hmis.apps.core.mixins import TenantScopedViewMixin

# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------


class FacilityDailySummaryFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")

    class Meta:
        model = FacilityDailySummary
        fields = ["date", "date_from", "date_to"]


class DepartmentMonthlyFilter(django_filters.FilterSet):
    class Meta:
        model = DepartmentMonthlySummary
        fields = ["year", "month", "department"]


class DiagnosisTrendFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="period_start", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="period_start", lookup_expr="lte")
    top_n = django_filters.NumberFilter(method="filter_top_n")

    class Meta:
        model = DiagnosisTrend
        fields = ["icd10_code", "granularity", "date_from", "date_to"]

    def filter_top_n(self, queryset, name, value):
        if value and value > 0:
            return queryset[:int(value)]
        return queryset


# ---------------------------------------------------------------------------
# ViewSets (read-only)
# ---------------------------------------------------------------------------


class FacilityDailySummaryViewSet(
    TenantScopedViewMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Facility daily summaries.

    Filterable by date range.  Returns one row per facility per date.
    """

    queryset = FacilityDailySummary.objects.select_related("facility")
    serializer_class = FacilityDailySummarySerializer
    permission_classes = [IsAuthenticated]
    filterset_class = FacilityDailySummaryFilter
    ordering_fields = ["date", "encounters_total", "revenue_total"]
    ordering = ["-date"]
    tenant_scope = "facility"


class DepartmentMonthlySummaryViewSet(
    TenantScopedViewMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Department monthly summaries.

    Filter by year, month, department.
    """

    queryset = DepartmentMonthlySummary.objects.select_related("facility")
    serializer_class = DepartmentMonthlySummarySerializer
    permission_classes = [IsAuthenticated]
    filterset_class = DepartmentMonthlyFilter
    ordering_fields = ["year", "month", "visit_count", "revenue"]
    ordering = ["-year", "-month"]
    tenant_scope = "facility"


class DiagnosisTrendViewSet(
    TenantScopedViewMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    ICD-10 diagnosis trends.

    Filter by code, granularity, date range.
    """

    queryset = DiagnosisTrend.objects.select_related("facility")
    serializer_class = DiagnosisTrendSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = DiagnosisTrendFilter
    ordering_fields = ["period_start", "case_count"]
    ordering = ["-period_start", "-case_count"]
    tenant_scope = "facility"


class PatientDemographicSnapshotViewSet(
    TenantScopedViewMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Patient demographic snapshots.

    Returns periodic snapshots of patient demographics by facility.
    """

    queryset = PatientDemographicSnapshot.objects.select_related("facility")
    serializer_class = PatientDemographicSnapshotSerializer
    permission_classes = [IsAuthenticated]
    ordering_fields = ["snapshot_date", "total_patients"]
    ordering = ["-snapshot_date"]
    tenant_scope = "facility"
