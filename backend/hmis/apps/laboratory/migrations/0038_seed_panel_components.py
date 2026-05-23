"""
Data migration to seed panel components for CBC and link them.
Also ensures is_panel=True for panel-type tests.
"""

import os

from decimal import Decimal

from django.conf import settings
from django.db import migrations


def seed_panel_components(apps, schema_editor):
    """Seed component tests for panels and link via panel_components M2M."""
    # Skip in test environments
    if os.getenv("DJANGO_ENV") == "test" or str(
        getattr(settings, "SETTINGS_MODULE", "")
    ).endswith(".test"):
        return

    db_name = settings.DATABASES["default"]["NAME"]
    if db_name == ":memory:":
        return

    TestCatalog = apps.get_model("laboratory", "TestCatalog")

    # Mark existing PANEL-type tests as is_panel=True
    TestCatalog.objects.filter(result_type="PANEL", is_panel=False).update(is_panel=True)

    # CBC panel components (Full Hemogram / Complete Blood Count)
    cbc_components = [
        {
            "code": "WBC",
            "name": "White Blood Cell Count",
            "short_name": "WBC",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "x10^9/L",
            "normal_range_male": "4.0-11.0",
            "normal_range_female": "4.0-11.0",
            "normal_range_child": "5.0-13.0",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "RBC",
            "name": "Red Blood Cell Count",
            "short_name": "RBC",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "x10^12/L",
            "normal_range_male": "4.5-5.5",
            "normal_range_female": "4.0-5.0",
            "normal_range_child": "4.0-5.5",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "HGB",
            "name": "Hemoglobin",
            "short_name": "Hb",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "g/dL",
            "normal_range_male": "13.0-17.0",
            "normal_range_female": "12.0-15.0",
            "normal_range_child": "11.0-14.0",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "HCT",
            "name": "Hematocrit",
            "short_name": "HCT",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "%",
            "normal_range_male": "40-54",
            "normal_range_female": "36-48",
            "normal_range_child": "35-45",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "PLT",
            "name": "Platelet Count",
            "short_name": "PLT",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "x10^9/L",
            "normal_range_male": "150-400",
            "normal_range_female": "150-400",
            "normal_range_child": "150-400",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "MCV",
            "name": "Mean Corpuscular Volume",
            "short_name": "MCV",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "fL",
            "normal_range_male": "80-100",
            "normal_range_female": "80-100",
            "normal_range_child": "75-95",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "MCH",
            "name": "Mean Corpuscular Hemoglobin",
            "short_name": "MCH",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "pg",
            "normal_range_male": "27-33",
            "normal_range_female": "27-33",
            "normal_range_child": "25-33",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "MCHC",
            "name": "Mean Corpuscular Hemoglobin Concentration",
            "short_name": "MCHC",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "g/dL",
            "normal_range_male": "32-36",
            "normal_range_female": "32-36",
            "normal_range_child": "32-36",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "NEUT",
            "name": "Neutrophils",
            "short_name": "Neut",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "%",
            "normal_range_male": "40-70",
            "normal_range_female": "40-70",
            "normal_range_child": "30-60",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
        {
            "code": "LYMPH",
            "name": "Lymphocytes",
            "short_name": "Lymph",
            "category": "HEMATOLOGY",
            "specimen_type": "BLOOD",
            "result_type": "NUMERIC",
            "result_unit": "%",
            "normal_range_male": "20-40",
            "normal_range_female": "20-40",
            "normal_range_child": "30-50",
            "cost": Decimal("0.00"),
            "sha_claimable": True,
            "available_in_house": True,
            "turnaround_hours": 2,
        },
    ]

    # Create or get the CBC panel
    cbc_panel = TestCatalog.objects.filter(code="CBC").first()
    if not cbc_panel:
        return

    # Ensure is_panel is True
    if not cbc_panel.is_panel:
        cbc_panel.is_panel = True
        cbc_panel.save(update_fields=["is_panel"])

    # Create component tests and link to panel
    for comp_data in cbc_components:
        comp_test, _ = TestCatalog.objects.get_or_create(
            code=comp_data["code"],
            defaults=comp_data,
        )
        cbc_panel.panel_components.add(comp_test)


def reverse_seed(apps, schema_editor):
    """Remove seeded panel components."""
    TestCatalog = apps.get_model("laboratory", "TestCatalog")
    component_codes = [
        "WBC", "RBC", "HGB", "HCT", "PLT", "MCV", "MCH", "MCHC", "NEUT", "LYMPH",
    ]
    # Remove M2M links
    cbc_panel = TestCatalog.objects.filter(code="CBC").first()
    if cbc_panel:
        cbc_panel.panel_components.clear()
    # Delete component tests (only if they have no results)
    TestCatalog.objects.filter(code__in=component_codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0037_panel_parent_on_laborderitem"),
    ]

    operations = [
        migrations.RunPython(seed_panel_components, reverse_seed),
    ]
