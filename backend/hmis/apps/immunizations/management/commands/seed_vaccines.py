"""
Management command to seed vaccine definitions.

Seeds both KEPI (from kepi_schedule.json) and adult/campaign/travel vaccines
(from adult_vaccines.json) into the immunizations app VaccineDefinition table.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand

from hmis.apps.immunizations.models import VaccineDefinition


class Command(BaseCommand):
    help = "Seed VaccineDefinition table with KEPI and adult vaccine data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--kepi-only",
            action="store_true",
            help="Only seed KEPI (child) vaccines",
        )
        parser.add_argument(
            "--adult-only",
            action="store_true",
            help="Only seed adult/campaign/travel vaccines",
        )

    def handle(self, *args, **options):
        data_dir = Path(__file__).resolve().parent.parent.parent.parent.parent / "data"
        created_count = 0
        updated_count = 0

        if not options["adult_only"]:
            created, updated = self._seed_file(
                data_dir / "kepi_schedule.json",
                default_program="KEPI",
                default_target="INFANT",
            )
            created_count += created
            updated_count += updated
            self.stdout.write(f"KEPI: {created} created, {updated} updated")

        if not options["kepi_only"]:
            created, updated = self._seed_file(
                data_dir / "adult_vaccines.json",
                default_program=None,
                default_target=None,
            )
            created_count += created
            updated_count += updated
            self.stdout.write(f"Adult/Other: {created} created, {updated} updated")

        self.stdout.write(
            self.style.SUCCESS(
                f"Total: {created_count} created, {updated_count} updated. "
                f"{VaccineDefinition.objects.count()} vaccines in database."
            )
        )

    def _seed_file(self, filepath, default_program, default_target):
        if not filepath.exists():
            self.stdout.write(self.style.WARNING(f"File not found: {filepath}"))
            return 0, 0

        with open(filepath) as f:
            data = json.load(f)

        created = 0
        updated = 0

        for item in data:
            defaults = {
                "name": item["name"],
                "description": item.get("description", ""),
                "disease_target": item.get("disease_target", ""),
                "standard_age_days": item.get("standard_age_days", 0),
                "route": item.get("route", ""),
                "dose_number": item.get("dose_number", 1),
                "total_doses": item.get("total_doses", 1),
                "series_name": item.get("series_name", ""),
                "interval_days": item.get("interval_days", 0),
                "target_population": item.get("target_population", default_target or "INFANT"),
                "program": item.get("program", default_program or "KEPI"),
                "min_age_days": item.get("min_age_days", 0),
                "max_age_days": item.get("max_age_days", 0),
            }

            obj, was_created = VaccineDefinition.objects.update_or_create(
                code=item["code"],
                defaults=defaults,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        return created, updated
