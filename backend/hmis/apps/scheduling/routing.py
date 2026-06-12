# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
WebSocket URL Routing for Scheduling App.

Defines WebSocket URL patterns for scheduling real-time updates.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/scheduling/(?P<facility_id>\d+)/appointments/$",
        consumers.SchedulingConsumer.as_asgi(),
    ),
]
