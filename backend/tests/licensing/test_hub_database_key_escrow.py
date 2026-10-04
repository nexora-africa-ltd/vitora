# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for cloud-side SQLCipher hub database key escrow.

Run with ``poetry run pytest tests/licensing/test_hub_database_key_escrow.py``.
Inputs are active hub license credentials, SQLCipher key material, and X25519
device public keys. Plaintext key material must never be persisted or audited.
"""

from __future__ import annotations

import base64
from types import SimpleNamespace

import pytest  # type: ignore
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from hmis.apps.core.models import AuditLog
from hmis.apps.licensing.activation_secrets import decrypt_activation_secrets
from hmis.apps.licensing.hub_database_key_escrow import HubDatabaseKeyEscrowService
from hmis.apps.licensing.models import HubDatabaseKeyEscrow, Installation
from hmis.apps.licensing.tokens import build_license_payload, sign_license_token


def _device_keypair() -> tuple[X25519PrivateKey, str]:
    private_key = X25519PrivateKey.generate()
    encoded = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return private_key, base64.b64encode(encoded).decode("ascii")


@pytest.fixture
def active_installation(db, sample_organization, sample_facility):
    """Create an active installation holding a valid hub license credential."""
    installation = Installation.objects.create(
        installation_id="escrow-hub-1",
        organization=sample_organization,
        facility=sample_facility,
        status=Installation.Status.ACTIVE,
        activated_at=timezone.now(),
    )
    installation.license_jwt = sign_license_token(build_license_payload(installation))
    installation.save(update_fields=["license_jwt"])
    return installation


class FakeAzureKeyVaultProvider:
    """Deterministic Key Vault stand-in used to prove wrapping boundaries."""

    def __init__(self, vault_url, key_name, key_version=None):
        self.vault_url = vault_url
        self.key_name = key_name
        self.key_version = key_version

    def get_key_metadata(self):
        return SimpleNamespace(version="version-1", algorithm="RSA")

    def wrap_key(self, key_material):
        return b"wrapped:" + base64.b64encode(key_material)

    def unwrap_key(self, wrapped_key_material):
        assert wrapped_key_material.startswith(b"wrapped:")
        return base64.b64decode(wrapped_key_material.removeprefix(b"wrapped:"))


@pytest.mark.django_db
@override_settings(
    HUB_DB_ESCROW_ENABLED=True,
    AZURE_KEY_VAULT_URL="https://escrow.vault.azure.net",
    AZURE_HUB_DB_ESCROW_KEY_NAME="hub-db-escrow",
)
def test_service_persists_only_key_vault_wrapped_ciphertext(monkeypatch, active_installation):
    """The escrow record must contain ciphertext and Key Vault metadata, never plaintext."""
    monkeypatch.setattr(
        "hmis.apps.licensing.hub_database_key_escrow.AzureKeyVaultProvider",
        FakeAzureKeyVaultProvider,
    )

    key = "sqlcipher-test-key-that-must-not-be-stored"
    escrow = HubDatabaseKeyEscrowService().submit(active_installation, key)

    assert escrow.wrapped_ciphertext == b"wrapped:" + base64.b64encode(key.encode())
    assert escrow.vault_url == "https://escrow.vault.azure.net"
    assert escrow.key_name == "hub-db-escrow"
    assert escrow.key_version == "version-1"
    assert escrow.algorithm == "RSA-OAEP-256"
    assert key not in str(escrow.__dict__)
    assert HubDatabaseKeyEscrow.objects.filter(installation=active_installation).count() == 1


@pytest.mark.django_db
@override_settings(
    HUB_DB_ESCROW_ENABLED=True,
    AZURE_KEY_VAULT_URL="https://escrow.vault.azure.net",
    AZURE_HUB_DB_ESCROW_KEY_NAME="hub-db-escrow",
)
def test_recovery_only_returns_device_encrypted_envelope(monkeypatch, active_installation):
    """Recovery unwraps transiently and binds the returned envelope to the requesting device."""
    monkeypatch.setattr(
        "hmis.apps.licensing.hub_database_key_escrow.AzureKeyVaultProvider",
        FakeAzureKeyVaultProvider,
    )
    service = HubDatabaseKeyEscrowService()
    key = "sqlcipher-recovery-key"
    service.submit(active_installation, key)
    private_key, public_key = _device_keypair()

    envelope = service.recovery_envelope(active_installation, public_key)

    assert key not in str(envelope)
    recovered = decrypt_activation_secrets(
        envelope,
        private_key,
        installation_id=active_installation.installation_id,
        organization_id=active_installation.organization_id,
        facility_id=active_installation.facility_id,
    )
    assert recovered == {"hub_database_encryption_key": key}


@pytest.mark.django_db
@override_settings(HUB_DB_ESCROW_ENABLED=True)
def test_submission_endpoint_authorizes_hub_and_audits_without_key(
    monkeypatch, api_client, active_installation
):
    """Only a matching active hub can escrow its key and no audit payload includes it."""
    submitted = SimpleNamespace(pk=17, key_version="version-1", algorithm="RSA-OAEP-256")
    monkeypatch.setattr(
        "hmis.apps.licensing.views.HubDatabaseKeyEscrowService.submit",
        lambda _self, installation, key: submitted,
    )
    key = "do-not-log-this-sqlcipher-key-with-a-safe-minimum-length"

    response = api_client.post(
        "/api/licensing/escrow/submit/",
        {"hub_database_encryption_key": key},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {active_installation.license_jwt}",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert key not in str(response.data)
    audit = AuditLog.objects.filter(action="hub_database_key_escrow_submitted").latest("timestamp")
    assert audit.resource_id == active_installation.pk
    assert key not in str(audit.details)
    assert audit.organization_id == active_installation.organization_id


@pytest.mark.django_db
@override_settings(HUB_DB_ESCROW_ENABLED=True)
def test_recovery_endpoint_rejects_requests_without_matching_hub_license(
    api_client, active_installation
):
    """Recovery cannot be requested anonymously or with a normal user credential."""
    _, public_key = _device_keypair()

    response = api_client.post(
        "/api/licensing/escrow/recover/",
        {"device_public_key": public_key},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
