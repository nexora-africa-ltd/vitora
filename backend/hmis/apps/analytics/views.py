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
# Superset Embedded Analytics (replaces Metabase)
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)


class _SupersetTokenCache:
    """Cache Superset admin session to avoid login on every request."""

    _access_token: str = ""
    _csrf_token: str = ""
    _session: http_requests.Session | None = None
    _expires_at: float = 0.0

    @classmethod
    def get_tokens(cls) -> tuple[str, str]:
        """Return (access_token, csrf_token), refreshing if expired."""
        if cls._access_token and cls._session and time.time() < cls._expires_at:
            return cls._access_token, cls._csrf_token

        base_url = getattr(settings, "SUPERSET_URL", "").rstrip("/")
        username = getattr(settings, "SUPERSET_ADMIN_USERNAME", "admin")
        password = getattr(settings, "SUPERSET_ADMIN_PASSWORD", "admin")

        if not base_url:
            raise ValueError("SUPERSET_URL is not configured")

        # Use a session to maintain cookies (CSRF requires session cookie)
        cls._session = http_requests.Session()

        # 1. Login to get access token
        login_resp = cls._session.post(
            f"{base_url}/api/v1/security/login",
            json={
                "username": username,
                "password": password,
                "provider": "db",
            },
            timeout=10,
        )
        login_resp.raise_for_status()
        cls._access_token = login_resp.json()["access_token"]
        cls._session.headers.update(
            {
                "Authorization": f"Bearer {cls._access_token}",
            }
        )

        # 2. Get CSRF token (also sets the session cookie)
        csrf_resp = cls._session.get(
            f"{base_url}/api/v1/security/csrf_token/",
            timeout=10,
        )
        csrf_resp.raise_for_status()
        cls._csrf_token = csrf_resp.json()["result"]

        # Cache for 4 minutes (Superset default token TTL is 5 min)
        cls._expires_at = time.time() + 240
        return cls._access_token, cls._csrf_token

    @classmethod
    def get_session(cls) -> http_requests.Session:
        """Return the authenticated session, refreshing if needed."""
        if not cls._session or time.time() >= cls._expires_at:
            cls.get_tokens()
        assert cls._session is not None
        return cls._session

    @classmethod
    def invalidate(cls) -> None:
        cls._access_token = ""
        cls._csrf_token = ""
        cls._session = None
        cls._expires_at = 0.0


class SupersetGuestTokenView(APIView):
    """
    Generate a Superset guest token for embedded dashboard viewing.

    ``GET /api/analytics/superset-guest-token/?dashboard_id=1``

    Returns ``{ "guest_token": "...", "instance_url": "https://..." }``

    The guest token includes row-level security (RLS) rules that filter
    data by the requesting user's ``facility_id``, ensuring tenant isolation.
    """

    permission_classes = [IsAuthenticated, CanViewAnalytics]

    def get(self, request: Request) -> Response:
        dashboard_id = request.query_params.get("dashboard_id")
        if not dashboard_id:
            return Response(
                {"detail": "dashboard_id query parameter is required."},
                status=400,
            )

        try:
            dashboard_id = int(dashboard_id)
            if dashboard_id < 1:
                raise ValueError
        except (ValueError, TypeError):
            return Response(
                {"detail": "dashboard_id must be a positive integer."},
                status=400,
            )

        base_url = getattr(settings, "SUPERSET_URL", "").rstrip("/")
        if not base_url:
            return Response(
                {"detail": "Superset embedding is not configured."},
                status=503,
            )

        # Resolve facility_id and organization_id from the requesting user's profile
        facility_id = None
        organization_id = None
        profile = getattr(request.user, "staff_profile", None)
        if profile:
            if getattr(profile, "primary_facility_id", None):
                facility_id = profile.primary_facility_id
            if getattr(profile, "organization_id", None):
                organization_id = profile.organization_id

        # Build RLS rules for tenant isolation.
        # Superset applies ALL rules with AND logic per dataset.
        # We send both facility and org clauses — each dataset will only
        # match the column it actually has (Superset ignores clauses that
        # reference non-existent columns in a given dataset).
        rls_rules = []
        if facility_id:
            rls_rules.append({"clause": f"facility_id = {int(facility_id)}"})
        if organization_id:
            rls_rules.append({"clause": f"organization_id = {int(organization_id)}"})

        try:
            access_token, csrf_token = _SupersetTokenCache.get_tokens()
            superset_session = _SupersetTokenCache.get_session()
        except (http_requests.RequestException, ValueError, KeyError):
            logger.exception("Failed to authenticate with Superset")
            return Response(
                {"detail": "Could not authenticate with Superset."},
                status=502,
            )

        # Fetch the embedded UUID for this dashboard
        try:
            emb_resp = superset_session.get(
                f"{base_url}/api/v1/dashboard/{dashboard_id}/embedded",
                timeout=5,
            )
            if emb_resp.status_code == 200:
                embedded_uuid = emb_resp.json().get("result", {}).get("uuid", "")
            else:
                embedded_uuid = ""
        except http_requests.RequestException:
            embedded_uuid = ""

        if not embedded_uuid:
            return Response(
                {
                    "detail": "Dashboard is not configured for embedding. Enable embedding in Superset first."
                },
                status=400,
            )

        # Request guest token from Superset (session carries cookies + auth)
        try:
            guest_payload = {
                "user": {
                    "username": request.user.username,
                    "first_name": request.user.first_name or request.user.username,
                    "last_name": request.user.last_name or "",
                },
                "resources": [
                    {"type": "dashboard", "id": embedded_uuid},
                ],
                "rls": rls_rules,
            }
            guest_resp = superset_session.post(
                f"{base_url}/api/v1/security/guest_token/",
                json=guest_payload,
                headers={
                    "X-CSRFToken": csrf_token,
                    "Referer": base_url,
                },
                timeout=10,
            )
            if guest_resp.status_code == 401:
                # Token expired, retry once
                _SupersetTokenCache.invalidate()
                access_token, csrf_token = _SupersetTokenCache.get_tokens()
                superset_session = _SupersetTokenCache.get_session()
                guest_resp = superset_session.post(
                    f"{base_url}/api/v1/security/guest_token/",
                    json=guest_payload,
                    headers={
                        "X-CSRFToken": csrf_token,
                        "Referer": base_url,
                    },
                    timeout=10,
                )
            if not guest_resp.ok:
                logger.error(
                    "Superset guest_token returned %d: %s",
                    guest_resp.status_code,
                    guest_resp.text[:500],
                )
            guest_resp.raise_for_status()
        except http_requests.RequestException:
            logger.exception("Failed to obtain Superset guest token")
            return Response(
                {"detail": "Could not obtain guest token from Superset."},
                status=502,
            )

        guest_token = guest_resp.json().get("token", "")
        if not guest_token:
            return Response(
                {"detail": "Superset returned an empty guest token."},
                status=502,
            )

        logger.info(
            "Superset guest token generated for user=%s dashboard=%d facility=%s",
            request.user.pk,
            dashboard_id,
            facility_id,
        )

        return Response(
            {
                "guest_token": guest_token,
                "instance_url": base_url,
            }
        )


class SupersetDashboardListView(APIView):
    """
    List Superset dashboards available for embedding.

    ``GET /api/analytics/superset-dashboards/``

    Proxies the Superset API to fetch published dashboards.
    Only returns dashboards that are published (``published=true``).
    """

    permission_classes = [IsAuthenticated, CanViewAnalytics]

    def get(self, request: Request) -> Response:
        base_url = getattr(settings, "SUPERSET_URL", "").rstrip("/")
        if not base_url:
            return Response(
                {"detail": "Superset is not configured."},
                status=503,
            )

        try:
            access_token, _ = _SupersetTokenCache.get_tokens()
            superset_session = _SupersetTokenCache.get_session()
        except (http_requests.RequestException, ValueError, KeyError):
            logger.exception("Failed to authenticate with Superset")
            return Response(
                {"detail": "Could not authenticate with Superset."},
                status=502,
            )

        try:
            resp = superset_session.get(
                f"{base_url}/api/v1/dashboard/",
                params={
                    "q": "(filters:!((col:published,opr:eq,value:!t)))",
                    "page_size": 100,
                },
                timeout=10,
            )
            if resp.status_code == 401:
                _SupersetTokenCache.invalidate()
                access_token, _ = _SupersetTokenCache.get_tokens()
                superset_session = _SupersetTokenCache.get_session()
                resp = superset_session.get(
                    f"{base_url}/api/v1/dashboard/",
                    params={
                        "q": "(filters:!((col:published,opr:eq,value:!t)))",
                        "page_size": 100,
                    },
                    timeout=10,
                )
            resp.raise_for_status()
        except http_requests.RequestException:
            logger.exception("Failed to fetch dashboards from Superset")
            return Response(
                {"detail": "Could not reach Superset."},
                status=502,
            )

        dashboards = []
        for d in resp.json().get("result", []):
            dash_id = d["id"]
            # Fetch the embedded UUID for this dashboard
            embedded_id = ""
            try:
                emb_resp = superset_session.get(
                    f"{base_url}/api/v1/dashboard/{dash_id}/embedded",
                    timeout=5,
                )
                if emb_resp.status_code == 200:
                    result = emb_resp.json().get("result", {})
                    embedded_id = result.get("uuid", "")
            except http_requests.RequestException:
                pass  # Dashboard not configured for embedding

            dashboards.append(
                {
                    "id": dash_id,
                    "name": d.get("dashboard_title", ""),
                    "description": d.get("description") or "",
                    "embedded_id": embedded_id,
                }
            )

        return Response(dashboards)


# Legacy Metabase endpoints (kept for backward compat during migration)


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
                "facility_id": [facility_id] if facility_id else [],
            },
            "_embedding_params": {
                "facility_id": "locked",
            },
            "iat": int(time.time()),
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

        return Response(
            {
                "embed_url": embed_url,
                "token": token,
                "instance_url": site_url.rstrip("/"),
            }
        )


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
        api_url = getattr(settings, "METABASE_API_URL", "") or getattr(
            settings, "METABASE_SITE_URL", ""
        )
        mb_api_key = getattr(settings, "METABASE_API_KEY", "")

        if not api_url:
            return Response(
                {"detail": "Metabase is not configured."},
                status=503,
            )

        try:
            headers = {}
            if mb_api_key:
                headers["x-api-key"] = mb_api_key
            resp = http_requests.get(
                f"{api_url.rstrip('/')}/api/dashboard",
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
