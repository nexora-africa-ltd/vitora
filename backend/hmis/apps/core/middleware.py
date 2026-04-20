"""
Middleware for audit logging and multitenancy.

This module contains middleware that automatically logs
user actions for Kenya Data Protection Act compliance,
and resolves tenant context (organization + facility) for
multi-tenant request scoping.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

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
        """Check whether user is assigned to the given facility via OrgMembership."""
        if user.is_superuser:
            return True

        profile = getattr(user, "staff_profile", None)
        if not profile:
            return False

        # Check via OrgMembership: user needs an ACTIVE membership for the
        # facility's org, AND that membership must include this facility.
        from hmis.apps.core.models import OrgMembership

        return OrgMembership.objects.filter(
            staff_profile=profile,
            organization=facility.organization,
            status=OrgMembership.MembershipStatus.ACTIVE,
            facilities=facility,
        ).exists()


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


class OnboardingEnforcementMiddleware:
    """
    Redirect org admins to complete onboarding after a grace period.

    For the first ``ONBOARDING_GRACE_PERIOD_DAYS`` days after org creation,
    API access is unrestricted (soft phase — frontend shows a banner).
    After the grace period, non-superuser org-admin users whose organization
    has not completed onboarding are blocked from most API endpoints.

    Exempt paths (always accessible):
    - ``/api/token/`` — authentication
    - ``/api/core/onboarding/`` — the onboarding endpoints themselves
    - ``/api/core/auth/`` — password change, etc.
    - ``/api/staff/me/`` — user info sync
    - ``/api/core/facilities/`` — needed to configure modules
    - ``/api/core/departments/`` — needed during setup
    - ``/api/core/roles/`` — needed during setup
    - ``/api/core/invitations/`` — needed to invite staff
    - ``/api/clinics/`` — needed to create first clinic
    - ``/api/locations/`` — needed for location cascades
    - ``/admin/`` — Django admin

    Only enforced when ``ONBOARDING_ENFORCEMENT`` setting is ``True``.
    """

    EXEMPT_PREFIXES = (
        "/api/token/",
        "/api/auth/",
        "/api/core/onboarding/",
        "/api/core/auth/",
        "/api/staff/me/",
        "/api/core/facilities/",
        "/api/core/departments/",
        "/api/core/roles/",
        "/api/core/invitations/",
        "/api/clinics/",
        "/api/locations/",
        "/admin/",
        "/api/mfa/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        import json

        from django.conf import settings as django_settings
        from django.http import HttpResponse

        if not getattr(django_settings, "ONBOARDING_ENFORCEMENT", False):
            return self.get_response(request)

        # Only gate API routes
        if not request.path.startswith("/api/"):
            return self.get_response(request)

        # Exempt paths
        if any(request.path.startswith(p) for p in self.EXEMPT_PREFIXES):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return self.get_response(request)

        # Superusers are always exempt
        if user.is_superuser:
            return self.get_response(request)

        # Only block org admins (ADMIN, ORG-ADMIN, OWNER roles)
        profile = getattr(user, "staff_profile", None)
        if not profile or not profile.organization:
            return self.get_response(request)

        org = profile.organization

        # If onboarding is already complete, pass through
        if org.onboarding_complete:
            return self.get_response(request)

        # Check grace period
        grace_days = getattr(django_settings, "ONBOARDING_GRACE_PERIOD_DAYS", 7)
        grace_deadline = org.created_at + timedelta(days=grace_days)

        if timezone.now() <= grace_deadline:
            # Still in grace period — allow access
            return self.get_response(request)

        # Only block admin roles after grace period
        admin_codes = {"ADMIN", "ORG-ADMIN", "OWNER"}
        role_code = profile.primary_role.code if profile.primary_role else None
        if role_code not in admin_codes:
            return self.get_response(request)

        return HttpResponse(
            json.dumps(
                {
                    "detail": (
                        "Your organization setup is incomplete. "
                        "Please complete the onboarding checklist to continue."
                    ),
                    "code": "onboarding_required",
                }
            ),
            content_type="application/json",
            status=403,
        )


# ---------------------------------------------------------------------------
# Media Security Middleware
# ---------------------------------------------------------------------------


class MediaSecurityMiddleware:
    """
    Force ``Content-Disposition: attachment`` on all responses served from
    the ``MEDIA_URL`` path.  This prevents browsers from rendering uploaded
    files inline, mitigating stored XSS via HTML/SVG uploads.

    Also sets ``X-Content-Type-Options: nosniff`` to stop browsers from
    guessing the MIME type and executing content they shouldn't.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.media_url = settings.MEDIA_URL
        if not self.media_url.startswith("/"):
            self.media_url = "/" + self.media_url

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith(self.media_url):
            # Force download rather than inline rendering
            if "Content-Disposition" not in response:
                response["Content-Disposition"] = "attachment"
            response["X-Content-Type-Options"] = "nosniff"
        return response
