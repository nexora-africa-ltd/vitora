# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: S607 — docker/cosign CLI tools invoked by partial name intentionally.
"""
Auto-update service for hub installations.

Phase 4: Distribution Hardening — checks for new versions, downloads,
verifies signatures, and orchestrates atomic updates.

Supports two delivery modes:
- Container (Docker): pulls new image, verifies cosign signature, restarts
- Tarball (native): downloads from CDN, verifies manifest hash, swaps atomically
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess  # nosec B404 - needed for docker commands
from dataclasses import dataclass
from pathlib import Path

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CDN_BASE_URL = getattr(settings, "HUB_CDN_BASE_URL", "https://get.vitora.digital")
REGISTRY = getattr(settings, "HUB_REGISTRY", "registry.vitora.digital")
IMAGE_NAME = getattr(settings, "HUB_IMAGE_NAME", "hub")
UPDATE_CHANNEL = getattr(settings, "HUB_UPDATE_CHANNEL", "stable")
COSIGN_PUBLIC_KEY_PATH = getattr(
    settings,
    "HUB_COSIGN_PUBLIC_KEY_PATH",
    "/opt/vitora-hub/keys/cosign.pub",
)
MAX_DEFER_DAYS = getattr(settings, "HUB_MAX_DEFER_DAYS", 14)


@dataclass
class UpdateInfo:
    """Information about an available update."""

    version: str
    channel: str
    digest: str | None = None
    url: str | None = None
    sha256: str | None = None
    minimum_version: str | None = None
    release_notes_url: str | None = None
    published_at: str | None = None

    @property
    def is_container_update(self) -> bool:
        return self.digest is not None

    @property
    def is_tarball_update(self) -> bool:
        return self.url is not None and self.digest is None


def check_for_update(  # nosec B107  # FP: license_token is not a password
    current_version: str, license_token: str = ""
) -> UpdateInfo | None:
    """
    Check the cloud update manifest for a newer version.

    Args:
        current_version: Currently running version string.
        license_token: License JWT for authenticated access.

    Returns:
        UpdateInfo if an update is available, None otherwise.
    """
    delivery_mode = _detect_delivery_mode()

    if delivery_mode == "container":
        manifest_url = f"{CDN_BASE_URL}/hub-container/latest.json"
    else:
        manifest_url = f"{CDN_BASE_URL}/hub/latest.json"

    headers = {}
    if license_token:
        headers["Authorization"] = f"Bearer {license_token}"

    try:
        response = requests.get(manifest_url, headers=headers, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Update check failed: %s", exc)
        return None

    data = response.json()
    available_version = data.get("version", "")

    if not available_version:
        return None

    # Simple semantic version comparison
    if not _is_newer_version(available_version, current_version):
        return None

    # Check minimum version requirement
    min_version = data.get("minimum_version")
    if min_version and _is_newer_version(min_version, current_version):
        logger.warning(
            "Current version %s is below minimum %s; forced update required.",
            current_version,
            min_version,
        )

    return UpdateInfo(
        version=available_version,
        channel=data.get("channel", UPDATE_CHANNEL),
        digest=data.get("digest"),
        url=data.get("url"),
        sha256=data.get("sha256"),
        minimum_version=min_version,
        release_notes_url=data.get("release_notes_url"),
        published_at=data.get("published_at"),
    )


def download_and_verify_tarball(update: UpdateInfo) -> Path | None:
    """
    Download a tarball update, verify its SHA-256, and stage it.

    Returns:
        Path to the staged update directory, or None on failure.
    """
    if not update.url:
        logger.error("No download URL in update info.")
        return None

    staging_dir = Path(getattr(settings, "HUB_UPDATE_STAGING_DIR", "/var/lib/vitora-hub/updates"))
    staging_dir.mkdir(parents=True, exist_ok=True)

    tarball_path = staging_dir / f"vitora-hub-{update.version}.tar.gz"

    try:
        # Download with streaming
        response = requests.get(update.url, stream=True, timeout=300)
        response.raise_for_status()

        sha256 = hashlib.sha256()
        with open(tarball_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                sha256.update(chunk)

        # Verify SHA-256
        computed_hash = sha256.hexdigest()
        if update.sha256 and computed_hash != update.sha256:
            logger.error(
                "SHA-256 mismatch: expected %s, got %s",
                update.sha256,
                computed_hash,
            )
            tarball_path.unlink(missing_ok=True)
            return None

        logger.info("Downloaded and verified update %s", update.version)
        return tarball_path

    except requests.RequestException as exc:
        logger.error("Failed to download update: %s", exc)
        tarball_path.unlink(missing_ok=True)
        return None


def verify_container_image(image_ref: str) -> bool:
    """
    Verify a container image signature using cosign.

    Args:
        image_ref: Full image reference (registry/image:tag or @digest).

    Returns:
        True if signature is valid, False otherwise.
    """
    cosign_key = COSIGN_PUBLIC_KEY_PATH

    if not Path(cosign_key).exists():
        logger.error("Cosign public key not found at %s", cosign_key)
        return False

    try:
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["cosign", "verify", "--key", cosign_key, image_ref],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            logger.info("Image signature verified: %s", image_ref)
            return True
        else:
            logger.error("Image signature verification FAILED: %s", result.stderr)
            return False
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.error("Cosign verification error: %s", exc)
        return False


def pull_container_update(  # nosec B107
    update: UpdateInfo, license_token: str = ""
) -> bool:
    """
    Pull a new container image from the private registry.

    Uses the license JWT as bearer token for registry authentication.

    Returns:
        True if pull succeeded and signature verified.
    """
    image_ref = f"{REGISTRY}/{IMAGE_NAME}:{update.version}"
    image_ref_digest = f"{REGISTRY}/{IMAGE_NAME}@{update.digest}" if update.digest else image_ref

    # Registry login with license token
    if license_token:
        _docker_login(license_token)

    try:
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["docker", "pull", image_ref_digest],
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.returncode != 0:
            logger.error("Docker pull failed: %s", result.stderr)
            return False
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.error("Docker pull error: %s", exc)
        return False

    # Verify image signature
    if not verify_container_image(image_ref_digest):
        # Remove the unverified image
        subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["docker", "rmi", image_ref_digest],
            capture_output=True,
            timeout=30,
        )
        return False

    # Tag as the version tag if pulled by digest
    if update.digest:
        subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["docker", "tag", image_ref_digest, image_ref],
            capture_output=True,
            timeout=10,
        )

    return True


def apply_tarball_update(tarball_path: Path, rollback: bool = True) -> bool:
    """
    Apply a tarball update atomically with rollback support.

    Strategy:
    1. Extract to staging directory
    2. Verify manifest.json integrity
    3. Move current install to .previous/
    4. Move staged install to current
    5. Restart the service
    6. On failure: rollback from .previous/

    Args:
        tarball_path: Path to the downloaded and verified tarball.
        rollback: Whether to keep the previous version for rollback.

    Returns:
        True if update applied successfully.
    """
    install_dir = Path(getattr(settings, "HUB_INSTALL_DIR", "/opt/vitora-hub"))
    staging_dir = install_dir.parent / "vitora-hub-staging"
    previous_dir = install_dir.parent / "vitora-hub-previous"

    try:
        # 1. Extract to staging
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        staging_dir.mkdir(parents=True)

        import tarfile

        with tarfile.open(tarball_path) as tf:
            # Security: check for path traversal
            for member in tf.getmembers():
                if member.name.startswith("/") or ".." in member.name:
                    logger.error("Tarball contains unsafe path: %s", member.name)
                    return False
            tf.extractall(staging_dir)  # noqa: S202  # nosec B202

        # 2. Verify manifest
        manifest_file = _find_manifest(staging_dir)
        if not manifest_file:
            logger.error("No manifest.json in update payload")
            return False

        if not _verify_staged_manifest(manifest_file):
            logger.error("Manifest integrity check failed")
            return False

        # 3. Backup current installation
        if rollback:
            if previous_dir.exists():
                shutil.rmtree(previous_dir)
            if install_dir.exists():
                shutil.move(str(install_dir), str(previous_dir))

        # 4. Move staged to current
        payload_dir = _find_payload_root(staging_dir)
        shutil.move(str(payload_dir), str(install_dir))

        # 5. Cleanup staging
        if staging_dir.exists():
            shutil.rmtree(staging_dir)

        logger.info("Update applied successfully")
        return True

    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ) as exc:
        logger.error("Update failed: %s", exc)

        # Rollback on failure
        if rollback and previous_dir.exists():
            logger.info("Rolling back to previous version...")
            if install_dir.exists():
                shutil.rmtree(install_dir)
            shutil.move(str(previous_dir), str(install_dir))
            logger.info("Rollback complete.")

        return False


def rollback_update() -> bool:
    """
    Rollback to the previous version if available.

    Returns:
        True if rollback succeeded.
    """
    install_dir = Path(getattr(settings, "HUB_INSTALL_DIR", "/opt/vitora-hub"))
    previous_dir = install_dir.parent / "vitora-hub-previous"

    if not previous_dir.exists():
        logger.error("No previous version available for rollback.")
        return False

    try:
        if install_dir.exists():
            shutil.rmtree(install_dir)
        shutil.move(str(previous_dir), str(install_dir))
        logger.info("Rollback to previous version complete.")
        return True
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ) as exc:
        logger.error("Rollback failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Registry Authentication
# ---------------------------------------------------------------------------


def _docker_login(license_token: str) -> bool:
    """
    Authenticate to the private registry using the license JWT.

    The registry is configured to accept license JWTs as bearer tokens.
    """
    try:
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            [
                "docker",
                "login",
                REGISTRY,
                "--username",
                "license",
                "--password-stdin",
            ],
            input=license_token,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def generate_registry_token(installation_id: str, license_token: str) -> str | None:
    """
    Exchange a license JWT for a short-lived registry pull token.

    The cloud validates the license and returns a Docker-compatible
    bearer token scoped to pull-only on the hub image.

    Args:
        installation_id: The installation's unique ID.
        license_token: Current valid license JWT.

    Returns:
        A short-lived registry bearer token, or None on failure.
    """
    sync_server = getattr(settings, "SYNC_SERVER_URL", "")
    if not sync_server:
        return None

    token_url = f"{sync_server.rstrip('/')}/api/licensing/registry-token/"

    try:
        response = requests.post(
            token_url,
            json={"installation_id": installation_id},
            headers={"Authorization": f"Bearer {license_token}"},
            timeout=15,
        )
        if response.status_code == 200:
            return response.json().get("token")
    except requests.RequestException as exc:
        logger.warning("Registry token exchange failed: %s", exc)

    return None


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------


def _detect_delivery_mode() -> str:
    """Detect whether this hub runs as a container or native install."""
    # Check for Docker-specific indicators
    if Path("/.dockerenv").exists():
        return "container"
    if Path("/proc/1/cgroup").exists():
        try:
            cgroup_content = Path("/proc/1/cgroup").read_text()
            if "docker" in cgroup_content or "containerd" in cgroup_content:
                return "container"
        except OSError:
            pass
    return "native"


def _is_newer_version(available: str, current: str) -> bool:
    """
    Compare semantic version strings.

    Returns True if available > current.
    """
    try:
        avail_parts = [int(x) for x in available.split(".")]
        curr_parts = [int(x) for x in current.split(".")]
        # Pad to same length
        max_len = max(len(avail_parts), len(curr_parts))
        avail_parts.extend([0] * (max_len - len(avail_parts)))
        curr_parts.extend([0] * (max_len - len(curr_parts)))
        return avail_parts > curr_parts
    except (ValueError, AttributeError):
        return False


def _find_manifest(staging_dir: Path) -> Path | None:
    """Find manifest.json in the staging directory."""
    for manifest in staging_dir.rglob("manifest.json"):
        return manifest
    return None


# ---------------------------------------------------------------------------
# Container Lifecycle (Phase 4 gap closure)
# ---------------------------------------------------------------------------

HEALTH_CHECK_URL = "http://127.0.0.1:9088/api/health/"
HEALTH_CHECK_TIMEOUT = 5
HEALTH_CHECK_RETRIES = 6  # 6 x 5s = 30s total wait


def restart_container(image_ref: str) -> bool:
    """
    Restart the hub container with the new image.

    Uses docker compose to pull the new image tag and recreate the service.
    Falls back to raw `docker stop` + `docker run` if compose is unavailable.

    Returns:
        True if the container restarted and health check passed.
    """
    compose_file = Path(getattr(settings, "HUB_COMPOSE_FILE", "/opt/vitora-hub/docker-compose.yml"))

    if compose_file.exists():
        return _restart_via_compose(compose_file, image_ref)
    return _restart_via_docker(image_ref)


def _restart_via_compose(compose_file: Path, image_ref: str) -> bool:
    """Restart using docker compose."""
    import time

    compose_dir = compose_file.parent
    try:
        # Update the image reference in the environment
        env = os.environ.copy()
        env["VITORA_HUB_IMAGE"] = image_ref

        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["docker", "compose", "-f", str(compose_file), "up", "-d", "--no-deps", "hub"],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(compose_dir),
            env=env,
        )
        if result.returncode != 0:
            logger.error("docker compose up failed: %s", result.stderr)
            return False

        # Wait for health check
        time.sleep(5)
        return _wait_for_health()

    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.error("Container compose restart error: %s", exc)
        return False


def _restart_via_docker(image_ref: str) -> bool:
    """Restart using raw docker commands (fallback)."""
    import time

    container_name = "vitora-hub"
    try:
        # Stop current container
        subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["docker", "stop", container_name],
            capture_output=True,
            timeout=30,
        )
        subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["docker", "rm", container_name],
            capture_output=True,
            timeout=10,
        )

        # Start new container
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            [
                "docker",
                "run",
                "-d",
                "--name",
                container_name,
                "--restart",
                "unless-stopped",
                "-p",
                "9088:9088",
                "-v",
                "vitora-data:/data",
                image_ref,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            logger.error("docker run failed: %s", result.stderr)
            return False

        time.sleep(5)
        return _wait_for_health()

    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.error("Container restart error: %s", exc)
        return False


def _wait_for_health() -> bool:
    """Poll health endpoint until healthy or timeout."""
    import time

    for attempt in range(HEALTH_CHECK_RETRIES):
        try:
            response = requests.get(HEALTH_CHECK_URL, timeout=HEALTH_CHECK_TIMEOUT)
            if response.status_code in (200, 401):
                logger.info("Health check passed on attempt %d", attempt + 1)
                return True
        except requests.RequestException:
            pass
        time.sleep(5)

    logger.error("Health check failed after %d attempts", HEALTH_CHECK_RETRIES)
    return False


def rollback_container(previous_image: str) -> bool:
    """
    Rollback to the previous container image after a failed update.

    Args:
        previous_image: The image reference to rollback to.

    Returns:
        True if rollback succeeded.
    """
    logger.warning("Rolling back container to: %s", previous_image)
    return restart_container(previous_image)


def apply_container_update(update: UpdateInfo, license_token: str = "") -> bool:  # nosec B107
    """
    Full container update lifecycle: pull, verify, restart, health-check, rollback on failure.

    Args:
        update: UpdateInfo with version and digest.
        license_token: License JWT for registry auth.

    Returns:
        True if update applied successfully.
    """
    image_ref = f"{REGISTRY}/{IMAGE_NAME}:{update.version}"

    # Get current image for rollback
    current_image = _get_current_container_image()

    # Pull and verify new image
    if not pull_container_update(update, license_token):
        logger.error("Failed to pull/verify update %s", update.version)
        return False

    # Restart with new image
    if not restart_container(image_ref):
        logger.error("Restart failed; triggering rollback")
        if current_image:
            rollback_container(current_image)
        return False

    logger.info("Container update to %s completed successfully", update.version)
    return True


def _get_current_container_image() -> str | None:
    """Get the image reference of the currently running hub container."""
    try:
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            [
                "docker",
                "inspect",
                "--format",
                "{{.Config.Image}}",
                "vitora-hub",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


def _find_payload_root(staging_dir: Path) -> Path:
    """Find the payload root directory within the extracted tarball."""
    # If there's a single subdirectory, that's the root
    children = list(staging_dir.iterdir())
    if len(children) == 1 and children[0].is_dir():
        return children[0]
    return staging_dir


def _verify_staged_manifest(manifest_path: Path) -> bool:
    """Verify file hashes in the staged manifest against actual files."""
    try:
        manifest = json.loads(manifest_path.read_text())
    except (json.JSONDecodeError, OSError):
        return False

    files = manifest.get("files", {})
    if not files:
        # Empty manifest is suspicious
        return False

    base_dir = manifest_path.parent
    mismatches = 0

    for rel_path, expected_hash in files.items():
        file_path = base_dir / rel_path
        if not file_path.exists():
            mismatches += 1
            continue

        actual_hash = hashlib.sha256(file_path.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            mismatches += 1

    if mismatches > 0:
        logger.warning("%d file(s) failed integrity check in staged update.", mismatches)
        return False

    return True
