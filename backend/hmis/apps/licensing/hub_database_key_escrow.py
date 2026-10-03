# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Azure Key Vault-backed SQLCipher key escrow for active hub installations.

Use ``HubDatabaseKeyEscrowService.submit`` to wrap a hub-provided SQLCipher key
and ``recovery_envelope`` to deliver it only in an X25519 device-bound envelope.
Inputs are active ``Installation`` objects, key material, and device public keys.
"""

from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from hmis.apps.core.kms.azure import AzureKeyVaultProvider

from .activation_secrets import encrypt_activation_secrets, validate_device_public_key
from .models import HubDatabaseKeyEscrow, Installation


class HubDatabaseKeyEscrowUnavailable(Exception):
    """Raised when escrow has not been configured or cannot serve a request."""


class HubDatabaseKeyEscrowService:
    """Keep SQLCipher key material encrypted by a dedicated Azure Key Vault key."""

    algorithm = "RSA-OAEP-256"

    def _configuration(self) -> tuple[str, str]:
        if not getattr(settings, "HUB_DB_ESCROW_ENABLED", False):
            raise HubDatabaseKeyEscrowUnavailable("Hub database key escrow is disabled.")
        vault_url = (getattr(settings, "AZURE_KEY_VAULT_URL", "") or "").strip()
        key_name = (getattr(settings, "AZURE_HUB_DB_ESCROW_KEY_NAME", "") or "").strip()
        if not vault_url or not key_name:
            raise HubDatabaseKeyEscrowUnavailable("Hub database key escrow is not configured.")
        return vault_url, key_name

    @staticmethod
    def _context(installation: Installation) -> dict[str, str]:
        return {
            "purpose": "hub_database_key_escrow",
            "installation_id": str(installation.installation_id),
            "organization_id": str(installation.organization_id),
            "facility_id": str(installation.facility_id or ""),
        }

    def submit(self, installation: Installation, key_material: str) -> HubDatabaseKeyEscrow:
        """Wrap and persist a hub SQLCipher key without retaining plaintext."""
        vault_url, key_name = self._configuration()
        provider = AzureKeyVaultProvider(vault_url=vault_url, key_name=key_name)
        metadata = provider.get_key_metadata()
        wrapped_ciphertext = provider.wrap_key(key_material.encode("utf-8"))

        with transaction.atomic():
            escrow, created = HubDatabaseKeyEscrow.objects.select_for_update().get_or_create(
                installation=installation,
                defaults={
                    "organization": installation.organization,
                    "facility": installation.facility,
                    "wrapped_ciphertext": wrapped_ciphertext,
                    "vault_url": vault_url,
                    "key_name": key_name,
                    "key_version": metadata.version or "",
                    "algorithm": self.algorithm,
                },
            )
            if not created:
                escrow.organization = installation.organization
                escrow.facility = installation.facility
                escrow.wrapped_ciphertext = wrapped_ciphertext
                escrow.vault_url = vault_url
                escrow.key_name = key_name
                escrow.key_version = metadata.version or ""
                escrow.algorithm = self.algorithm
                escrow.submitted_at = timezone.now()
                escrow.save()
        return escrow

    def recovery_envelope(
        self, installation: Installation, device_public_key: str
    ) -> dict[str, str | int]:
        """Unwrap transiently and encrypt the key to a validated device public key."""
        self._configuration()
        validate_device_public_key(device_public_key)
        try:
            escrow = installation.database_key_escrow
        except HubDatabaseKeyEscrow.DoesNotExist as exc:
            raise HubDatabaseKeyEscrowUnavailable(
                "No database key escrow exists for this installation."
            ) from exc

        provider = AzureKeyVaultProvider(
            vault_url=escrow.vault_url,
            key_name=escrow.key_name,
            key_version=escrow.key_version,
        )
        key_material = provider.unwrap_key(bytes(escrow.wrapped_ciphertext)).decode("utf-8")
        envelope = encrypt_activation_secrets(
            {"hub_database_encryption_key": key_material},
            device_public_key,
            installation_id=str(installation.installation_id),
            organization_id=installation.organization_id,
            facility_id=installation.facility_id,
        )
        HubDatabaseKeyEscrow.objects.filter(pk=escrow.pk).update(
            last_recovered_at=timezone.now(),
            recovery_count=escrow.recovery_count + 1,
        )
        return envelope
