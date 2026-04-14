"""
CookieJWTAuthentication — DRF auth backend that reads JWT from httpOnly cookies.

This module is deliberately minimal to avoid circular imports. It is loaded
by DRF during startup via DEFAULT_AUTHENTICATION_CLASSES.

The cookie-based views (login, refresh, logout) are in cookie_auth.py.
"""

from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication

ACCESS_COOKIE = "vitora_access"


class _CSRFCheck(CsrfViewMiddleware):
    """Thin wrapper to reuse Django's CSRF logic in DRF."""

    def _reject(self, _request, reason):  # type: ignore[override]
        return reason


class CookieJWTAuthentication(BaseAuthentication):
    """
    DRF authentication backend that reads JWT from an httpOnly cookie.

    Falls through to the next auth class (e.g. JWTAuthentication) when no
    cookie is present. Enforces CSRF for unsafe HTTP methods.
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

        # Enforce CSRF for state-changing methods
        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            self._enforce_csrf(request)

        from django.contrib.auth import get_user_model

        User = get_user_model()

        try:
            user = User.objects.get(pk=validated_token["user_id"])
        except User.DoesNotExist:
            raise exceptions.AuthenticationFailed("User not found") from None

        if not user.is_active:
            raise exceptions.AuthenticationFailed("User is inactive")

        return (user, validated_token)

    def _enforce_csrf(self, request):
        """Enforce CSRF validation for cookie-based auth."""
        check = _CSRFCheck(lambda _req: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f"CSRF validation failed: {reason}")

    def authenticate_header(self, _request):
        return None  # No WWW-Authenticate header for cookie auth
