# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add ATR actual transfused volume and optional Blood Bank unit linkage for transfusions.

Usage:
- Applied automatically via `python manage.py migrate`.

Inputs:
- No CLI arguments.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("blood_bank", "0004_blooddonor_origin_hub_id_blooddonor_origin_local_id_and_more"),
        ("inpatient", "0053_add_hdu_nbu_ward_types"),
    ]

    operations = [
        migrations.AddField(
            model_name="adversetransfusionreaction",
            name="volume_transfused_ml",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Actual volume transfused before/at reaction (mL)",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="bloodtransfusionobservation",
            name="blood_bank_unit",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional linked Blood Bank unit record",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="inpatient_transfusions",
                to="blood_bank.bloodunit",
            ),
        ),
    ]
