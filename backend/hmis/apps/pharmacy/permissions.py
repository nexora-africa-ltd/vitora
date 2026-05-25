"""
Pharmacy-specific permissions.

Gates pharmacy features based on:
1. Facility module flags (has_pharmacy, has_pharmacy_standalone)
2. Global PHARMACY_STANDALONE_MODE setting
3. Role-based permission matrix
"""

import logging

from django.conf import settings
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)


class PharmacyModuleRequired(BasePermission):
    """
    Allows access only if the user's facility has the pharmacy module enabled.

    This gates ALL pharmacy endpoints — both integrated and standalone.
    """

    message = "Pharmacy module is not enabled for this facility."

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, "staff_profile", None)
        if not profile:
            return False

        facility = profile.primary_facility
        if not facility:
            return False

        return facility.has_pharmacy or facility.has_pharmacy_standalone


class PharmacyStandaloneRequired(BasePermission):
    """
    Gates standalone pharmacy features (walk-in customers, external prescriptions,
    standalone dispensing without an encounter).

    Access is granted if ANY of:
    1. Global PHARMACY_STANDALONE_MODE setting is True
    2. Facility has has_pharmacy_standalone = True
    3. User is superuser

    This permission is additive to PharmacyModuleRequired — standalone views
    should use BOTH: [IsAuthenticated, PharmacyModuleRequired, PharmacyStandaloneRequired]
    """

    message = "Pharmacy standalone mode is not enabled for this facility."

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        if getattr(settings, "PHARMACY_STANDALONE_MODE", False):
            return True

        profile = getattr(request.user, "staff_profile", None)
        if not profile:
            return False

        facility = profile.primary_facility
        if not facility:
            return False

        return facility.has_pharmacy_standalone
