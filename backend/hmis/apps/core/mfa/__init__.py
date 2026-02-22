"""
MFA (Multi-Factor Authentication) module for Vitora HMIS.

DHA Compliance: P0 REQUIRED
- TOTP enrollment flow (QR code + backup codes)
- MFA requirement for sensitive roles (ADMIN, CLINICAL_SENIOR, MANAGEMENT)
- Backup code support
- Audit logging for all MFA events
"""

from hmis.apps.core.mfa.models import BackupCode, MFAToken, UserTOTPDevice
from hmis.apps.core.mfa.utils import is_mfa_enabled, is_mfa_required

__all__ = [
    "UserTOTPDevice",
    "BackupCode",
    "MFAToken",
    "is_mfa_enabled",
    "is_mfa_required",
]
