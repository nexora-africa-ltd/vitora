"""
MFA utility functions for Vitora HMIS.

Provides helper functions for checking MFA status and requirements.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser

# Roles that require MFA (DHA compliance)
MFA_REQUIRED_ROLES = {
    "ADMIN",
    "CLINICAL_SENIOR",
    "MANAGEMENT",
}


def is_mfa_enabled(user: "AbstractUser") -> bool:
    """
    Check if MFA is enabled for a user.

    MFA is considered enabled if the user has at least one confirmed TOTP device.

    Args:
        user: User to check

    Returns:
        bool: True if MFA is enabled
    """
    from hmis.apps.core.mfa.models import UserTOTPDevice

    return UserTOTPDevice.objects.filter(user=user, confirmed=True).exists()


def is_mfa_required(user: "AbstractUser") -> bool:
    """
    Check if MFA is required for a user based on their role.

    MFA is required for:
    - Superusers
    - Users with ADMIN role
    - Users with CLINICAL_SENIOR role
    - Users with MANAGEMENT role category

    Respects the ``MFA_ENFORCEMENT`` setting — when ``False`` (dev/test),
    MFA is never required regardless of role.

    Args:
        user: User to check

    Returns:
        bool: True if MFA is required for this user
    """
    from django.conf import settings

    if not getattr(settings, "MFA_ENFORCEMENT", True):
        return False

    # Superusers always require MFA
    if user.is_superuser:
        return True

    # Check staff profile for role
    if hasattr(user, "staff_profile") and user.staff_profile:
        profile = user.staff_profile
        primary_role = profile.primary_role

        if primary_role:
            # Check if role code is in required roles
            if primary_role.code in MFA_REQUIRED_ROLES:
                return True

            # Check if role category is MANAGEMENT
            if primary_role.category == "MANAGEMENT":
                return True

        # Check secondary roles too
        for role in profile.secondary_roles.all():
            if role.code in MFA_REQUIRED_ROLES:
                return True
            if role.category == "MANAGEMENT":
                return True

    return False


def get_mfa_status(user: "AbstractUser") -> dict:
    """
    Get complete MFA status for a user.

    Args:
        user: User to check

    Returns:
        dict: MFA status information
    """
    from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

    devices = UserTOTPDevice.objects.filter(user=user)
    confirmed_devices = devices.filter(confirmed=True)
    backup_codes_remaining = BackupCode.remaining_codes_count(user)

    return {
        "mfa_enabled": confirmed_devices.exists(),
        "mfa_required": is_mfa_required(user),
        "devices_count": confirmed_devices.count(),
        "backup_codes_remaining": backup_codes_remaining,
        "has_pending_setup": devices.filter(confirmed=False).exists(),
    }


def get_client_ip(request) -> str | None:
    """
    Extract client IP address from request.

    Args:
        request: Django request object

    Returns:
        str or None: Client IP address
    """
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
