# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for protocol-v2 activation secret envelopes and installer safeguards."""

import base64
import uuid

import pytest  # type: ignore
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.conf import settings
from rest_framework import status

from hmis.apps.licensing.activation_secrets import decrypt_activation_secrets
from hmis.apps.licensing.models import Installation

HUB_EULA_VERSION = "2026-07-31"


def _device_public_key() -> tuple[X25519PrivateKey, str]:
    private_key = X25519PrivateKey.generate()
    encoded = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return private_key, base64.b64encode(encoded).decode("ascii")


@pytest.fixture
def pending_installation(db, sample_organization, sample_facility):
    """A pending installation with a configured plan for activation tests."""
    from hmis.apps.core.models import SubscriptionPlan

    plan = SubscriptionPlan.objects.create(
        code=f"V2-{uuid.uuid4()}",
        name="Protocol v2 test plan",
        monthly_price=1,
        annual_price=1,
        max_facilities=1,
        max_users=1,
        features={},
    )
    sample_organization.subscription_plan = plan
    sample_organization.subscription_tier = "TEST"
    sample_organization.subscription_status = "ACTIVE"
    sample_organization.save()
    return Installation.objects.create(
        installation_id=f"pending-{uuid.uuid4()}",
        organization=sample_organization,
        facility=sample_facility,
        activation_code="TEST-ACTIVATION-CODE",
        status=Installation.Status.PENDING,
    )


@pytest.mark.django_db
def test_v2_activation_encrypts_secrets_and_binds_them_to_tenant(api_client, pending_installation):
    """Protocol v2 must return only an AAD-bound encrypted secret envelope."""
    private_key, device_public_key = _device_public_key()
    installation_id = str(uuid.uuid4())

    response = api_client.post(
        "/api/licensing/activate/",
        {
            "installation_id": installation_id,
            "activation_code": "TEST-ACTIVATION-CODE",
            "device_public_key": device_public_key,
            "protocol_version": 2,
            "eula_accepted": True,
            "eula_version": HUB_EULA_VERSION,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["protocol_version"] == 2
    assert "encryption_key" not in response.data
    assert "pii_hmac_key" not in response.data
    assert response.data["secrets_envelope"]["algorithm"] == "X25519-HKDF-SHA256-AESGCM"
    pending_installation.refresh_from_db()
    assert pending_installation.device_public_key == device_public_key

    secrets = decrypt_activation_secrets(
        response.data["secrets_envelope"],
        private_key,
        installation_id=installation_id,
        organization_id=pending_installation.organization_id,
        facility_id=pending_installation.facility_id,
    )
    assert secrets["encryption_key"] == settings.ENCRYPTION_KEY
    assert secrets["pii_hmac_key"] == settings.PII_HMAC_KEY
    assert secrets["organization_pii_key_package"]["version"] == 1
    assert "organization_pii_key_package" not in response.data
    assert secrets["organization_pii_key_package"]["dek"] not in str(response.data)

    with pytest.raises(ValueError, match="AAD"):
        decrypt_activation_secrets(
            response.data["secrets_envelope"],
            private_key,
            installation_id=installation_id,
            organization_id=pending_installation.organization_id + 1,
            facility_id=pending_installation.facility_id,
        )


@pytest.mark.django_db
def test_v1_activation_is_explicitly_flagged_legacy_compatibility(api_client, pending_installation):
    """A legacy client can opt in to v1, but the response clearly marks the risk."""
    response = api_client.post(
        "/api/licensing/activate/",
        {
            "installation_id": str(uuid.uuid4()),
            "activation_code": "TEST-ACTIVATION-CODE",
            "protocol_version": 1,
            "eula_accepted": True,
            "eula_version": HUB_EULA_VERSION,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["protocol_version"] == 1
    assert response.data["legacy_plaintext_secrets"] is True
    assert response.data["encryption_key"] == settings.ENCRYPTION_KEY


def test_hub_installers_request_v2_and_do_not_persist_secret_keys_in_dotenv():
    """Fresh installers must register device keys and keep bootstrap secrets out of .env."""
    root = __import__("pathlib").Path(__file__).resolve().parents[3]
    linux = (root / "backend/scripts/install-hub.sh").read_text()
    windows = (root / "backend/scripts/install-hub-windows.ps1").read_text()

    for script in (linux, windows):
        assert "device_public_key" in script
        assert "protocol_version" in script
        assert "secrets_envelope" in script
        assert "pii-key-package-stdin" in script

    assert "ENCRYPTION_KEY=${ENCRYPTION_KEY}" not in linux
    assert "PII_HMAC_KEY=${PII_HMAC_KEY}" not in linux
    assert "ENCRYPTION_KEY=$EncryptionKey" not in windows
    assert "PII_HMAC_KEY=$PiiHmacKey" not in windows
    assert "HUB_PII_KEY_PACKAGE" not in windows
    assert "PlaintextFallback" not in windows
    assert 'throw "DPAPI is required' in windows
