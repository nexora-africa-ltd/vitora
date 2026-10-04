# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Report whether the configured SQLCipher key opens the Facility Hub database.

Run ``python manage.py hub_database_key_status [--database PATH]``. The command
reads HUB_DATABASE_ENCRYPTION_KEY and never prints the key material.
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from hmis.apps.core.hub_database import database_key_status


class Command(BaseCommand):
    """Provide key verification status suitable for installation health checks."""

    help = "Check whether HUB_DATABASE_ENCRYPTION_KEY can open the hub database."

    def add_arguments(self, parser):
        parser.add_argument(
            "--database", help="Hub SQLite database path (defaults to HUB_DB_PATH)."
        )

    def handle(self, *args, **options):
        database_path = Path(options["database"] or settings.HUB_DB_PATH)
        status = database_key_status(database_path, settings.HUB_DATABASE_ENCRYPTION_KEY)
        self.stdout.write(json.dumps(status, sort_keys=True))
