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

        before_pending = SyncQueue.objects.filter(status="PENDING").count()
        before_failed = SyncQueue.objects.filter(status="FAILED").count()
        pushed, pulled = worker.sync_once()
        after_pending = SyncQueue.objects.filter(status="PENDING").count()
        after_failed = SyncQueue.objects.filter(status="FAILED").count()

        self.stdout.write(
            self.style.SUCCESS(
                "Hub sync complete: "
                f"pushed={pushed}, pulled={pulled}, "
                f"pending={before_pending}->{after_pending}, "
                f"failed={before_failed}->{after_failed}"
            )
        )
