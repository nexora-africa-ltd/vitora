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
    from django.db.utils import OperationalError, ProgrammingError

    from hmis.apps.core.mfa.models import UserTOTPDevice, UserWebAuthnCredential

    try:
        has_totp = UserTOTPDevice.objects.filter(user=user, confirmed=True).exists()
        has_webauthn = UserWebAuthnCredential.objects.filter(user=user).exists()
        return has_totp or has_webauthn
    except (OperationalError, ProgrammingError):
        # Table may not exist in --no-migrations test mode
        return False


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
    from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice, UserWebAuthnCredential

    devices = UserTOTPDevice.objects.filter(user=user)
    confirmed_devices = devices.filter(confirmed=True)
    webauthn_count = UserWebAuthnCredential.objects.filter(user=user).count()
    backup_codes_remaining = BackupCode.remaining_codes_count(user)

    # Build available methods list
    available_methods: list[str] = []
    if confirmed_devices.exists():
        available_methods.append("totp")
    if webauthn_count > 0:
        available_methods.append("webauthn")
    if backup_codes_remaining > 0:
        available_methods.append("backup_code")

    return {
        "mfa_enabled": confirmed_devices.exists(),
        "mfa_required": is_mfa_required(user),
        "devices_count": confirmed_devices.count(),
        "webauthn_credentials_count": webauthn_count,
        "backup_codes_remaining": backup_codes_remaining,
        "has_pending_setup": devices.filter(confirmed=False).exists(),
        "available_methods": available_methods,
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


# ============================================================================
# MFA Grace Period
# ============================================================================


def set_mfa_grace_deadline(user: "AbstractUser") -> None:
    """
    Set the MFA grace deadline for a user if not already set.

    Called on first login when MFA is required but not yet configured.
    The deadline is ``now + MFA_GRACE_PERIOD_HOURS`` (default 72h).
    """
    from django.conf import settings
    from django.utils import timezone

    profile = getattr(user, "staff_profile", None)
    if not profile:
        return

    if profile.mfa_grace_deadline is not None:
        return  # Already set — don't extend

    from datetime import timedelta

    hours = getattr(settings, "MFA_GRACE_PERIOD_HOURS", 72)
    profile.mfa_grace_deadline = timezone.now() + timedelta(hours=hours)
    profile.save(update_fields=["mfa_grace_deadline"])


def is_mfa_grace_period_expired(user: "AbstractUser") -> bool:
    """
    Check whether the user's MFA grace period has expired.

    Returns ``True`` only when all conditions are met:
    1. MFA enforcement is enabled
    2. MFA is required for the user's role
    3. MFA is NOT yet configured
    4. Grace deadline is set AND has passed

    Returns:
        bool: True if access should be blocked until MFA is set up.
    """
    from django.conf import settings
    from django.utils import timezone

    if not getattr(settings, "MFA_ENFORCEMENT", True):
        return False

    if not is_mfa_required(user):
        return False

    if is_mfa_enabled(user):
        return False

    profile = getattr(user, "staff_profile", None)
    if not profile or not profile.mfa_grace_deadline:
        return False

    return timezone.now() >= profile.mfa_grace_deadline
