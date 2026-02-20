"""
WebSocket URL Routing for Triage/Emergency App.

Defines WebSocket URL patterns for emergency queue real-time updates.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/emergency/queue/$",
        consumers.EmergencyQueueConsumer.as_asgi(),
    ),
]
