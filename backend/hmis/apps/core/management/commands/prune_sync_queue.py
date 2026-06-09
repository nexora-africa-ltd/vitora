"""
Management command to prune old SyncQueue entries.

Removes SYNCED entries older than the retention period and permanently-failed
entries older than 7 days. Designed to run as a Celery beat task or cron job.

Usage:
    python manage.py prune_sync_queue           # Default: 24h retention
    python manage.py prune_sync_queue --hours 48
    python manage.py prune_sync_queue --dry-run
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from hmis.apps.core.models import SyncQueue


class Command(BaseCommand):
    help = "Prune old SYNCED and permanently-failed SyncQueue entries."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            type=int,
            default=24,
            help="Delete SYNCED entries older than this many hours (default: 24).",
        )
        parser.add_argument(
            "--max-retries",
            type=int,
            default=10,
            help="Mark PENDING entries with retry_count >= this as FAILED (default: 10).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without deleting.",
        )

    def handle(self, *args, **options):
        hours = options["hours"]
        max_retries = options["max_retries"]
        dry_run = options["dry_run"]

        synced_cutoff = timezone.now() - timedelta(hours=hours)
        failed_cutoff = timezone.now() - timedelta(days=7)

        # 1. Mark permanently failed entries
        permanently_failed = SyncQueue.objects.filter(
            status="PENDING",
            retry_count__gte=max_retries,
        )
        pf_count = permanently_failed.count()
        if pf_count and not dry_run:
            permanently_failed.update(
                status="FAILED",
                error_message="Max retries exceeded",
            )

        # 2. Delete old SYNCED entries
        old_synced = SyncQueue.objects.filter(
            status="SYNCED",
            synced_at__lt=synced_cutoff,
        )
        synced_count = old_synced.count()
        if not dry_run:
            old_synced.delete()

        # 3. Delete old FAILED entries (> 7 days)
        old_failed = SyncQueue.objects.filter(
            status="FAILED",
            created_at__lt=failed_cutoff,
        )
        failed_count = old_failed.count()
        if not dry_run:
            old_failed.delete()

        prefix = "[DRY RUN] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}Pruned: {synced_count} synced, "
                f"{failed_count} failed, "
                f"{pf_count} marked permanently failed"
            )
        )
