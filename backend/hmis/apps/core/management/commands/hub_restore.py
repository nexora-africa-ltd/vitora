# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Verify or restore an encrypted hub backup bundle.

Run ``python manage.py hub_restore PATH --verify`` to inspect a bundle. A real
restore needs ``--force`` after the hub service is stopped; ``--dry-run`` writes nothing.
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.hub_backup import BackupError, restore_backup, verify_backup


class Command(BaseCommand):
    help = "Verify or restore an encrypted hub backup bundle."

    def add_arguments(self, parser):
        parser.add_argument("bundle", type=Path, help="Path to the .hubbackup bundle.")
        parser.add_argument("--verify", action="store_true", help="Verify only; do not restore.")
        parser.add_argument(
            "--dry-run", action="store_true", help="Verify restore inputs without writing files."
        )
        parser.add_argument(
            "--force", action="store_true", help="Allow replacement of the existing hub database."
        )

    def handle(self, *args, **options):
        try:
            if options["verify"]:
                manifest = verify_backup(options["bundle"])
                self.stdout.write(self.style.SUCCESS(f"Verified backup: {manifest['created_at']}"))
                return
            result = restore_backup(
                options["bundle"], force=options["force"], dry_run=options["dry_run"]
            )
        except BackupError as exc:
            raise CommandError(str(exc)) from exc
        status = "Restore dry run" if options["dry_run"] else "Restored hub backup"
        self.stdout.write(self.style.SUCCESS(f"{status}: {result['database_path']}"))
