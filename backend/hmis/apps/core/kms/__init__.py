"""
KMS (Key Management System) Module for Vitora HMIS.

This module provides an abstraction layer for key management operations,
supporting multiple KMS backends:
- Local: Fernet-based encryption for development/testing
- Azure: Azure Key Vault for production (primary)
- GCP: Google Cloud KMS for production (alternative)

Usage:
    from hmis.apps.core.kms import get_kms_provider

    kms = get_kms_provider()
    encrypted = kms.encrypt(b"sensitive data")
    decrypted = kms.decrypt(encrypted)

Configuration:
    Set KMS_PROVIDER in Django settings:
    - "local": Use Fernet with ENCRYPTION_KEY from settings
    - "azure": Use Azure Key Vault
    - "gcp": Use Google Cloud KMS (future)

Sprint: Phase 1 - DHA Compliance
Feature: Key Management System (KMS) Integration
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from django.conf import settings

if TYPE_CHECKING:
    from .base import KMSProvider


@lru_cache(maxsize=1)
def get_kms_provider() -> KMSProvider:
    """
    Factory function to get the configured KMS provider.

    Returns a singleton instance of the configured KMS provider.
    The provider is cached for performance.

    Returns:
        KMSProvider: The configured KMS provider instance.

    Raises:
        ValueError: If an invalid KMS_PROVIDER is configured.
        ImportError: If required dependencies are not installed.
    """
    provider_name = getattr(settings, "KMS_PROVIDER", "local").lower()

    if provider_name == "local":
        from .local import LocalKMSProvider

        encryption_key = getattr(settings, "ENCRYPTION_KEY", None)
        if not encryption_key:
            raise ValueError("ENCRYPTION_KEY must be set for local KMS provider")
        return LocalKMSProvider(encryption_key=encryption_key)

    elif provider_name == "azure":
        from .azure import AzureKeyVaultProvider

        vault_url = getattr(settings, "AZURE_KEY_VAULT_URL", None)
        key_name = getattr(settings, "AZURE_KEY_NAME", "vitora-hmis-key")

        if not vault_url:
            raise ValueError("AZURE_KEY_VAULT_URL must be set for Azure KMS provider")

        return AzureKeyVaultProvider(
            vault_url=vault_url,
            key_name=key_name,
        )

    elif provider_name == "gcp":
        from .gcp import GCPKMSProvider

        project_id = getattr(settings, "GCP_PROJECT_ID", None)
        location = getattr(settings, "GCP_KMS_LOCATION", "global")
        keyring = getattr(settings, "GCP_KMS_KEYRING", "vitora-hmis")
        key_name = getattr(settings, "GCP_KMS_KEY", "vitora-key")

        if not project_id:
            raise ValueError("GCP_PROJECT_ID must be set for GCP KMS provider")

        return GCPKMSProvider(
            project_id=project_id,
            location=location,
            keyring=keyring,
            key_name=key_name,
        )

    else:
        raise ValueError(
            f"Invalid KMS_PROVIDER: {provider_name}. Valid options: 'local', 'azure', 'gcp'"
        )


def clear_kms_cache() -> None:
    """Clear the KMS provider cache. Useful for testing."""
    get_kms_provider.cache_clear()


__all__ = [
    "get_kms_provider",
    "clear_kms_cache",
]
