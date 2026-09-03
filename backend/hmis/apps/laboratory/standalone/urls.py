# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""URL configuration for standalone LIS operations."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ExternalOrderRequestViewSet,
    StandaloneOrderViewSet,
    WalkInPatientViewSet,
    standalone_onboarding_seed_defaults,
    standalone_onboarding_status,
)

router = DefaultRouter()
router.register(r"walkin-patients", WalkInPatientViewSet, basename="walkin-patient")
router.register(r"external-orders", ExternalOrderRequestViewSet, basename="external-order")

urlpatterns = [
    path(
        "onboarding/status/",
        standalone_onboarding_status,
        name="standalone-lis-onboarding-status",
    ),
    path(
        "onboarding/seed-defaults/",
        standalone_onboarding_seed_defaults,
        name="standalone-lis-onboarding-seed-defaults",
    ),
    path(
        "orders/create/",
        StandaloneOrderViewSet.as_view({"post": "create"}),
        name="standalone-order-create",
    ),
    path("", include(router.urls)),
]
