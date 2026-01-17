"""
Management command to import LOINC codes from CSV file.

LOINC (Logical Observation Identifiers Names and Codes) is a universal
standard for identifying medical laboratory observations.

Usage:
    python manage.py import_loinc
    python manage.py import_loinc --file path/to/loinc.csv
    python manage.py import_loinc --clear  # Clear existing before import
"""

import csv
import logging
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from hmis.apps.laboratory.models import LOINCCode

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    """Import LOINC codes from CSV file."""

    help = "Import LOINC codes from a CSV file into the database"

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Path to LOINC CSV file (default: uses LOINC_DATA_PATH setting)",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing LOINC codes before import",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate CSV without importing",
        )

    def handle(self, *args, **options):  # noqa: ARG002
        """Execute the command."""
        # Determine file path
        file_path = options.get("file")
        if not file_path:
            file_path = getattr(settings, "LOINC_DATA_PATH", "data/loinc_common.csv")

        # Resolve relative path from BASE_DIR
        if not Path(file_path).is_absolute():
            file_path = Path(settings.BASE_DIR) / file_path

        file_path = Path(file_path)

        if not file_path.exists():
            # If file doesn't exist, create a sample file with common lab test LOINC codes
            self.stdout.write(self.style.WARNING(f"LOINC file not found: {file_path}"))
            self.stdout.write("Creating sample LOINC codes from built-in data...")
            self._import_builtin_loinc_codes(options)
            return

        self.stdout.write(f"Importing LOINC codes from: {file_path}")

        # Clear existing if requested
        if options["clear"]:
            deleted_count = LOINCCode.objects.count()
            LOINCCode.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {deleted_count} existing LOINC codes"))

        # Read and validate CSV
        try:
            with open(file_path, newline="", encoding="utf-8") as csvfile:
                reader = csv.DictReader(csvfile)
                self._validate_csv_columns(reader.fieldnames)

                if options["dry_run"]:
                    self._dry_run(reader)
                else:
                    self._import_codes(reader)

        except FileNotFoundError as e:
            raise CommandError(f"File not found: {file_path}") from e
        except csv.Error as e:
            raise CommandError(f"CSV parsing error: {e}") from e

    def _validate_csv_columns(self, fieldnames):
        """Validate required columns exist in CSV."""
        required_columns = {"code", "component", "long_common_name", "short_name"}
        if fieldnames is None:
            raise CommandError("CSV file appears to be empty or malformed")

        missing = required_columns - set(fieldnames)
        if missing:
            raise CommandError(f"Missing required columns: {missing}")

    def _dry_run(self, reader):
        """Validate CSV without importing."""
        valid_count = 0
        error_count = 0

        for row_num, row in enumerate(reader, start=2):
            code = row.get("code", "").strip()
            if not code:
                self.stdout.write(self.style.WARNING(f"Row {row_num}: Missing code"))
                error_count += 1
                continue
            valid_count += 1

        self.stdout.write(
            self.style.SUCCESS(f"Dry run complete: {valid_count} valid rows, {error_count} errors")
        )

    def _import_codes(self, reader):
        """Import LOINC codes from CSV reader."""
        created_count = 0
        updated_count = 0
        skipped_count = 0

        for row in reader:
            code = row.get("code", "").strip()
            if not code:
                skipped_count += 1
                continue

            defaults = {
                "component": row.get("component", "").strip()[:200],
                "property": row.get("property", "").strip()[:50],
                "time_aspect": row.get("time_aspect", "").strip()[:50],
                "system": row.get("system", "").strip()[:100],
                "scale_type": row.get("scale_type", "").strip()[:50],
                "method_type": row.get("method_type", "").strip()[:100],
                "long_common_name": row.get("long_common_name", "").strip()[:300],
                "short_name": row.get("short_name", "").strip()[:100],
            }

            _, created = LOINCCode.objects.update_or_create(
                code=code,
                defaults=defaults,
            )

            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Import complete: {created_count} created, {updated_count} updated, "
                f"{skipped_count} skipped"
            )
        )

    def _import_builtin_loinc_codes(self, options):
        """Import built-in LOINC codes for common lab tests."""
        if options.get("dry_run"):
            self.stdout.write("Dry run: Would import built-in LOINC codes")
            return

        if options.get("clear"):
            deleted_count = LOINCCode.objects.count()
            LOINCCode.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {deleted_count} existing LOINC codes"))

        # Common LOINC codes for Kenya essential lab tests
        builtin_codes = [
            # Hematology
            {
                "code": "718-7",
                "component": "Hemoglobin",
                "property": "MCnc",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Hemoglobin [Mass/volume] in Blood",
                "short_name": "Hgb Bld-mCnc",
            },
            {
                "code": "6690-2",
                "component": "Leukocytes",
                "property": "NCnc",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Leukocytes [#/volume] in Blood by Automated count",
                "short_name": "WBC # Bld Auto",
            },
            {
                "code": "789-8",
                "component": "Erythrocytes",
                "property": "NCnc",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Erythrocytes [#/volume] in Blood by Automated count",
                "short_name": "RBC # Bld Auto",
            },
            {
                "code": "777-3",
                "component": "Platelets",
                "property": "NCnc",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Platelets [#/volume] in Blood by Automated count",
                "short_name": "Platelet # Bld Auto",
            },
            {
                "code": "30341-2",
                "component": "Erythrocyte sedimentation rate",
                "property": "Vel",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Qn",
                "method_type": "Westergren",
                "long_common_name": "Erythrocyte sedimentation rate by Westergren method",
                "short_name": "ESR Bld Qn Westergren",
            },
            # Blood Grouping
            {
                "code": "882-1",
                "component": "ABO and Rh group",
                "property": "Type",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Nom",
                "method_type": "",
                "long_common_name": "ABO and Rh group [Type] in Blood",
                "short_name": "ABO+Rh Bld",
            },
            # Clinical Chemistry
            {
                "code": "2339-0",
                "component": "Glucose",
                "property": "MCnc",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Glucose [Mass/volume] in Blood",
                "short_name": "Glucose Bld-mCnc",
            },
            {
                "code": "1558-6",
                "component": "Fasting glucose",
                "property": "MCnc",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Fasting glucose [Mass/volume] in Serum or Plasma",
                "short_name": "Glucose SerPl-mCnc",
            },
            {
                "code": "2160-0",
                "component": "Creatinine",
                "property": "MCnc",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Creatinine [Mass/volume] in Serum or Plasma",
                "short_name": "Creat SerPl-mCnc",
            },
            {
                "code": "3094-0",
                "component": "Urea nitrogen",
                "property": "MCnc",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Urea nitrogen [Mass/volume] in Serum or Plasma",
                "short_name": "BUN SerPl-mCnc",
            },
            # Liver Function
            {
                "code": "1742-6",
                "component": "Alanine aminotransferase",
                "property": "CCnc",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma",
                "short_name": "ALT SerPl-cCnc",
            },
            {
                "code": "1920-8",
                "component": "Aspartate aminotransferase",
                "property": "CCnc",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma",
                "short_name": "AST SerPl-cCnc",
            },
            # Malaria
            {
                "code": "32700-7",
                "component": "Plasmodium sp identified",
                "property": "Prid",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Nom",
                "method_type": "Thick smear",
                "long_common_name": "Plasmodium sp identified in Blood by Thick smear",
                "short_name": "Malaria Bld Thick Smear",
            },
            {
                "code": "70569-9",
                "component": "Plasmodium falciparum Ag",
                "property": "PrThr",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Ord",
                "method_type": "Rapid immunoassay",
                "long_common_name": "Plasmodium falciparum Ag [Presence] in Blood by Rapid immunoassay",
                "short_name": "P falciparum Ag Bld Ql IA.rapid",
            },
            # HIV
            {
                "code": "68961-2",
                "component": "HIV 1+2 Ab",
                "property": "PrThr",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Ord",
                "method_type": "Rapid immunoassay",
                "long_common_name": "HIV 1+2 Ab [Presence] in Serum or Plasma by Rapid immunoassay",
                "short_name": "HIV 1+2 Ab SerPl Ql IA.rapid",
            },
            {
                "code": "24467-3",
                "component": "CD4 cells",
                "property": "NCnc",
                "time_aspect": "Pt",
                "system": "Bld",
                "scale_type": "Qn",
                "method_type": "",
                "long_common_name": "CD4 cells [#/volume] in Blood",
                "short_name": "CD4 # Bld",
            },
            {
                "code": "20447-9",
                "component": "HIV 1 RNA",
                "property": "NCnc",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Qn",
                "method_type": "Probe.amp.tar",
                "long_common_name": "HIV 1 RNA [#/volume] (viral load) in Serum or Plasma by NAA with probe detection",
                "short_name": "HIV1 RNA SerPl NAA+probe-aCnc",
            },
            # Hepatitis
            {
                "code": "5196-1",
                "component": "Hepatitis B virus surface Ag",
                "property": "PrThr",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Ord",
                "method_type": "",
                "long_common_name": "Hepatitis B virus surface Ag [Presence] in Serum or Plasma",
                "short_name": "HBsAg SerPl Ql",
            },
            {
                "code": "16128-1",
                "component": "Hepatitis C virus Ab",
                "property": "PrThr",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Ord",
                "method_type": "",
                "long_common_name": "Hepatitis C virus Ab [Presence] in Serum or Plasma",
                "short_name": "HCV Ab SerPl Ql",
            },
            # Urinalysis
            {
                "code": "5778-6",
                "component": "Color of Urine",
                "property": "Type",
                "time_aspect": "Pt",
                "system": "Urine",
                "scale_type": "Nom",
                "method_type": "Visual",
                "long_common_name": "Color of Urine by Visual",
                "short_name": "Color Ur",
            },
            {
                "code": "5803-2",
                "component": "pH of Urine",
                "property": "SCnc",
                "time_aspect": "Pt",
                "system": "Urine",
                "scale_type": "Qn",
                "method_type": "Test strip",
                "long_common_name": "pH of Urine by Test strip",
                "short_name": "pH Ur Strip",
            },
            {
                "code": "5804-0",
                "component": "Protein in Urine",
                "property": "MCnc",
                "time_aspect": "Pt",
                "system": "Urine",
                "scale_type": "Qn",
                "method_type": "Test strip",
                "long_common_name": "Protein [Mass/volume] in Urine by Test strip",
                "short_name": "Prot Ur Strip-mCnc",
            },
            # Stool
            {
                "code": "20508-8",
                "component": "Ova and parasites identified",
                "property": "Prid",
                "time_aspect": "Pt",
                "system": "Stool",
                "scale_type": "Nom",
                "method_type": "Microscopy",
                "long_common_name": "Ova and parasites identified in Stool by Microscopy",
                "short_name": "O+P Stl Micro",
            },
            # Syphilis
            {
                "code": "20507-0",
                "component": "Reagin Ab",
                "property": "PrThr",
                "time_aspect": "Pt",
                "system": "Ser/Plas",
                "scale_type": "Ord",
                "method_type": "RPR",
                "long_common_name": "Reagin Ab [Presence] in Serum by RPR",
                "short_name": "Reagin Ab Ser Ql RPR",
            },
            # Typhoid
            {
                "code": "6570-6",
                "component": "Salmonella typhi O Ab",
                "property": "Titr",
                "time_aspect": "Pt",
                "system": "Ser",
                "scale_type": "Qn",
                "method_type": "Agglut",
                "long_common_name": "Salmonella typhi O Ab [Titer] in Serum by Agglutination",
                "short_name": "Widal O Ag Titr Ser",
            },
        ]

        created_count = 0
        for code_data in builtin_codes:
            _, created = LOINCCode.objects.update_or_create(
                code=code_data["code"],
                defaults={k: v for k, v in code_data.items() if k != "code"},
            )
            if created:
                created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Imported {created_count} built-in LOINC codes "
                f"({len(builtin_codes) - created_count} already existed)"
            )
        )
