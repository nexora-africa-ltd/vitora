# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
HttpOnly cookie-based JWT authentication views for the web frontend.

Provides:
- CookieLoginView — sets httpOnly cookies on successful login
- CookieMFAVerifyView — sets httpOnly cookies after MFA verification
- CookieRefreshView — refreshes access token via cookie
- CookieLogoutView — clears auth cookies

The CookieJWTAuthentication backend is in cookie_auth_backend.py (separate
module to avoid circular imports during DRF startup).

The existing /api/token/ endpoints remain unchanged for desktop app / Postman
backward compatibility. These cookie-based endpoints are used exclusively by
the Next.js web frontend.
"""

import logging

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from hmis.apps.core.openapi import SchemaFallbackSerializer

logger = logging.getLogger(__name__)

# Cookie names (must match cookie_auth_backend.py)
ACCESS_COOKIE = "vitora_access"
REFRESH_COOKIE = "vitora_refresh"


class CookieAuthSchemaMixin:
    """Schema fallback helpers for APIViews used by drf-spectacular."""

    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return self.serializer_class

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": self.request, "format": self.format_kwarg, "view": self}


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------


def _get_cookie_kwargs(max_age: int) -> dict:
    """Build cookie keyword arguments from settings."""
    return {
        "max_age": max_age,
        "httponly": True,
        "secure": getattr(settings, "AUTH_COOKIE_SECURE", not settings.DEBUG),
        "samesite": getattr(settings, "AUTH_COOKIE_SAMESITE", "Lax"),
        "domain": getattr(settings, "AUTH_COOKIE_DOMAIN", None),
        "path": "/",
    }


def _set_auth_cookies(response: Response, access: str, refresh: str) -> Response:
    """Set both access and refresh httpOnly cookies on a response."""
    access_lifetime = settings.SIMPLE_JWT.get("ACCESS_TOKEN_LIFETIME")
    refresh_lifetime = settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME")

    response.set_cookie(
        ACCESS_COOKIE,
        access,
        **_get_cookie_kwargs(int(access_lifetime.total_seconds())),
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        **_get_cookie_kwargs(int(refresh_lifetime.total_seconds())),
    )
    return response


def _clear_auth_cookies(response: Response) -> Response:
    """Clear auth cookies."""
    domain = getattr(settings, "AUTH_COOKIE_DOMAIN", None)
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=domain)
    response.delete_cookie(REFRESH_COOKIE, path="/", domain=domain)
    return response


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


class CookieLoginView(CookieAuthSchemaMixin, APIView):
    """
    Login endpoint that sets httpOnly cookies.

    POST /api/auth/login/
    Body: { "username": "...", "password": "..." }

    On success: Sets httpOnly cookies, returns user profile (no tokens in body).
    On MFA required: Returns {mfa_required: true} without cookies.
    """

    permission_classes = [AllowAny]
    authentication_classes = []  # No auth needed for login

    def post(self, request):
        from hmis.apps.core.views import AuditedTokenObtainPairView

        # Delegate to the canonical JWT login view so cookie login enforces the
        # same password, organization activation, MFA, audit, and user payload
        # behavior as /api/token/. Do not duplicate serializer logic here.
        token_view = AuditedTokenObtainPairView.as_view()
        token_response = token_view(request._request)

        if token_response.status_code != status.HTTP_200_OK:
            return token_response

        data = token_response.data

        # If MFA is required, don't set cookies yet
        if data.get("mfa_required"):
            return Response(data, status=status.HTTP_200_OK)

        # Build response — user profile without tokens
        user_data = {k: v for k, v in data.items() if k not in ("access", "refresh")}

        response = Response(user_data, status=status.HTTP_200_OK)

        # Desktop clients can't use cross-origin httpOnly cookies (different
        # origins over HTTP, SameSite blocks them).  Return tokens in the body
        # so the desktop frontend can use Authorization: Bearer headers instead.
        if request.headers.get("X-Vitora-Client", "").startswith("desktop"):
            user_data["access"] = data["access"]
            user_data["refresh"] = data["refresh"]
            return Response(user_data, status=status.HTTP_200_OK)

        return _set_auth_cookies(response, data["access"], data["refresh"])


class CookieMFAVerifyView(CookieAuthSchemaMixin, APIView):
    """
    MFA verification that sets httpOnly cookies.

    POST /api/auth/mfa-verify/
    Body: { "mfa_token": "...", "token"?: "...", "backup_code"?: "..." }

    Delegates to the existing MFAVerifyView logic, then sets cookies
    instead of returning tokens in the response body.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from hmis.apps.core.mfa.views import MFAVerifyView

        # Delegate to existing MFA verify view
        mfa_view = MFAVerifyView.as_view()
        mfa_response = mfa_view(request._request)

        # If MFA verification failed, return the error as-is
        if mfa_response.status_code != 200:
            return mfa_response

        data = mfa_response.data

        # Extract tokens and build cookie response
        access = data.get("access")
        refresh = data.get("refresh")

        if not access or not refresh:
            return mfa_response  # Unexpected — return as-is

        # Return user data without tokens
        user_data = {k: v for k, v in data.items() if k not in ("access", "refresh")}
        response = Response(user_data, status=status.HTTP_200_OK)

        # Desktop clients can't use cross-origin httpOnly cookies. Normal
        # desktop login returns body tokens; MFA completion must do the same or
        # the next API request immediately 401s after a successful MFA verify.
        if request.headers.get("X-Vitora-Client", "").startswith("desktop"):
            user_data["access"] = access
            user_data["refresh"] = refresh
            return Response(user_data, status=status.HTTP_200_OK)

        return _set_auth_cookies(response, access, refresh)


class CookieRefreshView(CookieAuthSchemaMixin, APIView):
    """
    Refresh access token via httpOnly cookie.

    POST /api/auth/refresh/
    No body needed — reads refresh token from cookie.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            return Response(
                {"error": "No refresh token"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            refresh = RefreshToken(raw_refresh)
            new_access = str(refresh.access_token)
        except TokenError:
            response = Response(
                {"error": "Refresh token expired or invalid"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            return _clear_auth_cookies(response)

        response = Response({"refreshed": True}, status=status.HTTP_200_OK)

        # Set new access cookie
        access_lifetime = settings.SIMPLE_JWT.get("ACCESS_TOKEN_LIFETIME")
        response.set_cookie(
            ACCESS_COOKIE,
            new_access,
            **_get_cookie_kwargs(int(access_lifetime.total_seconds())),
        )

        return response


class CookieLogoutView(CookieAuthSchemaMixin, APIView):
    """
    Logout — blacklists the refresh token and clears httpOnly auth cookies.

    POST /api/auth/logout/
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        # Attempt to blacklist the refresh token to prevent reuse
        refresh_token = request.COOKIES.get(REFRESH_COOKIE)
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except (TokenError, AttributeError):
                # Token already expired/invalid or blacklist app issue — proceed with clearing
                pass

        response = Response({"logged_out": True}, status=status.HTTP_200_OK)
        return _clear_auth_cookies(response)
