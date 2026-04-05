"""URL configuration for the immunizations app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.immunizations.views import (
    AEFIViewSet,
    CoverageView,
    ImmunizationRecordViewSet,
    VaccineCampaignViewSet,
    VaccineDefinitionViewSet,
)

app_name = "immunizations"

router = DefaultRouter()
router.register(r"vaccines", VaccineDefinitionViewSet, basename="vaccine-definition")
router.register(r"records", ImmunizationRecordViewSet, basename="immunization-record")
router.register(r"campaigns", VaccineCampaignViewSet, basename="vaccine-campaign")
router.register(r"aefi", AEFIViewSet, basename="aefi")

urlpatterns = [
    path("", include(router.urls)),
    path("coverage/", CoverageView.as_view(), name="coverage"),
]
