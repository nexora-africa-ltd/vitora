# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Issue short-lived one-time tickets for authenticated WebSocket clients.

Use ``POST /api/core/websocket-ticket/`` with normal Vitora API authentication.
The endpoint accepts no request body and returns an opaque ticket plus expiry time.
"""

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import WEBSOCKET_TICKET_LIFETIME, WebSocketTicket


class WebSocketTicketView(APIView):
    """Issue an opaque credential that can authenticate exactly one WS upgrade."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Return a ticket without placing a bearer JWT in a WebSocket URL."""
        ticket = WebSocketTicket.issue(request.user)
        return Response(
            {
                "ticket": ticket,
                "expires_at": (timezone.now() + WEBSOCKET_TICKET_LIFETIME).isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )
