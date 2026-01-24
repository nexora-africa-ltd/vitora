"""
WebSocket URL Routing for Clinics App.

Defines WebSocket URL patterns for clinic queue real-time updates.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/clinics/(?P<clinic_id>\d+)/queue/$",
        consumers.ClinicQueueConsumer.as_asgi(),
    ),
]
