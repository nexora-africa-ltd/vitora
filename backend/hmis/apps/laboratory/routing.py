"""
WebSocket URL Routing for Laboratory App.

Defines WebSocket URL patterns for lab result real-time updates.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # Lab updates for a specific encounter
    re_path(
        r"ws/lab/encounters/(?P<encounter_id>\d+)/$",
        consumers.LabEncounterConsumer.as_asgi(),
    ),
    # Lab updates for a specific order
    re_path(
        r"ws/lab/orders/(?P<order_id>\d+)/$",
        consumers.LabOrderConsumer.as_asgi(),
    ),
    # Lab notifications for the authenticated clinician
    re_path(
        r"ws/lab/clinician/$",
        consumers.LabClinicianConsumer.as_asgi(),
    ),
]
