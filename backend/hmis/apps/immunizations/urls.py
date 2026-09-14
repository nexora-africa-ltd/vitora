# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""URL configuration for the immunizations app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.immunizations.views import (
    AEFIViewSet,
    ColdChainEquipmentViewSet,
    CoverageView,
    FacilityCustomVaccineViewSet,
    FacilityVaccineConfigViewSet,
    ImmunizationRecordViewSet,
    OrganizationVaccineConfigViewSet,
    TemperatureLogViewSet,
    VaccineCampaignViewSet,
    VaccineDefinitionViewSet,
    VaccineIncidentViewSet,
    VaccineStockViewSet,
)

app_name = "immunizations"

router = DefaultRouter()
router.register(r"vaccines", VaccineDefinitionViewSet, basename="vaccine-definition")
router.register(
    r"organization-vaccine-configs",
    OrganizationVaccineConfigViewSet,
    basename="organization-vaccine-config",
)
router.register(
    r"facility-vaccine-configs", FacilityVaccineConfigViewSet, basename="facility-vaccine-config"
)
router.register(
    r"custom-vaccines", FacilityCustomVaccineViewSet, basename="facility-custom-vaccine"
)
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
