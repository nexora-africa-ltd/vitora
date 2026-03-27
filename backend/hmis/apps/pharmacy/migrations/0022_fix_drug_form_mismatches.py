"""
Data migration: Fix drug form mismatches from import.

Obrex (Cough Syrup) was imported as TABLET instead of SYRUP due to
non-deterministic set ordering in the merge script.
"""

from django.db import migrations


# Generic names that contain form hints but were imported with wrong forms.
# Maps: (generic_name_substring, wrong_form) -> correct_form
FIXES = [
    {"code": "DRG-COUGHS-0001", "old_form": "TABLET", "new_form": "SYRUP"},
]


def fix_drug_forms(apps, schema_editor):
    Drug = apps.get_model("pharmacy", "Drug")
    for fix in FIXES:
        updated = Drug.objects.filter(
            code=fix["code"], form=fix["old_form"]
        ).update(form=fix["new_form"])
        if updated:
            print(f"  Fixed {fix['code']}: {fix['old_form']} -> {fix['new_form']}")


def reverse_fix(apps, schema_editor):
    Drug = apps.get_model("pharmacy", "Drug")
    for fix in FIXES:
        Drug.objects.filter(
            code=fix["code"], form=fix["new_form"]
        ).update(form=fix["old_form"])


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0021_add_dispensing_type_and_is_discharge_medication"),
    ]

    operations = [
        migrations.RunPython(fix_drug_forms, reverse_fix),
    ]
