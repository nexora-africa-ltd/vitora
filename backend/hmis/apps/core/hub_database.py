# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Manage SQLCipher encryption for Facility Hub SQLite databases.

Used by the ``hub_encrypt_database``, ``hub_rotate_database_key``, and
``hub_database_key_status`` commands. Callers provide a database path and a
runtime key; deployment-specific secret and escrow adapters remain external.
"""

from __future__ import annotations

import os
import tempfile
from contextlib import suppress
from pathlib import Path

from sqlcipher3 import dbapi2 as sqlcipher


class HubDatabaseError(RuntimeError):
    """Raised when a hub database encryption lifecycle action is unsafe or fails."""


def _quoted(value: str) -> str:
    """Return a SQLite single-quoted literal for a trusted DB-API pragma value."""
    return "'" + value.replace("'", "''") + "'"


def _require_key(key: str) -> str:
    if not key:
        raise HubDatabaseError("A SQLCipher database key is required.")
    return key


def _connect_encrypted(database_path: Path, key: str, *, read_only: bool = False):
    _require_key(key)
    try:
        if read_only:
            connection = sqlcipher.connect(f"file:{database_path}?mode=ro", uri=True)
        else:
            connection = sqlcipher.connect(database_path)
        connection.execute(f"PRAGMA key = {_quoted(key)}")
        connection.execute("SELECT COUNT(*) FROM sqlite_master").fetchone()
        return connection
    except sqlcipher.DatabaseError as exc:
        with suppress(UnboundLocalError):
            connection.close()
        raise HubDatabaseError("The supplied SQLCipher key cannot open this database.") from exc


def verify_database_key(database_path: Path | str, key: str) -> bool:
    """Return ``True`` only when ``key`` can decrypt the existing database."""
    path = Path(database_path)
    if not path.is_file():
        raise HubDatabaseError(f"Hub database does not exist: {path}")
    connection = _connect_encrypted(path, key, read_only=True)
    connection.close()
    return True


def database_key_status(database_path: Path | str, key: str) -> dict[str, str | bool]:
    """Report whether a configured key can open the target without exposing it."""
    path = Path(database_path)
    result: dict[str, str | bool] = {
        "database_path": str(path),
        "key_configured": bool(key),
        "status": "key_missing" if not key else "invalid",
    }
    if not key:
        return result
    if path.is_file():
        with path.open("rb") as source:
            if source.read(16) == b"SQLite format 3\x00":
                result["status"] = "plaintext"
                return result
    try:
        verify_database_key(path, key)
    except HubDatabaseError:
        return result
    result["status"] = "valid"
    return result


def convert_plaintext_database(
    plaintext_path: Path | str, encrypted_path: Path | str, key: str
) -> Path:
    """Export a plaintext SQLite database into a new SQLCipher-encrypted file."""
    _require_key(key)
    source_path = Path(plaintext_path)
    target_path = Path(encrypted_path)
    if not source_path.is_file():
        raise HubDatabaseError(f"Hub database does not exist: {source_path}")
    if target_path.exists():
        raise HubDatabaseError(f"Encrypted target already exists: {target_path}")
    with source_path.open("rb") as source:
        if source.read(16) != b"SQLite format 3\x00":
            raise HubDatabaseError(
                "Source is not plaintext SQLite; do not replace an encrypted database with an unknown key."
            )
    target_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlcipher.connect(source_path)
    try:
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise HubDatabaseError("Plaintext database integrity check failed.")
        user_version = connection.execute("PRAGMA user_version").fetchone()[0]
        application_id = connection.execute("PRAGMA application_id").fetchone()[0]
        connection.execute(
            f"ATTACH DATABASE {_quoted(str(target_path))} AS encrypted KEY {_quoted(key)}"
        )
        connection.execute("SELECT sqlcipher_export('encrypted')")
        connection.execute(f"PRAGMA encrypted.user_version = {int(user_version)}")
        connection.execute(f"PRAGMA encrypted.application_id = {int(application_id)}")
        tables = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        for (table,) in tables:
            identifier = '"' + table.replace('"', '""') + '"'
            source_count = connection.execute(
                f"SELECT COUNT(*) FROM main.{identifier}"  # noqa: S608  # nosec S608 - sqlite_master identifier quoted above.
            ).fetchone()
            target_count = connection.execute(
                f"SELECT COUNT(*) FROM encrypted.{identifier}"  # noqa: S608  # nosec S608 - sqlite_master identifier quoted above.
            ).fetchone()
            if source_count != target_count:
                raise HubDatabaseError("Encrypted export row counts do not match the source.")
        connection.execute("DETACH DATABASE encrypted")
    except sqlcipher.DatabaseError as exc:
        target_path.unlink(missing_ok=True)
        raise HubDatabaseError(f"Could not encrypt hub database: {exc}") from exc
    finally:
        connection.close()
    os.chmod(target_path, 0o600)
    verify_database_key(target_path, key)
    return target_path


def replace_with_encrypted_database(database_path: Path | str, key: str) -> Path:
    """Atomically replace a plaintext hub database with its encrypted equivalent."""
    source_path = Path(database_path)
    state = database_key_status(source_path, key)["status"]
    if state == "valid":
        return source_path
    if state != "plaintext":
        raise HubDatabaseError(
            "Conversion requires a verified plaintext database and a configured key."
        )
    # Checkpoint while all hub writers are stopped. Refuse an incomplete
    # checkpoint instead of replacing a DB still paired with an active WAL.
    source = sqlcipher.connect(source_path)
    try:
        checkpoint = source.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if checkpoint[0] != 0:
            raise HubDatabaseError("Database is busy; stop all hub writers before conversion.")
        if source.execute("PRAGMA journal_mode=DELETE").fetchone()[0] != "delete":
            raise HubDatabaseError("Could not detach the plaintext database from its WAL.")
    finally:
        source.close()
    with tempfile.NamedTemporaryFile(
        dir=source_path.parent, prefix=f".{source_path.name}.", suffix=".sqlcipher", delete=False
    ) as temporary:
        target_path = Path(temporary.name)
    target_path.unlink()
    try:
        convert_plaintext_database(source_path, target_path, key)
        os.replace(target_path, source_path)
    finally:
        target_path.unlink(missing_ok=True)
    return source_path


def rekey_database(database_path: Path | str, old_key: str, new_key: str) -> None:
    """Rotate an encrypted hub database key in place after authenticating ``old_key``."""
    _require_key(new_key)
    path = Path(database_path)
    connection = _connect_encrypted(path, old_key)
    try:
        connection.execute(f"PRAGMA rekey = {_quoted(new_key)}")
        connection.execute("SELECT COUNT(*) FROM sqlite_master").fetchone()
    except sqlcipher.DatabaseError as exc:
        raise HubDatabaseError(f"Could not rotate SQLCipher database key: {exc}") from exc
    finally:
        connection.close()
    verify_database_key(path, new_key)


def snapshot_encrypted_database(database_path: Path | str, key: str) -> bytes:
    """Return a WAL-consistent SQLCipher snapshot encrypted with the same key."""
    source_path = Path(database_path)
    source = _connect_encrypted(source_path, key, read_only=True)
    with tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False) as temporary:
        snapshot_path = Path(temporary.name)
    try:
        destination = _connect_encrypted(snapshot_path, key)
        try:
            source.backup(destination)
        finally:
            destination.close()
        return snapshot_path.read_bytes()
    except sqlcipher.DatabaseError as exc:
        raise HubDatabaseError(f"Could not create SQLCipher backup snapshot: {exc}") from exc
    finally:
        source.close()
        snapshot_path.unlink(missing_ok=True)
