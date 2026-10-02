# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for authenticated v2 device-key re-enrollment of active hubs.

Run with ``poetry run pytest tests/licensing/test_installation_reenrollment.py``.
Inputs cover an active Installation, an admin user, or its current license JWT.
"""

import base64
from pathlib import Path

import pytest  # type: ignore
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.utils import timezone
from rest_framework import status

from hmis.apps.licensing.activation_secrets import decrypt_activation_secrets
from hmis.apps.licensing.models import Installation
from hmis.apps.licensing.tokens import build_license_payload, sign_license_token


def _device_public_key() -> tuple[X25519PrivateKey, str]:
    private_key = X25519PrivateKey.generate()
    encoded = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return private_key, base64.b64encode(encoded).decode("ascii")


@pytest.fixture
def active_installation(db, sample_organization, sample_facility):
    """An active hub with a current license JWT for self-service re-enrollment."""
    installation = Installation.objects.create(
        installation_id="active-reenrollment-hub",
        organization=sample_organization,
        facility=sample_facility,
        status=Installation.Status.ACTIVE,
        activated_at=timezone.now(),
    )
    installation.license_jwt = sign_license_token(build_license_payload(installation))
    installation.save(update_fields=["license_jwt"])
    return installation


@pytest.mark.django_db
def test_active_installation_can_reenroll_with_its_license_token(api_client, active_installation):
    """A current hub credential may rotate its own v2 device key and receive an envelope."""
    private_key, device_public_key = _device_public_key()

    response = api_client.post(
        "/api/licensing/re-enroll/",
        {
            "installation_id": active_installation.installation_id,
            "protocol_version": 2,
            "device_public_key": device_public_key,
        },
        format="json",
        HTTP_X_LICENSE_TOKEN=active_installation.license_jwt,
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["protocol_version"] == 2
    assert "legacy_plaintext_secrets" not in response.data
    assert "encryption_key" not in response.data
    active_installation.refresh_from_db()
    assert active_installation.device_public_key == device_public_key

    decrypted = decrypt_activation_secrets(
        response.data["secrets_envelope"],
        private_key,
        installation_id=active_installation.installation_id,
        organization_id=active_installation.organization_id,
        facility_id=active_installation.facility_id,
    )
    assert decrypted["organization_pii_key_package"]["version"] == 1


@pytest.mark.django_db
def test_reenrollment_requires_admin_or_matching_installation_license(
    api_client, active_installation
):
    """An unrelated caller cannot replace the active hub's device key."""
    _, device_public_key = _device_public_key()

    response = api_client.post(
        f"/api/licensing/installations/{active_installation.pk}/re-enroll/",
        {"protocol_version": 2, "device_public_key": device_public_key},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    active_installation.refresh_from_db()
    assert active_installation.device_public_key == ""


@pytest.mark.django_db
def test_reenrollment_is_v2_only(authenticated_client, active_installation):
    """Plaintext v1 is never available through the existing-installation route."""
    user = authenticated_client.handler._force_user
    user.is_staff = True
    user.is_superuser = True
    user.save()
    _, device_public_key = _device_public_key()

    response = authenticated_client.post(
        f"/api/licensing/installations/{active_installation.pk}/re-enroll/",
        {"protocol_version": 1, "device_public_key": device_public_key},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "protocol_version" in response.data


def test_upgrade_scripts_reenroll_with_v2_without_plaintext_dotenv_secrets():
    """Linux and Windows upgrades rotate device keys and keep envelope secrets out of .env."""
    root = Path(__file__).resolve().parents[3]
    linux = (root / "backend/scripts/update-hub.sh").read_text()
    windows = (root / "backend/scripts/update-hub-windows.ps1").read_text()

    for script in (linux, windows):
        assert "re-enroll" in script
        assert "device_public_key" in script
        assert "secrets_envelope" in script
        assert "protocol_version" in script

    assert "ENCRYPTION_KEY=" not in linux.split('cat > "$APP_DIR/.env"', 1)[-1]
    assert "PII_HMAC_KEY=" not in linux.split('cat > "$APP_DIR/.env"', 1)[-1]
    assert "PlaintextFallback" not in windows
