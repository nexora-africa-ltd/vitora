# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Align IDSR submission-attempt tenant fields with FacilityScopedModel.

Applied by Django migrations; no command-line arguments are supported.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0105_terminologyconceptcache_terminologybinding"),
        ("surveillance", "0016_idsr_submission_attempt"),
    ]

    operations = [
        migrations.RenameIndex(
            model_name="idsrsubmissionattempt",
            new_name="surveillanc_status_784cfb_idx",
            old_name="surveillanc_status_70d2dc_idx",
        ),
        migrations.AddField(
            model_name="idsrsubmissionattempt",
            name="origin_hub_id",
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text="Hub ID where this record was originally created (null = cloud-created).",
                max_length=100,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="idsrsubmissionattempt",
            name="origin_local_id",
            field=models.BigIntegerField(
                blank=True,
                db_index=True,
                help_text="Original PK on the source hub (for dedup on cloud receipt).",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="idsrsubmissionattempt",
            name="facility",
            field=models.ForeignKey(
                blank=True,
                help_text="Facility (branch) where this record was created.",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="%(app_label)s_%(class)s_set",
                to="core.facility",
            ),
        ),
        migrations.AlterField(
            model_name="idsrsubmissionattempt",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Owning organization (tenant).",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="%(app_label)s_%(class)s_set",
                to="core.organization",
            ),
        ),
    ]
