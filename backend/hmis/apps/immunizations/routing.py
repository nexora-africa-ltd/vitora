# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
WebSocket URL Routing for Immunizations App.

Defines WebSocket URL patterns for immunization real-time updates.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/immunizations/(?P<facility_id>\d+)/records/$",
        consumers.ImmunizationConsumer.as_asgi(),
    ),
]
