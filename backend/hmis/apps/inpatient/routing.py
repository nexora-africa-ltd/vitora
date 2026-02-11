"""
WebSocket URL Routing for Inpatient App.

Defines WebSocket URL patterns for ward compatibility and supervisor alerts.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/inpatient/wards/(?P<ward_id>\d+)/$",
        consumers.WardCompatibilityConsumer.as_asgi(),
    ),
    re_path(
        r"ws/inpatient/supervisor/alerts/$",
        consumers.SupervisorAlertConsumer.as_asgi(),
    ),
]
