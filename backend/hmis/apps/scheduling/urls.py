"""
URL configuration for scheduling app.

Phase 1: Core Scheduling Foundation
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.scheduling.views import (
    AppointmentViewSet,
    ResourceViewSet,
    ScheduleViewSet,
)

router = DefaultRouter()
router.register(r"resources", ResourceViewSet, basename="resource")
router.register(r"schedules", ScheduleViewSet, basename="schedule")
router.register(r"appointments", AppointmentViewSet, basename="appointment")

app_name = "scheduling"

urlpatterns = [
    path("", include(router.urls)),
]
