# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Seed baseline scheduling assignment rules.

What this file is for:
- Provide a CLI command to create default AssignmentRule records for facilities.

How to use it:
- Run: ``python manage.py seed_assignment_defaults --facility-id=<id>``
- Optional: ``--created-by=<user_id>`` and ``--dry-run``.

Supported inputs/args:
- --facility-id: Required target facility ID.
- --created-by: Optional user ID to set as rule creator.
- --dry-run: Optional flag to preview counts without DB writes.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.models import Facility
from hmis.apps.scheduling.services.assignment_defaults import seed_assignment_defaults_for_facility


class Command(BaseCommand):
    help = "Seed default scheduling assignment rules for a facility"

    def add_arguments(self, parser):
        parser.add_argument("--facility-id", type=int, required=True, help="Target facility ID")
        parser.add_argument(
            "--created-by",
            type=int,
            required=False,
            help="Optional user ID for created_by field",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview results without creating rules",
        )

    def handle(self, *args, **options):
        facility_id = options["facility_id"]
        created_by_id = options.get("created_by")
        dry_run = bool(options.get("dry_run", False))

        facility = Facility.objects.filter(pk=facility_id).first()
        if not facility:
            raise CommandError(f"Facility {facility_id} not found")

        created_by = None
        if created_by_id:
            User = get_user_model()
            created_by = User.objects.filter(pk=created_by_id).first()
            if not created_by:
                raise CommandError(f"User {created_by_id} not found")

        result = seed_assignment_defaults_for_facility(
            facility=facility,
            created_by=created_by,
            dry_run=dry_run,
        )

        action = "Previewed" if dry_run else "Seeded"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} assignment defaults for facility {facility.id}: "
                f"created={result['created']}, skipped={result['skipped']}, total_rules={result['total_rules']}"
            )
        )
