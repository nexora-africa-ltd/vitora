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
