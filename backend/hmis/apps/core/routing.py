"""
WebSocket URL Routing for Core App (Dashboard + Notifications).

Defines WebSocket URL patterns for dashboard projection broadcasts
and per-user notification delivery.
"""

from django.urls import re_path

from hmis.apps.core.websockets.dashboard import DashboardConsumer
from hmis.apps.core.websockets.notifications import NotificationConsumer

websocket_urlpatterns = [
    re_path(
        r"ws/dashboard/(?P<facility_id>\d+)/$",
        DashboardConsumer.as_asgi(),
    ),
    re_path(
        r"ws/notifications/$",
        NotificationConsumer.as_asgi(),
    ),
]
