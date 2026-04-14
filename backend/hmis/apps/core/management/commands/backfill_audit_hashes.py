"""
Management command to backfill hash chain on existing AuditLog entries.

Computes SHA-256 hashes for audit entries that were created before
the hash chaining feature was enabled.

DHA Compliance: Gap #31 — Tamper-Resistant Audit Log (Sprint 3.C)

Usage:
    python manage.py backfill_audit_hashes
    python manage.py backfill_audit_hashes --dry-run
    python manage.py backfill_audit_hashes --batch-size 500
"""

import logging

from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.core.models import AuditLog

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Backfill SHA-256 hash chain on existing AuditLog entries without hashes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without writing to the database.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=1000,
            help="Number of entries to process per batch (default: 1000).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        batch_size = options["batch_size"]

        # Count entries that need backfill (no sequence_number)
        unchained = AuditLog.objects.filter(sequence_number__isnull=True)
        total = unchained.count()

        if total == 0:
            self.stdout.write(
                self.style.SUCCESS("All audit entries already have hashes. Nothing to do.")
            )
            return

        self.stdout.write(f"Found {total} audit entries without hashes.")

        if dry_run:
            self.stdout.write(
                self.style.WARNING("[DRY RUN] Would backfill hashes for these entries.")
            )
            return

        # Get the current chain's last entry (if any chained entries exist)
        last_chained = (
            AuditLog.objects.filter(sequence_number__isnull=False)
            .order_by("-sequence_number")
            .values("sequence_number", "entry_hash")
            .first()
        )

        if last_chained:
            next_seq = last_chained["sequence_number"] + 1
            prev_hash = last_chained["entry_hash"]
        else:
            next_seq = 1
            prev_hash = AuditLog.GENESIS_HASH

        # Process unchained entries in chronological order
        unchained_ordered = unchained.order_by("timestamp", "id")
        processed = 0

        entries_to_process = unchained_ordered.values_list("id", flat=True)
        id_list = list(entries_to_process)

        for i in range(0, len(id_list), batch_size):
            batch_ids = id_list[i : i + batch_size]

            with transaction.atomic():
                # Fetch entries in the batch ordered by timestamp
                batch_entries = (
                    AuditLog.objects.select_for_update()
                    .filter(id__in=batch_ids)
                    .order_by("timestamp", "id")
                )

                for entry in batch_entries:
                    user_id = entry.user_id or 0

                    entry_hash = AuditLog.compute_hash(
                        sequence_number=next_seq,
                        previous_hash=prev_hash,
                        action=entry.action,
                        user_id=user_id,
                        timestamp=entry.timestamp,
                        resource_type=entry.resource_type,
                        resource_id=entry.resource_id,
                        details=entry.details,
                    )

                    entry.sequence_number = next_seq
                    entry.previous_hash = prev_hash
                    entry.entry_hash = entry_hash
                    entry.save(update_fields=["sequence_number", "previous_hash", "entry_hash"])

                    prev_hash = entry_hash
                    next_seq += 1
                    processed += 1

            self.stdout.write(f"  Processed {processed}/{total} entries...")

        self.stdout.write(
            self.style.SUCCESS(
                f"Backfill complete: {processed} entries hashed "
                f"(seq {next_seq - processed} to {next_seq - 1})."
            )
        )
