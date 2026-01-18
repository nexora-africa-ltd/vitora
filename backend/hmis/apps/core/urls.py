"""
URL configuration for core app.
"""

from django.urls import path
from rest_framework import routers

from .dashboard_views import dashboard_stats, patient_volume_history, revenue_breakdown
from .views import (
    AuditLogViewSet,
    DepartmentViewSet,
    NotificationViewSet,
    RoleViewSet,
    StaffProfileViewSet,
    generate_case_number_view,
    generate_prc_number_view,
)

router = routers.DefaultRouter()
router.register(r"auditlogs", AuditLogViewSet, basename="auditlog")
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"staff", StaffProfileViewSet, basename="staffprofile")
router.register(r"notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    # Dashboard statistics
    path("dashboard/stats/", dashboard_stats, name="dashboard-stats"),
    path("dashboard/patient-volume/", patient_volume_history, name="dashboard-patient-volume"),
    path("dashboard/revenue-breakdown/", revenue_breakdown, name="dashboard-revenue-breakdown"),
    # Case number generation endpoints
    path("generate/prc-number/", generate_prc_number_view, name="generate-prc-number"),
    path("generate/case-number/", generate_case_number_view, name="generate-case-number"),
] + router.urls
