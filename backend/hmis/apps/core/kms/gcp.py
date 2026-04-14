"""
Google Cloud KMS Provider (Stub).

This module provides a stub implementation for Google Cloud KMS.
Currently not implemented - use Azure Key Vault for production.

If GCP becomes the deployment target, implement this provider following
the same pattern as the Azure provider.

Configuration (when implemented):
    GCP_PROJECT_ID: Google Cloud project ID
    GCP_KMS_LOCATION: KMS location (e.g., 'global', 'us-east1')
    GCP_KMS_KEYRING: Key ring name
    GCP_KMS_KEY: Key name within the key ring
"""

from __future__ import annotations

import logging

from .base import KeyMetadata, KeyState, KMSError, KMSProvider

logger = logging.getLogger(__name__)


class GCPKMSProvider(KMSProvider):
    """
    Google Cloud KMS provider.

    ⚠️ NOT YET IMPLEMENTED - This is a stub for future GCP support.

    When implemented, this provider will support:
    - Symmetric encryption with AES-256-GCM
    - Automatic key rotation
    - IAM-based access control
    - Cloud HSM backed keys

    Installation (when ready):
        poetry add google-cloud-kms
    """

    def __init__(
        self,
        project_id: str,
        location: str = "global",
        keyring: str = "vitora-hmis",
        key_name: str = "vitora-key",
    ):
        """
        Initialize GCP KMS provider.

        Args:
            project_id: GCP project ID.
            location: KMS location.
            keyring: Key ring name.
            key_name: Key name.
        """
        self._project_id = project_id
        self._location = location
        self._keyring = keyring
        self._key_name = key_name

        logger.warning(
            "GCPKMSProvider is a stub - not implemented. Use Azure Key Vault for production."
        )

    def _not_implemented(self) -> None:
        """Raise not implemented error."""
        raise KMSError(
            "GCP KMS provider is not yet implemented. "
            "Please use 'azure' or 'local' provider until GCP support is added."
        )

    def encrypt(self, plaintext: bytes, context: dict[str, str] | None = None) -> bytes:  # noqa: ARG002
        """Not yet implemented."""
        self._not_implemented()
        return b""  # unreachable

    def decrypt(self, ciphertext: bytes, context: dict[str, str] | None = None) -> bytes:  # noqa: ARG002
        """Not yet implemented."""
        self._not_implemented()
        return b""  # unreachable

    def encrypt_string(self, plaintext: str, context: dict[str, str] | None = None) -> str:  # noqa: ARG002
        """Not yet implemented."""
        self._not_implemented()
        return ""  # unreachable

    def decrypt_string(self, ciphertext: str, context: dict[str, str] | None = None) -> str:  # noqa: ARG002
        """Not yet implemented."""
        self._not_implemented()
        return ""  # unreachable

    def rotate_key(self) -> KeyMetadata:
        """Not yet implemented."""
        self._not_implemented()
        return KeyMetadata(  # unreachable
            key_id="",
            key_name="",
            state=KeyState.DISABLED,
            created_at=None,
            updated_at=None,
        )

    def get_key_metadata(self) -> KeyMetadata:
        """Return stub metadata indicating not implemented."""
        return KeyMetadata(
            key_id=f"projects/{self._project_id}/locations/{self._location}/keyRings/{self._keyring}/cryptoKeys/{self._key_name}",
            key_name=self._key_name,
            state=KeyState.DISABLED,
            created_at=None,
            updated_at=None,
            algorithm="NOT_IMPLEMENTED",
            provider="gcp",
            tags={"status": "stub - not implemented"},
        )

    def is_healthy(self) -> bool:
        """Always returns False for stub provider."""
        return False

    def supports_automatic_rotation(self) -> bool:
        """GCP KMS supports automatic rotation when implemented."""
        return True
