"""URL configuration for Quality Measures & Reporting API."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AnnualReportViewSet,
    QualityDashboardView,
    QualityMeasureResultViewSet,
    QualityMeasureViewSet,
    QuarterlyReportViewSet,
)

app_name = "quality"

router = DefaultRouter()
router.register(r"quarterly-reports", QuarterlyReportViewSet, basename="quarterly-report")
router.register(r"annual-reports", AnnualReportViewSet, basename="annual-report")
router.register(r"measures", QualityMeasureViewSet, basename="quality-measure")
router.register(r"results", QualityMeasureResultViewSet, basename="quality-measure-result")

urlpatterns = [
    path("dashboard/", QualityDashboardView.as_view(), name="quality-dashboard"),
    path("", include(router.urls)),
]
