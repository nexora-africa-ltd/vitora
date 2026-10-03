# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Compatibility tests for SQLCipher-encrypted Facility Hub SQLite databases.

Run with: poetry run pytest tests/core/test_sqlcipher_backend.py --no-cov
Inputs: temporary database paths and SQLCipher runtime keys.
"""

import sqlite3

import pytest  # type: ignore
from sqlcipher3 import dbapi2 as sqlcipher


def _open_cipher_database(path, key: str):
    """Open a SQLCipher database after applying a safely escaped test key."""
    connection = sqlcipher.connect(path)
    escaped_key = key.replace("'", "''")
    connection.execute(f"PRAGMA key = '{escaped_key}'")
    return connection


def test_sqlcipher_database_rejects_standard_sqlite_reader(tmp_path):
    """SQLCipher pages must not expose application rows to the standard driver."""
    database_path = tmp_path / "encrypted.sqlite3"
    key = "test-sqlcipher-key"

    connection = _open_cipher_database(database_path, key)
    connection.execute("CREATE TABLE secret_records (value TEXT)")
    connection.execute("INSERT INTO secret_records VALUES ('protected')")
    connection.commit()
    connection.close()

    with pytest.raises(sqlite3.DatabaseError):
        plaintext = sqlite3.connect(database_path)
        try:
            plaintext.execute("SELECT value FROM secret_records").fetchone()
        finally:
            plaintext.close()


def test_sqlcipher_database_rejects_wrong_key(tmp_path):
    """A wrong SQLCipher key must fail before application queries can run."""
    database_path = tmp_path / "encrypted.sqlite3"
    connection = _open_cipher_database(database_path, "correct-key")
    connection.execute("CREATE TABLE records (value TEXT)")
    connection.commit()
    connection.close()

    wrong_connection = _open_cipher_database(database_path, "wrong-key")
    try:
        with pytest.raises(sqlcipher.DatabaseError):
            wrong_connection.execute("SELECT COUNT(*) FROM records").fetchone()
    finally:
        wrong_connection.close()
