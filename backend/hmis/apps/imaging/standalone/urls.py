"""URL configuration for standalone Imaging operations."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ExternalImagingOrderRequestViewSet,
    StandaloneImagingOrderViewSet,
    WalkInImagingPatientViewSet,
)

router = DefaultRouter()
router.register(r"walkin-patients", WalkInImagingPatientViewSet, basename="walkin-imaging-patient")
router.register(
    r"external-orders",
    ExternalImagingOrderRequestViewSet,
    basename="external-imaging-order",
)

urlpatterns = [
    path(
        "orders/create/",
        StandaloneImagingOrderViewSet.as_view({"post": "create"}),
        name="standalone-imaging-order-create",
    ),
    path("", include(router.urls)),
]
