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

logger = logging.getLogger(__name__)

# Cookie names (must match cookie_auth_backend.py)
ACCESS_COOKIE = "vitora_access"
REFRESH_COOKIE = "vitora_refresh"


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


class CookieLoginView(APIView):
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
        from hmis.apps.core.powersync_tokens import PowerSyncTokenObtainPairSerializer
        from hmis.apps.core.views import _build_user_info

        serializer = PowerSyncTokenObtainPairSerializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        data = serializer.validated_data

        # If MFA is required, don't set cookies yet
        if data.get("mfa_required"):
            return Response(data, status=status.HTTP_200_OK)

        # Build response — user profile without tokens
        # The serializer only returns {access, refresh}, so we build user info
        # from the authenticated user for the frontend to store in localStorage.
        user_data = {k: v for k, v in data.items() if k not in ("access", "refresh")}
        user_data["user"] = _build_user_info(serializer.user)

        # Include memberships at top level for frontend org-switching
        from hmis.apps.core.models import OrgMembership

        memberships = []
        if hasattr(serializer.user, "staff_profile"):
            try:
                profile = serializer.user.staff_profile
                for m in profile.memberships.filter(
                    status=OrgMembership.MembershipStatus.ACTIVE
                ).select_related("organization", "role", "department"):
                    memberships.append(
                        {
                            "id": m.pk,
                            "organization_id": m.organization_id,
                            "organization_name": m.organization.name,
                            "role_code": m.role.code,
                            "role_name": m.role.name,
                            "is_primary": m.is_primary,
                            "facilities": list(m.facilities.values("id", "name", "mfl_code")),
                        }
                    )
            except Exception:
                logger.exception("Failed to build memberships for user %s", serializer.user.pk)
        user_data["memberships"] = memberships

        response = Response(user_data, status=status.HTTP_200_OK)

        return _set_auth_cookies(response, data["access"], data["refresh"])


class CookieMFAVerifyView(APIView):
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

        return _set_auth_cookies(response, access, refresh)


class CookieRefreshView(APIView):
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


class CookieLogoutView(APIView):
    """
    Logout — clears httpOnly auth cookies.

    POST /api/auth/logout/
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, _request):
        response = Response({"logged_out": True}, status=status.HTTP_200_OK)
        return _clear_auth_cookies(response)
