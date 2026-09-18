# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Backfill AuditLog.hash_algorithm by matching stored hashes against known algorithms.

Usage:
    python manage.py backfill_audit_hash_algorithms
    python manage.py backfill_audit_hash_algorithms --dry-run
    python manage.py backfill_audit_hash_algorithms --force

Supported args:
    --dry-run   Analyze only; do not update rows.
    --force     Recompute and overwrite rows that already have hash_algorithm set.
"""

from django.core.management.base import BaseCommand

from hmis.apps.core.models import AuditLog
from hmis.apps.core.services.audit_integrity import AuditIntegrityService


class Command(BaseCommand):
    help = "Detect and backfill AuditLog.hash_algorithm for chained entries."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Do not persist changes.")
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-evaluate rows even when hash_algorithm is already set.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]

        service = AuditIntegrityService()
        queryset = AuditLog.objects.filter(sequence_number__isnull=False).order_by(
            "sequence_number"
        )
        if not force:
            queryset = queryset.filter(hash_algorithm__isnull=True)

        updated = 0
        unknown = 0

        for entry in queryset.iterator():
            row = {
                "sequence_number": entry.sequence_number,
                "previous_hash": entry.previous_hash,
                "entry_hash": entry.entry_hash,
                "hash_algorithm": entry.hash_algorithm,
                "action": entry.action,
                "user_id": entry.user_id,
                "timestamp": entry.timestamp,
                "resource_type": entry.resource_type,
                "resource_id": entry.resource_id,
                "details": entry.details,
            }
            detected = service._resolve_matching_algorithm(row)
            if not detected:
                unknown += 1
                continue

            if entry.hash_algorithm == detected:
                continue

            updated += 1
            if not dry_run:
                entry.hash_algorithm = detected
                entry.save(update_fields=["hash_algorithm"])

        mode = "[DRY RUN] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode}Backfill complete: updated={updated}, unknown={unknown}, force={force}."
            )
        )
