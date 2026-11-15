# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Store notifiable-disease ICD-11 mappings as JSON arrays.

Apply with:
    poetry run python manage.py migrate

Inputs:
    No runtime arguments. Existing comma-delimited ICD-11 mappings are converted
    to JSON arrays before the column type changes.
"""

import json

from django.db import migrations, models


def convert_icd11_strings_to_arrays(apps, schema_editor):
    """Serialize legacy text mappings as JSON arrays before the field type changes."""
    NotifiableDisease = apps.get_model("surveillance", "NotifiableDisease")
    for disease in NotifiableDisease.objects.all().only("id", "icd11_codes").iterator():
        raw_codes = disease.icd11_codes
        if isinstance(raw_codes, str):
            codes = [code.strip().upper() for code in raw_codes.split(",") if code.strip()]
        elif isinstance(raw_codes, list):
            codes = [str(code).strip().upper() for code in raw_codes if str(code).strip()]
        else:
            codes = []
        disease.icd11_codes = json.dumps(list(dict.fromkeys(codes)))
        disease.save(update_fields=["icd11_codes"])


def convert_icd11_arrays_to_strings(apps, schema_editor):
    """Restore comma-delimited mappings if this migration is reversed."""
    NotifiableDisease = apps.get_model("surveillance", "NotifiableDisease")
    for disease in NotifiableDisease.objects.all().only("id", "icd11_codes").iterator():
        raw_codes = disease.icd11_codes
        if isinstance(raw_codes, str):
            try:
                parsed_codes = json.loads(raw_codes)
            except json.JSONDecodeError:
                parsed_codes = raw_codes.split(",")
        else:
            parsed_codes = raw_codes
        codes = (
            [str(code).strip().upper() for code in parsed_codes if str(code).strip()]
            if isinstance(parsed_codes, list)
            else []
        )
        disease.icd11_codes = ",".join(dict.fromkeys(codes))
        disease.save(update_fields=["icd11_codes"])


class Migration(migrations.Migration):
    dependencies = [
        ("surveillance", "0019_notifiabledisease_icd11_codes_and_more"),
    ]

    operations = [
        migrations.RunPython(convert_icd11_strings_to_arrays, convert_icd11_arrays_to_strings),
        migrations.AlterField(
            model_name="notifiabledisease",
            name="icd11_codes",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="ICD-11 MMS codes (e.g., ['1A00', '1A00.0'])",
            ),
        ),
    ]
