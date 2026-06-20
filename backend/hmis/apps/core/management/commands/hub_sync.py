"""
Run a single hub-to-cloud sync cycle.

Usage:
    python manage.py hub_sync
"""

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.hub_sync import HubCloudSyncWorker
from hmis.apps.core.models import SyncQueue


class Command(BaseCommand):
    help = "Run one hub-to-cloud sync cycle and report queue status."

    def add_arguments(self, parser):
        parser.add_argument(
            "--retry-failed",
            action="store_true",
            help="Reset failed sync entries that are still below SYNC_MAX_RETRIES before syncing.",
        )
        parser.add_argument(
            "--full-pull",
            action="store_true",
            help="Force the cloud pull step to request a full downward sync instead of using the saved cursor.",
        )
        parser.add_argument(
            "--pull-only",
            action="store_true",
            help="Skip pushing local pending changes and only pull from the cloud.",
        )
        parser.add_argument(
            "--tables",
            default="",
            help=(
                "Comma-separated model labels to pull (e.g. "
                "'patients.Patient,patients.EmergencyContact'). When set, the "
                "pull is scoped to those tables, a full snapshot of each is "
                "requested, and the regular incremental-sync state is left "
                "untouched. Implies --pull-only."
            ),
        )

    def handle(self, *args, **options):
        worker = HubCloudSyncWorker()
        if not worker.is_configured:
            raise CommandError(
                "Hub sync is not configured. Set SYNC_SERVER_URL, HUB_ID, and HUB_FACILITY_ID."
            )

        if not worker.has_license_token:
            raise CommandError(
                "Hub license token is required. Run hub activation or configure "
                "LICENSE_TOKEN/HUB_LICENSE_TOKEN_PATH."
            )

        tables_raw = (options.get("tables") or "").strip()
        tables = [t.strip() for t in tables_raw.split(",") if t.strip()] or None

        reset_count = 0
        if options["retry_failed"]:
            reset_count = worker.reset_failed_for_retry()

        before_pending = SyncQueue.objects.filter(status="PENDING").count()
        before_failed = SyncQueue.objects.filter(status="FAILED").count()
        pushed, pulled = worker.sync_once(
            force_full_pull=options["full_pull"],
            skip_push=options["pull_only"] or bool(tables),
            tables=tables,
        )
        after_pending = SyncQueue.objects.filter(status="PENDING").count()
        after_failed = SyncQueue.objects.filter(status="FAILED").count()

        scope_suffix = f", tables={','.join(tables)}" if tables else ""
        self.stdout.write(
            self.style.SUCCESS(
                "Hub sync complete: "
                f"pushed={pushed}, pulled={pulled}, "
                f"pending={before_pending}->{after_pending}, "
                f"failed={before_failed}->{after_failed}"
                + (f", reset_failed={reset_count}" if options["retry_failed"] else "")
                + scope_suffix
            )
        )
