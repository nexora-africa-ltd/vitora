"""
Management command to import ICD-10 codes from CSV file.

Usage:
    python manage.py import_icd10 data/icd10_kenya_common.csv
    python manage.py import_icd10 data/icd10_kenya_common.csv --clear  # Clear existing first
"""

import csv
import os

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.encounters.models import ICD10Code


class Command(BaseCommand):
    help = "Import ICD-10 codes from a CSV file"

    def add_arguments(self, parser):
        parser.add_argument(
            "csv_file",
            type=str,
            help="Path to the CSV file containing ICD-10 codes",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing ICD-10 codes before importing",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing codes instead of skipping them",
        )

    def handle(self, *args, **options):
        csv_file = options["csv_file"]
        clear_existing = options["clear"]
        update_existing = options["update"]

        # Validate file exists
        if not os.path.exists(csv_file):
            raise CommandError(f"CSV file not found: {csv_file}")

        # Clear existing if requested
        if clear_existing:
            count = ICD10Code.objects.count()
            ICD10Code.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {count} existing ICD-10 codes"))

        # Track statistics
        created_count = 0
        updated_count = 0
        skipped_count = 0
        error_count = 0

        # Read and import CSV
        with open(csv_file, encoding="utf-8") as f:
            reader = csv.DictReader(f)

            # Validate required columns
            required_columns = {"code", "short_description", "category", "chapter"}
            if not required_columns.issubset(set(reader.fieldnames or [])):
                missing = required_columns - set(reader.fieldnames or [])
                raise CommandError(f"Missing required columns: {missing}")

            for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
                try:
                    code = row["code"].strip().upper()
                    short_description = row["short_description"].strip()
                    long_description = row.get("long_description", "").strip()
                    category = row["category"].strip()
                    chapter = int(row["chapter"])
                    is_billable = row.get("is_billable", "true").lower() in ("true", "1", "yes")

                    # Check if code exists
                    existing = ICD10Code.objects.filter(code=code).first()

                    if existing:
                        if update_existing:
                            existing.short_description = short_description
                            existing.description = (
                                short_description  # Use short as main description
                            )
                            existing.long_description = long_description
                            existing.category = category
                            existing.chapter = chapter
                            existing.is_billable = is_billable
                            existing.save()
                            updated_count += 1
                        else:
                            skipped_count += 1
                    else:
                        ICD10Code.objects.create(
                            code=code,
                            short_description=short_description,
                            description=short_description,  # Use short as main description
                            long_description=long_description,
                            category=category,
                            chapter=chapter,
                            is_billable=is_billable,
                            is_active=True,
                        )
                        created_count += 1

                except ValueError as e:
                    self.stderr.write(self.style.ERROR(f"Row {row_num}: Invalid data - {e}"))
                    error_count += 1
                except Exception as e:
                    self.stderr.write(
                        self.style.ERROR(
                            f"Row {row_num}: Error importing {row.get('code', 'unknown')} - {e}"
                        )
                    )
                    error_count += 1

        # Summary
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Import complete:"))
        self.stdout.write(f"  Created: {created_count}")
        self.stdout.write(f"  Updated: {updated_count}")
        self.stdout.write(f"  Skipped: {skipped_count}")
        if error_count > 0:
            self.stdout.write(self.style.ERROR(f"  Errors: {error_count}"))

        total = ICD10Code.objects.count()
        self.stdout.write(f"\nTotal ICD-10 codes in database: {total}")
