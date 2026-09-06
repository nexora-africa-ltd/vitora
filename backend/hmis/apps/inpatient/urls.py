# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
URL configuration for inpatient app.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdmissionRecommendationViewSet,
    AdmissionViewSet,
    AdverseTransfusionReactionViewSet,
    BedAssignmentRequestViewSet,
    BedViewSet,
    BloodTransfusionViewSet,
    BPMonitoringViewSet,
    DischargeTemplateViewSet,
    DischargeViewSet,
    FluidBalanceEntryViewSet,
    FluidBalanceSheetViewSet,
    InterFacilityTransferViewSet,
    MedicationAdministrationViewSet,
    NursingKardexViewSet,
    ReviewRequestViewSet,
    ShiftHandoverViewSet,
    SupervisorAlertViewSet,
    TemperatureReadingViewSet,
    TransferViewSet,
    WardRoundViewSet,
    WardViewSet,
)
from .views_discharge_readiness import DischargeReadinessSummaryView

app_name = "inpatient"

# Create router for inpatient endpoints
router = DefaultRouter()
router.register(r"wards", WardViewSet, basename="ward")
router.register(r"beds", BedViewSet, basename="bed")
router.register(
    r"bed-assignment-requests",
    BedAssignmentRequestViewSet,
    basename="bed-assignment-request",
)
router.register(
    r"admission-recommendations",
    AdmissionRecommendationViewSet,
    basename="admission-recommendation",
)
router.register(r"admissions", AdmissionViewSet, basename="admission")
router.register(r"discharges", DischargeViewSet, basename="discharge")
router.register(r"discharge-templates", DischargeTemplateViewSet, basename="discharge-template")
router.register(
    r"inter-facility-transfers",
    InterFacilityTransferViewSet,
    basename="inter-facility-transfer",
)
router.register(r"transfers", TransferViewSet, basename="transfer")
router.register(r"ward-rounds", WardRoundViewSet, basename="ward-round")
router.register(r"review-requests", ReviewRequestViewSet, basename="review-request")
router.register(r"kardex", NursingKardexViewSet, basename="kardex")
router.register(r"shift-handovers", ShiftHandoverViewSet, basename="shift-handover")
router.register(r"temperature-readings", TemperatureReadingViewSet, basename="temperature-reading")
router.register(r"fluid-balance-sheets", FluidBalanceSheetViewSet, basename="fluid-balance-sheet")
router.register(r"fluid-balance-entries", FluidBalanceEntryViewSet, basename="fluid-balance-entry")
router.register(r"blood-transfusions", BloodTransfusionViewSet, basename="blood-transfusion")
router.register(
    r"adverse-transfusion-reactions",
    AdverseTransfusionReactionViewSet,
    basename="adverse-transfusion-reaction",
)
router.register(r"bp-readings", BPMonitoringViewSet, basename="bp-reading")
router.register(
    r"medication-administrations",
    MedicationAdministrationViewSet,
    basename="medication-administration",
)

urlpatterns = [
    path(
        "discharge-readiness-summary/",
        DischargeReadinessSummaryView.as_view(),
        name="discharge-readiness-summary",
    ),
    path("", include(router.urls)),
    # Supervisor alerts - explicit paths since it's not a typical resource
    path(
        "supervisor/alerts/",
        SupervisorAlertViewSet.as_view({"get": "list"}),
        name="supervisor-alerts",
    ),
    path(
        "supervisor/alerts/acknowledge/",
        SupervisorAlertViewSet.as_view({"post": "acknowledge"}),
        name="supervisor-alerts-acknowledge",
    ),
    path(
        "supervisor/alerts/metrics/",
        SupervisorAlertViewSet.as_view({"get": "metrics"}),
        name="supervisor-alerts-metrics",
    ),
]
