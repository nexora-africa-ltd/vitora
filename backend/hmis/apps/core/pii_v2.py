# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Organization-scoped AES-GCM PII encryption; import OrganizationPIIEncryptionService in PII code.

Inputs are a persisted Organization, model label, field name, and plaintext string. Ciphertext is
stored as ``v2.<key-version>.<nonce-base64url>.<ciphertext-base64url>``.
"""

from __future__ import annotations

import base64
import os
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db import IntegrityError, transaction

from hmis.apps.core.kms import get_kms_provider
from hmis.apps.core.kms.base import KMSProvider
from hmis.apps.core.models_org import Organization, OrganizationPIIKeyVersion


class OrganizationPIIEncryptionService:
    """Encrypt PII with per-organization DEKs stored only in KMS-wrapped form."""

    PREFIX = "v2"

    def __init__(self, provider: KMSProvider | None = None):
        self.provider = provider or get_kms_provider()

    def encrypt(
        self, organization: Organization, plaintext: str, *, model_label: str, field_name: str
    ) -> str:
        """Encrypt plaintext using the active organization DEK and authenticated context."""
        key_version = self._active_key_version(organization)
        dek = self._unwrap_dek(key_version)
        nonce = os.urandom(12)
        ciphertext = AESGCM(dek).encrypt(
            nonce, plaintext.encode("utf-8"), self._aad(organization, model_label, field_name)
        )
        return ".".join(
            [
                self.PREFIX,
                str(key_version.version),
                self._encode(nonce),
                self._encode(ciphertext),
            ]
        )

    def decrypt(
        self, organization: Organization, ciphertext: str, *, model_label: str, field_name: str
    ) -> str:
        """Decrypt a v2 ciphertext, validating its organization/model/field binding."""
        try:
            prefix, version, encoded_nonce, encoded_ciphertext = ciphertext.split(".")
            if prefix != self.PREFIX:
                raise ValueError("unsupported PII ciphertext version")
            key_version = OrganizationPIIKeyVersion.objects.get(
                organization=organization, version=int(version)
            )
            plaintext = AESGCM(self._unwrap_dek(key_version)).decrypt(
                self._decode(encoded_nonce),
                self._decode(encoded_ciphertext),
                self._aad(organization, model_label, field_name),
            )
            return plaintext.decode("utf-8")
        except (InvalidTag, ValueError, OrganizationPIIKeyVersion.DoesNotExist) as exc:
            raise ValueError("v2 PII ciphertext could not be decrypted") from exc

    def _active_key_version(self, organization: Organization) -> OrganizationPIIKeyVersion:
        existing = OrganizationPIIKeyVersion.objects.filter(
            organization=organization, is_active=True
        ).first()
        if existing:
            return existing

        metadata = self.provider.get_key_metadata()
        try:
            with transaction.atomic():
                return OrganizationPIIKeyVersion.objects.create(
                    organization=organization,
                    version=1,
                    wrapped_dek=self._encode(
                        self.provider.wrap_key(AESGCM.generate_key(bit_length=256))
                    ),
                    wrapped_hmac_key=self._encode(self.provider.wrap_key(os.urandom(32))),
                    kms_provider=metadata.provider,
                    kms_key_id=metadata.key_id,
                )
        except IntegrityError:
            return OrganizationPIIKeyVersion.objects.get(organization=organization, is_active=True)

    def _unwrap_dek(self, key_version: OrganizationPIIKeyVersion) -> bytes:
        return self.provider.unwrap_key(self._decode(key_version.wrapped_dek))

    def export_active_key_package(self, organization: Organization) -> dict[str, int | str]:
        """Return active raw key material for transport inside an authenticated envelope only."""
        key_version = self._active_key_version(organization)
        return {
            "version": key_version.version,
            "dek": self._encode(self._unwrap_dek(key_version)),
            "hmac_key": self._encode(
                self.provider.unwrap_key(self._decode(key_version.wrapped_hmac_key))
            ),
        }

    @staticmethod
    def _aad(organization: Organization, model_label: str, field_name: str) -> bytes:
        return f"org={organization.pk}|model={model_label}|field={field_name}".encode()

    @staticmethod
    def _encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")

    @staticmethod
    def _decode(value: str) -> bytes:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def import_organization_pii_key_package(
    organization: Organization, package: dict[str, Any], provider: KMSProvider | None = None
) -> OrganizationPIIKeyVersion:
    """Wrap an envelope-delivered organization key package with this runtime's KMS."""
    try:
        version = int(package["version"])
        dek = OrganizationPIIEncryptionService._decode(str(package["dek"]))
        hmac_key = OrganizationPIIEncryptionService._decode(str(package["hmac_key"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("organization PII key package is invalid") from exc
    if version < 1 or len(dek) != 32 or len(hmac_key) != 32:
        raise ValueError("organization PII key package has invalid key material")

    provider = provider or get_kms_provider()
    metadata = provider.get_key_metadata()
    with transaction.atomic():
        OrganizationPIIKeyVersion.objects.filter(organization=organization, is_active=True).update(
            is_active=False
        )
        key_version, _ = OrganizationPIIKeyVersion.objects.update_or_create(
            organization=organization,
            version=version,
            defaults={
                "wrapped_dek": OrganizationPIIEncryptionService._encode(provider.wrap_key(dek)),
                "wrapped_hmac_key": OrganizationPIIEncryptionService._encode(
                    provider.wrap_key(hmac_key)
                ),
                "kms_provider": metadata.provider,
                "kms_key_id": metadata.key_id,
                "is_active": True,
            },
        )
    return key_version


def resolve_pii_organization(instance: object) -> Organization | None:
    """Resolve a persisted organization directly or through a facility relationship."""
    if getattr(instance, "_meta", None) and instance._meta.label_lower == "core.organization":
        return instance if getattr(instance, "pk", None) else None
    if getattr(instance, "organization_id", None):
        return instance.organization
    if getattr(instance, "facility_id", None):
        return instance.facility.organization
    if getattr(instance, "patient_id", None):
        return instance.patient.organization
    return None
