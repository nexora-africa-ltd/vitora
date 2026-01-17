"""
Management command to import drugs from CSV catalog.

Usage:
    python manage.py import_drugs [--clear]

Options:
    --clear: Delete all existing drugs before importing
"""

import ast
import csv
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.pharmacy.models import Drug


class Command(BaseCommand):
    help = "Import drugs from the drug_catalog.csv file"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all existing drugs before importing",
        )
        parser.add_argument(
            "--file",
            type=str,
            default="data/drug_catalog.csv",
            help="Path to the CSV file (relative to backend folder)",
        )

    def handle(self, *args, **options):
        # Resolve file path
        backend_dir = Path(__file__).resolve().parent.parent.parent.parent.parent.parent
        csv_path = backend_dir / options["file"]

        if not csv_path.exists():
            self.stderr.write(self.style.ERROR(f"File not found: {csv_path}"))
            return

        self.stdout.write(f"Importing drugs from: {csv_path}")

        if options["clear"]:
            self.stdout.write("Clearing existing drugs...")
            Drug.objects.all().delete()
            self.stdout.write(self.style.SUCCESS("Cleared all existing drugs"))

        # Read and import
        created_count = 0
        updated_count = 0
        error_count = 0
        errors = []

        with open(csv_path, encoding="utf-8") as f:
            reader = csv.DictReader(f)

            # Process in batches for performance
            batch_size = 500
            drugs_to_create = []
            drugs_to_update = []

            for row_num, row in enumerate(reader, start=2):  # Start at 2 (1 is header)
                try:
                    drug_data = self._parse_row(row)

                    # Check if drug already exists
                    existing = Drug.objects.filter(code=drug_data["code"]).first()

                    if existing:
                        # Update existing drug
                        for key, value in drug_data.items():
                            setattr(existing, key, value)
                        drugs_to_update.append(existing)
                    else:
                        # Create new drug
                        drugs_to_create.append(Drug(**drug_data))

                    # Batch save
                    if len(drugs_to_create) >= batch_size:
                        with transaction.atomic():
                            Drug.objects.bulk_create(drugs_to_create, ignore_conflicts=True)
                        created_count += len(drugs_to_create)
                        drugs_to_create = []
                        self.stdout.write(f"  Created {created_count} drugs...")

                    if len(drugs_to_update) >= batch_size:
                        with transaction.atomic():
                            Drug.objects.bulk_update(
                                drugs_to_update,
                                fields=[
                                    "generic_name",
                                    "brand_names",
                                    "category",
                                    "form",
                                    "strength",
                                    "unit",
                                    "schedule",
                                    "requires_prescription",
                                    "is_controlled",
                                    "is_narcotic",
                                    "keml_code",
                                    "is_essential",
                                    "nhif_code",
                                    "default_reorder_level",
                                    "default_reorder_quantity",
                                    "storage_requirements",
                                    "reference_price",
                                    "is_active",
                                ],
                            )
                        updated_count += len(drugs_to_update)
                        drugs_to_update = []
                        self.stdout.write(f"  Updated {updated_count} drugs...")

                except Exception as e:
                    error_count += 1
                    errors.append(f"Row {row_num}: {str(e)}")
                    if error_count <= 10:  # Only show first 10 errors
                        self.stderr.write(self.style.WARNING(f"Row {row_num}: {str(e)}"))

            # Save remaining batches
            if drugs_to_create:
                with transaction.atomic():
                    Drug.objects.bulk_create(drugs_to_create, ignore_conflicts=True)
                created_count += len(drugs_to_create)

            if drugs_to_update:
                with transaction.atomic():
                    Drug.objects.bulk_update(
                        drugs_to_update,
                        fields=[
                            "generic_name",
                            "brand_names",
                            "category",
                            "form",
                            "strength",
                            "unit",
                            "schedule",
                            "requires_prescription",
                            "is_controlled",
                            "is_narcotic",
                            "keml_code",
                            "is_essential",
                            "nhif_code",
                            "default_reorder_level",
                            "default_reorder_quantity",
                            "storage_requirements",
                            "reference_price",
                            "is_active",
                        ],
                    )
                updated_count += len(drugs_to_update)

        # Summary
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Import complete!"))
        self.stdout.write(f"  Created: {created_count}")
        self.stdout.write(f"  Updated: {updated_count}")
        if error_count:
            self.stdout.write(self.style.WARNING(f"  Errors: {error_count}"))
            if error_count > 10:
                self.stdout.write("  (Showing first 10 errors only)")

        # Total in database
        total = Drug.objects.count()
        self.stdout.write(f"  Total drugs in database: {total}")

    def _parse_row(self, row: dict) -> dict:
        """Parse a CSV row into drug model data."""
        # Parse JSON-like fields (brand_names is stored as Python list literal)
        brand_names = []
        if row.get("brand_names"):
            try:
                brand_names = ast.literal_eval(row["brand_names"])
                if not isinstance(brand_names, list):
                    brand_names = []
            except (ValueError, SyntaxError):
                brand_names = []

        # Parse boolean fields
        def parse_bool(value):
            if isinstance(value, bool):
                return value
            return str(value).lower() in ("true", "1", "yes", "t")

        # Parse integer fields
        def parse_int(value, default=0):
            try:
                return int(value) if value else default
            except (ValueError, TypeError):
                return default

        # Parse decimal fields
        def parse_decimal(value):
            if not value or value == "":
                return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None

        # Map category to valid choice
        category = row.get("category", "OTHER").upper()
        valid_categories = [c[0] for c in Drug.DRUG_CATEGORIES]
        if category not in valid_categories:
            category = "OTHER"

        # Map form to valid choice
        form = row.get("form", "TABLET").upper()
        valid_forms = [f[0] for f in Drug.DRUG_FORMS]
        if form not in valid_forms:
            form = "TABLET"

        # Map schedule to valid choice
        schedule = row.get("schedule", "POM").upper()
        valid_schedules = [s[0] for s in Drug.SCHEDULE_CHOICES]
        if schedule not in valid_schedules:
            schedule = "POM"

        return {
            "code": row.get("code", "").strip(),
            "generic_name": row.get("generic_name", "").strip(),
            "brand_names": brand_names,
            "category": category,
            "form": form,
            "strength": row.get("strength", "").strip(),
            "unit": row.get("unit", "").strip(),
            "schedule": schedule,
            "requires_prescription": parse_bool(row.get("requires_prescription", True)),
            "is_controlled": parse_bool(row.get("is_controlled", False)),
            "is_narcotic": parse_bool(row.get("is_narcotic", False)),
            "keml_code": row.get("keml_code", "").strip(),
            "is_essential": parse_bool(row.get("is_essential", False)),
            "nhif_code": row.get("sha_code", "").strip(),  # CSV uses sha_code
            "default_reorder_level": parse_int(row.get("default_reorder_level"), 50),
            "default_reorder_quantity": parse_int(row.get("default_reorder_quantity"), 100),
            "storage_requirements": row.get("storage_requirements", "").strip(),
            "reference_price": parse_decimal(row.get("reference_price")),
            "is_active": parse_bool(row.get("is_active", True)),
        }
