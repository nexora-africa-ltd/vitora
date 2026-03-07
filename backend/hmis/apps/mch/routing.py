"""WebSocket routing for MCH realtime channels."""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/mch/partographs/(?P<partograph_id>\d+)/$",
        consumers.LabourPartographConsumer.as_asgi(),
    ),
]