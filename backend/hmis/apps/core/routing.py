"""
WebSocket URL Routing for Core App (Dashboard).

Defines WebSocket URL patterns for dashboard projection broadcasts.
"""

from django.urls import re_path

from hmis.apps.core.websockets.dashboard import DashboardConsumer

websocket_urlpatterns = [
    re_path(
        r"ws/dashboard/(?P<facility_id>\d+)/$",
        DashboardConsumer.as_asgi(),
    ),
]
