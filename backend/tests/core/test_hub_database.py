# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for SQLCipher Facility Hub database lifecycle utilities.

Run with: poetry run pytest tests/core/test_hub_database.py --no-cov.
Inputs: temporary SQLite paths and SQLCipher keys; no deployed secret adapter is used.
"""

import sqlite3

import pytest  # type: ignore
from sqlcipher3 import dbapi2 as sqlcipher

from hmis.apps.core.hub_database import (
    HubDatabaseError,
    convert_plaintext_database,
    database_key_status,
    rekey_database,
    verify_database_key,
)


def _open_cipher_database(path, key: str):
    connection = sqlcipher.connect(path)
    escaped_key = key.replace("'", "''")
    connection.execute(f"PRAGMA key = '{escaped_key}'")
    return connection


class TestHubDatabaseEncryption:
    """Convert and verify local SQLCipher databases."""

    def test_convert_plaintext_database_preserves_rows_and_requires_key(self, tmp_path):
        """Conversion writes an encrypted database without altering the source."""
        plaintext_path = tmp_path / "plaintext.sqlite3"
        encrypted_path = tmp_path / "encrypted.sqlite3"
        plaintext = sqlite3.connect(plaintext_path)
        plaintext.execute("CREATE TABLE records (value TEXT)")
        plaintext.execute("INSERT INTO records VALUES ('protected')")
        plaintext.commit()
        plaintext.close()

        convert_plaintext_database(plaintext_path, encrypted_path, "encryption-key")

        assert verify_database_key(encrypted_path, "encryption-key") is True
        with pytest.raises(sqlite3.DatabaseError):
            sqlite3.connect(encrypted_path).execute("SELECT * FROM records").fetchall()
        encrypted = _open_cipher_database(encrypted_path, "encryption-key")
        assert encrypted.execute("SELECT value FROM records").fetchall() == [("protected",)]
        encrypted.close()

    def test_rekey_rejects_old_key_and_accepts_new_key(self, tmp_path):
        """Key rotation changes only the SQLCipher key, not the stored records."""
        database_path = tmp_path / "encrypted.sqlite3"
        connection = _open_cipher_database(database_path, "old-key")
        connection.execute("CREATE TABLE records (value TEXT)")
        connection.execute("INSERT INTO records VALUES ('retained')")
        connection.commit()
        connection.close()

        rekey_database(database_path, "old-key", "new-key")

        assert verify_database_key(database_path, "new-key") is True
        with pytest.raises(HubDatabaseError, match="key cannot open"):
            verify_database_key(database_path, "old-key")

    def test_missing_key_is_reported_without_opening_database(self, tmp_path):
        """Lifecycle operations refuse an absent key rather than using plaintext."""
        database_path = tmp_path / "database.sqlite3"
        database_path.write_bytes(b"not a database")

        assert database_key_status(database_path, "") == {
            "database_path": str(database_path),
            "key_configured": False,
            "status": "key_missing",
        }
        with pytest.raises(HubDatabaseError, match="key is required"):
            verify_database_key(database_path, "")
