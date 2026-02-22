"""
Management command to seed MOH 502 notifiable diseases.

Seeds the database with Kenya's Ministry of Health notifiable disease list
including ICD-10 code mappings, reporting categories, and timelines.

Loads diseases from JSON file (data/notifiable_diseases.json) for easy maintenance
and expansion. The JSON format allows non-developers to add/modify diseases.
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """Management command to seed MOH 502 notifiable diseases from JSON."""

    help = "Seed the database with Kenya MOH 502 notifiable diseases list"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing diseases before seeding",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing diseases instead of skipping",
        )
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Path to JSON file (default: data/notifiable_diseases.json)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )

    def handle(self, *args, **options):
        from hmis.apps.surveillance.models import NotifiableDisease

        clear = options.get("clear", False)
        update = options.get("update", False)
        dry_run = options.get("dry_run", False)
        file_path = options.get("file")

        # Determine JSON file path
        if file_path:
            json_path = Path(file_path)
        else:
            # Default to data/notifiable_diseases.json relative to backend dir
            # BASE_DIR is /path/to/vitora/backend
            json_path = Path(settings.BASE_DIR) / "data" / "notifiable_diseases.json"

        if not json_path.exists():
            raise CommandError(f"JSON file not found: {json_path}")

        # Load diseases from JSON
        self.stdout.write(f"Loading diseases from: {json_path}")
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise CommandError(f"Invalid JSON file: {e}")

        # Validate JSON structure
        if "diseases" not in data:
            raise CommandError("JSON file must contain a 'diseases' array")

        diseases = data["diseases"]
        metadata = data.get("_metadata", {})

        if metadata:
            self.stdout.write(f"  Version: {metadata.get('version', 'unknown')}")
            self.stdout.write(f"  Source: {metadata.get('source', 'unknown')}")
            self.stdout.write(f"  Last Updated: {metadata.get('last_updated', 'unknown')}")
            self.stdout.write("")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no changes will be made"))
            self.stdout.write("")

        # Clear existing diseases if requested
        if clear and not dry_run:
            count = NotifiableDisease.objects.count()
            NotifiableDisease.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {count} existing diseases"))
        elif clear and dry_run:
            count = NotifiableDisease.objects.count()
            self.stdout.write(self.style.WARNING(f"Would clear {count} existing diseases"))

        created_count = 0
        updated_count = 0
        skipped_count = 0
        error_count = 0

        for disease_data in diseases:
            name = disease_data.get("name")
            if not name:
                self.stdout.write(self.style.ERROR("  Skipped entry without name"))
                error_count += 1
                continue

            # Prepare data for Django model (convert JSON booleans)
            model_data = {
                "name": name,
                "icd10_codes": disease_data.get("icd10_codes", ""),
                "category": disease_data.get("category", "WEEKLY"),
                "reporting_hours": disease_data.get("reporting_hours", 168),
                "description": disease_data.get("description", ""),
                "case_definition": disease_data.get("case_definition", ""),
                "laboratory_criteria": disease_data.get("laboratory_criteria", ""),
                "is_ihr_notifiable": disease_data.get("is_ihr_notifiable", False),
                "is_active": disease_data.get("is_active", True),
            }

            existing = NotifiableDisease.objects.filter(name=name).first()

            if existing:
                if update:
                    if not dry_run:
                        for key, value in model_data.items():
                            setattr(existing, key, value)
                        existing.save()
                    updated_count += 1
                    self.stdout.write(f"  {'Would update' if dry_run else 'Updated'}: {name}")
                else:
                    skipped_count += 1
                    self.stdout.write(f"  Skipped (exists): {name}")
            else:
                if not dry_run:
                    NotifiableDisease.objects.create(**model_data)
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  {'Would create' if dry_run else 'Created'}: {name}")
                )

        # Summary
        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Dry run' if dry_run else 'Seeding'} complete: "
                f"{created_count} {'would be ' if dry_run else ''}created, "
                f"{updated_count} {'would be ' if dry_run else ''}updated, "
                f"{skipped_count} skipped"
                + (f", {error_count} errors" if error_count else "")
            )
        )

        # Summary by category (from database, not dry run)
        if not dry_run:
            immediate = NotifiableDisease.objects.filter(category="IMMEDIATE").count()
            weekly = NotifiableDisease.objects.filter(category="WEEKLY").count()
            monthly = NotifiableDisease.objects.filter(category="MONTHLY").count()

            self.stdout.write("")
            self.stdout.write("Disease counts by category:")
            self.stdout.write(f"  IMMEDIATE: {immediate}")
            self.stdout.write(f"  WEEKLY: {weekly}")
            self.stdout.write(f"  MONTHLY: {monthly}")
            self.stdout.write(f"  TOTAL: {immediate + weekly + monthly}")
        else:
            # From JSON for dry run
            immediate = sum(1 for d in diseases if d.get("category") == "IMMEDIATE")
            weekly = sum(1 for d in diseases if d.get("category") == "WEEKLY")
            monthly = sum(1 for d in diseases if d.get("category") == "MONTHLY")

            self.stdout.write("")
            self.stdout.write("Diseases in JSON file by category:")
            self.stdout.write(f"  IMMEDIATE: {immediate}")
            self.stdout.write(f"  WEEKLY: {weekly}")
            self.stdout.write(f"  MONTHLY: {monthly}")
            self.stdout.write(f"  TOTAL: {len(diseases)}")
