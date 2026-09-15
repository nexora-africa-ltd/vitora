# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Azure Key Vault KMS Provider.

This provider integrates with Azure Key Vault for enterprise-grade
key management with:
- Hardware Security Module (HSM) backed keys
- Automatic key rotation support
- Azure AD/Managed Identity authentication
- Full audit logging in Azure Monitor

Configuration:
    AZURE_KEY_VAULT_URL: Azure Key Vault URL (e.g., https://myvault.vault.azure.net)
    AZURE_KEY_NAME: Name of the key in Key Vault
    AZURE_TENANT_ID: Azure AD tenant ID (optional if using Managed Identity)
    AZURE_CLIENT_ID: Azure AD client ID (optional if using Managed Identity)
    AZURE_CLIENT_SECRET: Azure AD client secret (optional if using Managed Identity)

Note: In production, use Managed Identity for authentication instead of
client secrets. This provider uses DefaultAzureCredential which automatically
handles various authentication methods.
"""

from __future__ import annotations

import base64
import logging
from functools import cached_property
from typing import TYPE_CHECKING

from .base import (
    DecryptionError,
    EncryptionError,
    KeyMetadata,
    KeyNotFoundError,
    KeyRotationError,
    KeyState,
    KMSProvider,
)

if TYPE_CHECKING:
    from azure.keyvault.keys import KeyClient
    from azure.keyvault.keys.crypto import CryptographyClient

logger = logging.getLogger(__name__)


def _sanitize_log_field(value: object) -> str:
    text = str(value)
    return text.replace("\r", " ").replace("\n", " ")


def _azure_kms_handled_exceptions() -> tuple[type[Exception], ...]:
    """Exceptions expected from Azure SDK/KMS operations."""
    base: tuple[type[Exception], ...] = (
        ImportError,
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
    )
    try:
        from azure.core.exceptions import AzureError

        return (AzureError, *base)
    except ImportError:
        return base


def _get_azure_imports():
    """
    Lazy import Azure SDK to avoid ImportError when Azure is not configured.

    Returns:
        Tuple of (DefaultAzureCredential, KeyClient, CryptographyClient, EncryptionAlgorithm).

    Raises:
        ImportError: If azure-identity or azure-keyvault-keys is not installed.
    """
    try:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.keys import KeyClient
        from azure.keyvault.keys.crypto import CryptographyClient, EncryptionAlgorithm

        return DefaultAzureCredential, KeyClient, CryptographyClient, EncryptionAlgorithm
    except ImportError as e:
        raise ImportError(
            "Azure SDK not installed. Install with: poetry add azure-identity azure-keyvault-keys"
        ) from e


class AzureKeyVaultProvider(KMSProvider):
    """
    Azure Key Vault KMS provider.

    Uses Azure Key Vault for cryptographic operations with support for:
    - RSA-OAEP encryption (for key wrapping)
    - Automatic key rotation via Azure policies
    - Managed Identity authentication in production
    - HSM-backed keys for FIPS 140-2 compliance
    """

    def __init__(
        self,
        vault_url: str,
        key_name: str,
        key_version: str | None = None,
    ):
        """
        Initialize Azure Key Vault provider.

        Args:
            vault_url: Azure Key Vault URL (e.g., https://myvault.vault.azure.net).
            key_name: Name of the key in Key Vault.
            key_version: Specific key version to use (None = latest).
        """
        self._vault_url = vault_url
        self._key_name = key_name
        self._key_version = key_version

        # Import Azure SDK
        (
            self._DefaultAzureCredential,
            self._KeyClient,
            self._CryptographyClient,
            self._EncryptionAlgorithm,
        ) = _get_azure_imports()

        logger.info(
            "AzureKeyVaultProvider initialized for vault: %s, key: %s",
            _sanitize_log_field(vault_url),
            _sanitize_log_field(key_name),
        )

    @cached_property
    def _credential(self):
        """Get Azure credential (lazy loaded)."""
        return self._DefaultAzureCredential()

    @cached_property
    def _key_client(self) -> KeyClient:
        """Get Key Vault key client (lazy loaded)."""
        return self._KeyClient(vault_url=self._vault_url, credential=self._credential)

    @cached_property
    def _crypto_client(self) -> CryptographyClient:
        """Get cryptography client for the configured key."""
        if self._key_version:
            key_id = f"{self._vault_url}/keys/{self._key_name}/{self._key_version}"
        else:
            key_id = f"{self._vault_url}/keys/{self._key_name}"

        return self._CryptographyClient(key_id, credential=self._credential)

    def encrypt(self, plaintext: bytes, context: dict[str, str] | None = None) -> bytes:
        """
        Encrypt data using Azure Key Vault.

        Note: Azure Key Vault has size limits for direct encryption (~190 bytes for RSA-OAEP).
        For larger data, we use envelope encryption:
        1. Generate a DEK (Data Encryption Key)
        2. Encrypt the data with the DEK (locally using AES)
        3. Encrypt the DEK with Azure Key Vault (key wrapping)
        4. Return wrapped DEK + encrypted data

        Args:
            plaintext: Data to encrypt.
            context: Optional encryption context for auditing.

        Returns:
            Encrypted data (envelope encrypted for large payloads).

        Raises:
            EncryptionError: If encryption fails.
        """
        try:
            # For small data, use direct encryption
            if len(plaintext) <= 190:
                result = self._crypto_client.encrypt(
                    self._EncryptionAlgorithm.rsa_oaep_256,
                    plaintext,
                )
                # Prefix with 'D' to indicate direct encryption
                return b"D" + result.ciphertext

            # For large data, use envelope encryption
            from cryptography.fernet import Fernet

            # Generate ephemeral DEK
            dek = Fernet.generate_key()
            fernet = Fernet(dek)

            # Encrypt data with DEK
            encrypted_data = fernet.encrypt(plaintext)

            # Wrap DEK with Azure Key Vault
            wrapped_dek = self._crypto_client.encrypt(
                self._EncryptionAlgorithm.rsa_oaep_256,
                dek,
            )

            # Format: E + len(wrapped_dek, 4 bytes) + wrapped_dek + encrypted_data
            dek_len = len(wrapped_dek.ciphertext).to_bytes(4, "big")
            result = b"E" + dek_len + wrapped_dek.ciphertext + encrypted_data

            if context:
                logger.debug(
                    "Encrypted data with Azure KMS",
                    extra={"context": context, "size": len(plaintext)},
                )

            return result

        except _azure_kms_handled_exceptions() as e:
            logger.error("Azure encryption failed (%s)", type(e).__name__)
            raise EncryptionError(f"Azure Key Vault encryption failed: {e}") from e

    def decrypt(self, ciphertext: bytes, context: dict[str, str] | None = None) -> bytes:
        """
        Decrypt data using Azure Key Vault.

        Args:
            ciphertext: Encrypted data.
            context: Optional encryption context for auditing.

        Returns:
            Decrypted plaintext.

        Raises:
            DecryptionError: If decryption fails.
        """
        try:
            if not ciphertext:
                raise DecryptionError("Empty ciphertext")

            mode = ciphertext[0:1]

            if mode == b"D":
                # Direct decryption
                result = self._crypto_client.decrypt(
                    self._EncryptionAlgorithm.rsa_oaep_256,
                    ciphertext[1:],
                )
                return result.plaintext

            elif mode == b"E":
                # Envelope decryption
                from cryptography.fernet import Fernet

                dek_len = int.from_bytes(ciphertext[1:5], "big")
                wrapped_dek = ciphertext[5 : 5 + dek_len]
                encrypted_data = ciphertext[5 + dek_len :]

                # Unwrap DEK
                result = self._crypto_client.decrypt(
                    self._EncryptionAlgorithm.rsa_oaep_256,
                    wrapped_dek,
                )
                dek = result.plaintext

                # Decrypt data with DEK
                fernet = Fernet(dek)
                plaintext = fernet.decrypt(encrypted_data)

                if context:
                    logger.debug(
                        "Decrypted data with Azure KMS",
                        extra={"context": context},
                    )

                return plaintext

            else:
                raise DecryptionError(f"Unknown encryption mode: {mode}")

        except DecryptionError:
            raise
        except _azure_kms_handled_exceptions() as e:
            logger.error("Azure decryption failed (%s)", type(e).__name__)
            raise DecryptionError(f"Azure Key Vault decryption failed: {e}") from e

    def encrypt_string(self, plaintext: str, context: dict[str, str] | None = None) -> str:
        """
        Encrypt a string and return base64-encoded ciphertext.

        Args:
            plaintext: String to encrypt.
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
        Trigger key rotation in Azure Key Vault.

        Creates a new version of the key. Previous versions remain available
        for decryption of existing data.

        Returns:
            KeyMetadata with information about the new key version.

        Raises:
            KeyRotationError: If rotation fails.
        """
        try:
            # Create new version by creating key with same properties
            # Azure automatically versions keys
            new_key = self._key_client.rotate_key(self._key_name)

            logger.info(
                "Azure key rotated: %s, new version: %s",
                _sanitize_log_field(self._key_name),
                _sanitize_log_field(new_key.properties.version),
            )

            return self._key_to_metadata(new_key)

        except _azure_kms_handled_exceptions() as e:
            logger.error("Azure key rotation failed (%s)", type(e).__name__)
            raise KeyRotationError(f"Failed to rotate Azure key: {e}") from e

    def get_key_metadata(self) -> KeyMetadata:
        """
        Get metadata about the current key from Azure Key Vault.

        Returns:
            KeyMetadata with key information.
        """
        try:
            key = self._key_client.get_key(self._key_name, self._key_version)
            return self._key_to_metadata(key)
        except _azure_kms_handled_exceptions() as e:
            logger.error("Failed to get key metadata (%s)", type(e).__name__)
            raise KeyNotFoundError(f"Key not found: {self._key_name}") from e

    def _key_to_metadata(self, key) -> KeyMetadata:
        """Convert Azure key to KeyMetadata."""
        props = key.properties

        # Map Azure key state
        state = KeyState.ENABLED if props.enabled else KeyState.DISABLED

        return KeyMetadata(
            key_id=key.id,
            key_name=key.name,
            state=state,
            created_at=props.created_on,
            updated_at=props.updated_on,
            rotation_period_days=None,  # Get from rotation policy if available
            last_rotated_at=props.updated_on,
            next_rotation_at=props.expires_on,
            algorithm=str(key.key.kty),
            provider="azure",
            version=props.version,
            tags=props.tags,
        )

    def is_healthy(self) -> bool:
        """
        Check if Azure Key Vault is accessible and the key exists.

        Returns:
            True if the provider can perform operations.
        """
        try:
            key = self._key_client.get_key(self._key_name)
            return key.properties.enabled
        except _azure_kms_handled_exceptions() as e:
            logger.error("Azure health check failed (%s)", type(e).__name__)
            return False

    def supports_automatic_rotation(self) -> bool:
        """Azure Key Vault supports automatic key rotation policies."""
        return True

    def configure_rotation_policy(
        self,
        rotate_after_days: int = 365,
        notify_before_days: int = 30,
    ) -> None:
        """
        Configure automatic key rotation policy in Azure.

        Args:
            rotate_after_days: Days after creation to rotate the key.
            notify_before_days: Days before expiry to notify.

        Raises:
            KeyRotationError: If policy configuration fails.
        """
        try:
            from azure.keyvault.keys import KeyRotationLifetimeAction, KeyRotationPolicy

            policy = KeyRotationPolicy(
                lifetime_actions=[
                    KeyRotationLifetimeAction(
                        action="rotate",
                        time_after_create=f"P{rotate_after_days}D",
                    ),
                    KeyRotationLifetimeAction(
                        action="notify",
                        time_before_expiry=f"P{notify_before_days}D",
                    ),
                ],
            )

            self._key_client.update_key_rotation_policy(self._key_name, policy)
            logger.info(
                "Configured rotation policy for %s: rotate every %d days",
                _sanitize_log_field(self._key_name),
                rotate_after_days,
            )

        except _azure_kms_handled_exceptions() as e:
            logger.error("Failed to configure rotation policy (%s)", type(e).__name__)
            raise KeyRotationError(f"Failed to configure rotation policy: {e}") from e
