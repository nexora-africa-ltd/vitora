"""
Laboratory-specific permissions.

Gates LIS features based on:
1. Facility module flags (has_laboratory, has_lis_standalone)
2. Global LIS_STANDALONE_MODE setting
3. Role-based permission matrix
"""

import logging

from django.conf import settings
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)


class LaboratoryModuleRequired(BasePermission):
    """
    Allows access only if the user's facility has the laboratory module enabled.

    This gates ALL laboratory endpoints — both integrated and standalone.
    """

    message = "Laboratory module is not enabled for this facility."

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False

        # Superusers bypass
        if request.user.is_superuser:
            return True

        # Check facility module
        profile = getattr(request.user, "staff_profile", None)
        if not profile:
            return False

        facility = profile.primary_facility
        if not facility:
            return False

        return facility.has_laboratory or facility.has_lis_standalone


class LISStandaloneRequired(BasePermission):
    """
    Gates standalone LIS features (walk-in patients, external orders, standalone orders).

    Access is granted if ANY of:
    1. Global LIS_STANDALONE_MODE setting is True
    2. Facility has has_lis_standalone = True
    3. User is superuser

    This permission is additive to LaboratoryModuleRequired — standalone views
    should use BOTH: [IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired]
    """

    message = "LIS standalone mode is not enabled for this facility."

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False

        # Superusers bypass
        if request.user.is_superuser:
            return True

        # Global setting override
        if getattr(settings, "LIS_STANDALONE_MODE", False):
            return True

        # Per-facility flag
        profile = getattr(request.user, "staff_profile", None)
        if not profile:
            return False

        facility = profile.primary_facility
        if not facility:
            return False

        return facility.has_lis_standalone


class LISQCPermission(BasePermission):
    """Gates QC features — requires laboratory module + LAB_TECH/LAB_SCIENTIST/PATHOLOGIST role."""

    message = "You do not have permission to access QC features."

    LIS_QC_ROLES = {"LAB_TECH", "LAB_SCIENTIST", "PATHOLOGIST", "ADMIN", "ORG-ADMIN", "LIS_ADMIN"}

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        profile = getattr(request.user, "staff_profile", None)
        if not profile or not profile.primary_role:
            return False

        return profile.primary_role.code in self.LIS_QC_ROLES


class LISManageCatalogPermission(BasePermission):
    """Gates test catalog management — requires LAB_SCIENTIST/PATHOLOGIST/ADMIN."""

    message = "You do not have permission to manage the test catalog."

    CATALOG_ADMIN_ROLES = {"LAB_SCIENTIST", "PATHOLOGIST", "ADMIN", "ORG-ADMIN", "LIS_ADMIN"}

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        # Read access for all lab roles
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True

        profile = getattr(request.user, "staff_profile", None)
        if not profile or not profile.primary_role:
            return False

        return profile.primary_role.code in self.CATALOG_ADMIN_ROLES


class LISVerifyResultsPermission(BasePermission):
    """Gates result verification — requires LAB_SCIENTIST/PATHOLOGIST."""

    message = "Only lab scientists and pathologists can verify results."

    VERIFY_ROLES = {"LAB_SCIENTIST", "PATHOLOGIST", "ADMIN", "ORG-ADMIN", "LIS_ADMIN"}

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        profile = getattr(request.user, "staff_profile", None)
        if not profile or not profile.primary_role:
            return False

        return profile.primary_role.code in self.VERIFY_ROLES


# ---------------------------------------------------------------------------
# Granular workflow permissions (collect / enter / release / config)
# ---------------------------------------------------------------------------


class _RoleBasedPermission(BasePermission):
    """Internal helper: gates by a fixed role-code allowlist.

    Subclasses set ``ALLOWED_ROLES`` and ``message``. Superusers always pass.
    Read-only methods are allowed for any authenticated user (read access in
    the laboratory module is gated separately by ``LaboratoryModuleRequired``).
    """

    ALLOWED_ROLES: set[str] = set()
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        profile = getattr(request.user, "staff_profile", None)
        if not profile or not profile.primary_role:
            return False
        return profile.primary_role.code in self.ALLOWED_ROLES


class LISCollectSamplePermission(_RoleBasedPermission):
    """Gates specimen collection — phlebotomists, lab techs, nurses."""

    message = "You do not have permission to collect specimens."
    ALLOWED_ROLES = {
        "LAB_TECH",
        "LAB_SCIENTIST",
        "PHLEBOTOMIST",
        "NURSE",
        "ADMIN",
        "ORG-ADMIN",
        "LIS_ADMIN",
    }


class LISEnterResultsPermission(_RoleBasedPermission):
    """Gates entering / saving lab results — bench techs, scientists, pathologists."""

    message = "You do not have permission to enter laboratory results."
    ALLOWED_ROLES = {
        "LAB_TECH",
        "LAB_SCIENTIST",
        "PATHOLOGIST",
        "ADMIN",
        "ORG-ADMIN",
        "LIS_ADMIN",
    }


class LISReleaseResultsPermission(_RoleBasedPermission):
    """Gates releasing / signing-out final results — scientists & pathologists only."""

    message = "Only lab scientists and pathologists can release results."
    ALLOWED_ROLES = {
        "LAB_SCIENTIST",
        "PATHOLOGIST",
        "ADMIN",
        "ORG-ADMIN",
        "LIS_ADMIN",
    }


class LISConfigPermission(_RoleBasedPermission):
    """Gates LIS configuration (QC rules, reflex rules, critical values, analyzers, autoverify)."""

    message = "You do not have permission to manage LIS configuration."
    ALLOWED_ROLES = {
        "LAB_SCIENTIST",
        "PATHOLOGIST",
        "ADMIN",
        "ORG-ADMIN",
        "LIS_ADMIN",
    }


class LISWorksheetPermission(_RoleBasedPermission):
    """Gates worksheet management — techs and above."""

    message = "You do not have permission to manage worksheets."
    ALLOWED_ROLES = {
        "LAB_TECH",
        "LAB_SCIENTIST",
        "PATHOLOGIST",
        "ADMIN",
        "ORG-ADMIN",
        "LIS_ADMIN",
    }
