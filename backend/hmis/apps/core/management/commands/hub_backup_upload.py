# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Upload locally queued encrypted hub backup bundles.

Run ``python manage.py hub_backup_upload``. Use ``--dry-run`` to inspect the
persisted queue without contacting the configured NAS or S3-compatible target.
"""

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.hub_backup import BackupError, upload_pending_backups


class Command(BaseCommand):
    help = "Upload queued encrypted hub backup bundles to the configured offsite target."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true", help="Report queue state without uploading."
        )

    def handle(self, *args, **options):
        try:
            result = upload_pending_backups(dry_run=options["dry_run"])
        except BackupError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f"Hub backup upload queue: {result}"))
