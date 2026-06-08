"""
WebSocket URL Routing for Core App (Dashboard + Notifications + Sync).

Defines WebSocket URL patterns for dashboard projection broadcasts,
per-user notification delivery, and LAN sync broadcasts.
"""

from django.urls import re_path

from hmis.apps.core.websockets.dashboard import DashboardConsumer
from hmis.apps.core.websockets.notifications import NotificationConsumer
from hmis.apps.core.websockets.sync import SyncConsumer

websocket_urlpatterns = [
    re_path(
        r"ws/dashboard/(?P<facility_id>\d+)/$",
        DashboardConsumer.as_asgi(),
    ),
    re_path(
        r"ws/notifications/$",
        NotificationConsumer.as_asgi(),
    ),
    re_path(
        r"ws/sync/(?P<facility_id>\d+)/$",
        SyncConsumer.as_asgi(),
    ),
]
