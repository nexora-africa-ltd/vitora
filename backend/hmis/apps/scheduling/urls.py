"""
URL configuration for scheduling app.

Phase 1: Core Scheduling Foundation
Phase 2: Automatic Assignment Engine
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.scheduling.views import (
    AppointmentViewSet,
    AssignmentDecisionViewSet,
    AssignmentOverrideViewSet,
    AssignmentRuleViewSet,
    AssignmentViewSet,
    ResourceViewSet,
    ScheduleViewSet,
)

router = DefaultRouter()
router.register(r"resources", ResourceViewSet, basename="resource")
router.register(r"schedules", ScheduleViewSet, basename="schedule")
router.register(r"appointments", AppointmentViewSet, basename="appointment")

# Phase 2: Assignment Engine
router.register(r"assignment-rules", AssignmentRuleViewSet, basename="assignment-rule")
router.register(r"assignment-decisions", AssignmentDecisionViewSet, basename="assignment-decision")
router.register(r"assignment-overrides", AssignmentOverrideViewSet, basename="assignment-override")
router.register(r"assignments", AssignmentViewSet, basename="assignment")

app_name = "scheduling"

urlpatterns = [
    path("", include(router.urls)),
]
