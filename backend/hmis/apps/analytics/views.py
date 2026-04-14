"""
Analytics API views.

Read-only endpoints for BI dashboards and trend analysis.

Scope levels
------------
* **Facility** — default, scoped via ``TenantScopedViewMixin``.
* **Organization** — cross-facility aggregation for org admins.
* **Platform** — cross-tenant aggregation for Nexora superusers.
"""

import logging
import time

import jwt
import requests as http_requests
from django.conf import settings
from django_filters import rest_framework as django_filters
from rest_framework import mixins, serializers, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.analytics.models import (
    DepartmentMonthlySummary,
    DiagnosisTrend,
    FacilityDailySummary,
    PatientDemographicSnapshot,
)
from hmis.apps.analytics.permissions import CanViewAnalytics, IsSuperUser
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
            # Order before slicing to avoid "Cannot reorder after slice" errors
            # when DRF pagination/ordering runs after filtering.
            qs = queryset.order_by("-case_count")
            pks = list(qs.values_list("pk", flat=True)[: int(value)])
            return queryset.filter(pk__in=pks)
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
    permission_classes = [IsAuthenticated, CanViewAnalytics]
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
    permission_classes = [IsAuthenticated, CanViewAnalytics]
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
    permission_classes = [IsAuthenticated, CanViewAnalytics]
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
    permission_classes = [IsAuthenticated, CanViewAnalytics]
    ordering_fields = ["snapshot_date", "total_patients"]
    ordering = ["-snapshot_date"]
    tenant_scope = "facility"


# ---------------------------------------------------------------------------
# Metabase Embedded Analytics
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)


class MetabaseEmbedSerializer(serializers.Serializer):
    """Validates the request for a Metabase embed URL."""

    resource_type = serializers.ChoiceField(
        choices=["dashboard", "question"],
        default="dashboard",
    )
    resource_id = serializers.IntegerField(min_value=1)


class MetabaseEmbedView(APIView):
    """
    Generate a signed Metabase embed URL.

    ``GET /api/analytics/metabase-embed/?resource_type=dashboard&resource_id=1``

    Returns ``{ "embed_url": "https://metabase.…/embed/dashboard/…#token=…" }``

    The JWT is signed with ``METABASE_EMBEDDING_SECRET`` and includes the
    requesting user's ``facility_id`` as a locked parameter so Metabase's
    row-level sandboxing filters data by tenant.
    """

    permission_classes = [IsAuthenticated, CanViewAnalytics]

    def get(self, request: Request) -> Response:
        serializer = MetabaseEmbedSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        secret = getattr(settings, "METABASE_EMBEDDING_SECRET", "")
        site_url = getattr(settings, "METABASE_SITE_URL", "")

        if not secret:
            return Response(
                {"detail": "Metabase embedding is not configured."},
                status=503,
            )

        # Resolve facility_id from the requesting user's profile
        facility_id = None
        profile = getattr(request.user, "staff_profile", None)
        if profile and getattr(profile, "primary_facility_id", None):
            facility_id = profile.primary_facility_id

        resource_type = data["resource_type"]
        resource_id = data["resource_id"]

        payload = {
            "resource": {resource_type: resource_id},
            "params": {
                "facility_id": facility_id,
            },
            "exp": int(time.time()) + 600,  # 10 minute expiry
        }

        token = jwt.encode(payload, secret, algorithm="HS256")
        embed_url = (
            f"{site_url.rstrip('/')}/embed/{resource_type}/{token}#bordered=false&titled=true"
        )

        logger.info(
            "Metabase embed URL generated for user=%s resource=%s:%d facility=%s",
            request.user.pk,
            resource_type,
            resource_id,
            facility_id,
        )

        return Response({"embed_url": embed_url})


class MetabaseDashboardListView(APIView):
    """
    List Metabase dashboards available for embedding.

    ``GET /api/analytics/metabase-dashboards/``

    Proxies the Metabase API to fetch dashboards, filtering to only those
    that have ``embedding_params`` configured (i.e. enabled for embedding).
    Excludes the default E-commerce sample dashboard.
    """

    permission_classes = [IsAuthenticated, CanViewAnalytics]

    def get(self, request: Request) -> Response:
        site_url = getattr(settings, "METABASE_SITE_URL", "")
        mb_api_key = getattr(settings, "METABASE_API_KEY", "")

        if not site_url:
            return Response(
                {"detail": "Metabase is not configured."},
                status=503,
            )

        try:
            headers = {}
            if mb_api_key:
                headers["x-api-key"] = mb_api_key
            resp = http_requests.get(
                f"{site_url.rstrip('/')}/api/dashboard",
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
        except http_requests.RequestException:
            logger.exception("Failed to fetch dashboards from Metabase")
            return Response(
                {"detail": "Could not reach Metabase."},
                status=502,
            )

        dashboards = []
        for d in resp.json():
            # Only include dashboards that have embedding configured
            ep = d.get("embedding_params")
            if not ep:
                continue
            dashboards.append(
                {
                    "id": d["id"],
                    "name": d["name"],
                    "description": d.get("description") or "",
                }
            )

        return Response(dashboards)


# ---------------------------------------------------------------------------
# Organization-level cross-facility aggregation
# ---------------------------------------------------------------------------


class OrgFacilityDailySummaryViewSet(
    TenantScopedViewMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Cross-facility daily summaries for the user's organization.

    Returns one row per facility per date across all facilities in the
    user's organization.  Only accessible by management / admin roles.
    """

    queryset = FacilityDailySummary.objects.select_related("facility")
    serializer_class = FacilityDailySummarySerializer
    permission_classes = [IsAuthenticated, CanViewAnalytics]
    filterset_class = FacilityDailySummaryFilter
    ordering_fields = ["date", "encounters_total", "revenue_total"]
    ordering = ["-date"]
    tenant_scope = "organization"


class OrgDepartmentMonthlySummaryViewSet(
    TenantScopedViewMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Cross-facility department monthly summaries for the user's organization.
    """

    queryset = DepartmentMonthlySummary.objects.select_related("facility")
    serializer_class = DepartmentMonthlySummarySerializer
    permission_classes = [IsAuthenticated, CanViewAnalytics]
    filterset_class = DepartmentMonthlyFilter
    ordering_fields = ["year", "month", "visit_count", "revenue"]
    ordering = ["-year", "-month"]
    tenant_scope = "organization"


class OrgDiagnosisTrendViewSet(
    TenantScopedViewMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Cross-facility diagnosis trends for the user's organization.
    """

    queryset = DiagnosisTrend.objects.select_related("facility")
    serializer_class = DiagnosisTrendSerializer
    permission_classes = [IsAuthenticated, CanViewAnalytics]
    filterset_class = DiagnosisTrendFilter
    ordering_fields = ["period_start", "case_count"]
    ordering = ["-period_start", "-case_count"]
    tenant_scope = "organization"


class OrgDemographicSnapshotViewSet(
    TenantScopedViewMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Cross-facility patient demographics for the user's organization.
    """

    queryset = PatientDemographicSnapshot.objects.select_related("facility")
    serializer_class = PatientDemographicSnapshotSerializer
    permission_classes = [IsAuthenticated, CanViewAnalytics]
    ordering_fields = ["snapshot_date", "total_patients"]
    ordering = ["-snapshot_date"]
    tenant_scope = "organization"


# ---------------------------------------------------------------------------
# Platform-wide analytics (Nexora superusers only)
# ---------------------------------------------------------------------------


class PlatformFacilityDailySummaryViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Platform-wide facility daily summaries across all tenants.

    Restricted to Nexora superusers.  No tenant scoping — returns all
    rows.  Useful for platform-level dashboards comparing facility
    performance.
    """

    queryset = FacilityDailySummary.objects.select_related("facility")
    serializer_class = FacilityDailySummarySerializer
    permission_classes = [IsAuthenticated, IsSuperUser]
    filterset_class = FacilityDailySummaryFilter
    ordering_fields = ["date", "encounters_total", "revenue_total"]
    ordering = ["-date"]


class PlatformDepartmentMonthlySummaryViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Platform-wide department monthly summaries across all tenants."""

    queryset = DepartmentMonthlySummary.objects.select_related("facility")
    serializer_class = DepartmentMonthlySummarySerializer
    permission_classes = [IsAuthenticated, IsSuperUser]
    filterset_class = DepartmentMonthlyFilter
    ordering_fields = ["year", "month", "visit_count", "revenue"]
    ordering = ["-year", "-month"]


class PlatformDiagnosisTrendViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Platform-wide diagnosis trends across all tenants."""

    queryset = DiagnosisTrend.objects.select_related("facility")
    serializer_class = DiagnosisTrendSerializer
    permission_classes = [IsAuthenticated, IsSuperUser]
    filterset_class = DiagnosisTrendFilter
    ordering_fields = ["period_start", "case_count"]
    ordering = ["-period_start", "-case_count"]


class PlatformDemographicSnapshotViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Platform-wide patient demographics across all tenants."""

    queryset = PatientDemographicSnapshot.objects.select_related("facility")
    serializer_class = PatientDemographicSnapshotSerializer
    permission_classes = [IsAuthenticated, IsSuperUser]
    ordering_fields = ["snapshot_date", "total_patients"]
    ordering = ["-snapshot_date"]
