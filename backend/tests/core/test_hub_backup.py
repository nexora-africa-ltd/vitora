# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for encrypted, WAL-safe hub SQLite backup and recovery helpers."""

import json
import sqlite3
from datetime import timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from cryptography.fernet import Fernet
from django.test import override_settings
from django.utils import timezone
from sqlcipher3 import dbapi2 as sqlcipher

from hmis.apps.core.hub_backup import (
    BackupError,
    _upload_bundle,
    create_backup,
    restore_backup,
    upload_pending_backups,
    verify_backup,
)


@pytest.fixture
def hub_paths(tmp_path):
    """Create a WAL-backed hub database and persisted sync state."""
    db_path = tmp_path / "hub.sqlite3"
    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("CREATE TABLE records (value TEXT NOT NULL)")
    connection.execute("INSERT INTO records VALUES ('durable')")
    connection.commit()
    connection.execute("INSERT INTO records VALUES ('wal-only')")
    connection.commit()
    connection.close()

    state_path = tmp_path / ".hub_sync_state.json"
    state_path.write_text(json.dumps({"last_pull_timestamp": "2026-10-03T00:00:00+00:00"}))
    return db_path, state_path, tmp_path / "backups"


class TestHubBackup:
    """Encrypted bundle creation and inspection."""

    def test_snapshot_includes_committed_wal_data_and_sync_state(self, hub_paths):
        """Connection.backup snapshots committed WAL pages, not only the main file."""
        db_path, state_path, backup_dir = hub_paths
        key = Fernet.generate_key().decode()

        with override_settings(
            HUB_DB_PATH=str(db_path),
            HUB_DATA_DIR=str(db_path.parent),
            HUB_BACKUP_DIR=str(backup_dir),
            HUB_BACKUP_ENCRYPTION_KEY=key,
        ):
            bundle = create_backup()
            manifest = verify_backup(bundle)
            restored = db_path.parent / "snapshot.sqlite3"
            restore_backup(
                bundle,
                database_path=restored,
                state_path=state_path.with_name("restored-state.json"),
            )

        assert manifest["files"]["database"]["sha256"]
        assert manifest["files"]["sync_state"]["sha256"]
        assert manifest["files"]["sync_state"]["present"] is True

        connection = sqlite3.connect(restored)
        assert connection.execute("SELECT value FROM records ORDER BY rowid").fetchall() == [
            ("durable",),
            ("wal-only",),
        ]
        connection.close()

    def test_bundle_is_fernet_encrypted_and_requires_a_valid_key(self, hub_paths):
        """Backups never write an unencrypted archive and reject missing keys."""
        db_path, _, backup_dir = hub_paths

        with override_settings(
            HUB_DB_PATH=str(db_path),
            HUB_DATA_DIR=str(db_path.parent),
            HUB_BACKUP_DIR=str(backup_dir),
            HUB_BACKUP_ENCRYPTION_KEY="",
        ):
            with pytest.raises(BackupError, match="HUB_BACKUP_ENCRYPTION_KEY"):
                create_backup()

        key = Fernet.generate_key().decode()
        with override_settings(
            HUB_DB_PATH=str(db_path),
            HUB_DATA_DIR=str(db_path.parent),
            HUB_BACKUP_DIR=str(backup_dir),
            HUB_BACKUP_ENCRYPTION_KEY=key,
        ):
            bundle = create_backup()

        assert bundle.read_bytes().startswith(b"gAAAA")

    def test_snapshot_of_encrypted_database_remains_sqlcipher_encrypted(self, tmp_path):
        """An encrypted hub snapshot is read and written through SQLCipher."""
        db_path = tmp_path / "hub.sqlite3"
        database_key = "hub-database-key"
        connection = sqlcipher.connect(db_path)
        connection.execute(f"PRAGMA key = '{database_key}'")
        connection.execute("CREATE TABLE records (value TEXT NOT NULL)")
        connection.execute("INSERT INTO records VALUES ('cipher-row')")
        connection.commit()
        connection.close()
        backup_key = Fernet.generate_key().decode()

        with override_settings(
            HUB_DB_PATH=str(db_path),
            HUB_DATA_DIR=str(tmp_path),
            HUB_BACKUP_DIR=str(tmp_path / "backups"),
            HUB_BACKUP_ENCRYPTION_KEY=backup_key,
            HUB_DATABASE_ENCRYPTION_REQUIRED=True,
            HUB_DATABASE_ENCRYPTION_KEY=database_key,
        ):
            bundle = create_backup()
            restored = tmp_path / "restored.sqlite3"
            restore_backup(bundle, database_path=restored, state_path=tmp_path / "state.json")

        with pytest.raises(sqlite3.DatabaseError):
            sqlite3.connect(restored).execute("SELECT value FROM records").fetchall()
        restored_connection = sqlcipher.connect(restored)
        restored_connection.execute(f"PRAGMA key = '{database_key}'")
        assert restored_connection.execute("SELECT value FROM records").fetchall() == [
            ("cipher-row",)
        ]
        restored_connection.close()


class TestHubBackupOffsiteQueue:
    """Tests for the persisted offsite backup queue."""

    def test_nas_upload_copies_bundle_and_marks_queue_complete(self, hub_paths, tmp_path):
        """A configured NAS target consumes a locally persisted queue entry."""
        db_path, _, backup_dir = hub_paths
        nas_dir = tmp_path / "nas"
        key = Fernet.generate_key().decode()

        with override_settings(
            HUB_DB_PATH=str(db_path),
            HUB_DATA_DIR=str(db_path.parent),
            HUB_BACKUP_DIR=str(backup_dir),
            HUB_BACKUP_ENCRYPTION_KEY=key,
            HUB_BACKUP_NAS_PATH=str(nas_dir),
            HUB_BACKUP_S3_URL="",
        ):
            bundle = create_backup()
            result = upload_pending_backups()

        assert result == {"uploaded": 1, "failed": 0, "pending": 0}
        assert (nas_dir / bundle.name).read_bytes() == bundle.read_bytes()
        queue = json.loads((backup_dir / ".hub_backup_upload_queue.json").read_text())
        assert queue == []

    def test_expired_s3_credential_retains_pending_backup(self, hub_paths):
        """Expired short-lived credentials must not discard an offline backup."""
        db_path, _, backup_dir = hub_paths
        key = Fernet.generate_key().decode()

        with override_settings(
            HUB_DB_PATH=str(db_path),
            HUB_DATA_DIR=str(db_path.parent),
            HUB_BACKUP_DIR=str(backup_dir),
            HUB_BACKUP_ENCRYPTION_KEY=key,
            HUB_BACKUP_S3_URL="https://backup.ke.example.test/tenant",
            HUB_BACKUP_S3_TOKEN="expired-token",
            HUB_BACKUP_S3_TOKEN_EXPIRES_AT=(timezone.now() - timedelta(minutes=1)).isoformat(),
        ):
            create_backup()
            result = upload_pending_backups()

        assert result == {"uploaded": 0, "failed": 1, "pending": 1}
        assert len(json.loads((backup_dir / ".hub_backup_upload_queue.json").read_text())) == 1

    def test_azure_sas_is_sent_as_a_query_token_not_a_bearer_header(self, tmp_path):
        """Azure Blob SAS credentials authenticate the object URL directly."""
        bundle = tmp_path / "hub-backup.hubbackup"
        bundle.write_bytes(b"encrypted-backup")
        response = MagicMock(status=201)

        with override_settings(HUB_BACKUP_S3_TOKEN="sv=2025-01-01&sig=azure-signature"):
            with patch("hmis.apps.core.hub_backup.urllib.request.urlopen") as mock_urlopen:
                mock_urlopen.return_value.__enter__.return_value = response
                _upload_bundle(bundle, "s3", "https://account.blob.core.windows.net/backups/tenant")

        request = mock_urlopen.call_args.args[0]
        assert request.full_url == (
            "https://account.blob.core.windows.net/backups/tenant/hub-backup.hubbackup?"
            "sv=2025-01-01&sig=azure-signature"
        )
        assert request.get_header("Authorization") is None
        assert request.get_header("X-ms-blob-type") == "BlockBlob"


class TestHubRestoreGuards:
    """Tests for verification and replacement protection."""

    def test_restore_verify_and_dry_run_do_not_replace_existing_database(self, hub_paths):
        """Inspection modes are safe and a live target requires explicit force."""
        db_path, state_path, backup_dir = hub_paths
        key = Fernet.generate_key().decode()
        target = db_path.parent / "target.sqlite3"
        target.write_bytes(b"existing")

        with override_settings(
            HUB_DB_PATH=str(db_path),
            HUB_DATA_DIR=str(db_path.parent),
            HUB_BACKUP_DIR=str(backup_dir),
            HUB_BACKUP_ENCRYPTION_KEY=key,
        ):
            bundle = create_backup()
            assert verify_backup(bundle)["format"] == "vitora-hub-backup-v1"
            assert restore_backup(
                bundle, database_path=target, state_path=state_path, dry_run=True
            )["dry_run"]
            with pytest.raises(BackupError, match="--force"):
                restore_backup(bundle, database_path=target, state_path=state_path)

        assert target.read_bytes() == b"existing"
