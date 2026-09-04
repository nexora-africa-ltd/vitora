# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""URL configuration for standalone LIS operations."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ExternalOrderRequestViewSet,
    ExternalPatientIdentifierCrosswalkViewSet,
    InboundIngestionEventViewSet,
    InteropInboundViewSet,
    LISMessageMappingViewSet,
    ResultDeliveryLogViewSet,
    StandaloneOrderViewSet,
    WalkInPatientViewSet,
    standalone_onboarding_import_analyzer_channel,
    standalone_onboarding_import_reference_ranges,
    standalone_onboarding_import_specimen_workflow,
    standalone_onboarding_import_test_catalog,
    standalone_onboarding_seed_defaults,
    standalone_onboarding_status,
    standalone_onboarding_template_download,
)

router = DefaultRouter()
router.register(r"walkin-patients", WalkInPatientViewSet, basename="walkin-patient")
router.register(r"external-orders", ExternalOrderRequestViewSet, basename="external-order")
router.register(r"interop/inbound-events", InboundIngestionEventViewSet, basename="inbound-event")
router.register(r"interop/crosswalk", ExternalPatientIdentifierCrosswalkViewSet, basename="xwalk")
router.register(r"interop/delivery-logs", ResultDeliveryLogViewSet, basename="result-delivery-log")
router.register(r"interop/mappings", LISMessageMappingViewSet, basename="interop-mapping")

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
        "onboarding/import/specimen-workflow/",
        standalone_onboarding_import_specimen_workflow,
        name="standalone-lis-onboarding-import-specimen-workflow",
    ),
    path(
        "onboarding/import/analyzer-channel/",
        standalone_onboarding_import_analyzer_channel,
        name="standalone-lis-onboarding-import-analyzer-channel",
    ),
    path(
        "onboarding/import/reference-ranges/",
        standalone_onboarding_import_reference_ranges,
        name="standalone-lis-onboarding-import-reference-ranges",
    ),
    path(
        "orders/create/",
        StandaloneOrderViewSet.as_view({"post": "create"}),
        name="standalone-order-create",
    ),
    path(
        "interop/inbound-orders/",
        InteropInboundViewSet.as_view({"post": "create"}),
        name="standalone-interop-inbound-orders",
    ),
    path("", include(router.urls)),
]
