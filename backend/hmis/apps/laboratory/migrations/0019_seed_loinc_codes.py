"""
Data migration to seed LOINC codes on existing TestCatalog entries
and add missing ICU-critical tests (Lactate, Bilirubin, ABG).

LOINC codes are the international standard for laboratory observation
identifiers, required for FHIR R4 interoperability and used by TibaBot
ICU predictor endpoints.

Reference: https://loinc.org/
"""

import os
from decimal import Decimal

from django.conf import settings
from django.db import migrations


# ─────────────────────────────────────────────────────────────────────
# LOINC mapping for EXISTING tests (keyed by TestCatalog.code)
# ─────────────────────────────────────────────────────────────────────
LOINC_MAP: dict[str, str] = {
    # Hematology
    "CBC": "58410-2",        # CBC panel - Blood by Automated count
    "HB": "718-7",           # Hemoglobin [Mass/volume] in Blood
    "ESR": "4537-7",         # Erythrocyte sedimentation rate
    "BG": "882-1",           # ABO+Rh group [Type] in Blood
    "FBC": "57021-8",        # CBC W Auto Differential panel - Blood
    "WBC": "6690-2",         # Leukocytes [#/volume] in Blood
    "PLT": "777-3",          # Platelets [#/volume] in Blood
    # Clinical Chemistry
    "RBS": "2345-7",         # Glucose [Mass/volume] in Serum or Plasma
    "FBS": "1558-6",         # Fasting glucose [Mass/volume] in Serum or Plasma
    "CREA": "2160-0",        # Creatinine [Mass/volume] in Serum or Plasma
    "CR": "2160-0",          # Creatinine (duplicate code) — same LOINC
    "BUN": "3094-0",         # Urea nitrogen [Mass/volume] in Serum or Plasma
    "K": "2823-3",           # Potassium [Moles/volume] in Serum or Plasma
    "NA": "2951-2",          # Sodium [Moles/volume] in Serum or Plasma
    "HBA1C": "4548-4",       # Hemoglobin A1c/Hemoglobin.total in Blood
    "TROPI": "10839-9",      # Troponin I.cardiac [Mass/volume] in Serum or Plasma
    "CRP": "1988-5",         # C reactive protein [Mass/volume] in Serum or Plasma
    "EGFR": "48642-3",       # Glomerular filtration rate/1.73 sq M
    # Serology
    "HIV": "75622-1",        # HIV 1 and 2 tests - Meaningful Use set
    "HBSAG": "5196-1",       # Hepatitis B virus surface Ag [Presence] in Serum
    "WIDAL": "5408-0",       # Salmonella sp Ab [Titer] in Serum (closest available)
    # Parasitology
    "MPS": "51587-4",        # Plasmodium sp [Presence] in Blood by Light microscopy
    "MRDT": "70569-9",       # Plasmodium sp Ag [Presence] in Blood by Rapid immunoassay
    "STOOL": "10701-1",      # Ova and parasites identified in Stool
    # Urinalysis / Microbiology
    "UA": "24357-6",         # Urinalysis macro (dipstick) panel
    "UC": "630-4",           # Bacteria identified in Urine by Culture
    "BCULTURE": "600-7",     # Bacteria identified in Blood by Culture
    # Immunology / Molecular
    "CD4": "24467-3",        # CD4 cells [#/volume] in Blood
    "VL": "25836-8",         # HIV 1 RNA [#/volume] (viral load)
}


# ─────────────────────────────────────────────────────────────────────
# NEW tests to create (ICU-critical tests missing from the catalog)
# ─────────────────────────────────────────────────────────────────────
NEW_TESTS = [
    {
        "code": "LACT",
        "name": "Lactate (Lactic Acid)",
        "short_name": "Lactate",
        "loinc_code": "2524-7",
        "category": "CHEMISTRY",
        "specimen_type": "BLOOD",
        "result_type": "NUMERIC",
        "result_unit": "mmol/L",
        "normal_range_male": "0.5-2.2",
        "normal_range_female": "0.5-2.2",
        "normal_range_child": "0.5-2.2",
        "cost": Decimal("600.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 1,
    },
    {
        "code": "TBIL",
        "name": "Total Bilirubin",
        "short_name": "T.Bil",
        "loinc_code": "1975-2",
        "category": "CHEMISTRY",
        "specimen_type": "SERUM",
        "result_type": "NUMERIC",
        "result_unit": "μmol/L",
        "normal_range_male": "3.4-20.5",
        "normal_range_female": "3.4-20.5",
        "normal_range_child": "3.4-20.5",
        "cost": Decimal("350.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 4,
    },
    {
        "code": "ALT",
        "name": "Alanine Aminotransferase",
        "short_name": "ALT",
        "loinc_code": "1742-6",
        "category": "CHEMISTRY",
        "specimen_type": "SERUM",
        "result_type": "NUMERIC",
        "result_unit": "U/L",
        "normal_range_male": "7-56",
        "normal_range_female": "7-45",
        "cost": Decimal("350.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 4,
    },
    {
        "code": "AST",
        "name": "Aspartate Aminotransferase",
        "short_name": "AST",
        "loinc_code": "1920-8",
        "category": "CHEMISTRY",
        "specimen_type": "SERUM",
        "result_type": "NUMERIC",
        "result_unit": "U/L",
        "normal_range_male": "10-40",
        "normal_range_female": "10-35",
        "cost": Decimal("350.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 4,
    },
    {
        "code": "LDH",
        "name": "Lactate Dehydrogenase",
        "short_name": "LDH",
        "loinc_code": "2532-0",
        "category": "CHEMISTRY",
        "specimen_type": "SERUM",
        "result_type": "NUMERIC",
        "result_unit": "U/L",
        "normal_range_male": "140-280",
        "normal_range_female": "140-280",
        "cost": Decimal("500.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 4,
    },
    {
        "code": "ABG",
        "name": "Arterial Blood Gas",
        "short_name": "ABG",
        "loinc_code": "24336-0",
        "category": "CHEMISTRY",
        "specimen_type": "BLOOD",
        "result_type": "PANEL",
        "cost": Decimal("1200.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 1,
        "special_instructions": "Arterial sample required. Analyse within 15 minutes of collection.",
    },
    {
        "code": "PT_INR",
        "name": "Prothrombin Time / INR",
        "short_name": "PT/INR",
        "loinc_code": "5902-2",
        "category": "HEMATOLOGY",
        "specimen_type": "BLOOD",
        "result_type": "NUMERIC",
        "result_unit": "seconds",
        "normal_range_male": "11-13.5",
        "normal_range_female": "11-13.5",
        "cost": Decimal("600.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 2,
    },
    {
        "code": "APTT",
        "name": "Activated Partial Thromboplastin Time",
        "short_name": "aPTT",
        "loinc_code": "3173-2",
        "category": "HEMATOLOGY",
        "specimen_type": "BLOOD",
        "result_type": "NUMERIC",
        "result_unit": "seconds",
        "normal_range_male": "25-35",
        "normal_range_female": "25-35",
        "cost": Decimal("500.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 2,
    },
    {
        "code": "DDIMER",
        "name": "D-Dimer",
        "short_name": "D-Dimer",
        "loinc_code": "48066-5",
        "category": "HEMATOLOGY",
        "specimen_type": "BLOOD",
        "result_type": "NUMERIC",
        "result_unit": "mg/L FEU",
        "normal_range_male": "0-0.5",
        "normal_range_female": "0-0.5",
        "cost": Decimal("1500.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 2,
    },
    {
        "code": "PROCAL",
        "name": "Procalcitonin",
        "short_name": "PCT",
        "loinc_code": "75241-0",
        "category": "CHEMISTRY",
        "specimen_type": "BLOOD",
        "result_type": "NUMERIC",
        "result_unit": "ng/mL",
        "normal_range_male": "0-0.1",
        "normal_range_female": "0-0.1",
        "cost": Decimal("2500.00"),
        "sha_claimable": True,
        "available_in_house": False,
        "external_lab_partner": "Lancet",
        "turnaround_hours": 24,
    },
    {
        "code": "FIBR",
        "name": "Fibrinogen",
        "short_name": "Fibrinogen",
        "loinc_code": "3255-7",
        "category": "HEMATOLOGY",
        "specimen_type": "BLOOD",
        "result_type": "NUMERIC",
        "result_unit": "g/L",
        "normal_range_male": "2.0-4.0",
        "normal_range_female": "2.0-4.0",
        "cost": Decimal("800.00"),
        "sha_claimable": True,
        "available_in_house": True,
        "turnaround_hours": 4,
    },
]


def seed_loinc_codes(apps, schema_editor):
    """Update existing tests with LOINC codes and create missing tests."""
    if os.getenv("DJANGO_ENV") == "test" or str(
        getattr(settings, "SETTINGS_MODULE", "")
    ).endswith(".test"):
        return

    db_name = settings.DATABASES["default"]["NAME"]
    if db_name == ":memory:":
        return

    TestCatalog = apps.get_model("laboratory", "TestCatalog")

    # 1. Update LOINC codes on existing tests
    updated = 0
    for code, loinc in LOINC_MAP.items():
        rows = TestCatalog.objects.filter(code=code).exclude(
            loinc_code=loinc,
        ).update(loinc_code=loinc)
        updated += rows

    # 2. Create new ICU-critical tests
    created = 0
    for test_data in NEW_TESTS:
        _, was_created = TestCatalog.objects.get_or_create(
            code=test_data["code"], defaults=test_data
        )
        if was_created:
            created += 1

    if updated or created:
        print(f"  LOINC codes: {updated} tests updated, {created} new tests created")


def reverse_loinc_codes(apps, schema_editor):
    """Remove LOINC codes and delete newly-created tests."""
    TestCatalog = apps.get_model("laboratory", "TestCatalog")

    # Clear LOINC codes
    for code in LOINC_MAP:
        TestCatalog.objects.filter(code=code).update(loinc_code="")

    # Delete new tests
    new_codes = [t["code"] for t in NEW_TESTS]
    TestCatalog.objects.filter(code__in=new_codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("laboratory", "0018_multitenancy_clinical_fks"),
    ]

    operations = [
        migrations.RunPython(seed_loinc_codes, reverse_loinc_codes),
    ]
