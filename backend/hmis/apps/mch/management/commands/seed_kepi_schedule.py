"""Seed KEPI vaccine schedule reference data."""

import json
from pathlib import Path

from django.core.management.base import BaseCommand

from hmis.apps.mch.models import Vaccine


class Command(BaseCommand):
    """Seed KEPI vaccine schedule data from JSON."""

    help = "Seed KEPI vaccine schedule reference data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--path",
            default=None,
            help="Path to kepi_schedule.json (defaults to backend/data/kepi_schedule.json)",
        )

    def handle(self, *args, **options):
        base_dir = Path(__file__).resolve().parents[5]
        default_path = base_dir / "data" / "kepi_schedule.json"
        data_path = Path(options["path"]) if options.get("path") else default_path

        if not data_path.exists():
            self.stderr.write(self.style.ERROR(f"KEPI schedule file not found: {data_path}"))
            return

        with data_path.open() as handle:
            entries = json.load(handle)

        created = 0
        updated = 0

        for entry in entries:
            code = entry.get("code")
            if not code:
                continue

            defaults = {
                "name": entry.get("name", ""),
                "description": entry.get("description", ""),
                "disease_target": entry.get("disease_target", ""),
                "standard_age_days": entry.get("standard_age_days", 0),
                "route": entry.get("route", ""),
                "dose_number": entry.get("dose_number", 1),
                "series_name": entry.get("series_name", ""),
                "is_active": True,
            }

            vaccine, created_flag = Vaccine.objects.update_or_create(
                code=code,
                defaults=defaults,
            )
            if created_flag:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(f"KEPI schedule seeded. Created: {created}, Updated: {updated}")
        )
