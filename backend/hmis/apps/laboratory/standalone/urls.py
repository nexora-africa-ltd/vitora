"""URL configuration for standalone LIS operations."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ExternalOrderRequestViewSet, StandaloneOrderViewSet, WalkInPatientViewSet

router = DefaultRouter()
router.register(r"walkin-patients", WalkInPatientViewSet, basename="walkin-patient")
router.register(r"external-orders", ExternalOrderRequestViewSet, basename="external-order")

urlpatterns = [
    path(
        "orders/create/",
        StandaloneOrderViewSet.as_view({"post": "create"}),
        name="standalone-order-create",
    ),
    path("", include(router.urls)),
]
