"""
WebSocket URL Routing for Imaging App.

Defines WebSocket URL patterns for imaging order real-time updates.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/imaging/(?P<facility_id>\d+)/orders/$",
        consumers.ImagingConsumer.as_asgi(),
    ),
]
