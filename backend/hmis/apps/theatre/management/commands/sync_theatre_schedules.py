"""Backfill scheduling resources and recurring schedules for theatres."""

from django.core.management.base import BaseCommand

from hmis.apps.theatre.models import OperatingTheatre
from hmis.apps.theatre.signals import _sync_theatre_resource, _sync_theatre_schedules


class Command(BaseCommand):
    help = "Backfill scheduling PLACE resources and recurring schedules for operating theatres."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview the theatres that would be synced without writing changes.",
        )
        parser.add_argument(
            "--theatre",
            type=str,
            default=None,
            help="Only sync a specific theatre by code.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        theatre_code = options.get("theatre")

        theatres = OperatingTheatre.objects.filter(facility__isnull=False)
        if theatre_code:
            theatres = theatres.filter(code=theatre_code)

        processed = 0
        for theatre in theatres.select_related("facility", "organization", "scheduling_resource"):
            processed += 1
            if dry_run:
                self.stdout.write(
                    f"[DRY-RUN] Would sync theatre {theatre.code} "
                    f"({theatre.operating_hours_start}-{theatre.operating_hours_end}, slot {theatre.slot_duration_minutes}m)"
                )
                continue

            _sync_theatre_resource(theatre)
            theatre.refresh_from_db(fields=["scheduling_resource"])
            _sync_theatre_schedules(theatre)
            self.stdout.write(
                f"Synced theatre {theatre.code} -> resource {theatre.scheduling_resource.code} with 7 recurring schedules"
            )

        prefix = "[DRY-RUN] " if dry_run else ""
        self.stdout.write(self.style.SUCCESS(f"{prefix}Processed {processed} theatre(s)."))
