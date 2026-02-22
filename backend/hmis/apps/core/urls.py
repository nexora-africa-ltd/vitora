"""
URL configuration for core app.
"""

from django.urls import include, path
from rest_framework import routers

from .dashboard_views import (
    activity_feed,
    dashboard_stats,
    patient_volume_history,
    revenue_breakdown,
)
from .views import (
    AuditLogViewSet,
    DepartmentViewSet,
    FrontendEventViewSet,
    NotificationViewSet,
    RoleViewSet,
    StaffProfileViewSet,
    generate_case_number_view,
    generate_prc_number_view,
    verify_document,
)

router = routers.DefaultRouter()
router.register(r"auditlogs", AuditLogViewSet, basename="auditlog")
router.register(r"events", FrontendEventViewSet, basename="frontendevent")
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"staff", StaffProfileViewSet, basename="staffprofile")
router.register(r"notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    # Dashboard statistics
    path("dashboard/stats/", dashboard_stats, name="dashboard-stats"),
    path("dashboard/patient-volume/", patient_volume_history, name="dashboard-patient-volume"),
    path("dashboard/revenue-breakdown/", revenue_breakdown, name="dashboard-revenue-breakdown"),
    path("dashboard/activity-feed/", activity_feed, name="dashboard-activity-feed"),
    # Case number generation endpoints
    path("generate/prc-number/", generate_prc_number_view, name="generate-prc-number"),
    path("generate/case-number/", generate_case_number_view, name="generate-case-number"),
    # Public document verification (no auth required)
    path("verify/", verify_document, name="verify-document"),
    # Emergency access (break-glass)
    path("emergency-access/", include("hmis.apps.core.emergency_access.urls")),
] + router.urls
