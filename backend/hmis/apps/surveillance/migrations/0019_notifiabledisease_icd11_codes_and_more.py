# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add explicit county policy and ICD-11 mappings to the disease catalogue.

Apply with:
    poetry run python manage.py migrate

Inputs:
    No runtime arguments; existing immediate diseases are backfilled as county-notifiable.
"""

from django.db import migrations, models


def backfill_immediate_disease_county_policy(apps, schema_editor):
    """Preserve established individual-notification behavior for existing immediate diseases."""
    NotifiableDisease = apps.get_model("surveillance", "NotifiableDisease")
    NotifiableDisease.objects.filter(category="IMMEDIATE").update(
        requires_county_notification=True
    )


class Migration(migrations.Migration):

    dependencies = [
        ("surveillance", "0018_alter_countynotificationdelivery_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="notifiabledisease",
            name="icd11_codes",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Comma-separated ICD-11 MMS codes (e.g., '1A00,1A00.0')",
            ),
        ),
        migrations.AddField(
            model_name="notifiabledisease",
            name="requires_county_notification",
            field=models.BooleanField(
                default=False,
                help_text="Require individual county SMS/email notification for each case. Outbreak alerts always require county notification.",
            ),
        ),
        migrations.RunPython(
            backfill_immediate_disease_county_policy,
            migrations.RunPython.noop,
        ),
    ]
