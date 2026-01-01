"""
Management command to load lab test reference ranges into LabResultTemplate.

Populates common lab test parameters with WHO-recommended and Kenya-specific
reference ranges for different demographics (adult male, adult female, pediatric).

Usage:
    python manage.py load_lab_reference_ranges
    python manage.py load_lab_reference_ranges --clear  # Clear existing first
    python manage.py load_lab_reference_ranges --panel CBC  # Load specific panel
    python manage.py load_lab_reference_ranges --dry-run  # Validate without loading
"""

import logging
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from hmis.apps.laboratory.models import LabResultTemplate

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    """Load lab test reference ranges from predefined data."""

    help = "Load lab test reference ranges into LabResultTemplate model"

    # Reference range data for common lab tests
    # Based on WHO recommendations and Kenya guidelines
    REFERENCE_RANGE_DATA = {
        "CBC": {
            "test_name": "Complete Blood Count",
            "parameters": [
                {
                    "parameter_code": "WBC",
                    "parameter_name": "White Blood Cells",
                    "unit": "×10⁹/L",
                    "display_order": 1,
                    "reference_ranges": {
                        "adult_male": {"low": 4.5, "high": 11.0},
                        "adult_female": {"low": 4.5, "high": 11.0},
                        "pediatric": {"low": 5.0, "high": 15.0},
                    },
                    "critical_low": Decimal("2.0"),
                    "critical_high": Decimal("30.0"),
                },
                {
                    "parameter_code": "RBC",
                    "parameter_name": "Red Blood Cells",
                    "unit": "×10¹²/L",
                    "display_order": 2,
                    "reference_ranges": {
                        "adult_male": {"low": 4.5, "high": 5.9},
                        "adult_female": {"low": 4.1, "high": 5.1},
                        "pediatric": {"low": 3.8, "high": 5.5},
                    },
                    "critical_low": Decimal("2.5"),
                    "critical_high": Decimal("7.0"),
                },
                {
                    "parameter_code": "HGB",
                    "parameter_name": "Hemoglobin",
                    "unit": "g/dL",
                    "display_order": 3,
                    "reference_ranges": {
                        "adult_male": {"low": 13.5, "high": 17.5},
                        "adult_female": {"low": 12.0, "high": 16.0},
                        "pediatric": {"low": 11.0, "high": 14.0},
                    },
                    "critical_low": Decimal("7.0"),
                    "critical_high": Decimal("20.0"),
                },
                {
                    "parameter_code": "HCT",
                    "parameter_name": "Hematocrit",
                    "unit": "%",
                    "display_order": 4,
                    "reference_ranges": {
                        "adult_male": {"low": 40.0, "high": 52.0},
                        "adult_female": {"low": 36.0, "high": 46.0},
                        "pediatric": {"low": 32.0, "high": 44.0},
                    },
                    "critical_low": Decimal("20.0"),
                    "critical_high": Decimal("60.0"),
                },
                {
                    "parameter_code": "PLT",
                    "parameter_name": "Platelets",
                    "unit": "×10⁹/L",
                    "display_order": 5,
                    "reference_ranges": {
                        "adult_male": {"low": 150, "high": 400},
                        "adult_female": {"low": 150, "high": 400},
                        "pediatric": {"low": 150, "high": 450},
                    },
                    "critical_low": Decimal("20.0"),
                    "critical_high": Decimal("1000.0"),
                },
                {
                    "parameter_code": "MCV",
                    "parameter_name": "Mean Corpuscular Volume",
                    "unit": "fL",
                    "display_order": 6,
                    "reference_ranges": {
                        "adult_male": {"low": 80.0, "high": 100.0},
                        "adult_female": {"low": 80.0, "high": 100.0},
                        "pediatric": {"low": 75.0, "high": 95.0},
                    },
                    "critical_low": None,
                    "critical_high": None,
                },
                {
                    "parameter_code": "MCH",
                    "parameter_name": "Mean Corpuscular Hemoglobin",
                    "unit": "pg",
                    "display_order": 7,
                    "reference_ranges": {
                        "adult_male": {"low": 27.0, "high": 31.0},
                        "adult_female": {"low": 27.0, "high": 31.0},
                        "pediatric": {"low": 25.0, "high": 31.0},
                    },
                    "critical_low": None,
                    "critical_high": None,
                },
                {
                    "parameter_code": "MCHC",
                    "parameter_name": "Mean Corpuscular Hemoglobin Concentration",
                    "unit": "g/dL",
                    "display_order": 8,
                    "reference_ranges": {
                        "adult_male": {"low": 32.0, "high": 36.0},
                        "adult_female": {"low": 32.0, "high": 36.0},
                        "pediatric": {"low": 32.0, "high": 36.0},
                    },
                    "critical_low": None,
                    "critical_high": None,
                },
            ],
        },
        "LIVER": {
            "test_name": "Liver Function Tests",
            "parameters": [
                {
                    "parameter_code": "ALT",
                    "parameter_name": "Alanine Aminotransferase",
                    "unit": "U/L",
                    "display_order": 1,
                    "reference_ranges": {
                        "adult_male": {"low": 7, "high": 56},
                        "adult_female": {"low": 7, "high": 41},
                        "pediatric": {"low": 10, "high": 40},
                    },
                    "critical_low": None,
                    "critical_high": Decimal("500.0"),
                },
                {
                    "parameter_code": "AST",
                    "parameter_name": "Aspartate Aminotransferase",
                    "unit": "U/L",
                    "display_order": 2,
                    "reference_ranges": {
                        "adult_male": {"low": 10, "high": 40},
                        "adult_female": {"low": 10, "high": 35},
                        "pediatric": {"low": 15, "high": 50},
                    },
                    "critical_low": None,
                    "critical_high": Decimal("500.0"),
                },
                {
                    "parameter_code": "ALP",
                    "parameter_name": "Alkaline Phosphatase",
                    "unit": "U/L",
                    "display_order": 3,
                    "reference_ranges": {
                        "adult_male": {"low": 40, "high": 130},
                        "adult_female": {"low": 35, "high": 104},
                        "pediatric": {"low": 100, "high": 320},
                    },
                    "critical_low": None,
                    "critical_high": None,
                },
                {
                    "parameter_code": "TBIL",
                    "parameter_name": "Total Bilirubin",
                    "unit": "mg/dL",
                    "display_order": 4,
                    "reference_ranges": {
                        "adult_male": {"low": 0.2, "high": 1.2},
                        "adult_female": {"low": 0.2, "high": 1.2},
                        "pediatric": {"low": 0.3, "high": 1.0},
                    },
                    "critical_low": None,
                    "critical_high": Decimal("15.0"),
                },
                {
                    "parameter_code": "ALB",
                    "parameter_name": "Albumin",
                    "unit": "g/dL",
                    "display_order": 5,
                    "reference_ranges": {
                        "adult_male": {"low": 3.5, "high": 5.5},
                        "adult_female": {"low": 3.5, "high": 5.5},
                        "pediatric": {"low": 3.2, "high": 5.0},
                    },
                    "critical_low": Decimal("2.0"),
                    "critical_high": None,
                },
            ],
        },
        "RENAL": {
            "test_name": "Kidney Function Tests",
            "parameters": [
                {
                    "parameter_code": "CREAT",
                    "parameter_name": "Creatinine",
                    "unit": "mg/dL",
                    "display_order": 1,
                    "reference_ranges": {
                        "adult_male": {"low": 0.7, "high": 1.3},
                        "adult_female": {"low": 0.6, "high": 1.1},
                        "pediatric": {"low": 0.3, "high": 0.7},
                    },
                    "critical_low": None,
                    "critical_high": Decimal("10.0"),
                },
                {
                    "parameter_code": "BUN",
                    "parameter_name": "Blood Urea Nitrogen",
                    "unit": "mg/dL",
                    "display_order": 2,
                    "reference_ranges": {
                        "adult_male": {"low": 7, "high": 20},
                        "adult_female": {"low": 7, "high": 20},
                        "pediatric": {"low": 5, "high": 18},
                    },
                    "critical_low": None,
                    "critical_high": Decimal("100.0"),
                },
                {
                    "parameter_code": "URIC",
                    "parameter_name": "Uric Acid",
                    "unit": "mg/dL",
                    "display_order": 3,
                    "reference_ranges": {
                        "adult_male": {"low": 3.5, "high": 7.2},
                        "adult_female": {"low": 2.6, "high": 6.0},
                        "pediatric": {"low": 2.0, "high": 5.5},
                    },
                    "critical_low": None,
                    "critical_high": None,
                },
            ],
        },
        "LIPID": {
            "test_name": "Lipid Profile",
            "parameters": [
                {
                    "parameter_code": "CHOL",
                    "parameter_name": "Total Cholesterol",
                    "unit": "mg/dL",
                    "display_order": 1,
                    "reference_ranges": {
                        "default": {"low": 0, "high": 200},
                    },
                    "critical_low": None,
                    "critical_high": Decimal("400.0"),
                },
                {
                    "parameter_code": "LDL",
                    "parameter_name": "LDL Cholesterol",
                    "unit": "mg/dL",
                    "display_order": 2,
                    "reference_ranges": {
                        "default": {"low": 0, "high": 100},
                    },
                    "critical_low": None,
                    "critical_high": Decimal("300.0"),
                },
                {
                    "parameter_code": "HDL",
                    "parameter_name": "HDL Cholesterol",
                    "unit": "mg/dL",
                    "display_order": 3,
                    "reference_ranges": {
                        "adult_male": {"low": 40, "high": 999},
                        "adult_female": {"low": 50, "high": 999},
                        "default": {"low": 40, "high": 999},
                    },
                    "critical_low": Decimal("20.0"),
                    "critical_high": None,
                },
                {
                    "parameter_code": "TRIG",
                    "parameter_name": "Triglycerides",
                    "unit": "mg/dL",
                    "display_order": 4,
                    "reference_ranges": {
                        "default": {"low": 0, "high": 150},
                    },
                    "critical_low": None,
                    "critical_high": Decimal("1000.0"),
                },
            ],
        },
        "GLUCOSE": {
            "test_name": "Blood Glucose Tests",
            "parameters": [
                {
                    "parameter_code": "GLU_F",
                    "parameter_name": "Fasting Glucose",
                    "unit": "mg/dL",
                    "display_order": 1,
                    "reference_ranges": {
                        "default": {"low": 70, "high": 100},
                    },
                    "critical_low": Decimal("40.0"),
                    "critical_high": Decimal("500.0"),
                },
                {
                    "parameter_code": "GLU_R",
                    "parameter_name": "Random Glucose",
                    "unit": "mg/dL",
                    "display_order": 2,
                    "reference_ranges": {
                        "default": {"low": 70, "high": 140},
                    },
                    "critical_low": Decimal("40.0"),
                    "critical_high": Decimal("500.0"),
                },
                {
                    "parameter_code": "HBA1C",
                    "parameter_name": "Hemoglobin A1c",
                    "unit": "%",
                    "display_order": 3,
                    "reference_ranges": {
                        "default": {"low": 4.0, "high": 5.6},
                    },
                    "critical_low": None,
                    "critical_high": Decimal("14.0"),
                },
            ],
        },
        "ELECTROLYTES": {
            "test_name": "Electrolytes",
            "parameters": [
                {
                    "parameter_code": "NA",
                    "parameter_name": "Sodium",
                    "unit": "mEq/L",
                    "display_order": 1,
                    "reference_ranges": {
                        "default": {"low": 136, "high": 145},
                    },
                    "critical_low": Decimal("120.0"),
                    "critical_high": Decimal("160.0"),
                },
                {
                    "parameter_code": "K",
                    "parameter_name": "Potassium",
                    "unit": "mEq/L",
                    "display_order": 2,
                    "reference_ranges": {
                        "default": {"low": 3.5, "high": 5.0},
                    },
                    "critical_low": Decimal("2.5"),
                    "critical_high": Decimal("6.5"),
                },
                {
                    "parameter_code": "CL",
                    "parameter_name": "Chloride",
                    "unit": "mEq/L",
                    "display_order": 3,
                    "reference_ranges": {
                        "default": {"low": 98, "high": 107},
                    },
                    "critical_low": Decimal("80.0"),
                    "critical_high": Decimal("120.0"),
                },
                {
                    "parameter_code": "CO2",
                    "parameter_name": "Carbon Dioxide",
                    "unit": "mEq/L",
                    "display_order": 4,
                    "reference_ranges": {
                        "default": {"low": 23, "high": 29},
                    },
                    "critical_low": Decimal("10.0"),
                    "critical_high": Decimal("40.0"),
                },
            ],
        },
        "THYROID": {
            "test_name": "Thyroid Function Tests",
            "parameters": [
                {
                    "parameter_code": "TSH",
                    "parameter_name": "Thyroid Stimulating Hormone",
                    "unit": "mIU/L",
                    "display_order": 1,
                    "reference_ranges": {
                        "default": {"low": 0.4, "high": 4.0},
                    },
                    "critical_low": Decimal("0.01"),
                    "critical_high": Decimal("20.0"),
                },
                {
                    "parameter_code": "T3",
                    "parameter_name": "Triiodothyronine (T3)",
                    "unit": "ng/dL",
                    "display_order": 2,
                    "reference_ranges": {
                        "default": {"low": 80, "high": 200},
                    },
                    "critical_low": None,
                    "critical_high": None,
                },
                {
                    "parameter_code": "T4",
                    "parameter_name": "Thyroxine (T4)",
                    "unit": "µg/dL",
                    "display_order": 3,
                    "reference_ranges": {
                        "default": {"low": 5.0, "high": 12.0},
                    },
                    "critical_low": None,
                    "critical_high": None,
                },
            ],
        },
    }

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--panel",
            type=str,
            choices=list(self.REFERENCE_RANGE_DATA.keys()),
            help="Load specific panel only (CBC, LIVER, RENAL, LIPID, GLUCOSE, ELECTROLYTES, THYROID)",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing reference ranges before loading",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate data without loading into database",
        )

    def handle(self, *args, **options):  # noqa: ARG002
        """Execute the command."""
        dry_run = options.get("dry_run", False)
        clear = options.get("clear", False)
        panel = options.get("panel")

        # Determine which panels to load
        if panel:
            panels_to_load = {panel: self.REFERENCE_RANGE_DATA[panel]}
            self.stdout.write(f"Loading panel: {panel}")
        else:
            panels_to_load = self.REFERENCE_RANGE_DATA
            self.stdout.write("Loading all panels")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN MODE - No data will be saved"))

        # Clear existing if requested
        if clear and not dry_run:
            count = LabResultTemplate.objects.count()
            LabResultTemplate.objects.all().delete()
            self.stdout.write(
                self.style.WARNING(f"Cleared {count} existing reference range templates")
            )

        # Load reference ranges
        created_count = 0
        updated_count = 0

        try:
            with transaction.atomic():
                for test_code, panel_data in panels_to_load.items():
                    test_name = panel_data["test_name"]
                    parameters = panel_data["parameters"]

                    self.stdout.write(f"\nProcessing {test_name} ({test_code})...")

                    for param in parameters:
                        if dry_run:
                            self.stdout.write(
                                f"  Would create: {param['parameter_code']} - {param['parameter_name']}"
                            )
                            created_count += 1
                        else:
                            # Create or update parameter
                            template, created = LabResultTemplate.objects.update_or_create(
                                test_code=test_code,
                                parameter_code=param["parameter_code"],
                                defaults={
                                    "test_name": test_name,
                                    "parameter_name": param["parameter_name"],
                                    "unit": param["unit"],
                                    "display_order": param["display_order"],
                                    "reference_ranges": param["reference_ranges"],
                                    "critical_low": param["critical_low"],
                                    "critical_high": param["critical_high"],
                                    "is_active": True,
                                },
                            )

                            if created:
                                created_count += 1
                                self.stdout.write(
                                    self.style.SUCCESS(
                                        f"  ✓ Created: {param['parameter_code']} - {param['parameter_name']}"
                                    )
                                )
                            else:
                                updated_count += 1
                                self.stdout.write(
                                    f"  ↻ Updated: {param['parameter_code']} - {param['parameter_name']}"
                                )

                if dry_run:
                    # Rollback transaction in dry-run mode
                    transaction.set_rollback(True)

        except Exception as e:
            if not dry_run:
                logger.exception("Error loading reference ranges")
                raise CommandError(f"Failed to load reference ranges: {e}") from e

        # Summary
        self.stdout.write("\n" + "=" * 60)
        if dry_run:
            self.stdout.write(
                self.style.WARNING(f"DRY RUN: Would create {created_count} reference ranges")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully loaded {created_count} new + {updated_count} updated = "
                    f"{created_count + updated_count} total reference ranges"
                )
            )
        self.stdout.write("=" * 60)
