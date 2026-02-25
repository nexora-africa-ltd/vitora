"""
Key Rotation Service.

Provides functionality for rotating encryption keys and re-encrypting
existing data with the new key.

Key rotation is critical for:
- Compliance with security policies (annual rotation minimum per DHA)
- Limiting the impact of potential key compromise
- Meeting regulatory requirements (Kenya DPA 2019)

Usage:
    from hmis.apps.core.kms.rotation import KeyRotationService

    service = KeyRotationService()

    # Check if rotation is needed
    if service.needs_rotation():
        result = service.rotate_and_reencrypt()
"""

from __future__ import annotations

import contextlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import models

from .base import KeyMetadata, KeyState

if TYPE_CHECKING:
    from .base import KMSProvider

logger = logging.getLogger(__name__)


@dataclass
class RotationResult:
    """Result of a key rotation operation."""

    success: bool
    old_key_id: str | None
    new_key_id: str | None
    records_reencrypted: int
    errors: list[str]
    started_at: datetime
    completed_at: datetime | None
    metadata: KeyMetadata | None = None


class KeyRotationService:
    """
    Service for managing key rotation and data re-encryption.

    Handles:
    - Determining when rotation is needed
    - Triggering key rotation in the KMS provider
    - Re-encrypting existing data with new keys (for local provider)
    - Logging rotation events for audit trails
    """

    def __init__(
        self,
        provider: KMSProvider | None = None,
        rotation_days: int | None = None,
    ):
        """
        Initialize the rotation service.

        Args:
            provider: KMS provider instance. If None, uses get_kms_provider().
            rotation_days: Days between rotations. Default from settings or 365.
        """
        if provider is None:
            from . import get_kms_provider

            provider = get_kms_provider()

        self._provider = provider
        self._rotation_days = rotation_days or getattr(
            settings, "KMS_KEY_ROTATION_DAYS", 365
        )

    def needs_rotation(self) -> bool:
        """
        Check if the current key needs rotation based on policy.

        Returns:
            True if rotation is needed.
        """
        try:
            metadata = self._provider.get_key_metadata()

            # If key is disabled, don't rotate
            if metadata.state != KeyState.ENABLED:
                logger.warning(f"Key {metadata.key_id} is not enabled, skipping rotation check")
                return False

            # Check next rotation time
            if metadata.next_rotation_at and datetime.now(UTC) >= metadata.next_rotation_at:
                logger.info(f"Key rotation needed: past next_rotation_at ({metadata.next_rotation_at})")
                return True

            # Check last rotation time
            if metadata.last_rotated_at:
                days_since_rotation = (
                    datetime.now(UTC) - metadata.last_rotated_at
                ).days
                if days_since_rotation >= self._rotation_days:
                    logger.info(
                        f"Key rotation needed: {days_since_rotation} days since last rotation"
                    )
                    return True

            # Check creation time if never rotated
            if metadata.created_at and not metadata.last_rotated_at:
                days_since_creation = (
                    datetime.now(UTC) - metadata.created_at
                ).days
                if days_since_creation >= self._rotation_days:
                    logger.info(
                        f"Key rotation needed: {days_since_creation} days since creation"
                    )
                    return True

            return False

        except Exception as e:
            logger.error(f"Error checking rotation status: {e}")
            return False

    def rotate(self) -> RotationResult:
        """
        Rotate the encryption key.

        For cloud providers (Azure, GCP), this creates a new key version.
        For local provider, this generates a new key (but doesn't auto-apply).

        Returns:
            RotationResult with details of the operation.

        Raises:
            KeyRotationError: If rotation fails.
        """
        started_at = datetime.now(UTC)
        old_metadata = None

        try:
            # Get current key info
            with contextlib.suppress(Exception):
                old_metadata = self._provider.get_key_metadata()

            # Perform rotation
            new_metadata = self._provider.rotate_key()

            # Log the rotation event
            self._log_rotation_event(old_metadata, new_metadata)

            return RotationResult(
                success=True,
                old_key_id=old_metadata.key_id if old_metadata else None,
                new_key_id=new_metadata.key_id,
                records_reencrypted=0,  # No automatic re-encryption
                errors=[],
                started_at=started_at,
                completed_at=datetime.now(UTC),
                metadata=new_metadata,
            )

        except Exception as e:
            logger.error(f"Key rotation failed: {e}")
            return RotationResult(
                success=False,
                old_key_id=old_metadata.key_id if old_metadata else None,
                new_key_id=None,
                records_reencrypted=0,
                errors=[str(e)],
                started_at=started_at,
                completed_at=datetime.now(UTC),
            )

    def rotate_and_reencrypt(
        self,
        models_to_reencrypt: list[type[models.Model]] | None = None,
        batch_size: int = 100,
    ) -> RotationResult:
        """
        Rotate the key and re-encrypt existing data.

        This is primarily for local provider where new key versions
        aren't automatically used for decryption of old data.

        Cloud providers (Azure, GCP) maintain old key versions and can
        decrypt data encrypted with any version, so re-encryption is optional
        (but recommended for security best practices).

        Args:
            models_to_reencrypt: List of Django models with encrypted fields.
                If None, discovers models automatically.
            batch_size: Number of records to process per batch.

        Returns:
            RotationResult with re-encryption statistics.
        """
        started_at = datetime.now(UTC)
        errors: list[str] = []
        total_reencrypted = 0

        # First, rotate the key
        rotation_result = self.rotate()
        if not rotation_result.success:
            return rotation_result

        # For cloud providers, re-encryption is optional
        if self._provider.supports_automatic_rotation():
            logger.info(
                "Cloud KMS provider handles key versioning. "
                "Re-encryption is optional but recommended for data hygiene."
            )

        # If no models specified, discover encrypted fields
        if models_to_reencrypt is None:
            models_to_reencrypt = self._discover_encrypted_models()

        # Re-encrypt each model's encrypted fields
        for model in models_to_reencrypt:
            try:
                count = self._reencrypt_model(model, batch_size)
                total_reencrypted += count
                logger.info(f"Re-encrypted {count} records in {model.__name__}")
            except Exception as e:
                error_msg = f"Failed to re-encrypt {model.__name__}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)

        return RotationResult(
            success=len(errors) == 0,
            old_key_id=rotation_result.old_key_id,
            new_key_id=rotation_result.new_key_id,
            records_reencrypted=total_reencrypted,
            errors=errors,
            started_at=started_at,
            completed_at=datetime.now(UTC),
            metadata=rotation_result.metadata,
        )

    def _discover_encrypted_models(self) -> list[type[models.Model]]:
        """
        Discover Django models with encrypted fields.

        Returns:
            List of model classes with encrypted fields.
        """
        from django.apps import apps

        # Known models with encrypted fields in Vitora HMIS
        encrypted_models = []

        # Patient model has national_id and phone_number encrypted
        try:
            Patient = apps.get_model("patients", "Patient")
            encrypted_models.append(Patient)
        except LookupError:
            pass

        return encrypted_models

    def _reencrypt_model(
        self,
        model: type[models.Model],
        batch_size: int = 100,  # noqa: ARG002
    ) -> int:
        """
        Re-encrypt encrypted fields in a model.

        Args:
            model: Django model class.
            batch_size: Records per batch.

        Returns:
            Number of records re-encrypted.
        """
        # For now, this is a stub - actual implementation depends on
        # how encrypted fields are implemented (django-fernet-fields, etc.)
        logger.warning(
            f"Re-encryption for {model.__name__} not yet implemented. "
            "Implement based on your encrypted field library."
        )
        return 0

    def _log_rotation_event(
        self,
        old_metadata: KeyMetadata | None,
        new_metadata: KeyMetadata,
    ) -> None:
        """
        Log key rotation event for audit purposes.

        Args:
            old_metadata: Previous key metadata.
            new_metadata: New key metadata.
        """
        try:
            from hmis.apps.core.models import AuditLog

            AuditLog.objects.create(
                action="key_rotation",
                resource_type="KMS",
                resource_id=hash(new_metadata.key_id) % (10**9),  # Convert to int
                details={
                    "old_key_id": old_metadata.key_id if old_metadata else None,
                    "new_key_id": new_metadata.key_id,
                    "provider": new_metadata.provider,
                    "algorithm": new_metadata.algorithm,
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )
        except Exception as e:
            logger.warning(f"Failed to create audit log for key rotation: {e}")
