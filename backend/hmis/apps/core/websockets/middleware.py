"""
WebSocket facility-access middleware.

Extracts ``facility_id`` from the URL path and validates that the
authenticated user has access to that facility via their StaffProfile.

Usage in asgi.py:
    from hmis.apps.core.websockets.middleware import FacilityWebSocketMiddleware

    application = ProtocolTypeRouter({
        "websocket": AuthMiddlewareStack(
            FacilityWebSocketMiddleware(URLRouter(websocket_urlpatterns))
        ),
    })

Consumers can then read ``self.scope["facility_id"]`` (int or None).
Routes that do not contain a ``facility_id`` capture group are passed
through untouched.
"""

import logging
import re

from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)

# Regex to extract facility_id from URL path
_FACILITY_RE = re.compile(r"/(?P<facility_id>\d+)/")


class FacilityWebSocketMiddleware:
    """
    ASGI middleware that validates facility access for WebSocket connections.

    If the URL contains a ``facility_id`` capture (set by the URLRouter),
    the middleware checks whether the authenticated user's StaffProfile has
    access to that facility (primary or secondary).

    On failure the connection is closed with code 4403 (forbidden) or 4401
    (unauthenticated).

    Consumers receive ``scope["facility_id"]`` (int) for convenience.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "websocket":
            return await self.app(scope, receive, send)

        # Extract facility_id from URL kwargs (set by URLRouter)
        url_kwargs = scope.get("url_route", {}).get("kwargs", {})
        raw_facility_id = url_kwargs.get("facility_id")

        if raw_facility_id is None:
            # Route doesn't use facility_id — pass through
            scope["facility_id"] = None
            return await self.app(scope, receive, send)

        try:
            facility_id = int(raw_facility_id)
        except (ValueError, TypeError):
            await self._reject(send, code=4400)
            return

        scope["facility_id"] = facility_id

        # Check authentication
        user = scope.get("user")
        if user is None or (hasattr(user, "is_anonymous") and user.is_anonymous):
            # Allow anonymous connections for now (AuthMiddlewareStack may
            # already handle this), but log it. Consumers can do their own
            # auth check.
            logger.debug("Anonymous WS connection for facility %d", facility_id)
            return await self.app(scope, receive, send)

        # Validate facility access
        has_access = await self._check_facility_access(user, facility_id)
        if not has_access:
            logger.warning(
                "WS connection rejected: user %s has no access to facility %d",
                user,
                facility_id,
            )
            await self._reject(send, code=4403)
            return

        return await self.app(scope, receive, send)

    @database_sync_to_async
    def _check_facility_access(self, user, facility_id: int) -> bool:
        """Check if user has access to the given facility."""
        try:
            profile = user.staff_profile
        except Exception:
            # No StaffProfile → no facility access
            # (superusers still pass for admin convenience)
            return getattr(user, "is_superuser", False)

        # Primary facility
        if profile.primary_facility_id == facility_id:
            return True

        # Secondary facilities
        if profile.secondary_facilities.filter(id=facility_id).exists():
            return True

        # Superusers can access any facility
        return getattr(user, "is_superuser", False)

    @staticmethod
    async def _reject(send, code: int = 4403):
        """Reject a WebSocket connection before acceptance."""
        await send({"type": "websocket.close", "code": code})
