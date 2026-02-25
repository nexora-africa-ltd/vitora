"""
Local KMS Provider using Fernet symmetric encryption.

This provider is suitable for:
- Development environments
- Testing
- Single-server deployments without cloud KMS access

For production with cloud deployment, use Azure or GCP providers.
"""

from __future__ import annotations

import base64
import logging
from datetime import UTC, datetime, timedelta

from cryptography.fernet import Fernet, InvalidToken

from .base import (
    DecryptionError,
    EncryptionError,
    KeyMetadata,
    KeyRotationError,
    KeyState,
    KMSProvider,
)

logger = logging.getLogger(__name__)


class LocalKMSProvider(KMSProvider):
    """
    Local KMS provider using Fernet symmetric encryption.

    This provider uses the cryptography library's Fernet implementation,
    which provides AES-128-CBC with HMAC-SHA256 authentication.

    Configuration:
        ENCRYPTION_KEY: A 32-byte base64-encoded Fernet key.
        To generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    """

    def __init__(
        self,
        encryption_key: str,
        key_rotation_days: int = 365,
    ):
        """
        Initialize the local KMS provider.

        Args:
            encryption_key: Fernet key (base64-encoded, 32 bytes).
            key_rotation_days: Days between key rotations (for metadata only).
        """
        self._key = encryption_key
        self._rotation_days = key_rotation_days
        self._created_at = datetime.now(UTC)

        # Validate key format
        try:
            self._fernet = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid Fernet key format: {e}") from e

        logger.info("LocalKMSProvider initialized")

    def encrypt(self, plaintext: bytes, context: dict[str, str] | None = None) -> bytes:
        """
        Encrypt plaintext data using Fernet.

        Args:
            plaintext: The data to encrypt.
            context: Optional context (logged for audit, not used in encryption).

        Returns:
            Encrypted ciphertext.

        Raises:
            EncryptionError: If encryption fails.
        """
        try:
            ciphertext = self._fernet.encrypt(plaintext)
            if context:
                logger.debug(
                    "Encrypted data with context",
                    extra={"context": context, "size": len(plaintext)},
                )
            return ciphertext
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise EncryptionError(f"Failed to encrypt data: {e}") from e

    def decrypt(self, ciphertext: bytes, context: dict[str, str] | None = None) -> bytes:
        """
        Decrypt ciphertext using Fernet.

        Args:
            ciphertext: The encrypted data.
            context: Optional context (for audit logging).

        Returns:
            Decrypted plaintext.

        Raises:
            DecryptionError: If decryption fails.
        """
        try:
            plaintext = self._fernet.decrypt(ciphertext)
            if context:
                logger.debug(
                    "Decrypted data with context",
                    extra={"context": context},
                )
            return plaintext
        except InvalidToken as e:
            logger.error("Decryption failed: invalid token (wrong key or corrupted data)")
            raise DecryptionError("Invalid ciphertext or wrong encryption key") from e
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise DecryptionError(f"Failed to decrypt data: {e}") from e

    def encrypt_string(self, plaintext: str, context: dict[str, str] | None = None) -> str:
        """
        Encrypt a string and return base64-encoded ciphertext.

        Args:
            plaintext: The string to encrypt.
            context: Optional encryption context.

        Returns:
            Base64-encoded ciphertext.
        """
        encrypted = self.encrypt(plaintext.encode("utf-8"), context)
        return base64.urlsafe_b64encode(encrypted).decode("ascii")

    def decrypt_string(self, ciphertext: str, context: dict[str, str] | None = None) -> str:
        """
        Decrypt base64-encoded ciphertext and return plaintext string.

        Args:
            ciphertext: Base64-encoded encrypted data.
            context: Optional encryption context.

        Returns:
            Decrypted plaintext string.
        """
        encrypted = base64.urlsafe_b64decode(ciphertext.encode("ascii"))
        decrypted = self.decrypt(encrypted, context)
        return decrypted.decode("utf-8")

    def rotate_key(self) -> KeyMetadata:
        """
        Generate a new Fernet key.

        Note: In local mode, this only returns a new key but doesn't update
        the provider's key. Key rotation in local mode should be done by:
        1. Generating a new key
        2. Re-encrypting all data with the new key
        3. Updating ENCRYPTION_KEY in settings

        Returns:
            KeyMetadata with the new key in tags['new_key'].

        Raises:
            KeyRotationError: If rotation fails.
        """
        try:
            new_key = Fernet.generate_key().decode("ascii")
            now = datetime.now(UTC)

            logger.warning(
                "Local key rotation triggered. "
                "Manual re-encryption of existing data required!"
            )

            return KeyMetadata(
                key_id=f"local-{now.strftime('%Y%m%d%H%M%S')}",
                key_name="local-fernet-key",
                state=KeyState.ENABLED,
                created_at=now,
                updated_at=now,
                rotation_period_days=self._rotation_days,
                last_rotated_at=now,
                next_rotation_at=now + timedelta(days=self._rotation_days),
                algorithm="Fernet (AES-128-CBC + HMAC-SHA256)",
                provider="local",
                version="new",
                tags={"new_key": new_key},
            )
        except Exception as e:
            logger.error(f"Key rotation failed: {e}")
            raise KeyRotationError(f"Failed to rotate key: {e}") from e

    def get_key_metadata(self) -> KeyMetadata:
        """
        Get metadata about the current encryption key.

        Returns:
            KeyMetadata with information about the local key.
        """
        return KeyMetadata(
            key_id="local-key",
            key_name="local-fernet-key",
            state=KeyState.ENABLED,
            created_at=self._created_at,
            updated_at=self._created_at,
            rotation_period_days=self._rotation_days,
            last_rotated_at=None,  # Unknown for environment variable keys
            next_rotation_at=self._created_at + timedelta(days=self._rotation_days),
            algorithm="Fernet (AES-128-CBC + HMAC-SHA256)",
            provider="local",
            version="1",
            tags=None,
        )

    def is_healthy(self) -> bool:
        """
        Check if the local KMS provider is operational.

        Returns:
            True if encryption/decryption works.
        """
        try:
            test_data = b"health-check"
            encrypted = self.encrypt(test_data)
            decrypted = self.decrypt(encrypted)
            return decrypted == test_data
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False

    def supports_automatic_rotation(self) -> bool:
        """Local provider doesn't support automatic rotation."""
        return False

    @staticmethod
    def generate_key() -> str:
        """
        Generate a new Fernet key.

        Returns:
            A new base64-encoded Fernet key.
        """
        return Fernet.generate_key().decode("ascii")
