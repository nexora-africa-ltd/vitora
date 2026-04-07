"""
Seed Discharge Summary Templates — common Kenyan hospital formats.

Creates a set of discharge summary print templates for every active facility
that doesn't already have any templates configured.  Three formats are
seeded, matching the most common discharge summary styles used across
Kenya's KEPH levels:

  1. **Standard** — Narrative / flowing sections (large referral hospitals)
  2. **Structured** — Labelled field grid (county & sub-county hospitals)
  3. **Minimal** — Compact single-page (dispensaries & health centres)

The first template matching the facility's KEPH level is marked as default.

Usage:
    python manage.py seed_discharge_templates
    python manage.py seed_discharge_templates --force      # overwrite existing
    python manage.py seed_discharge_templates --facility 12345  # specific MFL code
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed discharge summary print templates for facilities"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Delete existing templates and recreate them",
        )
        parser.add_argument(
            "--facility",
            type=str,
            default=None,
            help="Only seed for a specific facility (by MFL code)",
        )

    def handle(self, *args, **options):
        from django.db import transaction

        from hmis.apps.core.models import Facility
        from hmis.apps.inpatient.models import DischargeTemplate

        force = options["force"]
        mfl_code = options.get("facility")

        facilities = Facility.objects.filter(is_active=True)
        if mfl_code:
            facilities = facilities.filter(mfl_code=mfl_code)

        if not facilities.exists():
            self.stderr.write(self.style.WARNING("No matching active facilities found."))
            return

        # Section presets per layout
        standard_sections = [
            {"key": "patient_demographics", "label": "Patient Information", "enabled": True},
            {"key": "admission_details", "label": "Admission Details", "enabled": True},
            {"key": "diagnosis", "label": "Diagnosis", "enabled": True},
            {"key": "history", "label": "History", "enabled": True},
            {"key": "hospital_course", "label": "Hospital Course", "enabled": True},
            {"key": "physical_examination", "label": "Physical Examination", "enabled": True},
            {"key": "investigations", "label": "Investigations Done", "enabled": True},
            {"key": "management", "label": "Management", "enabled": True},
            {"key": "condition_at_discharge", "label": "Condition at Discharge", "enabled": True},
            {"key": "discharge_medications", "label": "Discharge Medications", "enabled": True},
            {"key": "discharge_instructions", "label": "Discharge Instructions", "enabled": True},
            {"key": "follow_up", "label": "Follow-up / TCA", "enabled": True},
        ]

        structured_sections = [
            {"key": "patient_demographics", "label": "Patient Information", "enabled": True},
            {"key": "admission_details", "label": "Admission Details", "enabled": True},
            {"key": "diagnosis", "label": "Diagnosis", "enabled": True},
            {"key": "complaints", "label": "Complaints", "enabled": True},
            {"key": "physical_examination", "label": "Physical Findings", "enabled": True},
            {"key": "investigations", "label": "Investigations Done", "enabled": True},
            {"key": "hospital_course", "label": "Hospital Course", "enabled": True},
            {"key": "management", "label": "Management", "enabled": True},
            {"key": "condition_at_discharge", "label": "Condition at Discharge", "enabled": True},
            {"key": "discharge_medications", "label": "Discharge Medications", "enabled": True},
            {"key": "discharge_instructions", "label": "Outcome / Discharge Instructions", "enabled": True},
            {"key": "follow_up", "label": "Follow-up / TCA", "enabled": True},
        ]

        minimal_sections = [
            {"key": "patient_demographics", "label": "Patient Information", "enabled": True},
            {"key": "diagnosis", "label": "Diagnosis", "enabled": True},
            {"key": "history", "label": "History", "enabled": True},
            {"key": "physical_examination", "label": "Physical Examination", "enabled": True},
            {"key": "investigations", "label": "Investigation", "enabled": True},
            {"key": "management", "label": "Treatment", "enabled": True},
            {"key": "discharge_instructions", "label": "Discharge Instructions", "enabled": True},
        ]

        TEMPLATES = [
            {
                "name": "Standard (Narrative)",
                "layout": "STANDARD",
                "header_title": "Discharge Summary",
                "header_subtitle": "",
                "sections": standard_sections,
                "show_signature_lines": True,
                "show_qr_code": True,
            },
            {
                "name": "Structured (Grid)",
                "layout": "STRUCTURED",
                "header_title": "Discharge Summary",
                "header_subtitle": "",
                "sections": structured_sections,
                "show_signature_lines": True,
                "show_qr_code": True,
            },
            {
                "name": "Minimal (Compact)",
                "layout": "MINIMAL",
                "header_title": "Discharge Summary",
                "header_subtitle": "",
                "sections": minimal_sections,
                "show_signature_lines": True,
                "show_qr_code": False,
            },
        ]

        # Map KEPH level to the recommended default layout
        LEVEL_DEFAULT_LAYOUT = {
            "1": "MINIMAL",
            "2": "MINIMAL",
            "3": "MINIMAL",
            "4": "STRUCTURED",
            "5": "STRUCTURED",
            "6": "STANDARD",
        }

        created_count = 0
        skipped_count = 0

        for facility in facilities:
            existing = DischargeTemplate.objects.filter(facility=facility)

            if existing.exists() and not force:
                skipped_count += 1
                continue

            with transaction.atomic():
                if force:
                    existing.delete()

                default_layout = LEVEL_DEFAULT_LAYOUT.get(
                    str(facility.level), "STANDARD"
                )

                for tpl_data in TEMPLATES:
                    is_default = tpl_data["layout"] == default_layout
                    DischargeTemplate.objects.create(
                        facility=facility,
                        organization=facility.organization,
                        name=tpl_data["name"],
                        layout=tpl_data["layout"],
                        is_default=is_default,
                        is_active=True,
                        sections=tpl_data["sections"],
                        header_title=tpl_data["header_title"],
                        header_subtitle=tpl_data["header_subtitle"],
                        show_signature_lines=tpl_data["show_signature_lines"],
                        show_qr_code=tpl_data["show_qr_code"],
                    )
                    created_count += 1

            self.stdout.write(
                f"  ✓ {facility.name} (MFL {facility.mfl_code}) — "
                f"3 templates, default: {default_layout}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Created {created_count} templates across "
                f"{created_count // 3 if created_count else 0} facilities. "
                f"Skipped {skipped_count} (already configured)."
            )
        )
