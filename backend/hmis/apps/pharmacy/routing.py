# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
WebSocket URL Routing for Pharmacy App.

Defines WebSocket URL patterns for pharmacy queue real-time updates.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/pharmacy/(?P<facility_id>\d+)/queue/$",
        consumers.PharmacyQueueConsumer.as_asgi(),
    ),
]
