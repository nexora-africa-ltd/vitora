"""URL configuration for the immunizations app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.immunizations.views import (
    AEFIViewSet,
    ColdChainEquipmentViewSet,
    CoverageView,
    ImmunizationRecordViewSet,
    TemperatureLogViewSet,
    VaccineCampaignViewSet,
    VaccineDefinitionViewSet,
    VaccineIncidentViewSet,
    VaccineStockViewSet,
)

app_name = "immunizations"

router = DefaultRouter()
router.register(r"vaccines", VaccineDefinitionViewSet, basename="vaccine-definition")
router.register(r"records", ImmunizationRecordViewSet, basename="immunization-record")
router.register(r"campaigns", VaccineCampaignViewSet, basename="vaccine-campaign")
router.register(r"aefi", AEFIViewSet, basename="aefi")
router.register(r"stock", VaccineStockViewSet, basename="vaccine-stock")
router.register(r"cold-chain", ColdChainEquipmentViewSet, basename="cold-chain-equipment")
router.register(r"temperature-logs", TemperatureLogViewSet, basename="temperature-log")
router.register(r"incidents", VaccineIncidentViewSet, basename="vaccine-incident")

urlpatterns = [
    path("", include(router.urls)),
    path("coverage/", CoverageView.as_view(), name="coverage"),
]
