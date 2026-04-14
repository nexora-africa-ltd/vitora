"""
CookieJWTAuthentication — DRF auth backend that reads JWT from httpOnly cookies.

This module is deliberately minimal to avoid circular imports. It is loaded
by DRF during startup via DEFAULT_AUTHENTICATION_CLASSES.

The cookie-based views (login, refresh, logout) are in cookie_auth.py.

CSRF protection is handled by the SameSite cookie attribute (Lax in production)
and the CORS allowlist — not by a Django CSRF token. This is the standard
approach for cross-origin cookie-based JWT auth where the frontend and API live
on different origins (e.g. Vercel + Azure).
"""

from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication

ACCESS_COOKIE = "vitora_access"


class CookieJWTAuthentication(BaseAuthentication):
    """
    DRF authentication backend that reads JWT from an httpOnly cookie.

    Falls through to the next auth class (e.g. JWTAuthentication) when no
    cookie is present.
    """

    def authenticate(self, request):
        raw_token = request.COOKIES.get(ACCESS_COOKIE)
        if not raw_token:
            return None  # Fall through to next auth class

        # Lazy import to avoid circular import at module load time
        from rest_framework_simplejwt.exceptions import TokenError
        from rest_framework_simplejwt.tokens import AccessToken

        try:
            validated_token = AccessToken(raw_token)
        except TokenError:
            return None  # Token expired — let the refresh flow handle it

        from django.contrib.auth import get_user_model

        User = get_user_model()

        try:
            user = User.objects.get(pk=validated_token["user_id"])
        except User.DoesNotExist:
            raise exceptions.AuthenticationFailed("User not found") from None

        if not user.is_active:
            raise exceptions.AuthenticationFailed("User is inactive")

        return (user, validated_token)

    def authenticate_header(self, _request):
        return None  # No WWW-Authenticate header for cookie auth
