# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Rotate a Facility Hub SQLCipher database key.

Run ``python manage.py hub_rotate_database_key --new-key-env NAME`` after
stopping the hub service. The old key comes from HUB_DATABASE_ENCRYPTION_KEY.
"""

import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.hub_database import HubDatabaseError, rekey_database


class Command(BaseCommand):
    """Rotate SQLCipher keys without accepting a secret as a process argument."""

    help = "Rotate the hub SQLCipher key using a named environment variable."

    def add_arguments(self, parser):
        parser.add_argument(
            "--database", help="Hub SQLite database path (defaults to HUB_DB_PATH)."
        )
        parser.add_argument(
            "--new-key-env",
            required=True,
            help="Environment variable containing the replacement SQLCipher key.",
        )

    def handle(self, *args, **options):
        database_path = Path(options["database"] or settings.HUB_DB_PATH)
        new_key = os.getenv(options["new_key_env"], "")
        try:
            rekey_database(database_path, settings.HUB_DATABASE_ENCRYPTION_KEY, new_key)
        except HubDatabaseError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                "Rotated hub database key. Update HUB_DATABASE_ENCRYPTION_KEY before restarting."
            )
        )
