"""
Imaging/Radiology-specific permissions.

Gates imaging features based on:
1. Facility module flags (has_imaging, has_imaging_standalone)
2. Global IMAGING_STANDALONE_MODE setting
3. Role-based permission matrix
"""

import logging

from django.conf import settings
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)


class ImagingModuleRequired(BasePermission):
    """
    Allows access only if the user's facility has the imaging module enabled.

    Gates ALL imaging endpoints — both integrated and standalone.
    """

    message = "Imaging module is not enabled for this facility."

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

        return facility.has_imaging or facility.has_imaging_standalone


class ImagingStandaloneRequired(BasePermission):
    """
    Gates standalone imaging features (walk-in patients, external referrals,
    standalone imaging orders without an encounter).

    Access is granted if ANY of:
    1. Global IMAGING_STANDALONE_MODE setting is True
    2. Facility has has_imaging_standalone = True
    3. User is superuser
    """

    message = "Imaging standalone mode is not enabled for this facility."

    def has_permission(self, request, view):  # noqa: ARG002
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        if getattr(settings, "IMAGING_STANDALONE_MODE", False):
            return True

        profile = getattr(request.user, "staff_profile", None)
        if not profile:
            return False

        facility = profile.primary_facility
        if not facility:
            return False

        return facility.has_imaging_standalone
