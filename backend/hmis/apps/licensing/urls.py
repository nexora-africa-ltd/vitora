# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
URL routes for the licensing API.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from . import cloud_relay_views, views

router = DefaultRouter()
router.register("installations", views.InstallationViewSet, basename="installation")

urlpatterns = [
    path("activate/", views.activate_installation, name="licensing-activate"),
    path("check-in/", views.check_in, name="licensing-check-in"),
    path("status/", views.license_status, name="licensing-status"),
    path("generate-code/", views.generate_activation_code, name="licensing-generate-code"),
    # Cloud relay endpoints (hubs forward requests here)
    path("cloud/sha/submit/", cloud_relay_views.cloud_sha_submit, name="cloud-sha-submit"),
    path("cloud/sha/preauth/", cloud_relay_views.cloud_sha_preauth, name="cloud-sha-preauth"),
    path(
        "cloud/sha/eligibility/",
        cloud_relay_views.cloud_sha_eligibility,
        name="cloud-sha-eligibility",
    ),
    path("cloud/khis/report/", cloud_relay_views.cloud_khis_report, name="cloud-khis-report"),
] + router.urls
