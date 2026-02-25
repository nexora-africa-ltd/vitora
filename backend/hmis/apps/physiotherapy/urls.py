"""
URL configuration for the physiotherapy module.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.physiotherapy.views import (
    PhysiotherapyOrderViewSet,
    PhysiotherapySessionViewSet,
    PhysiotherapyTreatmentTypeViewSet,
)

app_name = "physiotherapy"

router = DefaultRouter()
router.register(r"treatment-types", PhysiotherapyTreatmentTypeViewSet, basename="treatment-type")
router.register(r"orders", PhysiotherapyOrderViewSet, basename="order")
router.register(r"sessions", PhysiotherapySessionViewSet, basename="session")

urlpatterns = [
    path("", include(router.urls)),
]
