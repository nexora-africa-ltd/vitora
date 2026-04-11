"""
WebSocket URL Routing for Billing App.

Defines WebSocket URL patterns for billing and SHA claims real-time updates.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/billing/(?P<facility_id>\d+)/invoices/$",
        consumers.BillingConsumer.as_asgi(),
    ),
    re_path(
        r"ws/billing/(?P<facility_id>\d+)/sha-claims/$",
        consumers.SHAClaimConsumer.as_asgi(),
    ),
]
