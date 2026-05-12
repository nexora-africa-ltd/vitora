"""Analytics URL configuration."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from hmis.apps.analytics import views

app_name = "analytics"

router = DefaultRouter()

# --- Facility-level (default) ---
router.register(r"facility-summary", views.FacilityDailySummaryViewSet, basename="facility-summary")
router.register(
    r"department-performance",
    views.DepartmentMonthlySummaryViewSet,
    basename="department-performance",
)
router.register(r"diagnosis-trends", views.DiagnosisTrendViewSet, basename="diagnosis-trends")
router.register(r"demographics", views.PatientDemographicSnapshotViewSet, basename="demographics")

# --- Organization-level (cross-facility) ---
router.register(
    r"org/facility-summary",
    views.OrgFacilityDailySummaryViewSet,
    basename="org-facility-summary",
)
router.register(
    r"org/department-performance",
    views.OrgDepartmentMonthlySummaryViewSet,
    basename="org-department-performance",
)
router.register(
    r"org/diagnosis-trends",
    views.OrgDiagnosisTrendViewSet,
    basename="org-diagnosis-trends",
)
router.register(
    r"org/demographics",
    views.OrgDemographicSnapshotViewSet,
    basename="org-demographics",
)

# --- Platform-wide (Nexora superusers) ---
router.register(
    r"platform/facility-summary",
    views.PlatformFacilityDailySummaryViewSet,
    basename="platform-facility-summary",
)
router.register(
    r"platform/department-performance",
    views.PlatformDepartmentMonthlySummaryViewSet,
    basename="platform-department-performance",
)
router.register(
    r"platform/diagnosis-trends",
    views.PlatformDiagnosisTrendViewSet,
    basename="platform-diagnosis-trends",
)
router.register(
    r"platform/demographics",
    views.PlatformDemographicSnapshotViewSet,
    basename="platform-demographics",
)

urlpatterns = [
    # Superset (primary)
    path(
        "superset-guest-token/",
        views.SupersetGuestTokenView.as_view(),
        name="superset-guest-token",
    ),
    path(
        "superset-dashboards/",
        views.SupersetDashboardListView.as_view(),
        name="superset-dashboards",
    ),
    # Legacy Metabase (kept for backward compat)
    path("metabase-embed/", views.MetabaseEmbedView.as_view(), name="metabase-embed"),
    path(
        "metabase-dashboards/",
        views.MetabaseDashboardListView.as_view(),
        name="metabase-dashboards",
    ),
] + router.urls
