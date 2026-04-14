"""
Management command to seed ER beds from a JSON configuration file.

Reads zone definitions (zone code, bed prefix, count) from a JSON file
and creates any missing ERBed records. Idempotent — re-running skips
beds that already exist.

Usage:
    # Seed from the default config (data/er_beds.json)
    python manage.py seed_er_beds

    # Seed from a custom config
    python manage.py seed_er_beds --config path/to/custom_er_beds.json

    # Dry run to preview what would be created
    python manage.py seed_er_beds --dry-run

    # Force recreate (deletes ALL existing ER beds first)
    python manage.py seed_er_beds --reset
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.triage.models import ERBed

DEFAULT_CONFIG = Path(__file__).resolve().parents[5] / "data" / "er_beds.json"

VALID_ZONES = {code for code, _ in ERBed.ZONE_CHOICES}


class Command(BaseCommand):
    """Seed ER beds from a JSON configuration file."""

    help = "Create ER bed records from a JSON config (idempotent)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--config",
            type=str,
            default=str(DEFAULT_CONFIG),
            help=f"Path to JSON config file (default: {DEFAULT_CONFIG})",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without making changes",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete ALL existing ER beds before seeding (destructive!)",
        )

    def handle(self, *args, **options):
        config_path = Path(options["config"])
        dry_run = options["dry_run"]
        reset = options["reset"]

        # Load config
        if not config_path.exists():
            raise CommandError(f"Config file not found: {config_path}")

        try:
            with open(config_path) as f:
                config = json.load(f)
        except json.JSONDecodeError as e:
            raise CommandError(f"Invalid JSON in {config_path}: {e}")

        zones = config.get("zones", [])
        if not zones:
            raise CommandError("No zones defined in config file")

        # Validate zones
        for entry in zones:
            zone_code = entry.get("zone")
            if zone_code not in VALID_ZONES:
                raise CommandError(
                    f"Invalid zone '{zone_code}'. Valid zones: {sorted(VALID_ZONES)}"
                )
            if not entry.get("prefix"):
                raise CommandError(f"Missing 'prefix' for zone '{zone_code}'")
            if not isinstance(entry.get("count"), int) or entry["count"] < 1:
                raise CommandError(f"'count' for zone '{zone_code}' must be a positive integer")

        # Reset if requested
        if reset and not dry_run:
            deleted, _ = ERBed.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Deleted {deleted} existing ER bed(s)"))

        total_created = 0
        total_skipped = 0

        for entry in zones:
            zone_code = entry["zone"]
            prefix = entry["prefix"]
            count = entry["count"]
            zone_label = dict(ERBed.ZONE_CHOICES).get(zone_code, zone_code)

            created = 0
            skipped = 0

            for i in range(1, count + 1):
                bed_number = f"{prefix}-{i:02d}"

                if dry_run:
                    exists = ERBed.objects.filter(zone=zone_code, bed_number=bed_number).exists()
                    if exists:
                        skipped += 1
                    else:
                        created += 1
                else:
                    _, was_created = ERBed.objects.get_or_create(
                        zone=zone_code,
                        bed_number=bed_number,
                        defaults={"status": "AVAILABLE"},
                    )
                    if was_created:
                        created += 1
                    else:
                        skipped += 1

            total_created += created
            total_skipped += skipped

            status = "Would create" if dry_run else "Created"
            self.stdout.write(
                f"  {zone_label}: {status} {created}, skipped {skipped} " f"(total: {count})"
            )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"\nDry run complete. Would create {total_created} bed(s), "
                    f"skip {total_skipped} existing."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nDone! Created {total_created} bed(s), "
                    f"skipped {total_skipped} existing. "
                    f"Total ER beds: {ERBed.objects.count()}"
                )
            )
