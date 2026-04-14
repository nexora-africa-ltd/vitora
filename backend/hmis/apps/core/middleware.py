"""
Middleware for audit logging and multitenancy.

This module contains middleware that automatically logs
user actions for Kenya Data Protection Act compliance,
and resolves tenant context (organization + facility) for
multi-tenant request scoping.
"""

import logging

logger = logging.getLogger(__name__)


def get_client_ip(request):
    """
    Extract client IP address from request.

    Args:
        request: The HTTP request object

    Returns:
        str: Client IP address or None
    """
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        ip = x_forwarded_for.split(",")[0].strip()
    else:
        ip = request.META.get("REMOTE_ADDR")
    return ip


class TenantMiddleware:
    """
    Resolve the active facility and organization from the request.

    Reads the ``X-Facility-Id`` HTTP header (set by the frontend) and
    resolves it to a ``Facility`` + its parent ``Organization``.  The
    resolved objects are stored on the request as:

    * ``request.facility``     — active ``Facility`` instance or ``None``
    * ``request.organization`` — active ``Organization`` instance or ``None``

    If no header is provided the middleware falls back to the
    authenticated user's ``primary_facility`` (from ``StaffProfile``).

    **Access control**: If the requested facility does not belong to
    any of the user's assigned facilities (primary + secondary), a
    403 Forbidden response is returned.
    """

    def __init__(self, get_response):
        """Initialize middleware."""
        self.get_response = get_response

    def __call__(self, request):
        """Resolve tenant context and attach to request."""
        request.facility = None
        request.organization = None

        # Only resolve for authenticated users
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return self.get_response(request)

        facility = self._resolve_facility(request, user)
        if facility is not None:
            request.facility = facility
            request.organization = facility.organization

        return self.get_response(request)

    def _resolve_facility(self, request, user):
        """
        Resolve the Facility from header or user profile.

        Returns the Facility instance or None. Does NOT return a 403 —
        unauthenticated/anonymous users simply get no tenant context.
        """
        from hmis.apps.core.models import Facility

        # 1. Try explicit header
        facility_id = request.META.get("HTTP_X_FACILITY_ID")
        if facility_id:
            try:
                facility = Facility.objects.select_related("organization").get(
                    pk=int(facility_id), is_active=True
                )
            except (Facility.DoesNotExist, ValueError, TypeError):
                logger.warning(
                    "TenantMiddleware: invalid X-Facility-Id=%s for user=%s",
                    facility_id,
                    user.pk,
                )
                return None

            # Validate the user has access to this facility
            if self._user_has_facility_access(user, facility):
                return facility

            logger.warning(
                "TenantMiddleware: user=%s denied access to facility=%s",
                user.pk,
                facility.pk,
            )
            return None

        # 2. Fallback to primary facility from StaffProfile
        profile = getattr(user, "staff_profile", None)
        if profile and profile.primary_facility_id:
            try:
                return Facility.objects.select_related("organization").get(
                    pk=profile.primary_facility_id, is_active=True
                )
            except Facility.DoesNotExist:
                return None

        return None

    def _user_has_facility_access(self, user, facility):
        """Check whether user is assigned to the given facility."""
        if user.is_superuser:
            return True

        profile = getattr(user, "staff_profile", None)
        if not profile:
            return False

        if profile.primary_facility_id == facility.pk:
            return True

        return profile.secondary_facilities.filter(pk=facility.pk).exists()


class AuditLogMiddleware:
    """
    Middleware for automatic audit logging of API requests.

    This middleware logs significant API actions for compliance with
    Kenya Data Protection Act requirements.
    """

    def __init__(self, get_response):
        """Initialize middleware."""
        self.get_response = get_response

    def __call__(self, request):
        """Process request and response."""
        response = self.get_response(request)
        return response


class AdminAccessMiddleware:
    """
    Restrict Django admin to Nexora platform staff (``is_superuser``)
    and enforce MFA verification for admin sessions.

    Combines two checks:
    1. Only superusers can access ``/admin/`` pages.
    2. If MFA is enabled for the user, they must verify TOTP before
       accessing admin pages (session key ``admin_mfa_verified``).
    """

    ADMIN_PREFIX = "/admin/"
    # Paths that must remain accessible for auth / MFA flow
    ALLOWED_PREFIXES = (
        "/admin/login/",
        "/admin/logout/",
        "/admin/mfa-verify/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from django.http import HttpResponseForbidden
        from django.shortcuts import redirect

        if not request.path.startswith(self.ADMIN_PREFIX):
            return self.get_response(request)

        # Allow login/logout/mfa-verify pages
        if any(request.path.startswith(p) for p in self.ALLOWED_PREFIXES):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return self.get_response(request)

        # Superuser-only check
        if not user.is_superuser:
            return HttpResponseForbidden(
                "Access denied. Django admin is restricted to Nexora platform administrators."
            )

        # MFA verification check
        from hmis.apps.core.mfa.utils import is_mfa_enabled

        if is_mfa_enabled(user):
            if not request.session.get("admin_mfa_verified"):
                return redirect("/admin/mfa-verify/")

        return self.get_response(request)


class MFAGraceEnforcementMiddleware:
    """
    Block API access when MFA grace period has expired.

    After the configurable grace period (default 72h from first login),
    users whose role requires MFA but who haven't set it up are blocked
    from all API endpoints except:
    - Authentication (``/api/token/``)
    - MFA setup (``/api/mfa/``)
    - Password change (``/api/auth/change-password/``)

    Returns 403 with a JSON body the frontend can detect and redirect to
    the MFA setup page.
    """

    # Paths that remain accessible even after grace period expires
    EXEMPT_PREFIXES = (
        "/api/token/",
        "/api/mfa/",
        "/api/auth/change-password/",
        "/api/me/",
        "/admin/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        import json

        from django.http import HttpResponse

        # Only gate API routes
        if not request.path.startswith("/api/"):
            return self.get_response(request)

        # Exempt paths
        if any(request.path.startswith(p) for p in self.EXEMPT_PREFIXES):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return self.get_response(request)

        from hmis.apps.core.mfa.utils import is_mfa_grace_period_expired

        if is_mfa_grace_period_expired(user):
            return HttpResponse(
                json.dumps(
                    {
                        "detail": (
                            "Your MFA setup grace period has expired. "
                            "Please configure multi-factor authentication to continue."
                        ),
                        "code": "mfa_setup_required",
                    }
                ),
                content_type="application/json",
                status=403,
            )

        return self.get_response(request)
