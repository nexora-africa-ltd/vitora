"""
URL configuration for inpatient app.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdmissionRecommendationViewSet,
    AdmissionViewSet,
    BedViewSet,
    DischargeViewSet,
    NursingKardexViewSet,
    ShiftHandoverViewSet,
    SupervisorAlertViewSet,
    TransferViewSet,
    WardRoundViewSet,
    WardViewSet,
)

app_name = "inpatient"

# Create router for inpatient endpoints
router = DefaultRouter()
router.register(r"wards", WardViewSet, basename="ward")
router.register(r"beds", BedViewSet, basename="bed")
router.register(
    r"admission-recommendations",
    AdmissionRecommendationViewSet,
    basename="admission-recommendation",
)
router.register(r"admissions", AdmissionViewSet, basename="admission")
router.register(r"discharges", DischargeViewSet, basename="discharge")
router.register(r"transfers", TransferViewSet, basename="transfer")
router.register(r"ward-rounds", WardRoundViewSet, basename="ward-round")
router.register(r"kardex", NursingKardexViewSet, basename="kardex")
router.register(r"shift-handovers", ShiftHandoverViewSet, basename="shift-handover")

urlpatterns = [
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
