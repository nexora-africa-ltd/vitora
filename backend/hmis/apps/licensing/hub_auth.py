# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Authentication helpers for hub license JWT requests."""

from __future__ import annotations

from django.contrib.auth.models import AnonymousUser
from rest_framework import permissions
from rest_framework.authentication import BaseAuthentication
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication

from hmis.apps.core.cookie_auth_backend import CookieJWTAuthentication
from hmis.apps.licensing.models import Installation
from hmis.apps.licensing.tokens import verify_license_token


def authenticate_hub_license(request: Request, token: str) -> bool:
    """Validate a hub license JWT and attach installation context to the request."""
    try:
        payload = verify_license_token(token)
    except Exception:
        return False

    installation_id = payload.get("installation_id")
    if not installation_id:
        return False

    try:
        installation = Installation.objects.select_related("organization", "facility").get(
            installation_id=installation_id,
            status=Installation.Status.ACTIVE,
        )
    except Installation.DoesNotExist:
        return False

    request._hub_installation = installation
    request._hub_license_payload = payload
    return True


class HubLicenseAuthenticated(permissions.BasePermission):
    """Permission class for endpoints that accept only active hub license JWTs."""

    message = "Invalid or expired hub license token."

    def has_permission(self, request: Request, _view) -> bool:
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return False
        return authenticate_hub_license(request, auth_header[7:])


class IsAuthenticatedOrHubLicense(permissions.BasePermission):
    """Allow either a normal authenticated user or an active hub license identity."""

    message = "Authentication credentials were not provided."

    def has_permission(self, request: Request, _view) -> bool:
        if getattr(request, "_hub_installation", None) is not None:
            return True
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated)


class HubLicenseOrJWTAuthentication(BaseAuthentication):
    """
    Authenticate sync requests with a hub license JWT or normal user JWT/cookie.

    License JWTs use the same Bearer header as SimpleJWT. This authenticator
    recognizes valid hub license tokens before delegating to user auth so DRF
    does not reject them as malformed user tokens.
    """

    def authenticate(self, request: Request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.startswith("Bearer ") and authenticate_hub_license(request, auth_header[7:]):
            return (AnonymousUser(), None)

        jwt_result = JWTAuthentication().authenticate(request)
        if jwt_result is not None:
            return jwt_result

        return CookieJWTAuthentication().authenticate(request)

    def authenticate_header(self, _request: Request) -> str:
        """Advertise Bearer auth so unauthenticated requests return 401."""
        return "Bearer"
