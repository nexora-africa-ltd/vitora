"""
URL configuration for Disease Surveillance module.

Provides API endpoints for notifiable diseases, cases, alerts,
and reporting to county health offices.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CountyReportView,
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

urlpatterns = [
    path("", include(router.urls)),
    path("dashboard/", SurveillanceDashboardView.as_view(), name="dashboard"),
    path(
        "reports/county/<int:county_id>/",
        CountyReportView.as_view(),
        name="county-report",
    ),
]
