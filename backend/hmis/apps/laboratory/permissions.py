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

    LIS_QC_ROLES = {"LAB_TECH", "LAB_SCIENTIST", "PATHOLOGIST", "ADMIN", "ORG-ADMIN"}

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

    CATALOG_ADMIN_ROLES = {"LAB_SCIENTIST", "PATHOLOGIST", "ADMIN", "ORG-ADMIN"}

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

    VERIFY_ROLES = {"LAB_SCIENTIST", "PATHOLOGIST", "ADMIN"}

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        profile = getattr(request.user, "staff_profile", None)
        if not profile or not profile.primary_role:
            return False

        return profile.primary_role.code in self.VERIFY_ROLES
