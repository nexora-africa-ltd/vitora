# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create, verify, upload, and restore encrypted Facility Hub SQLite backups.

Used by the ``hub_backup``, ``hub_backup_upload``, and ``hub_restore``
management commands. Inputs are configured Django hub settings; bundles contain
a WAL-safe SQLite snapshot, persisted sync state, and a checksummed manifest.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import sqlite3
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import connections

from hmis.apps.core.hub_database import HubDatabaseError, snapshot_encrypted_database
from hmis.apps.core.hub_sync import SYNC_STATE_FILENAME

BUNDLE_SUFFIX = ".hubbackup"
QUEUE_FILENAME = ".hub_backup_upload_queue.json"
DATABASE_MEMBER = "hub.sqlite3"
STATE_MEMBER = ".hub_sync_state.json"
MANIFEST_MEMBER = "manifest.json"


class BackupError(RuntimeError):
    """Raised when a backup cannot be securely created, verified, or restored."""


def _backup_dir() -> Path:
    return Path(getattr(settings, "HUB_BACKUP_DIR", Path(settings.HUB_DATA_DIR) / "backups"))


def _database_path() -> Path:
    return Path(getattr(settings, "HUB_DB_PATH", settings.DATABASES["default"]["NAME"]))


def _state_path() -> Path:
    return Path(getattr(settings, "HUB_DATA_DIR", settings.BASE_DIR)) / SYNC_STATE_FILENAME


def _fernet() -> Fernet:
    key = getattr(settings, "HUB_BACKUP_ENCRYPTION_KEY", "")
    if not key:
        raise BackupError(
            "HUB_BACKUP_ENCRYPTION_KEY must be configured; refusing unencrypted backup."
        )
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except (TypeError, ValueError) as exc:
        raise BackupError("HUB_BACKUP_ENCRYPTION_KEY is not a valid Fernet key.") from exc


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _snapshot_database(database_path: Path) -> bytes:
    """Return a consistent snapshot using SQLite's WAL-aware backup API."""
    if not database_path.is_file():
        raise BackupError(f"Hub database does not exist: {database_path}")
    if getattr(settings, "HUB_DATABASE_ENCRYPTION_REQUIRED", False):
        try:
            return snapshot_encrypted_database(
                database_path, str(getattr(settings, "HUB_DATABASE_ENCRYPTION_KEY", ""))
            )
        except HubDatabaseError as exc:
            raise BackupError(str(exc)) from exc
    with tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False) as temporary:
        snapshot_path = Path(temporary.name)
    try:
        source = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
        destination = sqlite3.connect(snapshot_path)
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()
        return snapshot_path.read_bytes()
    except sqlite3.Error as exc:
        raise BackupError(f"Could not create SQLite backup snapshot: {exc}") from exc
    finally:
        snapshot_path.unlink(missing_ok=True)


def _write_bundle(
    snapshot: bytes, state: bytes, state_present: bool
) -> tuple[bytes, dict[str, Any]]:
    manifest: dict[str, Any] = {
        "format": "vitora-hub-backup-v1",
        "created_at": datetime.now(UTC).isoformat(),
        "files": {
            "database": {
                "name": DATABASE_MEMBER,
                "sha256": _sha256(snapshot),
                "size": len(snapshot),
            },
            "sync_state": {
                "name": STATE_MEMBER,
                "sha256": _sha256(state),
                "size": len(state),
                "present": state_present,
            },
        },
    }
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr(DATABASE_MEMBER, snapshot)
        bundle.writestr(STATE_MEMBER, state)
        bundle.writestr(
            MANIFEST_MEMBER, json.dumps(manifest, sort_keys=True, separators=(",", ":"))
        )
    return archive.getvalue(), manifest


def _queue_path() -> Path:
    return _backup_dir() / QUEUE_FILENAME


def _read_queue() -> list[dict[str, str]]:
    try:
        queue = json.loads(_queue_path().read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, json.JSONDecodeError) as exc:
        raise BackupError(f"Could not read backup upload queue: {exc}") from exc
    if not isinstance(queue, list) or not all(isinstance(item, dict) for item in queue):
        raise BackupError("Backup upload queue is invalid.")
    return queue


def _write_queue(queue: list[dict[str, str]]) -> None:
    queue_path = _queue_path()
    queue_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = queue_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(queue, indent=2, sort_keys=True), encoding="utf-8")
    os.replace(temporary, queue_path)


def _prune_backups(directory: Path) -> None:
    retention = max(1, int(getattr(settings, "HUB_BACKUP_RETENTION_COUNT", 14)))
    bundles = sorted(
        directory.glob(f"*{BUNDLE_SUFFIX}"), key=lambda item: item.stat().st_mtime, reverse=True
    )
    for obsolete in bundles[retention:]:
        obsolete.unlink()


def create_backup() -> Path:
    """Create an encrypted backup bundle and enqueue it for configured offsite upload."""
    fernet = _fernet()
    backup_dir = _backup_dir()
    backup_dir.mkdir(parents=True, exist_ok=True)
    snapshot = _snapshot_database(_database_path())
    state_path = _state_path()
    state_present = state_path.is_file()
    state = state_path.read_bytes() if state_present else b"{}"
    archive, manifest = _write_bundle(snapshot, state, state_present)
    filename = f"hub-{datetime.now(UTC):%Y%m%dT%H%M%SZ}{BUNDLE_SUFFIX}"
    bundle_path = backup_dir / filename
    encrypted = fernet.encrypt(archive)
    bundle_path.write_bytes(encrypted)
    os.chmod(bundle_path, 0o600)
    _prune_backups(backup_dir)

    if _upload_target()[0]:
        queue = _read_queue()
        queue.append(
            {
                "bundle": str(bundle_path),
                "sha256": _sha256(encrypted),
                "created_at": manifest["created_at"],
            }
        )
        _write_queue(queue)
    return bundle_path


def _read_verified_bundle(bundle_path: Path) -> tuple[dict[str, Any], bytes, bytes]:
    try:
        decrypted = _fernet().decrypt(bundle_path.read_bytes())
    except FileNotFoundError as exc:
        raise BackupError(f"Backup bundle does not exist: {bundle_path}") from exc
    except (InvalidToken, OSError) as exc:
        raise BackupError(
            "Backup bundle cannot be decrypted with HUB_BACKUP_ENCRYPTION_KEY."
        ) from exc
    try:
        with zipfile.ZipFile(io.BytesIO(decrypted)) as bundle:
            manifest = json.loads(bundle.read(MANIFEST_MEMBER))
            snapshot = bundle.read(DATABASE_MEMBER)
            state = bundle.read(STATE_MEMBER)
    except (KeyError, OSError, ValueError, zipfile.BadZipFile) as exc:
        raise BackupError(f"Backup bundle is malformed: {exc}") from exc
    if manifest.get("format") != "vitora-hub-backup-v1":
        raise BackupError("Backup bundle format is not supported.")
    files = manifest.get("files", {})
    if _sha256(snapshot) != files.get("database", {}).get("sha256"):
        raise BackupError("Backup database checksum verification failed.")
    if _sha256(state) != files.get("sync_state", {}).get("sha256"):
        raise BackupError("Backup sync state checksum verification failed.")
    return manifest, snapshot, state


def verify_backup(bundle_path: Path | str) -> dict[str, Any]:
    """Decrypt and verify all bundle members without modifying local data."""
    manifest, _, _ = _read_verified_bundle(Path(bundle_path))
    return manifest


def restore_backup(
    bundle_path: Path | str,
    *,
    database_path: Path | str | None = None,
    state_path: Path | str | None = None,
    force: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Verify and atomically restore a bundle, requiring force for an existing DB."""
    manifest, snapshot, state = _read_verified_bundle(Path(bundle_path))
    target_database = Path(database_path) if database_path else _database_path()
    target_state = Path(state_path) if state_path else _state_path()
    if dry_run:
        return {"dry_run": True, "database_path": str(target_database), "manifest": manifest}
    if target_database.exists() and not force:
        raise BackupError("Target database exists; pass --force after stopping the hub service.")
    target_database.parent.mkdir(parents=True, exist_ok=True)
    target_state.parent.mkdir(parents=True, exist_ok=True)
    connections.close_all()
    for target, content in ((target_database, snapshot), (target_state, state)):
        temporary = target.with_suffix(f"{target.suffix}.restore")
        temporary.write_bytes(content)
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)
    return {"dry_run": False, "database_path": str(target_database), "manifest": manifest}


def _upload_target() -> tuple[str, str]:
    nas_path = str(getattr(settings, "HUB_BACKUP_NAS_PATH", "") or "").strip()
    s3_url = str(getattr(settings, "HUB_BACKUP_S3_URL", "") or "").strip()
    if nas_path and s3_url:
        raise BackupError("Configure only one offsite backup target: NAS or S3 URL.")
    return ("nas", nas_path) if nas_path else (("s3", s3_url) if s3_url else ("", ""))


def _upload_bundle(bundle_path: Path, target_kind: str, target: str) -> None:
    if target_kind == "nas":
        destination = Path(target)
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copy2(bundle_path, destination / bundle_path.name)
        return
    token = str(getattr(settings, "HUB_BACKUP_S3_TOKEN", "") or "").strip()
    if not token:
        raise BackupError("HUB_BACKUP_S3_TOKEN is required for S3-compatible uploads.")
    expires_at = str(getattr(settings, "HUB_BACKUP_S3_TOKEN_EXPIRES_AT", "") or "").strip()
    if expires_at:
        try:
            expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise BackupError("HUB_BACKUP_S3_TOKEN_EXPIRES_AT is invalid.") from exc
        if expiry.tzinfo is None or expiry <= datetime.now(UTC):
            raise BackupError(
                "HUB_BACKUP_S3_TOKEN has expired; retaining queued backups for renewal."
            )
    url = urllib.parse.urljoin(f"{target.rstrip('/')}/", urllib.parse.quote(bundle_path.name))
    parsed_url = urllib.parse.urlparse(url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise BackupError("HUB_BACKUP_S3_URL must be an absolute HTTP(S) endpoint.")
    headers = {"Content-Type": "application/octet-stream"}
    if "sig=" in token:
        separator = "&" if parsed_url.query else "?"
        url = f"{url}{separator}{token.lstrip('?')}"
        headers["x-ms-blob-type"] = "BlockBlob"
    else:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(  # noqa: S310 - validated operator-configured endpoint
        url,
        data=bundle_path.read_bytes(),
        method="PUT",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310  # nosec B310 - validated HTTPS operator endpoint
            if response.status not in {200, 201, 204}:
                raise BackupError(f"Offsite upload returned HTTP {response.status}.")
    except urllib.error.URLError as exc:
        raise BackupError(f"Offsite upload failed: {exc.reason}") from exc


def upload_pending_backups(*, dry_run: bool = False) -> dict[str, int]:
    """Upload queued bundles in order, retaining failed entries for later retry."""
    target_kind, target = _upload_target()
    queue = _read_queue()
    if not target_kind:
        return {"uploaded": 0, "failed": 0, "pending": len(queue)}
    if dry_run:
        return {"uploaded": 0, "failed": 0, "pending": len(queue)}
    uploaded = failed = 0
    remaining: list[dict[str, str]] = []
    for item in queue:
        bundle_path = Path(item.get("bundle", ""))
        try:
            if not bundle_path.is_file() or _sha256(bundle_path.read_bytes()) != item.get("sha256"):
                raise BackupError("Queued backup is missing or has changed.")
            _upload_bundle(bundle_path, target_kind, target)
            uploaded += 1
        except BackupError:
            failed += 1
            remaining.append(item)
    _write_queue(remaining)
    return {"uploaded": uploaded, "failed": failed, "pending": len(remaining)}
