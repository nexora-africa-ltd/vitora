"""
URL configuration for the occupational therapy module.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.occupational_therapy.views import (
    OccupationalTherapyOrderViewSet,
    OTSessionViewSet,
    OTTreatmentTypeViewSet,
)

app_name = "occupational_therapy"

router = DefaultRouter()
router.register(r"treatment-types", OTTreatmentTypeViewSet, basename="treatment-type")
router.register(r"orders", OccupationalTherapyOrderViewSet, basename="order")
router.register(r"sessions", OTSessionViewSet, basename="session")

urlpatterns = [
    path("", include(router.urls)),
]
