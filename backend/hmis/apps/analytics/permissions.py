"""
Analytics permission classes.

Controls access to analytics dashboards, BI endpoints, and MOH reports.
Only staff with management, admin, or senior clinical roles can view
aggregated analytics data.
"""

from rest_framework import permissions

# Role codes that grant analytics access.
# These correspond to Role.code values in core.models.Role.
ANALYTICS_ROLE_CODES = frozenset(
    {
        "ADMIN",
        "MANAGEMENT",
        "CLINICAL_SENIOR",
        "DOC",  # Doctors can view analytics for their facility
        "DOCTOR",
        "NURSING_MGR",
        "HEAD_NURSE",
        "MEDICAL_OFFICER",
        "FACILITY_ADMIN",
    }
)

# Role categories (Role.category) that grant analytics access.
ANALYTICS_ROLE_CATEGORIES = frozenset({"MANAGEMENT"})


class CanViewAnalytics(permissions.BasePermission):
    """
    Allow access to analytics endpoints for privileged roles.

    Access is granted if any of the following is true:
    * User is a superuser (Nexora platform staff).
    * User is Django ``is_staff``.
    * User's ``staff_profile.primary_role`` has a code in
      ``ANALYTICS_ROLE_CODES`` or a category in
      ``ANALYTICS_ROLE_CATEGORIES``.

    All other authenticated users are denied.
    Unauthenticated users are always denied.
    """

    message = "You do not have permission to view analytics data."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if user.is_superuser or user.is_staff:
            return True

        profile = getattr(user, "staff_profile", None)
        if not profile:
            return False

        role = getattr(profile, "primary_role", None)
        if not role:
            return False

        if getattr(role, "code", "") in ANALYTICS_ROLE_CODES:
            return True

        if getattr(role, "category", "") in ANALYTICS_ROLE_CATEGORIES:
            return True

        return False


class IsSuperUser(permissions.BasePermission):
    """
    Restrict access to Nexora platform superusers only.

    Used for platform-wide cross-tenant analytics endpoints.
    """

    message = "Platform-wide analytics require superuser access."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_superuser
