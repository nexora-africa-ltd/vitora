# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Permission policies for facility-scoped surveillance operations.

Use:
- Apply ``CountyNotificationDeliveryPermission`` to the delivery ledger ViewSet.

Inputs:
- Superusers and tenant ``OWNER``, ``ADMIN``, and ``ORG-ADMIN`` roles; the
  ``DHA_EVIDENCE_READER`` role has read-only ledger access.
- Other authenticated users require ``view_countynotificationdelivery`` for
  reads and ``change_countynotificationdelivery`` for manual retries.
"""

from rest_framework import permissions


class CountyNotificationDeliveryPermission(permissions.BasePermission):
    """Authorize delivery evidence and retries with explicit tenant-role support."""

    message = "You do not have permission to access notification deliveries."
    code = "permission_denied"
    TENANT_ADMIN_ROLE_CODES = {"OWNER", "ADMIN", "ORG-ADMIN"}
    DHA_EVIDENCE_READER_ROLE_CODE = "DHA_EVIDENCE_READER"

    def has_permission(self, request, view):  # noqa: ARG002
        """Check the Django model permission appropriate to the request method."""
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        profile = getattr(user, "staff_profile", None)
        role = getattr(profile, "primary_role", None) if profile else None
        role_code = getattr(role, "code", "")
        if role_code in self.TENANT_ADMIN_ROLE_CODES:
            return True
        if (
            request.method in permissions.SAFE_METHODS
            and role_code == self.DHA_EVIDENCE_READER_ROLE_CODE
        ):
            return True

        codename = (
            "surveillance.view_countynotificationdelivery"
            if request.method in permissions.SAFE_METHODS
            else "surveillance.change_countynotificationdelivery"
        )
        return user.has_perm(codename)
