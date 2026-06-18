# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""URL configuration for hub endpoints."""

from django.urls import path

from .hub_views import check_wipe_status, hub_health, request_remote_wipe, sync_now

urlpatterns = [
    path("health/", hub_health, name="hub-health"),
    path("sync-now/", sync_now, name="hub-sync-now"),
    path("wipe/", request_remote_wipe, name="hub-remote-wipe"),
    path("wipe-check/", check_wipe_status, name="hub-wipe-check"),
]
