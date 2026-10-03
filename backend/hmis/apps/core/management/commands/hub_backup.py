# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create an encrypted, WAL-safe hub SQLite backup bundle.

Run ``python manage.py hub_backup``. Use ``--dry-run`` to validate encryption
configuration without writing a snapshot, or ``--upload`` to process its queue.
"""

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.hub_backup import BackupError, create_backup, upload_pending_backups


class Command(BaseCommand):
    help = "Create an encrypted WAL-safe hub backup and optionally upload queued bundles."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate configuration without writing a backup.",
        )
        parser.add_argument(
            "--upload", action="store_true", help="Upload pending bundles after backup creation."
        )

    def handle(self, *args, **options):
        try:
            if options["dry_run"]:
                from hmis.apps.core.hub_backup import _fernet

                _fernet()
                self.stdout.write(
                    self.style.SUCCESS("Hub backup configuration is valid (dry run).")
                )
                return
            bundle = create_backup()
            self.stdout.write(self.style.SUCCESS(f"Created encrypted hub backup: {bundle}"))
            if options["upload"]:
                result = upload_pending_backups()
                self.stdout.write(self.style.SUCCESS(f"Upload queue: {result}"))
        except BackupError as exc:
            raise CommandError(str(exc)) from exc
