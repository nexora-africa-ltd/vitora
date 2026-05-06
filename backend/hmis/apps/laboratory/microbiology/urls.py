"""URL configuration for laboratory microbiology sub-module."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AntibiogramViewSet,
    AntibioticSensitivityViewSet,
    AntibioticViewSet,
    CultureResultViewSet,
    OrganismViewSet,
    WHONETExportView,
)

router = DefaultRouter()
router.register(r"organisms", OrganismViewSet, basename="organism")
router.register(r"antibiotics", AntibioticViewSet, basename="antibiotic")
router.register(r"cultures", CultureResultViewSet, basename="culture")
router.register(r"sensitivities", AntibioticSensitivityViewSet, basename="sensitivity")
router.register(r"antibiogram", AntibiogramViewSet, basename="antibiogram")

urlpatterns = [
    path("whonet-export/", WHONETExportView.as_view(), name="whonet-export"),
    path("", include(router.urls)),
]
