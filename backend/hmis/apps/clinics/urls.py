"""
URL configuration for Clinic API endpoints.

This module defines URL patterns for:
- Clinic CRUD and queue operations
- ClinicSession management (nested under clinics)
- ClinicVisit operations
- ClinicStaff assignments (nested under clinics)
- ClinicSchedule management (nested under clinics)
- ClinicEnrollment operations
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers

from .views import (
    ClinicEnrollmentViewSet,
    ClinicRoomViewSet,
    ClinicScheduleViewSet,
    ClinicSessionViewSet,
    ClinicStaffViewSet,
    ClinicViewSet,
    ClinicVisitViewSet,
)

# Main router for top-level endpoints
router = DefaultRouter()
router.register(r"clinics", ClinicViewSet, basename="clinic")
router.register(r"clinic-visits", ClinicVisitViewSet, basename="clinicvisit")
router.register(r"clinic-enrollments", ClinicEnrollmentViewSet, basename="clinicenrollment")

# Nested router for clinic-related resources
clinics_router = nested_routers.NestedDefaultRouter(router, r"clinics", lookup="clinic")
clinics_router.register(r"sessions", ClinicSessionViewSet, basename="clinic-sessions")
clinics_router.register(r"staff", ClinicStaffViewSet, basename="clinic-staff")
clinics_router.register(r"schedule", ClinicScheduleViewSet, basename="clinic-schedule")
clinics_router.register(r"rooms", ClinicRoomViewSet, basename="clinic-rooms")

urlpatterns = [
    path("", include(router.urls)),
    path("", include(clinics_router.urls)),
]
