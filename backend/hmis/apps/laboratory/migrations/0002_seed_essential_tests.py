"""
Data migration to seed essential Kenya laboratory tests.
"""

from decimal import Decimal

from django.conf import settings
from django.db import migrations


def seed_essential_tests(apps, schema_editor):
    """Seed essential laboratory tests for Kenyan healthcare facilities."""
    # Skip seeding in test environment (in-memory database)
    db_name = settings.DATABASES['default']['NAME']
    if db_name == ':memory:':
        return

    TestCatalog = apps.get_model("laboratory", "TestCatalog")

    essential_tests = [
        # Hematology
        {
            "code": "CBC",
            "name": "Complete Blood Count",
            "short_name": "CBC",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "PANEL",
            "cost": Decimal("800.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "HB",
            "name": "Hemoglobin",
            "short_name": "Hb",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "g/dL",
            "normal_range_male": "13.0-17.0",
            "normal_range_female": "12.0-15.0",
            "normal_range_child": "11.0-14.0",
            "cost": Decimal("200.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 1,
        },
        {
            "code": "ESR",
            "name": "Erythrocyte Sedimentation Rate",
            "short_name": "ESR",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "mm/hr",
            "normal_range_male": "0-15",
            "normal_range_female": "0-20",
            "cost": Decimal("300.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 1,
        },
        {
            "code": "BG",
            "name": "Blood Grouping & Rh",
            "short_name": "Blood Group",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "TEXT",
            "cost": Decimal("500.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 1,
        },
        
        # Clinical Chemistry
        {
            "code": "RBS",
            "name": "Random Blood Sugar",
            "short_name": "RBS",
            "category": "CHEMISTRY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "mmol/L",
            "normal_range_male": "3.9-7.8",
            "normal_range_female": "3.9-7.8",
            "cost": Decimal("150.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 1,
        },
        {
            "code": "FBS",
            "name": "Fasting Blood Sugar",
            "short_name": "FBS",
            "category": "CHEMISTRY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "mmol/L",
            "normal_range_male": "3.9-5.6",
            "normal_range_female": "3.9-5.6",
            "cost": Decimal("200.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "requires_fasting": True,
            "turnaround_hours": 1,
        },
        {
            "code": "CREA",
            "name": "Creatinine",
            "short_name": "Creatinine",
            "category": "CHEMISTRY",
            "specimen_type": "SERUM",
            "result_type": "NUMERIC",
            "result_unit": "μmol/L",
            "normal_range_male": "62-106",
            "normal_range_female": "44-80",
            "cost": Decimal("400.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 4,
        },
        
        # Serology
        {
            "code": "HIV",
            "name": "HIV 1&2 Antibody",
            "short_name": "HIV Test",
            "category": "SEROLOGY",
            "specimen_type": "BLOOD",
            "result_type": "OPTIONS",
            "result_options": ["Negative", "Positive", "Indeterminate"],
            "cost": Decimal("500.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 1,
        },
        {
            "code": "HBSAG",
            "name": "Hepatitis B Surface Antigen",
            "short_name": "HBsAg",
            "category": "SEROLOGY",
            "specimen_type": "SERUM",
            "result_type": "OPTIONS",
            "result_options": ["Negative", "Positive"],
            "cost": Decimal("600.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        
        # Parasitology
        {
            "code": "MPS",
            "name": "Malaria Parasites (Microscopy)",
            "short_name": "Malaria Test",
            "category": "PARASITOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "TEXT",
            "cost": Decimal("300.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 1,
        },
        {
            "code": "MRDT",
            "name": "Malaria RDT",
            "short_name": "mRDT",
            "category": "PARASITOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "OPTIONS",
            "result_options": ["Negative", "Positive"],
            "cost": Decimal("200.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 0.25,  # 15 minutes
        },
        {
            "code": "STOOL",
            "name": "Stool Examination",
            "short_name": "Stool Exam",
            "category": "PARASITOLOGY",
            "specimen_type": "STOOL",
            "result_type": "TEXT",
            "cost": Decimal("350.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 4,
        },
        
        # Urinalysis
        {
            "code": "UA",
            "name": "Urinalysis",
            "short_name": "Urinalysis",
            "category": "URINALYSIS",
            "specimen_type": "URINE",
            "result_type": "TEXT",
            "cost": Decimal("250.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 1,
        },
        {
            "code": "UC",
            "name": "Urine Culture",
            "short_name": "Urine C/S",
            "category": "MICROBIOLOGY",
            "specimen_type": "URINE",
            "result_type": "TEXT",
            "cost": Decimal("800.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 48,
        },
        
        # Immunology (often external)
        {
            "code": "CD4",
            "name": "CD4 Count",
            "short_name": "CD4",
            "category": "IMMUNOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "cells/μL",
            "normal_range_male": "500-1500",
            "normal_range_female": "500-1500",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "available_in_house": False,
            "external_lab_partner": "KEMRI",
            "turnaround_hours": 72,
        },
        {
            "code": "VL",
            "name": "Viral Load",
            "short_name": "Viral Load",
            "category": "MOLECULAR",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "copies/mL",
            "cost": Decimal("2000.00"),
            "sha_claimable": True,
            "available_in_house": False,
            "external_lab_partner": "KEMRI",
            "turnaround_hours": 120,
        },
    ]
    
    for test_data in essential_tests:
        TestCatalog.objects.get_or_create(
            code=test_data["code"],
            defaults=test_data
        )


def reverse_seed(apps, schema_editor):
    """Remove seeded tests."""
    TestCatalog = apps.get_model("laboratory", "TestCatalog")
    test_codes = [
        "CBC", "HB", "ESR", "BG", "RBS", "FBS", "CREA", 
        "HIV", "HBSAG", "MPS", "MRDT", "STOOL", "UA", 
        "UC", "CD4", "VL"
    ]
    TestCatalog.objects.filter(code__in=test_codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('laboratory', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_essential_tests, reverse_seed),
    ]
