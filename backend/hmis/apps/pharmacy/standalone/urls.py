"""URL configuration for standalone Pharmacy operations."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ExternalPrescriptionRequestViewSet,
    StandalonePrescriptionViewSet,
    WalkInCustomerViewSet,
)

router = DefaultRouter()
router.register(r"walkin-customers", WalkInCustomerViewSet, basename="walkin-customer")
router.register(
    r"external-prescriptions",
    ExternalPrescriptionRequestViewSet,
    basename="external-prescription",
)

urlpatterns = [
    path(
        "prescriptions/create/",
        StandalonePrescriptionViewSet.as_view({"post": "create"}),
        name="standalone-prescription-create",
    ),
    path("", include(router.urls)),
]
