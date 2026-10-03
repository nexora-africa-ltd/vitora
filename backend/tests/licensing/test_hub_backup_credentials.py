# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Test tenant-scoped, device-bound hub offsite backup credential issuance.

Run with ``poetry run pytest tests/licensing/test_hub_backup_credentials.py``.
Inputs are active hub license JWTs, destination configuration, and signer output.
"""

import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from hmis.apps.licensing.activation_secrets import (
    decrypt_activation_secrets,
    generate_device_keypair,
)
from hmis.apps.licensing.backup_credentials import (
    BackupCredentialUnavailable,
    sign_azure_blob_backup_credentials,
)
from hmis.apps.licensing.models import HubBackupDestination, Installation
from hmis.apps.licensing.tokens import build_license_payload, sign_license_token


@pytest.fixture
def active_installation(sample_organization, sample_facility):
    """Create an active installation with a verifiable hub license JWT."""
    installation = Installation.objects.create(
        installation_id=f"backup-hub-{uuid.uuid4()}",
        organization=sample_organization,
        facility=sample_facility,
        name="Backup Hub",
        status=Installation.Status.ACTIVE,
        activated_at=timezone.now(),
        last_check_in=timezone.now(),
    )
    installation.license_jwt = sign_license_token(build_license_payload(installation))
    installation.save(update_fields=["license_jwt"])
    return installation


@pytest.fixture
def backup_destination(active_installation):
    """Create an enabled Kenya-resident destination for the active hub."""
    return HubBackupDestination.objects.create(
        organization=active_installation.organization,
        facility=active_installation.facility,
        enabled=True,
        target_type=HubBackupDestination.TargetType.S3_COMPATIBLE,
        endpoint_url="https://backup.ke.example.test/tenant",
        object_prefix="facility-a",
        residency_country="KE",
        retention_days=30,
    )


@pytest.mark.django_db
class TestHubBackupCredentials:
    """The credential endpoint must bind issued secrets to one hub tenant."""

    @override_settings(HUB_BACKUP_ALLOWED_RESIDENCY_COUNTRIES="KE")
    def test_active_hub_receives_device_bound_envelope(
        self, api_client, active_installation, backup_destination
    ):
        private_key, public_key = generate_device_keypair()
        active_installation.device_public_key = public_key
        active_installation.save(update_fields=["device_public_key"])
        expires_at = timezone.now() + timedelta(hours=1)

        with patch(
            "hmis.apps.licensing.views.issue_configured_backup_credentials",
            return_value={
                "HUB_BACKUP_S3_URL": "https://backup.ke.example.test/tenant/facility-a",
                "HUB_BACKUP_S3_TOKEN": "short-lived-token",
                "HUB_BACKUP_S3_TOKEN_EXPIRES_AT": expires_at.isoformat(),
            },
        ):
            response = api_client.post(
                "/api/licensing/backup-credentials/",
                HTTP_AUTHORIZATION=f"Bearer {active_installation.license_jwt}",
            )

        assert response.status_code == status.HTTP_200_OK
        envelope = response.data["credentials_envelope"]
        assert (
            decrypt_activation_secrets(
                envelope,
                private_key,
                installation_id=active_installation.installation_id,
                organization_id=active_installation.organization_id,
                facility_id=active_installation.facility_id,
            )["HUB_BACKUP_S3_TOKEN"]
            == "short-lived-token"
        )
        backup_destination.refresh_from_db()
        assert backup_destination.last_credential_issued_at is not None
        assert backup_destination.last_credential_expires_at == expires_at

    @override_settings(HUB_BACKUP_ALLOWED_RESIDENCY_COUNTRIES="KE")
    def test_installation_cannot_receive_another_tenants_destination(
        self, api_client, active_installation, backup_destination
    ):
        from hmis.apps.core.models import Organization

        other_organization = Organization.objects.create(
            name="Other Health Group", slug="other-health-group", is_active=True, is_verified=True
        )
        backup_destination.organization = other_organization
        backup_destination.facility = None
        backup_destination.save()

        response = api_client.post(
            "/api/licensing/backup-credentials/",
            HTTP_AUTHORIZATION=f"Bearer {active_installation.license_jwt}",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_residency_policy_must_be_explicitly_configured(
        self, api_client, active_installation, backup_destination
    ):
        _, public_key = generate_device_keypair()
        active_installation.device_public_key = public_key
        active_installation.save(update_fields=["device_public_key"])
        with patch(
            "hmis.apps.licensing.backup_credentials._allowed_residency_countries",
            side_effect=BackupCredentialUnavailable(
                "Kenya backup residency policy is not configured."
            ),
        ):
            response = api_client.post(
                "/api/licensing/backup-credentials/",
                HTTP_AUTHORIZATION=f"Bearer {active_installation.license_jwt}",
            )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data["code"] == "backup_residency_policy_not_configured"


@pytest.mark.django_db
class TestAzureBlobBackupCredentialSigner:
    """Azure Blob SAS credentials remain short-lived and installation-scoped."""

    @override_settings(
        AZURE_HUB_BACKUP_STORAGE_ACCOUNT="vitoraarchive",
        AZURE_HUB_BACKUP_STORAGE_ACCOUNT_KEY="cloud-only-account-key",
        AZURE_HUB_BACKUP_STORAGE_CONTAINER="hub-backups",
        AZURE_HUB_BACKUP_SAS_EXPIRY_MINUTES=45,
    )
    @patch(
        "hmis.apps.licensing.backup_credentials.generate_container_sas",
        return_value="sv=test&sig=test",
    )
    def test_signer_issues_write_only_sas_for_installation_prefix(
        self, mock_generate_sas, active_installation, backup_destination
    ):
        """The account key signs in cloud only; the hub receives only a scoped SAS."""
        before = timezone.now()

        credentials = sign_azure_blob_backup_credentials(
            destination=backup_destination,
            installation=active_installation,
        )

        after = timezone.now()
        assert credentials["token"] == "sv=test&sig=test"
        assert credentials["url"] == (
            "https://vitoraarchive.blob.core.windows.net/hub-backups/"
            f"facility-a/organizations/{active_installation.organization_id}/"
            f"facilities/{active_installation.facility_id}/"
            f"installations/{active_installation.installation_id}"
        )
        assert (
            before + timedelta(minutes=45)
            <= credentials["expires_at"]
            <= after + timedelta(minutes=45)
        )

        kwargs = mock_generate_sas.call_args.kwargs
        assert kwargs["account_name"] == "vitoraarchive"
        assert kwargs["account_key"] == "cloud-only-account-key"
        assert kwargs["container_name"] == "hub-backups"
        assert str(kwargs["permission"]) == "acw"
        assert before + timedelta(minutes=45) <= kwargs["expiry"] <= after + timedelta(minutes=45)

    @override_settings(
        AZURE_HUB_BACKUP_STORAGE_ACCOUNT="vitoraarchive",
        AZURE_HUB_BACKUP_STORAGE_ACCOUNT_KEY="cloud-only-account-key",
        AZURE_HUB_BACKUP_STORAGE_CONTAINER="hub-backups",
    )
    @patch(
        "hmis.apps.licensing.backup_credentials.generate_container_sas", return_value="sas-token"
    )
    def test_signer_escapes_configured_prefix_segments(
        self, mock_generate_sas, active_installation, backup_destination
    ):
        """Configured prefixes cannot escape or inject URL path/query components."""
        backup_destination.object_prefix = "regional backups/../ke?ignore=true"

        credentials = sign_azure_blob_backup_credentials(
            destination=backup_destination,
            installation=active_installation,
        )

        assert credentials["url"].startswith(
            "https://vitoraarchive.blob.core.windows.net/hub-backups/"
            "regional%20backups/ke%3Fignore%3Dtrue/organizations/"
        )
        assert ".." not in credentials["url"]
        assert "?ignore" not in credentials["url"]
        assert mock_generate_sas.called
