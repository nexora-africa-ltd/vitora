"""
URL configuration for Disease Surveillance module.

Provides API endpoints for notifiable diseases, cases, alerts,
IDSR weekly reporting, and reporting to county health offices.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CountyReportView,
    IDSRWeeklyReportViewSet,
    IHRNotificationViewSet,
    NotifiableCaseViewSet,
    NotifiableDiseaseViewSet,
    OutbreakThresholdViewSet,
    SurveillanceAlertViewSet,
    SurveillanceDashboardView,
)

app_name = "surveillance"

router = DefaultRouter()
router.register(r"diseases", NotifiableDiseaseViewSet, basename="disease")
router.register(r"cases", NotifiableCaseViewSet, basename="case")
router.register(r"alerts", SurveillanceAlertViewSet, basename="alert")
router.register(r"thresholds", OutbreakThresholdViewSet, basename="threshold")
router.register(r"idsr", IDSRWeeklyReportViewSet, basename="idsr")
router.register(r"ihr", IHRNotificationViewSet, basename="ihr")

urlpatterns = [
    path("", include(router.urls)),
    path("dashboard/", SurveillanceDashboardView.as_view(), name="dashboard"),
    path(
        "reports/county/<int:county_id>/",
        CountyReportView.as_view(),
        name="county-report",
    ),
]
