"""URL configuration for laboratory reporting sub-module."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ActiveBreachesView,
    SLAComplianceReportView,
    TATSLATargetViewSet,
    TATSnapshotViewSet,
    TATTrendReportView,
    TechnicianEfficiencyView,
    WorkloadKPIReportView,
    WorkloadSnapshotViewSet,
)

router = DefaultRouter()
router.register(r"sla-targets", TATSLATargetViewSet, basename="sla-target")
router.register(r"tat-snapshots", TATSnapshotViewSet, basename="tat-snapshot")
router.register(r"workload-snapshots", WorkloadSnapshotViewSet, basename="workload-snapshot")

urlpatterns = [
    path("sla-compliance/", SLAComplianceReportView.as_view(), name="sla-compliance"),
    path("tat-trend/", TATTrendReportView.as_view(), name="tat-trend"),
    path("active-breaches/", ActiveBreachesView.as_view(), name="active-breaches"),
    path(
        "technician-efficiency/", TechnicianEfficiencyView.as_view(), name="technician-efficiency"
    ),
    path("workload-kpi/", WorkloadKPIReportView.as_view(), name="workload-kpi"),
    path("", include(router.urls)),
]
