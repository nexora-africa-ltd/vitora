"""URL routing for MCH module."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.mch.views import (
    AEFIViewSet,
    ANCVisitViewSet,
    CommunityScreeningViewSet,
    DeliveryViewSet,
    GrowthMeasurementViewSet,
    HEIFollowUpViewSet,
    HEIPCRTestViewSet,
    ImmunizationRecordViewSet,
    LabourPartographObservationViewSet,
    LabourPartographViewSet,
    MCHRegistrationViewSet,
    PNCVisitViewSet,
    VaccineViewSet,
    VitaminASupplementViewSet,
)

app_name = "mch"

router = DefaultRouter()
router.register(r"registrations", MCHRegistrationViewSet, basename="mch-registration")
router.register(r"anc-visits", ANCVisitViewSet, basename="mch-anc-visit")
router.register(r"community-screenings", CommunityScreeningViewSet, basename="mch-community-screening")
router.register(r"deliveries", DeliveryViewSet, basename="mch-delivery")
router.register(r"labour-partographs", LabourPartographViewSet, basename="mch-labour-partograph")
router.register(
    r"labour-partograph-observations",
    LabourPartographObservationViewSet,
    basename="mch-labour-partograph-observation",
)
router.register(r"pnc-visits", PNCVisitViewSet, basename="mch-pnc-visit")
router.register(r"growth-measurements", GrowthMeasurementViewSet, basename="mch-growth")
router.register(r"vaccines", VaccineViewSet, basename="mch-vaccine")
router.register(r"immunizations", ImmunizationRecordViewSet, basename="mch-immunization")
router.register(r"vitamin-a", VitaminASupplementViewSet, basename="mch-vitamin-a")
router.register(r"aefi", AEFIViewSet, basename="mch-aefi")
router.register(r"hei", HEIFollowUpViewSet, basename="mch-hei")
router.register(r"hei-pcr", HEIPCRTestViewSet, basename="mch-hei-pcr")

urlpatterns = [
    path("", include(router.urls)),
]
