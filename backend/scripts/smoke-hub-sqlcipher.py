# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Exercise encrypted Django startup from a source or compiled hub artifact.

Run: python scripts/smoke-hub-sqlcipher.py [--compiled] [--full-migrations].
Uses a disposable database and generated process-only keys; no deployed secrets.
The full-migrations flag applies all installed migrations before the ORM probes.
"""

from __future__ import annotations

import argparse
import faulthandler
import os
import secrets
import sqlite3
import sys
import tempfile
from datetime import UTC, date, datetime
from pathlib import Path


def progress(stage):
    print(f"SQLCIPHER SMOKE: {stage}", flush=True)


def exercise(compiled: bool, full_migrations: bool) -> None:
    import django

    progress("Django setup (including compiled application imports)")
    django.setup()
    from django.core.management import call_command
    from django.db import IntegrityError, connection, migrations, models, transaction
    from django.db.migrations.executor import MigrationExecutor
    from django.db.migrations.recorder import MigrationRecorder
    from django.db.migrations.state import ProjectState
    from django.db.models.functions import ExtractYear, TruncDate

    from hmis.apps.encounters import signals
    from hmis.apps.patients.models import Patient
    from hmis.db_backends.sqlcipher.base import DatabaseWrapper

    if compiled:
        extension = ".pyd" if sys.platform == "win32" else ".so"
        assert signals.__file__.endswith(extension), signals.__file__
        assert sys.modules[Patient.__module__].__file__.endswith(extension)

    progress("Encrypted Django connection and initialization")
    with connection.cursor() as cursor:
        assert cursor.execute("PRAGMA cipher_version").fetchone()[0]
        assert cursor.execute("PRAGMA foreign_keys").fetchone() == (1,)
        assert cursor.execute("PRAGMA journal_mode").fetchone() == ("wal",)
        cursor.execute("SELECT %(value)s, '%%s'", {"value": "named'parameter"})
        assert cursor.fetchone() == ("named'parameter", "%s")

    if full_migrations:
        progress("All application migrations")
        call_command("migrate", interactive=False, verbosity=1)
        assert not MigrationExecutor(connection).migration_plan(
            MigrationExecutor(connection).loader.graph.leaf_nodes()
        )

    progress("Migration executor and migration-recorder writes")
    migration = migrations.Migration("0001_probe", "hub_cipher_probe")
    migration.operations = [
        migrations.CreateModel(
            name="Probe",
            fields=[
                ("id", models.AutoField(primary_key=True)),
                ("name", models.CharField(max_length=80, unique=True)),
                ("at", models.DateTimeField()),
                ("payload", models.JSONField(default=dict)),
            ],
        )
    ]
    executor = MigrationExecutor(connection)
    state = executor.apply_migration(ProjectState(), migration)
    assert ("hub_cipher_probe", "0001_probe") in MigrationRecorder(connection).applied_migrations()
    probe = state.apps.get_model("hub_cipher_probe", "Probe")
    probe.objects.create(
        name="ward-12", at=datetime(2026, 10, 4, 12, tzinfo=UTC), payload={"ok": True}
    )
    progress("Parameterized ORM, date functions, regex, JSON and transaction rollback")
    assert probe.objects.filter(name__regex=r"^ward-\d+$", payload__ok=True).count() == 1
    assert probe.objects.annotate(year=ExtractYear("at"), day=TruncDate("at")).values_list(
        "year", "day"
    ).get() == (2026, date(2026, 10, 4))
    try:
        with transaction.atomic():
            probe.objects.create(name="ward-12", at=datetime.now(UTC))
    except IntegrityError:
        pass
    else:
        raise AssertionError("Duplicate insert failed to raise Django IntegrityError")
    with connection.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO hub_cipher_probe_probe (name, at, payload) VALUES (%s, %s, %s)",
            ((name, "2026-10-04 12:00:00", "{}") for name in ("batch-1", "batch-2")),
        )
        assert len(list(cursor.execute("SELECT name FROM hub_cipher_probe_probe"))) == 3

    progress("Close and reopen with the same key")
    connection.close()
    assert probe.objects.count() == 3
    progress("Reverse migration and verify recorder")
    executor.unapply_migration(ProjectState(), migration)
    assert ("hub_cipher_probe", "0001_probe") not in MigrationRecorder(
        connection
    ).applied_migrations()
    with connection.cursor() as cursor:
        assert cursor.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
    connection.close()

    progress("Wrong-key rejection before application queries")
    config = dict(connection.settings_dict)
    config["OPTIONS"] = {**config["OPTIONS"], "cipher_key": secrets.token_urlsafe(64)}
    wrong = DatabaseWrapper(config, alias="wrong_key_probe")
    try:
        try:
            wrong.get_new_connection(wrong.get_connection_params())
        except wrong.Database.DatabaseError:
            pass
        else:
            raise AssertionError("Wrong key was accepted")
    finally:
        wrong.close()

    progress("Standard SQLite cannot read encrypted pages")
    plain = sqlite3.connect(os.environ["HUB_DB_PATH"])
    try:
        try:
            plain.execute("SELECT COUNT(*) FROM sqlite_master").fetchone()
        except sqlite3.DatabaseError:
            pass
        else:
            raise AssertionError("Standard SQLite read the encrypted database")
    finally:
        plain.close()
    progress("PASS")


def main():
    faulthandler.enable()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compiled", action="store_true")
    parser.add_argument("--full-migrations", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from cryptography.fernet import Fernet

    with tempfile.TemporaryDirectory(prefix="vitora-sqlcipher-smoke-") as directory:
        os.environ.update(
            {
                "DJANGO_SETTINGS_MODULE": "hmis.settings.hub",
                "DJANGO_ENV": "hub",
                "HUB_DATA_DIR": directory,
                "HUB_DB_PATH": str(Path(directory) / "hub.sqlite3"),
                "HUB_LOG_FILE": str(Path(directory) / "hub.log"),
                "HUB_DATABASE_ENCRYPTION_REQUIRED": "true",
                "HUB_DATABASE_ENCRYPTION_KEY": secrets.token_urlsafe(64),
                "DJANGO_SECRET_KEY": secrets.token_urlsafe(50),
                "ENCRYPTION_KEY": Fernet.generate_key().decode(),
                "KMS_PROVIDER": "local",
                "SYNC_ENABLED": "false",
                "VITORA_DISABLE_MAGIC_SNIFFING": "true" if sys.platform == "win32" else "false",
            }
        )
        try:
            exercise(args.compiled, args.full_migrations)
        finally:
            from django.db import connections

            connections.close_all()
            # Windows cannot remove an open FileHandler log on TemporaryDirectory exit.
            import logging

            logging.shutdown()


if __name__ == "__main__":
    main()
