"""
WebSocket URL Routing for Surveillance App.

Defines WebSocket URL patterns for surveillance alerts real-time updates.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/surveillance/alerts/$",
        consumers.SurveillanceAlertConsumer.as_asgi(),
    ),
]
