# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""URL configuration for standalone LIS operations."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ExternalOrderRequestViewSet,
    StandaloneOrderViewSet,
    WalkInPatientViewSet,
    standalone_onboarding_import_test_catalog,
    standalone_onboarding_seed_defaults,
    standalone_onboarding_status,
    standalone_onboarding_template_download,
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
        "onboarding/templates/<str:template_name>/",
        standalone_onboarding_template_download,
        name="standalone-lis-onboarding-template-download",
    ),
    path(
        "onboarding/import/test-catalog/",
        standalone_onboarding_import_test_catalog,
        name="standalone-lis-onboarding-import-test-catalog",
    ),
    path(
        "orders/create/",
        StandaloneOrderViewSet.as_view({"post": "create"}),
        name="standalone-order-create",
    ),
    path("", include(router.urls)),
]
