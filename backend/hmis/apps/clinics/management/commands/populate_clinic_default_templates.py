"""Populate Clinic.default_clinical_template for existing clinics.

This is a safe backfill command intended for environments that already have
Clinic rows created before default clinical templates were introduced.

Rules:
- By default, only fills clinics where default_clinical_template is NULL.
- With --force, overwrites existing defaults using the clinic_type mapping.
- With --dry-run, prints what would change without persisting.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from hmis.apps.clinics.models import Clinic
from hmis.apps.clinics.services.template_routing import (
    resolve_default_clinical_template,
)


class Command(BaseCommand):
    help = "Auto-populate Clinic.default_clinical_template for existing clinics"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would change, without saving",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing clinic defaults",
        )
        parser.add_argument(
            "--clinic-type",
            action="append",
            default=[],
            help="Restrict to a clinic_type (can be provided multiple times)",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        force: bool = options["force"]
        clinic_types: list[str] = options["clinic_type"]

        qs = Clinic.objects.all().order_by("id")
        if clinic_types:
            qs = qs.filter(clinic_type__in=clinic_types)

        updated = 0
        overwritten = 0
        skipped = 0
        missing_template = 0

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN: no changes will be saved"))

        for clinic in qs:
            has_existing = clinic.default_clinical_template_id is not None
            if has_existing and not force:
                skipped += 1
                continue

            resolved = resolve_default_clinical_template(clinic)
            if resolved is None:
                missing_template += 1
                continue

            if dry_run:
                if has_existing and force:
                    overwritten += 1
                else:
                    updated += 1
                continue

            clinic.default_clinical_template = resolved
            clinic.save(update_fields=["default_clinical_template"])

            if has_existing and force:
                overwritten += 1
            else:
                updated += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("populate_clinic_default_templates summary"))
        self.stdout.write(f"Updated: {updated}")
        self.stdout.write(f"Overwritten: {overwritten}")
        self.stdout.write(f"Skipped: {skipped}")
        self.stdout.write(f"Missing template: {missing_template}")
