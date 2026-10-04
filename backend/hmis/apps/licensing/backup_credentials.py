# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Issue short-lived, tenant-scoped hub backup upload credentials.

Use ``issue_configured_backup_credentials(destination, installation)`` from
licensing endpoints and activation bootstrap. Set ``HUB_BACKUP_CREDENTIAL_SIGNER``
to a dotted callable that returns ``token`` and ``expires_at``; permanent cloud
credentials are never stored or returned.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from azure.storage.blob import ContainerSasPermissions, generate_container_sas
from django.conf import settings
from django.utils import timezone
from django.utils.module_loading import import_string


class BackupCredentialUnavailable(RuntimeError):
    """Raised when policy or short-lived backup credential issuance is unavailable."""


def _allowed_residency_countries() -> set[str]:
    configured = str(getattr(settings, "HUB_BACKUP_ALLOWED_RESIDENCY_COUNTRIES", "") or "")
    countries = {country.strip().upper() for country in configured.split(",") if country.strip()}
    if "KE" not in countries:
        raise BackupCredentialUnavailable("Kenya backup residency policy is not configured.")
    return countries


def _credential_url(destination, installation) -> str:
    prefix = destination.get_installation_object_prefix(installation)
    return (
        f"{destination.endpoint_url.rstrip('/')}/{prefix}"
        if prefix
        else destination.endpoint_url.rstrip("/")
    )


def sign_azure_blob_backup_credentials(*, destination, installation) -> dict[str, Any]:
    """Issue an Azure Blob container SAS for one installation's backup prefix.

    The storage account key remains in the cloud deployment and signs only a
    short-lived SAS. Azure container SAS has no virtual-directory restriction,
    so the returned URL roots normal uploads at the installation prefix while
    the SAS is limited to create, write, and add operations.
    """
    account_name = str(getattr(settings, "AZURE_HUB_BACKUP_STORAGE_ACCOUNT", "") or "").strip()
    account_key = str(getattr(settings, "AZURE_HUB_BACKUP_STORAGE_ACCOUNT_KEY", "") or "").strip()
    container_name = str(getattr(settings, "AZURE_HUB_BACKUP_STORAGE_CONTAINER", "") or "").strip()
    expiry_minutes = int(getattr(settings, "AZURE_HUB_BACKUP_SAS_EXPIRY_MINUTES", 60))
    if not account_name or not account_key or not container_name:
        raise BackupCredentialUnavailable("Azure hub backup storage is not configured.")
    if expiry_minutes < 1 or expiry_minutes > 1440:
        raise BackupCredentialUnavailable(
            "Azure hub backup SAS expiry must be between 1 and 1440 minutes."
        )

    expires_at = timezone.now() + timedelta(minutes=expiry_minutes)
    token = generate_container_sas(
        account_name=account_name,
        container_name=container_name,
        account_key=account_key,
        permission=ContainerSasPermissions(create=True, write=True, add=True),
        expiry=expires_at,
    )
    prefix = destination.get_installation_object_prefix(installation)
    url = f"https://{account_name}.blob.core.windows.net/{container_name}/{prefix}"
    return {"token": token, "expires_at": expires_at, "url": url}


def issue_configured_backup_credentials(destination, installation) -> dict[str, str]:
    """Call the configured signer and normalize its short-lived credential response."""
    if not destination.enabled:
        raise BackupCredentialUnavailable("Hub backup destination is disabled.")
    if destination.residency_country.upper() not in _allowed_residency_countries():
        raise BackupCredentialUnavailable("Hub backup destination violates residency policy.")

    signer_path = str(getattr(settings, "HUB_BACKUP_CREDENTIAL_SIGNER", "") or "").strip()
    if not signer_path:
        raise BackupCredentialUnavailable("Hub backup credential signer is not configured.")
    try:
        signer = import_string(signer_path)
        issued: Any = signer(destination=destination, installation=installation)
    except Exception as exc:  # noqa: BLE001 - configured signer is an external credential boundary
        raise BackupCredentialUnavailable("Hub backup credential signer is unavailable.") from exc
    if not isinstance(issued, dict):
        raise BackupCredentialUnavailable(
            "Hub backup credential signer returned an invalid response."
        )
    token = issued.get("token")
    expires_at = issued.get("expires_at")
    url = issued.get("url")
    if not isinstance(token, str) or not token:
        raise BackupCredentialUnavailable("Hub backup credential signer did not return a token.")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise BackupCredentialUnavailable("Hub backup credential expiry is invalid.") from exc
    if not isinstance(expires_at, datetime):
        raise BackupCredentialUnavailable("Hub backup credential signer did not return an expiry.")
    if timezone.is_naive(expires_at):
        raise BackupCredentialUnavailable("Hub backup credential expiry must include a timezone.")
    if expires_at <= timezone.now():
        raise BackupCredentialUnavailable("Hub backup credential signer returned an expired token.")
    if url is not None and (
        not isinstance(url, str) or not url.startswith(("https://", "http://"))
    ):
        raise BackupCredentialUnavailable("Hub backup credential signer returned an invalid URL.")

    return {
        "HUB_BACKUP_S3_URL": url or _credential_url(destination, installation),
        "HUB_BACKUP_S3_TOKEN": token,
        "HUB_BACKUP_S3_TOKEN_EXPIRES_AT": expires_at.isoformat(),
    }
