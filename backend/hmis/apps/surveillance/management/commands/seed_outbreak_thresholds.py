"""
Management command to seed default national outbreak thresholds.

Creates one OutbreakThreshold per disease (national level, county=NULL)
from the bundled JSON file (data/outbreak_thresholds.json).

Thresholds are based on WHO IHR 2005, IDSR Technical Guidelines, and
Kenya MOH 502 reporting standards.
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """Seed default national outbreak thresholds from JSON."""

    help = "Seed national outbreak thresholds for notifiable diseases"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing thresholds before seeding",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing thresholds instead of skipping",
        )
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Path to JSON file (default: data/outbreak_thresholds.json)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )

    def handle(self, *args, **options):
        from hmis.apps.surveillance.models import NotifiableDisease, OutbreakThreshold

        clear = options.get("clear", False)
        update = options.get("update", False)
        dry_run = options.get("dry_run", False)
        file_path = options.get("file")

        if file_path:
            json_path = Path(file_path)
        else:
            json_path = Path(settings.BASE_DIR) / "data" / "outbreak_thresholds.json"

        if not json_path.exists():
            raise CommandError(f"JSON file not found: {json_path}")

        self.stdout.write(f"Loading thresholds from: {json_path}")
        try:
            with open(json_path, encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise CommandError(f"Invalid JSON file: {e}")

        if "thresholds" not in data:
            raise CommandError("JSON file must contain a 'thresholds' array")

        thresholds = data["thresholds"]
        metadata = data.get("_metadata", {})

        if metadata:
            self.stdout.write(f"  Version: {metadata.get('version', 'unknown')}")
            self.stdout.write(f"  Source: {metadata.get('source', 'unknown')}")
            self.stdout.write("")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no changes will be made"))
            self.stdout.write("")

        # Check diseases exist
        disease_count = NotifiableDisease.objects.count()
        if disease_count == 0:
            raise CommandError("No notifiable diseases found. Run seed_notifiable_diseases first.")
        self.stdout.write(f"Found {disease_count} notifiable diseases in database")

        if clear and not dry_run:
            count = OutbreakThreshold.objects.count()
            OutbreakThreshold.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {count} existing thresholds"))
        elif clear and dry_run:
            count = OutbreakThreshold.objects.count()
            self.stdout.write(self.style.WARNING(f"Would clear {count} existing thresholds"))

        created_count = 0
        updated_count = 0
        skipped_count = 0
        missing_count = 0

        for entry in thresholds:
            disease_name = entry.get("disease_name")
            if not disease_name:
                continue

            try:
                disease = NotifiableDisease.objects.get(name=disease_name)
            except NotifiableDisease.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"  Disease not found: {disease_name}"))
                missing_count += 1
                continue

            # National threshold: county=NULL
            existing = OutbreakThreshold.objects.filter(
                disease=disease, county__isnull=True
            ).first()

            if existing:
                if update:
                    if not dry_run:
                        existing.case_threshold = entry["case_threshold"]
                        existing.period_days = entry["period_days"]
                        existing.is_active = True
                        existing.save()
                    updated_count += 1
                    self.stdout.write(
                        f"  {'Would update' if dry_run else 'Updated'}: {disease_name}"
                    )
                else:
                    skipped_count += 1
                    self.stdout.write(f"  Skipped (exists): {disease_name}")
            else:
                if not dry_run:
                    OutbreakThreshold.objects.create(
                        disease=disease,
                        county=None,
                        case_threshold=entry["case_threshold"],
                        period_days=entry["period_days"],
                        is_active=True,
                    )
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {'Would create' if dry_run else 'Created'}: "
                        f"{disease_name} ({entry['case_threshold']} cases / {entry['period_days']} days)"
                    )
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Dry run' if dry_run else 'Seeding'} complete: "
                f"{created_count} {'would be ' if dry_run else ''}created, "
                f"{updated_count} {'would be ' if dry_run else ''}updated, "
                f"{skipped_count} skipped"
                + (f", {missing_count} diseases not found" if missing_count else "")
            )
        )

        if not dry_run:
            total = OutbreakThreshold.objects.count()
            self.stdout.write(f"\nTotal thresholds in database: {total}")
