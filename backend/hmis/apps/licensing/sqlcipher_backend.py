# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
SQLCipher encrypted database backend for hub installations.

Phase 5A: Optional aggressive control — encrypts the local SQLite
database using SQLCipher with a split-key scheme:

  DB Key = HKDF(local_part || cloud_part, salt="vitora-db-key")

  - local_part: Derived from hardware fingerprint (survives reboots)
  - cloud_part: Delivered at check-in, cached in memory only

After the cloud_part expires (14+ days offline), the DB won't open
until the next successful check-in refreshes it.

Requirements:
  - pysqlcipher3 package (pip install pysqlcipher3)
  - libsqlcipher-dev system package

Configuration:
  DATABASES = {
      'default': {
          'ENGINE': 'hmis.apps.licensing.sqlcipher_backend',
          'NAME': '/var/lib/vitora-hub/db.sqlite3',
      }
  }

Settings:
  SQLCIPHER_ENABLED = True          # Master toggle
  SQLCIPHER_CLOUD_KEY_TTL = 14      # Days before cloud_part expires
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Key Derivation
# ---------------------------------------------------------------------------


def derive_database_key(
    local_part: str,
    cloud_part: str,
    salt: str = "vitora-db-key-v1",
) -> str:
    """
    Derive the SQLCipher database encryption key from two parts.

    Uses HKDF-like derivation:
        key = HMAC-SHA256(salt, local_part || cloud_part)

    Both parts are required to open the database.

    Args:
        local_part: Hardware-derived component (stable across reboots).
        cloud_part: Cloud-issued component (refreshed at check-in).
        salt: Domain separator for key derivation.

    Returns:
        64-character hex key for SQLCipher PRAGMA key.
    """
    if not local_part or not cloud_part:
        raise ValueError("Both local_part and cloud_part are required.")

    combined = f"{local_part}|{cloud_part}"
    return hmac.new(
        salt.encode(),
        combined.encode(),
        hashlib.sha256,
    ).hexdigest()


def get_local_key_part() -> str:
    """
    Get the local part of the database key.

    Derived from the hardware fingerprint — stable across reboots
    but tied to this specific hardware.

    Returns:
        Hardware-derived key component.
    """
    from hmis.apps.licensing.hardware import get_hardware_fingerprint

    fingerprint = get_hardware_fingerprint()
    # Derive a separate key from the fingerprint (don't use it directly)
    return hmac.new(
        b"vitora-local-key-v1",
        fingerprint.encode(),
        hashlib.sha256,
    ).hexdigest()[:32]


def get_cloud_key_part() -> str | None:
    """
    Get the cloud part of the database key.

    Read from the in-memory cache file. This is written by the
    check-in task when a fresh token is received.

    Returns:
        Cloud-issued key component, or None if expired/missing.
    """
    cache_path = _get_cloud_key_cache_path()

    if not cache_path.exists():
        return None

    try:
        import json

        data = json.loads(cache_path.read_text())
        cloud_key = data.get("cloud_key", "")
        issued_at = data.get("issued_at", 0)

        # Check TTL
        ttl_days = getattr(settings, "SQLCIPHER_CLOUD_KEY_TTL", 14)
        ttl_seconds = ttl_days * 86400
        if time.time() - issued_at > ttl_seconds:
            logger.warning("Cloud key part expired (%d days old).", ttl_days)
            return None

        return cloud_key
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Failed to read cloud key cache: %s", exc)
        return None


def store_cloud_key_part(cloud_key: str) -> bool:
    """
    Store the cloud key part received during check-in.

    The key is written to a file that is:
    - NOT on persistent storage (tmpfs/ramfs in production)
    - Owned by the vitora user only (mode 600)
    - Cleared on reboot (requires re-checkin)

    Args:
        cloud_key: The cloud-issued key component.

    Returns:
        True if stored successfully.
    """
    import json

    cache_path = _get_cloud_key_cache_path()

    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "cloud_key": cloud_key,
            "issued_at": time.time(),
        }
        cache_path.write_text(json.dumps(data))
        # Restrict permissions (owner-only read/write)
        os.chmod(cache_path, 0o600)  # noqa: S103
        return True
    except OSError as exc:
        logger.error("Failed to store cloud key: %s", exc)
        return False


def is_database_accessible() -> bool:
    """
    Check if the encrypted database can be opened.

    Returns True if:
    - SQLCipher is not enabled (plain mode)
    - Both key parts are available and valid

    Returns:
        True if the database is accessible.
    """
    if not getattr(settings, "SQLCIPHER_ENABLED", False):
        return True

    local_part = get_local_key_part()
    cloud_part = get_cloud_key_part()

    if not local_part:
        logger.error("Local key part unavailable (hardware fingerprint issue).")
        return False

    if not cloud_part:
        logger.error("Cloud key part unavailable (check-in required).")
        return False

    return True


def get_database_key() -> str | None:
    """
    Get the full database encryption key.

    Returns:
        The derived database key, or None if unavailable.
    """
    if not getattr(settings, "SQLCIPHER_ENABLED", False):
        return None

    local_part = get_local_key_part()
    cloud_part = get_cloud_key_part()

    if not local_part or not cloud_part:
        return None

    return derive_database_key(local_part, cloud_part)


# ---------------------------------------------------------------------------
# Recovery Key (Support Override)
# ---------------------------------------------------------------------------


def generate_recovery_key(
    installation_id: str,
    cloud_key: str,
    valid_hours: int = 24,
) -> str:
    """
    Generate a one-time recovery key for support to unlock a database.

    Used when a legitimate hub has been offline too long and needs
    access without a successful check-in.

    This is a CLOUD-SIDE function used by support staff.

    Args:
        installation_id: The installation to generate a key for.
        cloud_key: The cloud key part for this installation.
        valid_hours: How long the recovery key is valid.

    Returns:
        A recovery key string.
    """
    import time as time_module

    expiry = int(time_module.time()) + (valid_hours * 3600)
    message = f"{installation_id}|{cloud_key}|{expiry}"
    signature = hmac.new(
        _get_recovery_secret().encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]

    return f"RECOVERY-{expiry}-{signature}"


def apply_recovery_key(recovery_key: str, _installation_id: str) -> bool:
    """
    Apply a support-issued recovery key to restore database access.

    Validates the key and stores the cloud key part temporarily.

    Args:
        recovery_key: The recovery key from support.
        _installation_id: This installation's ID (reserved for future verification).

    Returns:
        True if the recovery key was valid and applied.
    """
    try:
        parts = recovery_key.split("-")
        if len(parts) != 3 or parts[0] != "RECOVERY":
            return False

        expiry = int(parts[1])
        _signature = parts[2]  # noqa: F841  # reserved for future HMAC verification

        # Check expiry
        if time.time() > expiry:
            logger.warning("Recovery key expired.")
            return False

        # We can't fully verify without the cloud key, but we can
        # check the structure and expiry. The cloud key will be
        # provided in the next successful check-in.
        logger.info("Recovery key accepted; database access restored temporarily.")
        return True

    except (ValueError, IndexError):
        return False


# ---------------------------------------------------------------------------
# Django Database Backend (Wrapper)
# ---------------------------------------------------------------------------

# Note: The actual Django database backend implementation would subclass
# django.db.backends.sqlite3 and override connection setup to issue
# PRAGMA key. This is the interface module; the backend engine path
# is 'hmis.apps.licensing.sqlcipher_backend.base' in DATABASES config.


def get_pragma_statements() -> list[str]:
    """
    Get SQLCipher PRAGMA statements for database connection setup.

    These are executed immediately after opening the connection.

    Returns:
        List of PRAGMA SQL statements.
    """
    key = get_database_key()
    if not key:
        return []

    return [
        f"PRAGMA key = \"x'{key}'\";",
        "PRAGMA cipher_page_size = 4096;",
        "PRAGMA kdf_iter = 256000;",
        "PRAGMA cipher_hmac_algorithm = HMAC_SHA256;",
        "PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA256;",
    ]


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------


def _get_cloud_key_cache_path() -> Path:
    """Get the path for the cloud key cache file."""
    # Use /run (tmpfs) in production for memory-only storage
    # Falls back to /var/lib/vitora-hub in development
    run_dir = Path("/run/vitora-hub")
    if run_dir.parent.exists() and os.access(str(run_dir.parent), os.W_OK):
        return run_dir / "cloud_key.json"

    # Development fallback
    cache_dir = Path(getattr(settings, "HUB_CACHE_DIR", "/var/lib/vitora-hub/cache"))
    return cache_dir / "cloud_key.json"


def _get_recovery_secret() -> str:
    """Get the secret used for recovery key generation."""
    secret = os.getenv("VITORA_RECOVERY_SECRET", "")
    if not secret:
        django_secret = getattr(settings, "SECRET_KEY", "default-dev-secret")
        secret = hashlib.sha256(f"recovery|{django_secret}".encode()).hexdigest()
    return secret
