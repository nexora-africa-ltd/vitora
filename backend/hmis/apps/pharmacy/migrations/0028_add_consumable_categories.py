"""Add consumable and reagent DrugCategory entries."""

from django.db import migrations


def add_consumable_categories(apps, schema_editor):
    DrugCategory = apps.get_model("pharmacy", "DrugCategory")
    categories = [
        ("MEDICAL_SUPPLY", "Medical Supplies"),
        ("SURGICAL_CONSUMABLE", "Surgical Consumables"),
        ("REAGENT", "Lab Reagents & Test Strips"),
        ("PPE", "Personal Protective Equipment"),
        ("WOUND_CARE", "Wound Care Supplies"),
        ("DISPOSABLE", "Disposable Items"),
    ]
    for code, name in categories:
        DrugCategory.objects.get_or_create(code=code, defaults={"name": name, "is_active": True})


def remove_consumable_categories(apps, schema_editor):
    DrugCategory = apps.get_model("pharmacy", "DrugCategory")
    DrugCategory.objects.filter(
        code__in=[
            "MEDICAL_SUPPLY",
            "SURGICAL_CONSUMABLE",
            "REAGENT",
            "PPE",
            "WOUND_CARE",
            "DISPOSABLE",
        ]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0027_add_item_type_to_drug"),
    ]

    operations = [
        migrations.RunPython(add_consumable_categories, remove_consumable_categories),
    ]
