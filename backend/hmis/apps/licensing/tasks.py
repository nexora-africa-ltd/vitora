# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Licensing Celery tasks.

- license_check_in: Hub-side periodic check-in (every 6 hours)
  Posts telemetry + binary hashes to the cloud, receives a fresh JWT.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


def _licensing_optional_step_exceptions() -> tuple[type[Exception], ...]:
    """Exceptions tolerated by best-effort licensing telemetry steps."""
    return (ImportError, AttributeError, TypeError, ValueError, RuntimeError, OSError)


@shared_task(
    name="hmis.apps.licensing.tasks.license_check_in",
    bind=True,
    max_retries=3,
    default_retry_delay=900,  # 15 minutes between retries
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def license_check_in(self) -> dict:
    """
    Periodic hub-to-cloud check-in.

    Sends installation telemetry and binary integrity hashes.
    Receives a fresh license JWT on success.

    Only runs when DJANGO_ENV=hub.
    """
    if os.getenv("DJANGO_ENV", "") != "hub":
        return {"skipped": True, "reason": "not a hub installation"}

    import platform

    import requests

    from hmis.apps.licensing.hardware import compute_binary_hashes, get_hardware_fingerprint

    # Determine the cloud check-in URL
    sync_server = getattr(settings, "SYNC_SERVER_URL", "")
    if not sync_server:
        return {"skipped": True, "reason": "SYNC_SERVER_URL not configured"}

    check_in_url = f"{sync_server.rstrip('/')}/api/licensing/check-in/"

    # Read current license token for auth
    token_path = getattr(settings, "HUB_LICENSE_TOKEN_PATH", "/var/lib/vitora-hub/license.jwt")
    token = os.getenv("LICENSE_TOKEN", "")
    if not token:
        try:
            token = Path(token_path).read_text().strip()
        except (FileNotFoundError, PermissionError):
            return {"error": "No license token found"}

    # Get installation_id from token
    import jwt as pyjwt

    try:
        payload = pyjwt.decode(token, options={"verify_signature": False})
        installation_id = payload.get("installation_id", "")
    except (pyjwt.PyJWTError, AttributeError, TypeError, ValueError):
        return {"error": "Cannot decode license token"}

    if not installation_id:
        return {"error": "No installation_id in token"}

    # Collect telemetry
    hub_base_dir = getattr(settings, "BASE_DIR", "")
    binary_hashes = compute_binary_hashes(str(hub_base_dir)) if hub_base_dir else {}
    hardware_fp = get_hardware_fingerprint()

    # Get usage counts (last 24h)
    user_count, encounter_count = _get_usage_counts_24h()

    # Build check-in payload
    check_in_data = {
        "installation_id": installation_id,
        "license_jti": payload.get("jti", ""),
        "version": _get_app_version(),
        "uptime_seconds": _get_uptime_seconds(),
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "ip_address": "",  # Cloud will see this from the request
        "user_count_24h": user_count,
        "encounter_count_24h": encounter_count,
        "binary_hashes": binary_hashes,
        "hardware_fingerprint": hardware_fp,
    }

    # Phase 5C: Include build ID (watermark)
    try:
        from hmis.apps.licensing.watermark import get_build_id

        build_id = get_build_id()
        if build_id:
            check_in_data["build_id"] = build_id
    except _licensing_optional_step_exceptions():
        pass

    # Phase 5D: Include canary token
    try:
        from hmis.apps.licensing.canary import get_local_canary

        canary = get_local_canary()
        if canary:
            check_in_data["canary_token"] = canary
    except _licensing_optional_step_exceptions():
        pass

    # Phase 5B: Include TPM quote if TPM is available
    try:
        from hmis.apps.licensing.tpm import generate_pcr_quote, is_tpm_available

        if is_tpm_available():
            nonce = payload.get("tpm_nonce", installation_id[:16])
            quote_data = generate_pcr_quote(nonce)
            if quote_data:
                check_in_data["tpm_quote"] = quote_data
    except _licensing_optional_step_exceptions():
        pass

    # Send check-in
    try:
        response = requests.post(
            check_in_url,
            json=check_in_data,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.warning("License check-in network error: %s", exc)
        raise self.retry(exc=exc) from exc

    if response.status_code == 200:
        data = response.json()
        new_token = data.get("license", "") or data.get("license_token", "")

        if new_token:
            # Write new token to disk
            _save_license_token(new_token, token_path)
            logger.info("License check-in successful; token refreshed.")

        # Phase 5A: Store cloud key part for SQLCipher (if provided)
        cloud_key = data.get("cloud_key")
        if cloud_key:
            try:
                from hmis.apps.licensing.sqlcipher_backend import store_cloud_key_part

                store_cloud_key_part(cloud_key)
            except _licensing_optional_step_exceptions() as exc:
                logger.warning("Failed to store cloud key part: %s", exc)

        return {
            "success": True,
            "expires_at": data.get("expires_at"),
            "binary_manifest_id": data.get("binary_manifest_id", ""),
            "actions": data.get("actions", []),
        }

    elif response.status_code == 401:
        # Revoked — wipe local token to trigger full block
        logger.warning("License REVOKED by cloud. Wiping local token.")
        _save_license_token("", token_path)
        return {"error": "revoked", "status": 401}

    elif response.status_code == 403:
        logger.warning("License check-in rejected (403): %s", response.text[:200])
        return {"error": "forbidden", "status": 403}

    else:
        logger.warning(
            "License check-in returned %d: %s",
            response.status_code,
            response.text[:200],
        )
        raise self.retry(exc=Exception(f"Check-in returned {response.status_code}"))


def _save_license_token(token: str, path: str) -> None:
    """Write the license token to disk (or clear it)."""
    try:
        token_path = Path(path)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(token)
    except (PermissionError, OSError) as exc:
        logger.error("Failed to save license token to %s: %s", path, exc)


def _get_app_version() -> str:
    """Read the hub version from VERSION file."""
    try:
        version_file = Path(settings.BASE_DIR) / "VERSION"
        return version_file.read_text().strip()
    except (FileNotFoundError, OSError):
        return "unknown"


def _get_uptime_seconds() -> int:
    """Get system uptime in seconds (Linux)."""
    try:
        uptime_str = Path("/proc/uptime").read_text().split()[0]
        return int(float(uptime_str))
    except (FileNotFoundError, OSError, ValueError, IndexError):
        return 0


def _get_usage_counts_24h() -> tuple[int, int]:
    """Get active user count and encounter count in the last 24 hours."""
    try:
        from django.contrib.auth import get_user_model
        from django.utils import timezone

        User = get_user_model()
        since = timezone.now() - timezone.timedelta(hours=24)

        user_count = User.objects.filter(last_login__gte=since).count()

        try:
            from hmis.apps.encounters.models import Encounter

            encounter_count = Encounter.objects.filter(created_at__gte=since).count()
        except _licensing_optional_step_exceptions():
            encounter_count = 0

        return user_count, encounter_count
    except _licensing_optional_step_exceptions():
        return 0, 0


# ---------------------------------------------------------------------------
# Phase 4: Auto-update check task
# ---------------------------------------------------------------------------


@shared_task(
    name="hmis.apps.licensing.tasks.check_for_updates",
    max_retries=2,
    default_retry_delay=1800,  # 30 minutes between retries
)
def check_for_updates() -> dict:
    """
    Check for available hub updates (Phase 4).

    Runs daily via Celery beat. Compares the current version against
    the cloud update manifest and records available updates.

    Only runs when DJANGO_ENV=hub.
    """
    if os.getenv("DJANGO_ENV", "") != "hub":
        return {"skipped": True, "reason": "not a hub installation"}

    from hmis.apps.licensing.update_service import check_for_update

    current_version = _get_app_version()
    if current_version == "unknown":
        return {"skipped": True, "reason": "version unknown"}

    # Read license token for authenticated access
    token_path = getattr(settings, "HUB_LICENSE_TOKEN_PATH", "/var/lib/vitora-hub/license.jwt")
    token = os.getenv("LICENSE_TOKEN", "")
    if not token:
        try:
            token = Path(token_path).read_text().strip()
        except (FileNotFoundError, PermissionError):
            token = ""

    update_info = check_for_update(current_version, license_token=token)

    if update_info is None:
        logger.info("No updates available (current: %s).", current_version)
        return {"up_to_date": True, "version": current_version}

    logger.info(
        "Update available: %s → %s (channel: %s)",
        current_version,
        update_info.version,
        update_info.channel,
    )

    return {
        "update_available": True,
        "current_version": current_version,
        "available_version": update_info.version,
        "channel": update_info.channel,
        "is_container": update_info.is_container_update,
        "release_notes_url": update_info.release_notes_url,
    }


# ---------------------------------------------------------------------------
# Phase 4: Auto-apply update task
# ---------------------------------------------------------------------------


@shared_task(
    name="hmis.apps.licensing.tasks.auto_apply_update",
    max_retries=1,
    default_retry_delay=3600,  # 1 hour between retries
)
def auto_apply_update() -> dict:
    """
    Automatically apply hub updates (Phase 4).

    Runs daily after check_for_updates. If an update is available,
    downloads/verifies it and spawns the platform-specific update script
    as a detached process (the service will be stopped during update).

    Container deployments use the Docker lifecycle directly.

    Only runs when DJANGO_ENV=hub and HUB_AUTO_UPDATE is True.
    """
    if os.getenv("DJANGO_ENV", "") != "hub":
        return {"skipped": True, "reason": "not a hub installation"}

    if not getattr(settings, "HUB_AUTO_UPDATE", True):
        return {"skipped": True, "reason": "auto-update disabled"}

    from hmis.apps.licensing.update_service import apply_container_update, check_for_update

    current_version = _get_app_version()
    if current_version == "unknown":
        return {"skipped": True, "reason": "version unknown"}

    # Read license token
    token = _read_license_token()

    update_info = check_for_update(current_version, license_token=token)
    if update_info is None:
        return {"up_to_date": True, "version": current_version}

    logger.info(
        "Auto-applying update: %s → %s",
        current_version,
        update_info.version,
    )

    # Container mode: apply directly via Docker lifecycle
    if update_info.is_container_update:
        success = apply_container_update(update_info, license_token=token)
        return {
            "applied": success,
            "mode": "container",
            "version": update_info.version,
        }

    # Native mode: spawn the platform update script as a detached process.
    # The script stops the service (including this worker), applies the update,
    # runs migrations, and restarts — so we cannot wait for its result.
    return _spawn_native_update(update_info.version)


def _read_license_token() -> str:
    """Read license token from env or disk."""
    token = os.getenv("LICENSE_TOKEN", "")
    if token:
        return token
    token_path = getattr(settings, "HUB_LICENSE_TOKEN_PATH", "/var/lib/vitora-hub/license.jwt")
    try:
        return Path(token_path).read_text().strip()
    except (FileNotFoundError, PermissionError):
        return ""


def _spawn_native_update(version: str) -> dict:
    """
    Spawn the platform-specific update script as a detached process.

    On Linux: runs update-hub.sh via bash
    On Windows: runs update-hub-windows.ps1 via PowerShell

    The script will stop the hub service (killing this worker), so we
    spawn it detached and return immediately.
    """
    import platform
    import subprocess  # nosec B404

    scripts_dir = Path(settings.BASE_DIR) / "scripts"

    if platform.system() == "Windows":
        script = scripts_dir / "update-hub-windows.ps1"
        if not script.exists():
            script = Path(r"C:\VitoraHub\scripts\update-hub-windows.ps1")
        if not script.exists():
            logger.error("Windows update script not found")
            return {"error": "update script not found", "platform": "windows"}

        # Spawn detached PowerShell process
        # CREATE_NEW_PROCESS_GROUP (0x200) + DETACHED_PROCESS (0x08)
        subprocess.Popen(  # noqa: S603  # nosec B603 B607
            [  # noqa: S607
                "powershell.exe",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script),
                "-Version",
                version,
            ],
            creationflags=0x00000208,
            close_fds=True,
        )
    else:
        script = scripts_dir / "update-hub.sh"
        if not script.exists():
            script = Path("/opt/vitora/scripts/update-hub.sh")
        if not script.exists():
            logger.error("Linux update script not found")
            return {"error": "update script not found", "platform": "linux"}

        # Spawn detached bash process via double-fork / nohup
        subprocess.Popen(  # noqa: S603  # nosec B603 B607
            ["bash", str(script), "--version", version],  # noqa: S607
            start_new_session=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )

    logger.info(
        "Spawned update script for version %s — service will restart shortly.",
        version,
    )
    return {
        "applied": True,
        "mode": "native",
        "version": version,
        "note": "Update script spawned; service will restart.",
    }
