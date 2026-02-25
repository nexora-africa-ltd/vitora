"""
Abstract base class for KMS providers.

All KMS providers must implement this interface to ensure
interoperability and ease of switching between providers.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class KeyState(Enum):
    """Enumeration of possible key states."""

    ENABLED = "enabled"
    DISABLED = "disabled"
    PENDING_DELETION = "pending_deletion"
    DESTROYED = "destroyed"
    PENDING_IMPORT = "pending_import"


@dataclass
class KeyMetadata:
    """Metadata about a cryptographic key."""

    key_id: str
    key_name: str
    state: KeyState
    created_at: datetime | None
    updated_at: datetime | None
    rotation_period_days: int | None = None
    last_rotated_at: datetime | None = None
    next_rotation_at: datetime | None = None
    algorithm: str = "AES-256-GCM"
    provider: str = "unknown"
    version: str | None = None
    tags: dict[str, str] | None = None


@dataclass
class EncryptionResult:
    """Result of an encryption operation."""

    ciphertext: bytes
    key_id: str | None = None
    key_version: str | None = None
    algorithm: str | None = None
    additional_data: dict[str, Any] | None = None


class KMSProvider(ABC):
    """
    Abstract base class for Key Management System providers.

    All KMS implementations must provide these methods to ensure
    consistent behavior across different cloud providers.
    """

    @abstractmethod
    def encrypt(self, plaintext: bytes, context: dict[str, str] | None = None) -> bytes:
        """
        Encrypt plaintext data.

        Args:
            plaintext: The data to encrypt.
            context: Optional encryption context for additional authenticated data.
                    This is logged but not encrypted, useful for audit trails.

        Returns:
            The encrypted ciphertext as bytes.

        Raises:
            EncryptionError: If encryption fails.
        """
        pass

    @abstractmethod
    def decrypt(self, ciphertext: bytes, context: dict[str, str] | None = None) -> bytes:
        """
        Decrypt ciphertext data.

        Args:
            ciphertext: The encrypted data to decrypt.
            context: Optional encryption context (must match what was used during encryption).

        Returns:
            The decrypted plaintext as bytes.

        Raises:
            DecryptionError: If decryption fails.
        """
        pass

    @abstractmethod
    def encrypt_string(self, plaintext: str, context: dict[str, str] | None = None) -> str:
        """
        Encrypt a string and return base64-encoded ciphertext.

        Args:
            plaintext: The string to encrypt.
            context: Optional encryption context.

        Returns:
            Base64-encoded ciphertext.
        """
        pass

    @abstractmethod
    def decrypt_string(self, ciphertext: str, context: dict[str, str] | None = None) -> str:
        """
        Decrypt base64-encoded ciphertext and return plaintext string.

        Args:
            ciphertext: Base64-encoded encrypted data.
            context: Optional encryption context.

        Returns:
            Decrypted plaintext string.
        """
        pass

    @abstractmethod
    def rotate_key(self) -> KeyMetadata:
        """
        Trigger key rotation.

        For cloud KMS providers, this creates a new key version.
        For local provider, this generates a new key.

        Returns:
            KeyMetadata: Metadata about the new key version.

        Raises:
            KeyRotationError: If rotation fails.
        """
        pass

    @abstractmethod
    def get_key_metadata(self) -> KeyMetadata:
        """
        Get metadata about the current encryption key.

        Returns:
            KeyMetadata: Information about the key including rotation schedule.
        """
        pass

    @abstractmethod
    def is_healthy(self) -> bool:
        """
        Check if the KMS provider is healthy and operational.

        Returns:
            True if the provider can perform encryption/decryption operations.
        """
        pass

    def get_provider_name(self) -> str:
        """
        Get the name of this KMS provider.

        Returns:
            The provider name (e.g., 'azure', 'gcp', 'local').
        """
        return self.__class__.__name__

    def supports_automatic_rotation(self) -> bool:
        """
        Check if this provider supports automatic key rotation.

        Returns:
            True if automatic rotation is supported.
        """
        return False


class KMSError(Exception):
    """Base exception for KMS operations."""

    pass


class EncryptionError(KMSError):
    """Exception raised when encryption fails."""

    pass


class DecryptionError(KMSError):
    """Exception raised when decryption fails."""

    pass


class KeyRotationError(KMSError):
    """Exception raised when key rotation fails."""

    pass


class KeyNotFoundError(KMSError):
    """Exception raised when a key is not found."""

    pass
