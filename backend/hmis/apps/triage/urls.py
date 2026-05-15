"""
URL configuration for Triage app.

Sprint 1.5-1.6 Track E: Triage Module MVP - Phase 5
Phase 4: Auto-Escalation & Alerts
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ERBedViewSet,
    EscalationViewSet,
    PublicTriageQueueView,
    ReportExportView,
    TriageAssessmentViewSet,
    TriageQueueViewSet,
    TriageReportSummaryView,
    TriageSettingsViewSet,
    VitalThresholdsViewSet,
    VolumeReportView,
    WaitingQueueViewSet,
    WaitTimeBreachViewSet,
    WaitTimesReportView,
)

router = DefaultRouter()
router.register(r"assessments", TriageAssessmentViewSet, basename="triageassessment")
router.register(r"queue", TriageQueueViewSet, basename="triagequeue")
router.register(r"waiting", WaitingQueueViewSet, basename="waitingqueue")
router.register(r"vital-thresholds", VitalThresholdsViewSet, basename="vitalthreshold")
router.register(r"er-beds", ERBedViewSet, basename="erbed")
router.register(r"breaches", WaitTimeBreachViewSet, basename="waittimebreach")
router.register(r"escalations", EscalationViewSet, basename="escalation")
router.register(r"settings", TriageSettingsViewSet, basename="triagesettings")

app_name = "triage"

urlpatterns = [
    # Public queue display (no auth)
    path(
        "public-queue/",
        PublicTriageQueueView.as_view({"get": "list"}),
        name="triage-public-queue",
    ),
    # Report endpoints
    path("reports/", TriageReportSummaryView.as_view(), name="triage-report-summary"),
    path("reports/wait-times/", WaitTimesReportView.as_view(), name="wait-times-report"),
    path("reports/volume/", VolumeReportView.as_view(), name="volume-report"),
    path("reports/export/", ReportExportView.as_view(), name="report-export"),
    path("", include(router.urls)),
]
