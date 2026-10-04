# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Compatibility tests for SQLCipher-encrypted Facility Hub SQLite databases.

Run with: poetry run pytest tests/core/test_sqlcipher_backend.py --no-cov
Inputs: temporary database paths and SQLCipher runtime keys.
"""

import sqlite3
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest  # type: ignore
from sqlcipher3 import dbapi2 as sqlcipher

from hmis.db_backends.sqlcipher.base import DatabaseWrapper


@pytest.fixture
def encrypted_backend(tmp_path, monkeypatch):
    """Use a separate real encrypted Django connection, never the default test DB."""
    from django.db import connections

    config = {
        "ENGINE": "hmis.db_backends.sqlcipher",
        "NAME": str(tmp_path / "orm.sqlite3"),
        "OPTIONS": {
            "cipher_key": "test-only-key",
            "init_command": "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3210;",
        },
        "TIME_ZONE": None,
        "CONN_HEALTH_CHECKS": False,
        "CONN_MAX_AGE": 0,
        "ATOMIC_REQUESTS": False,
        "AUTOCOMMIT": True,
    }
    wrapper = DatabaseWrapper(config, alias="cipher_regression")
    monkeypatch.setattr(connections._connections, wrapper.alias, wrapper, raising=False)
    try:
        yield wrapper
    finally:
        wrapper.close()


def test_connection_initializes_pragmas_functions_and_converters(encrypted_backend):
    with encrypted_backend.cursor() as cursor:
        assert cursor.execute("PRAGMA foreign_keys").fetchone() == (1,)
        assert cursor.execute("PRAGMA legacy_alter_table").fetchone() == (0,)
        assert cursor.execute("PRAGMA journal_mode").fetchone() == ("wal",)
        assert cursor.execute("PRAGMA busy_timeout").fetchone() == (3210,)
        assert cursor.execute("SELECT %s REGEXP %s", ["ward-12", r"^ward-\d+$"]).fetchone() == (1,)
        cursor.execute("CREATE TABLE typed (day date, moment datetime, enabled bool, amount TEXT)")
        moment = datetime(2026, 10, 4, 12, 30)
        cursor.execute(
            "INSERT INTO typed VALUES (%s, %s, %s, %s)",
            [date(2026, 10, 4), moment, True, Decimal("1.25")],
        )
        assert cursor.execute("SELECT * FROM typed").fetchone() == (
            date(2026, 10, 4),
            moment,
            True,
            "1.25",
        )


def test_cursor_iteration_named_parameters_and_generator_batches(encrypted_backend):
    with encrypted_backend.cursor() as cursor:
        cursor.execute("CREATE TABLE batches (value TEXT)")
        cursor.executemany(
            "INSERT INTO batches VALUES (%(value)s)", ({"value": value} for value in ["10%", "two"])
        )
        cursor.execute("SELECT value FROM batches ORDER BY value")
        assert list(cursor) == [("10%",), ("two",)]
        assert cursor.execute("SELECT %(value)s, '%%s'", {"value": "safe'quote"}).fetchone() == (
            "safe'quote",
            "%s",
        )
        assert cursor.execute("SELECT %s", ["chained"]) is cursor.cursor


def test_real_django_migration_recorder_orm_and_rollback(encrypted_backend):
    from django.db import IntegrityError, migrations, models, transaction
    from django.db.migrations.executor import MigrationExecutor
    from django.db.migrations.recorder import MigrationRecorder
    from django.db.migrations.state import ProjectState
    from django.db.models.functions import ExtractYear, TruncDate

    migration = migrations.Migration("0001_cipher_probe", "cipher_probe")
    migration.operations = [
        migrations.CreateModel(
            name="Probe",
            fields=[
                ("id", models.AutoField(primary_key=True)),
                ("name", models.CharField(max_length=100, unique=True)),
                ("at", models.DateTimeField()),
                ("payload", models.JSONField(default=dict)),
            ],
        )
    ]
    executor = MigrationExecutor(encrypted_backend)
    state = executor.apply_migration(ProjectState(), migration)
    recorder = MigrationRecorder(encrypted_backend)
    assert ("cipher_probe", "0001_cipher_probe") in recorder.applied_migrations()
    probe = state.apps.get_model("cipher_probe", "Probe")
    rows = probe.objects.using(encrypted_backend.alias)
    rows.create(name="ward-12", at=datetime(2026, 10, 4, 12, tzinfo=UTC), payload={"ok": True})
    assert rows.filter(name__regex=r"^ward-\d+$", payload__ok=True).count() == 1
    assert rows.annotate(year=ExtractYear("at"), day=TruncDate("at")).values_list(
        "year", "day"
    ).get() == (2026, date(2026, 10, 4))
    with pytest.raises(IntegrityError), transaction.atomic(using=encrypted_backend.alias):
        rows.create(name="ward-12", at=datetime.now(UTC))
    assert rows.count() == 1
    encrypted_backend.close()
    assert rows.count() == 1
    executor.unapply_migration(ProjectState(), migration)
    assert ("cipher_probe", "0001_cipher_probe") not in recorder.applied_migrations()


def test_django_connection_rejects_wrong_key_before_cursor_use(encrypted_backend):
    from django.db import DatabaseError

    with encrypted_backend.cursor() as cursor:
        cursor.execute("CREATE TABLE protected_data (value TEXT)")
    encrypted_backend.close()
    encrypted_backend.settings_dict["OPTIONS"]["cipher_key"] = "incorrect-key"
    with pytest.raises(DatabaseError):
        encrypted_backend.ensure_connection()


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
