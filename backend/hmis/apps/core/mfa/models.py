"""
MFA models for Vitora HMIS.

This module provides:
- UserTOTPDevice: TOTP device for time-based one-time passwords
- BackupCode: Single-use recovery codes
- MFAToken: Temporary token for MFA verification flow
"""

import hashlib
import secrets
from typing import ClassVar

import pyotp
from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


class UserTOTPDevice(models.Model):
    """
    TOTP (Time-based One-Time Password) device for a user.

    Stores the secret key and manages token generation/verification.
    Uses pyotp for TOTP compliance with RFC 6238.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="totp_devices",
        help_text="User who owns this device",
    )
    name = models.CharField(
        max_length=100,
        help_text="Device name (e.g., 'Phone', 'Tablet')",
    )
    secret_key = models.CharField(
        max_length=64,
        help_text="Base32-encoded secret key",
    )
    confirmed = models.BooleanField(
        default=False,
        help_text="Whether device has been verified",
    )
    confirmed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When device was confirmed (MFA enabled)",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When device was created",
    )
    last_used_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When device was last used for verification",
    )

    # Settings for TOTP
    TOTP_INTERVAL: ClassVar[int] = 30  # 30-second window
    TOTP_DIGITS: ClassVar[int] = 6  # 6-digit codes
    TOTP_ISSUER: ClassVar[str] = "Vitora HMIS"

    class Meta:
        verbose_name = "TOTP Device"
        verbose_name_plural = "TOTP Devices"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user.username} - {self.name}"

    def save(self, *args, **kwargs):
        """Generate secret key if not provided."""
        if not self.secret_key:
            # Generate a random base32-encoded secret (20 bytes = 32 chars)
            self.secret_key = pyotp.random_base32(length=32)
        super().save(*args, **kwargs)

    def _get_totp(self) -> pyotp.TOTP:
        """Get pyotp TOTP instance."""
        return pyotp.TOTP(
            self.secret_key,
            interval=self.TOTP_INTERVAL,
            digits=self.TOTP_DIGITS,
        )

    def generate_token(self) -> str:
        """
        Generate current TOTP token.

        Returns:
            str: Current 6-digit TOTP token
        """
        return self._get_totp().now()

    def verify_token(self, token: str, valid_window: int = 1) -> bool:
        """
        Verify a TOTP token.

        Args:
            token: The 6-digit token to verify
            valid_window: Number of 30-second windows to allow (default: 1)

        Returns:
            bool: True if token is valid
        """
        if not token or not token.isdigit() or len(token) != self.TOTP_DIGITS:
            return False

        totp = self._get_totp()
        is_valid = totp.verify(token, valid_window=valid_window)

        if is_valid:
            self.last_used_at = timezone.now()
            self.save(update_fields=["last_used_at"])

        return is_valid

    def get_provisioning_uri(self) -> str:
        """
        Get otpauth:// URI for QR code generation.

        Returns:
            str: Provisioning URI
        """
        totp = self._get_totp()
        # Use email if available, otherwise username
        account_name = self.user.email or self.user.username
        return totp.provisioning_uri(
            name=account_name,
            issuer_name=self.TOTP_ISSUER,
        )


class BackupCode(models.Model):
    """
    Single-use backup/recovery code for MFA.

    Users can use these codes when they don't have access to their TOTP device.
    """

    CODE_LENGTH: ClassVar[int] = 8  # 8 characters
    DEFAULT_CODE_COUNT: ClassVar[int] = 10  # Generate 10 codes by default

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="backup_codes",
        help_text="User who owns this code",
    )
    code_hash = models.CharField(
        max_length=64,
        help_text="SHA-256 hash of the backup code",
    )
    used = models.BooleanField(
        default=False,
        help_text="Whether this code has been used",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When code was created",
    )
    used_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When code was used",
    )

    class Meta:
        verbose_name = "Backup Code"
        verbose_name_plural = "Backup Codes"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        status = "Used" if self.used else "Available"
        return f"{self.user.username} - {status}"

    @staticmethod
    def _hash_code(code: str) -> str:
        """Hash a code using SHA-256."""
        return hashlib.sha256(code.encode()).hexdigest()

    @classmethod
    @transaction.atomic
    def generate_codes(cls, user, count: int | None = None) -> list[str]:
        """
        Generate new backup codes for a user.

        Deletes all existing unused codes for the user first.

        Args:
            user: User to generate codes for
            count: Number of codes to generate (default: 10)

        Returns:
            list[str]: Plain-text backup codes (only returned once!)
        """
        if count is None:
            count = cls.DEFAULT_CODE_COUNT

        # Delete existing codes for this user
        cls.objects.filter(user=user).delete()

        codes = []
        for _ in range(count):
            # Generate random alphanumeric code
            code = "".join(
                secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")  # No I, O, 0, 1 for clarity
                for _ in range(cls.CODE_LENGTH)
            )
            codes.append(code)

            # Store hashed code
            cls.objects.create(
                user=user,
                code_hash=cls._hash_code(code),
            )

        return codes

    @classmethod
    @transaction.atomic
    def verify_code(cls, user, code: str) -> bool:
        """
        Verify and consume a backup code.

        Args:
            user: User to verify code for
            code: Plain-text backup code

        Returns:
            bool: True if code is valid and was consumed
        """
        code = code.upper().strip()
        code_hash = cls._hash_code(code)

        backup_code = cls.objects.filter(
            user=user,
            code_hash=code_hash,
            used=False,
        ).first()

        if backup_code:
            backup_code.used = True
            backup_code.used_at = timezone.now()
            backup_code.save(update_fields=["used", "used_at"])
            return True

        return False

    @classmethod
    def remaining_codes_count(cls, user) -> int:
        """Get count of remaining unused backup codes."""
        return cls.objects.filter(user=user, used=False).count()


class MFAToken(models.Model):
    """
    Temporary token for MFA verification during login.

    When a user with MFA enabled attempts to login, they receive this
    temporary token instead of an access token. They must complete
    MFA verification using this token.
    """

    TOKEN_LENGTH: ClassVar[int] = 64
    TOKEN_LIFETIME_MINUTES: ClassVar[int] = 5  # Token expires after 5 minutes

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mfa_tokens",
        help_text="User this token belongs to",
    )
    token = models.CharField(
        max_length=128,
        unique=True,
        help_text="The temporary MFA token",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When token was created",
    )
    used = models.BooleanField(
        default=False,
        help_text="Whether this token has been used",
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="IP address of the login request",
    )

    class Meta:
        verbose_name = "MFA Token"
        verbose_name_plural = "MFA Tokens"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user.username} - {self.created_at}"

    def save(self, *args, **kwargs):
        """Generate token if not provided."""
        if not self.token:
            self.token = secrets.token_urlsafe(self.TOKEN_LENGTH)
        super().save(*args, **kwargs)

    def is_valid(self) -> bool:
        """Check if token is still valid (not used and not expired)."""
        if self.used:
            return False

        expiry_time = self.created_at + timezone.timedelta(minutes=self.TOKEN_LIFETIME_MINUTES)
        return timezone.now() < expiry_time

    def mark_used(self) -> None:
        """Mark token as used."""
        self.used = True
        self.save(update_fields=["used"])

    @classmethod
    def create_for_user(cls, user, ip_address: str | None = None) -> "MFAToken":
        """
        Create a new MFA token for a user.

        Invalidates any existing unused tokens for the user.

        Args:
            user: User to create token for
            ip_address: IP address of the request

        Returns:
            MFAToken: The new token
        """
        # Invalidate existing tokens
        cls.objects.filter(user=user, used=False).update(used=True)

        return cls.objects.create(
            user=user,
            ip_address=ip_address,
        )

    @classmethod
    def get_valid_token(cls, token_str: str) -> "MFAToken | None":
        """
        Get a valid MFA token by its string value.

        Args:
            token_str: The token string

        Returns:
            MFAToken or None if not found or invalid
        """
        try:
            mfa_token = cls.objects.get(token=token_str)
            if mfa_token.is_valid():
                return mfa_token
        except cls.DoesNotExist:
            pass
        return None
