# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""JWT authentication that enforces server-side session revocation and idle expiry."""

from rest_framework_simplejwt.authentication import JWTAuthentication

from hmis.apps.core.session_security import validate_session


class SessionAwareJWTAuthentication(JWTAuthentication):
    """Validate the server-side session claim after standard JWT validation."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, token = result
        validate_session(user, token.get("session_id"), request)
        return user, token
