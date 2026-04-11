"""URL routing for core WebSocket infrastructure endpoints."""

from django.urls import path

from hmis.apps.core.websockets.health import websocket_health

urlpatterns = [
    path("", websocket_health, name="ws-health"),
]
