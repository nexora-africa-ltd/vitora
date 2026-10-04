# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Compatibility tests for SQLCipher-encrypted Facility Hub SQLite databases.

Run with: poetry run pytest tests/core/test_sqlcipher_backend.py --no-cov
Inputs: temporary database paths and SQLCipher runtime keys.
"""

import sqlite3

import pytest  # type: ignore
from sqlcipher3 import dbapi2 as sqlcipher

from hmis.db_backends.sqlcipher.base import DatabaseWrapper


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


def test_django_sqlcipher_backend_returns_a_compatible_cursor(tmp_path):
    """Django must not use its sqlite3-only cursor factory for SQLCipher."""
    wrapper = DatabaseWrapper(
        {
            "NAME": str(tmp_path / "hub.sqlite3"),
            "OPTIONS": {"cipher_key": "test-sqlcipher-key"},
            "TIME_ZONE": None,
            "CONN_HEALTH_CHECKS": False,
            "CONN_MAX_AGE": 0,
            "ATOMIC_REQUESTS": False,
            "AUTOCOMMIT": True,
        },
        alias="default",
    )

    with wrapper.cursor() as cursor:
        cursor.execute("CREATE TABLE smoke_records (value TEXT)")
        cursor.execute("INSERT INTO smoke_records VALUES (%s)", ["protected"])
        cursor.execute("SELECT value FROM smoke_records WHERE value = %s", ["protected"])
        assert cursor.fetchone()[0] == "protected"
