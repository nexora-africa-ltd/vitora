# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Import countries into the core Country reference table.

Usage:
    python manage.py import_countries <csv_file_path> [--clear]

Supported CSV columns:
    - code (required, ISO 3166-1 alpha-2)
    - name (required)
    - is_active (optional: true/false/1/0/yes/no)
"""

from __future__ import annotations

import csv

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.models import Country


class Command(BaseCommand):
    help = "Import country reference data from CSV (code,name,is_active)."

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str, help="Path to countries CSV file")
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete existing countries before import",
        )

    def handle(self, *args, **options):
        csv_file = options["csv_file"]
        clear_existing = bool(options.get("clear"))

        if clear_existing:
            Country.objects.all().delete()
            self.stdout.write(self.style.WARNING("Existing countries deleted."))

        created = 0
        updated = 0

        try:
            with open(csv_file, encoding="utf-8-sig") as handle:
                reader = csv.DictReader(handle)
                required = {"code", "name"}
                if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
                    raise CommandError("CSV must include headers: code,name[,is_active]")

                for row in reader:
                    code = str(row.get("code") or "").strip().upper()
                    name = str(row.get("name") or "").strip()
                    if not code or not name:
                        continue

                    raw_active = str(row.get("is_active") or "true").strip().lower()
                    is_active = raw_active in {"1", "true", "yes", "y"}

                    country, was_created = Country.objects.update_or_create(
                        code=code,
                        defaults={"name": name, "is_active": is_active},
                    )
                    if was_created:
                        created += 1
                    else:
                        updated += 1

            self.stdout.write(
                self.style.SUCCESS(
                    f"Country import complete. created={created}, updated={updated}, total={Country.objects.count()}"
                )
            )
        except FileNotFoundError as exc:
            raise CommandError(f"File not found: {csv_file}") from exc
