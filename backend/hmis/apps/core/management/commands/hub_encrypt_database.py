# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Encrypt a plaintext Facility Hub database using the configured SQLCipher key.

Run ``python manage.py hub_encrypt_database [--database PATH]`` after stopping
the hub service. The key is read from ``HUB_DATABASE_ENCRYPTION_KEY`` only.
"""

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.hub_database import HubDatabaseError, replace_with_encrypted_database


class Command(BaseCommand):
    """Atomically replace a plaintext hub database with an SQLCipher database."""

    help = "Encrypt the hub database in place using HUB_DATABASE_ENCRYPTION_KEY."

    def add_arguments(self, parser):
        parser.add_argument(
            "--database", help="Hub SQLite database path (defaults to HUB_DB_PATH)."
        )

    def handle(self, *args, **options):
        database_path = Path(options["database"] or settings.HUB_DB_PATH)
        try:
            replace_with_encrypted_database(database_path, settings.HUB_DATABASE_ENCRYPTION_KEY)
        except HubDatabaseError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f"Encrypted hub database: {database_path}"))
