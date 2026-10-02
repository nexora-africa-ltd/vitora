# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""URL configuration for Quality Measures & Reporting API."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AnnualReportViewSet,
    BenchmarkDataView,
    FacilitySDMXConfigurationViewSet,
    QualityDashboardView,
    QualityMeasureResultViewSet,
    QualityMeasureViewSet,
    QuarterlyReportViewSet,
    SDMXCodeMappingViewSet,
    SDMXContractViewSet,
    SDMXImportView,
)

app_name = "quality"

router = DefaultRouter()
router.register(r"quarterly-reports", QuarterlyReportViewSet, basename="quarterly-report")
router.register(r"annual-reports", AnnualReportViewSet, basename="annual-report")
router.register(r"measures", QualityMeasureViewSet, basename="quality-measure")
router.register(r"results", QualityMeasureResultViewSet, basename="quality-measure-result")
sdmx_router = DefaultRouter()
sdmx_router.register(r"contracts", SDMXContractViewSet, basename="sdmx-contract")
sdmx_router.register(r"mappings", SDMXCodeMappingViewSet, basename="sdmx-mapping")
sdmx_router.register(
    r"facility-configs",
    FacilitySDMXConfigurationViewSet,
    basename="sdmx-facility-config",
)

urlpatterns = [
    path("dashboard/", QualityDashboardView.as_view(), name="quality-dashboard"),
    path("sdmx/import/", SDMXImportView.as_view(), name="sdmx-import"),
    path("sdmx/", include(sdmx_router.urls)),
    path("benchmarks/", BenchmarkDataView.as_view(), name="benchmark-list"),
    path("", include(router.urls)),
]
