# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Audit chain diagnostics command for mismatch ranges and key-era transition hints.

Usage:
    python manage.py audit_chain_diagnostics
    python manage.py audit_chain_diagnostics --count 1000
    python manage.py audit_chain_diagnostics --json

Supported args:
    --count  Analyze only the latest N chained entries.
    --json   Print diagnostics as JSON.
"""

import json

from django.core.management.base import BaseCommand

from hmis.apps.core.services.audit_integrity import AuditIntegrityService


class Command(BaseCommand):
    help = "Report audit chain mismatch ranges, gaps, link breaks, and match transitions."

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=None,
            help="Analyze only the latest N chained entries.",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Print the diagnostics payload as JSON.",
        )

    def handle(self, *args, **options):
        service = AuditIntegrityService()
        diagnostics = service.get_chain_diagnostics(count=options["count"])

        if options["json"]:
            self.stdout.write(json.dumps(diagnostics, indent=2, default=str))
            return

        self.stdout.write(self.style.MIGRATE_HEADING("Audit Chain Diagnostics"))
        self.stdout.write(f"Analyzed entries: {diagnostics['analyzed_entries']}")
        self.stdout.write(
            f"Sequence window: {diagnostics['first_sequence']} -> {diagnostics['last_sequence']}"
        )
        self.stdout.write(f"Mismatch count: {diagnostics['mismatch_count']}")
        self.stdout.write(f"Key source: {diagnostics['key_source']}")
        self.stdout.write(f"Link breaks: {len(diagnostics['link_break_sequences'])}")
        self.stdout.write(f"Gap ranges: {len(diagnostics['sequence_gaps'])}")
        self.stdout.write(f"Match transitions: {len(diagnostics['match_transitions'])}")
        self.stdout.write(f"Algorithm transitions: {len(diagnostics['algorithm_transitions'])}")

        if diagnostics["mismatch_ranges"]:
            self.stdout.write("Mismatch ranges (first 10):")
            for row in diagnostics["mismatch_ranges"][:10]:
                self.stdout.write(
                    f"  - {row['start_sequence']}..{row['end_sequence']} ({row['count']} entries)"
                )

        if diagnostics["key_transition_points"]:
            points = ", ".join(str(seq) for seq in diagnostics["key_transition_points"][:20])
            self.stdout.write(f"Transition points (first 20): {points}")

        if diagnostics["algorithm_transition_points"]:
            points = ", ".join(str(seq) for seq in diagnostics["algorithm_transition_points"][:20])
            self.stdout.write(f"Algorithm transition points (first 20): {points}")
