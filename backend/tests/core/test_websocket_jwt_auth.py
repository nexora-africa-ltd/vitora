# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests JWT cookie and one-time ticket authentication for Channels WebSockets."""

import pytest
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def issue_ticket(user):
    """Issue a short-lived ticket using the synchronous model manager."""
    from hmis.apps.core.models import WebSocketTicket

    return WebSocketTicket.issue(user)


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestJWTWebSocketAuthentication:
    """JWT-authenticated notification socket behavior."""

    async def test_access_cookie_authenticates_notification_socket(self, test_user):
        """The browser HttpOnly access cookie should authenticate Channels scope."""
        from hmis.asgi import application

        access = str(AccessToken.for_user(test_user))
        communicator = WebsocketCommunicator(
            application,
            "/ws/notifications/",
            headers=[(b"cookie", f"vitora_access={access}".encode())],
        )

        connected, code = await communicator.connect()

        assert connected is True, code
        await communicator.disconnect()

    async def test_one_time_ticket_authenticates_notification_socket(self, test_user):
        """Desktop tickets should authenticate a socket without exposing an access JWT."""
        from hmis.asgi import application

        ticket = await issue_ticket(test_user)
        communicator = WebsocketCommunicator(application, f"/ws/notifications/?ticket={ticket}")

        connected, code = await communicator.connect()

        assert connected is True, code
        await communicator.disconnect()

    async def test_consumed_ticket_cannot_open_a_second_socket(self, test_user):
        """A ticket is single-use even when a client retries the upgrade request."""
        from hmis.asgi import application

        ticket = await issue_ticket(test_user)
        first = WebsocketCommunicator(application, f"/ws/notifications/?ticket={ticket}")
        connected, code = await first.connect()
        assert connected is True, code
        await first.disconnect()

        second = WebsocketCommunicator(application, f"/ws/notifications/?ticket={ticket}")
        connected, code = await second.connect()

        assert connected is False
        assert code == 4401


@pytest.mark.django_db
class TestWebSocketTicketAPI:
    """Authenticated ticket issue endpoint behavior."""

    def test_authenticated_user_can_issue_ticket(self, authenticated_client):
        """The desktop client receives only an opaque, short-lived ticket."""
        response = authenticated_client.post("/api/core/websocket-ticket/")

        assert response.status_code == status.HTTP_201_CREATED
        assert isinstance(response.data["ticket"], str)
        assert len(response.data["ticket"]) >= 32
        assert response.data["expires_at"]

    def test_unauthenticated_user_cannot_issue_ticket(self, api_client):
        """Ticket issuance must remain subject to normal API authentication."""
        response = api_client.post("/api/core/websocket-ticket/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
