"""
Management command to seed default WorksheetTemplate records.

Seeds common lab worksheet templates for Kenyan healthcare facilities.
Templates are per-facility; run with --facility to target a specific facility.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from hmis.apps.core.models import Facility
from hmis.apps.laboratory.worksheets.models import WorksheetTemplate

TEMPLATES = [
    {
        "name": "Hematology Worklist",
        "description": "Daily worklist for CBC, coagulation, and ESR specimens grouped by section.",
        "group_by": "SECTION",
        "section_filter": "HEMATOLOGY",
        "max_specimens_per_page": 30,
        "default_export_format": "PDF",
        "include_qc_slots": True,
        "columns": ["specimen_barcode", "patient_name", "test_name", "priority", "collection_time"],
    },
    {
        "name": "Chemistry/Biochemistry Worklist",
        "description": "Batch worklist for chemistry analyzer runs (LFT, RFT, lipids, glucose).",
        "group_by": "ANALYZER",
        "section_filter": "BIOCHEMISTRY",
        "max_specimens_per_page": 40,
        "default_export_format": "PDF",
        "include_qc_slots": True,
        "columns": ["specimen_barcode", "patient_name", "test_name", "priority"],
    },
    {
        "name": "Microbiology Worklist",
        "description": "Culture and sensitivity worklist grouped by specimen type.",
        "group_by": "SPECIMEN_TYPE",
        "section_filter": "MICROBIOLOGY",
        "max_specimens_per_page": 20,
        "default_export_format": "PDF",
        "include_qc_slots": False,
        "columns": ["specimen_barcode", "patient_name", "test_name", "specimen_type", "priority"],
    },
    {
        "name": "Immunology/Serology Worklist",
        "description": "Worklist for immunoassay tests (HIV, Hepatitis, thyroid, hormones).",
        "group_by": "SECTION",
        "section_filter": "IMMUNOLOGY",
        "max_specimens_per_page": 25,
        "default_export_format": "PDF",
        "include_qc_slots": True,
        "columns": ["specimen_barcode", "patient_name", "test_name", "priority"],
    },
    {
        "name": "Urgent/STAT Worklist",
        "description": "Priority worklist for urgent specimens across all sections.",
        "group_by": "PRIORITY",
        "section_filter": "",
        "max_specimens_per_page": 20,
        "default_export_format": "PDF",
        "include_qc_slots": False,
        "columns": [
            "specimen_barcode",
            "patient_name",
            "test_name",
            "section",
            "priority",
            "collection_time",
        ],
    },
    {
        "name": "Parasitology Worklist",
        "description": "Microscopy worklist for malaria, stool O/C, urinalysis.",
        "group_by": "SECTION",
        "section_filter": "PARASITOLOGY",
        "max_specimens_per_page": 25,
        "default_export_format": "PDF",
        "include_qc_slots": False,
        "columns": ["specimen_barcode", "patient_name", "test_name", "specimen_type"],
    },
]


class Command(BaseCommand):
    help = "Seed default worksheet templates for a facility."

    def add_arguments(self, parser):
        parser.add_argument(
            "--facility",
            type=int,
            help="Facility ID to seed templates for. If omitted, seeds for all facilities.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created without writing to the database.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        facility_id = options.get("facility")
        dry_run = options.get("dry_run", False)

        if facility_id:
            try:
                facilities = [Facility.objects.get(pk=facility_id)]
            except Facility.DoesNotExist:
                raise CommandError(f"Facility with ID {facility_id} does not exist.")
        else:
            facilities = list(Facility.objects.all())

        if not facilities:
            self.stdout.write(self.style.WARNING("No facilities found. Nothing to seed."))
            return

        total_created = 0

        for facility in facilities:
            created_for_facility = 0
            for tmpl_data in TEMPLATES:
                name = tmpl_data["name"]
                exists = WorksheetTemplate.objects.filter(facility=facility, name=name).exists()

                if exists:
                    if not dry_run:
                        self.stdout.write(f"  [skip] {facility.name}: '{name}' already exists")
                    continue

                if dry_run:
                    self.stdout.write(f"  [dry-run] Would create '{name}' for {facility.name}")
                else:
                    WorksheetTemplate.objects.create(
                        facility=facility,
                        organization=facility.organization,
                        name=tmpl_data["name"],
                        description=tmpl_data["description"],
                        group_by=tmpl_data["group_by"],
                        section_filter=tmpl_data["section_filter"],
                        max_specimens_per_page=tmpl_data["max_specimens_per_page"],
                        default_export_format=tmpl_data["default_export_format"],
                        include_qc_slots=tmpl_data["include_qc_slots"],
                        columns=tmpl_data["columns"],
                    )
                    self.stdout.write(f"  [created] {facility.name}: '{name}'")

                created_for_facility += 1

            total_created += created_for_facility

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(f"\nDry run: would create {total_created} template(s).")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f"\nSeeded {total_created} worksheet template(s).")
            )
