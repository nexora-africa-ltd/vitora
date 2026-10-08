# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for protocol-v2 activation secret envelopes and installer safeguards."""

import base64
import uuid
from datetime import date
from unittest.mock import patch

import pytest  # type: ignore
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.conf import settings
from django.test import override_settings
from rest_framework import status

from hmis.apps.licensing import views as licensing_views
from hmis.apps.licensing.activation_secrets import decrypt_activation_secrets
from hmis.apps.licensing.models import HubBackupDestination, Installation

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
def test_v2_activation_includes_available_backup_credentials_in_envelope(
    api_client, pending_installation
):
    """Activation must only deliver renewable backup credentials inside the device envelope."""
    private_key, device_public_key = _device_public_key()
    installation_id = str(uuid.uuid4())
    HubBackupDestination.objects.create(
        organization=pending_installation.organization,
        facility=pending_installation.facility,
        enabled=True,
        target_type=HubBackupDestination.TargetType.S3_COMPATIBLE,
        endpoint_url="https://backup.ke.example.test/tenant",
        residency_country="KE",
        retention_days=30,
    )

    with patch(
        "hmis.apps.licensing.bootstrap.issue_configured_backup_credentials",
        return_value={
            "HUB_BACKUP_S3_URL": "https://backup.ke.example.test/tenant",
            "HUB_BACKUP_S3_TOKEN": "temporary-token",
            "HUB_BACKUP_S3_TOKEN_EXPIRES_AT": "2026-12-31T00:00:00+00:00",
        },
    ):
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
    secrets = decrypt_activation_secrets(
        response.data["secrets_envelope"],
        private_key,
        installation_id=installation_id,
        organization_id=pending_installation.organization_id,
        facility_id=pending_installation.facility_id,
    )
    assert secrets["HUB_BACKUP_S3_TOKEN"] == "temporary-token"
    assert "HUB_BACKUP_S3_TOKEN" not in response.data


@pytest.mark.django_db
@override_settings(
    SHA_ENABLED=True,
    SHA_AUTH_MODE="ilm",
    SHA_AUTH_BASE_URL="https://ilm.example.test/oauth",
    ILM_BASE_URL="https://ilm.example.test/api",
    SHA_CLIENT_ID="vitora",
    SHA_CLIENT_SECRET="shared-ilm-secret",
)
def test_v2_activation_encrypts_shared_ilm_credentials(api_client, pending_installation):
    """Authorized hubs receive shared ILM credentials only inside the v2 envelope."""
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
    assert "shared-ilm-secret" not in str(response.data)
    secrets = decrypt_activation_secrets(
        response.data["secrets_envelope"],
        private_key,
        installation_id=installation_id,
        organization_id=pending_installation.organization_id,
        facility_id=pending_installation.facility_id,
    )
    assert secrets["sha_auth_mode"] == "ilm"
    assert secrets["sha_auth_base_url"] == "https://ilm.example.test/oauth"
    assert secrets["ilm_base_url"] == "https://ilm.example.test/api"
    assert secrets["sha_client_id"] == "vitora"
    assert secrets["sha_client_secret"] == "shared-ilm-secret"


def test_windows_installer_keeps_hub_and_ilm_secrets_out_of_dotenv():
    """The Windows runtime must receive sensitive values only from DPAPI."""
    from pathlib import Path

    installer = (
        Path(__file__).resolve().parents[2] / "scripts" / "install-hub-windows.ps1"
    ).read_text()
    updater = (
        Path(__file__).resolve().parents[2] / "scripts" / "update-hub-windows.ps1"
    ).read_text()

    assert "DJANGO_SECRET_KEY=$secretKey" not in installer
    assert "LICENSE_TOKEN=$LicenseToken" not in installer
    assert "SHA_CLIENT_ID=$ShaClientId" not in installer
    assert "SHA_CLIENT_SECRET=$ShaClientSecret" not in installer
    assert "SHA_CLIENT_ID = $ShaClientId" in installer
    assert "SHA_CLIENT_SECRET = $ShaClientSecret" in installer
    assert "Load-DpapiSecretsBundle -Path $hubSecretsFile" in updater
    assert "DJANGO_SECRET_KEY|ENCRYPTION_KEY|PII_HMAC_KEY|LICENSE_TOKEN" in updater
    assert 'SHA_CLIENT_SECRET = (Get-HubEnvValue "SHA_CLIENT_SECRET")' in updater


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


@pytest.mark.django_db
def test_v1_activation_is_rejected_after_the_bounded_compatibility_window(
    api_client, pending_installation, monkeypatch
):
    """The plaintext v1 path has a fixed expiry and cannot be revived by re-enrollment."""
    monkeypatch.setattr(
        licensing_views, "LEGACY_V1_ACTIVATION_COMPATIBILITY_UNTIL", date(2000, 1, 1)
    )

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

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["code"] == "legacy_protocol_expired"


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


def test_hub_installers_provision_and_preserve_database_encryption_keys():
    """Install and re-enrollment flows keep SQLCipher keys in protected bundles."""
    root = __import__("pathlib").Path(__file__).resolve().parents[3]
    linux_installer = (root / "backend/scripts/install-hub.sh").read_text()
    linux_updater = (root / "backend/scripts/update-hub.sh").read_text()
    windows_installer = (root / "backend/scripts/install-hub-windows.ps1").read_text()
    windows_updater = (root / "backend/scripts/update-hub-windows.ps1").read_text()
    windows_launcher = (root / "backend/scripts/start-hub-windows.ps1").read_text()

    for script in (linux_installer, linux_updater):
        assert "hub_database_encryption_required" in script
        assert "hub_database_encryption_key" in script
        assert "token_urlsafe(64)" in script

    for script in (windows_installer, windows_updater):
        assert "HUB_DATABASE_ENCRYPTION_REQUIRED" in script
        assert "HUB_DATABASE_ENCRYPTION_KEY" in script
        assert "token_urlsafe(64)" in script

    assert 'existing_secrets.get("HUB_DATABASE_ENCRYPTION_KEY")' in linux_installer
    assert 'os.environ.get("HUB_DATABASE_ENCRYPTION_KEY")' in linux_updater
    assert (
        'Get-DpapiSecretValue -Path $HubSecretsFile -Name "HUB_DATABASE_ENCRYPTION_KEY"'
        in windows_installer
    )
    assert 'Get-HubEnvValue "HUB_DATABASE_ENCRYPTION_KEY"' in windows_updater

    for script in (linux_installer, windows_installer):
        assert "HUB_DATABASE_ENCRYPTION_KEY=" not in script
        assert "HUB_DATABASE_ENCRYPTION_REQUIRED=true" not in script

    assert '$Name -eq "HUB_DATABASE_ENCRYPTION_KEY"' in windows_launcher
    assert "Loaded $Name from ${Source}: $(Mask-SecretValue -Value $Value)" in windows_launcher


def test_hub_installers_enroll_and_recover_database_keys_without_cli_key_arguments():
    """Escrow runs after protected storage and recovery never falls back for an existing DB."""
    root = __import__("pathlib").Path(__file__).resolve().parents[3]
    helper = (root / "backend/scripts/hub_database_key_escrow.py").read_text()
    linux_installer = (root / "backend/scripts/install-hub.sh").read_text()
    linux_updater = (root / "backend/scripts/update-hub.sh").read_text()
    windows_installer = (root / "backend/scripts/install-hub-windows.ps1").read_text()
    windows_updater = (root / "backend/scripts/update-hub-windows.ps1").read_text()

    assert 'sys.argv[1] not in {"submit", "recover"}' in helper
    assert 'os.environ.get("HUB_DATABASE_ENCRYPTION_KEY"' in helper
    assert '"hub_database_encryption_key": key' in helper
    assert "sys.argv[2]" not in helper
    for script in (linux_installer, linux_updater, windows_installer, windows_updater):
        assert "hub_database_key_escrow.py" in script
        assert "not cloud-recoverable" in script

    assert linux_installer.index("systemd-creds encrypt") < linux_installer.index(
        "hub_database_key_escrow.py"
    )
    assert windows_installer.index("Write-DpapiSecretsBundle") < windows_installer.index(
        "hub_database_key_escrow.py"
    )
    assert (
        "Cloud database-key recovery failed; this encrypted database cannot be opened"
        in linux_updater
    )
    assert (
        "Cloud database-key recovery failed; this encrypted database cannot be opened"
        in windows_updater
    )


def test_hub_updaters_convert_plaintext_databases_before_requiring_encryption():
    """Existing hub databases are verified or converted before the flag is persisted."""
    root = __import__("pathlib").Path(__file__).resolve().parents[3]
    linux = (root / "backend/scripts/update-hub.sh").read_text()
    windows = (root / "backend/scripts/update-hub-windows.ps1").read_text()

    for script in (linux, windows):
        assert "hub_database_key_status" in script
        assert "hub_encrypt_database" in script
        assert "SQLCipher key verification failed after database conversion" in script

    assert linux.index("hub_database_key_status") < linux.index(
        "HUB_DATABASE_ENCRYPTION_REQUIRED=true"
    )
    assert windows.index("hub_database_key_status") < windows.index(
        '$env:HUB_DATABASE_ENCRYPTION_REQUIRED = "true"'
    )
