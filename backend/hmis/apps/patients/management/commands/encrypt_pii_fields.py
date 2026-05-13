"""
Management command stub — PII backfill is no longer needed.

Phase D dropped all plaintext PII columns from the database.
Patient and EmergencyContact models now store PII exclusively in
*_encrypted / *_hmac columns via ``encrypted_pii_property()`` descriptors.

This command is retained so that any runbook or CI script referencing it
does not crash; it simply prints a notice and exits.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "(No-op) PII backfill is no longer needed — plaintext columns were dropped in Phase D."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=500)
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--model", choices=["Patient", "EmergencyContact"])

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.WARNING(
                "Phase D: plaintext PII columns have been dropped. "
                "All data is stored encrypted-only. Nothing to backfill."
            )
        )
