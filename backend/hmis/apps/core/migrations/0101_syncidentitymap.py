# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Persist source-node to local-primary-key mappings for offline sync.

Applied by: python manage.py migrate
Inputs: no runtime arguments; creates the core SyncIdentityMap table.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0100_remove_auditlog_core_auditl_sequenc_928bf7_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="SyncIdentityMap",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("source_node", models.CharField(max_length=160)),
                ("model_label", models.CharField(max_length=100)),
                ("remote_record_id", models.CharField(max_length=128)),
                ("local_record_id", models.BigIntegerField(db_index=True)),
            ],
            options={
                "verbose_name": "Sync Identity Map",
                "verbose_name_plural": "Sync Identity Maps",
            },
        ),
        migrations.AddConstraint(
            model_name="syncidentitymap",
            constraint=models.UniqueConstraint(
                fields=("source_node", "model_label", "remote_record_id"),
                name="unique_sync_identity_source_record",
            ),
        ),
        migrations.AddIndex(
            model_name="syncidentitymap",
            index=models.Index(fields=["model_label", "local_record_id"], name="core_syncid_model_l_4ce0d0_idx"),
        ),
    ]
