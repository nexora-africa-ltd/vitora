# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Persist inbound sync rows until their parent identity maps are available.

Applied by: python manage.py migrate
Inputs: no runtime arguments; creates the core SyncDeferredMaterialization table.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0101_syncidentitymap")]

    operations = [
        migrations.CreateModel(
            name="SyncDeferredMaterialization",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("status", models.CharField(db_index=True, default="PENDING", max_length=12)),
                ("source_node", models.CharField(max_length=160)),
                ("model_label", models.CharField(max_length=100)),
                ("remote_record_id", models.CharField(max_length=128)),
                ("payload", models.JSONField(default=dict)),
                ("error_message", models.TextField(blank=True, default="")),
                ("retry_count", models.PositiveIntegerField(default=0)),
            ],
        ),
        migrations.AddConstraint(
            model_name="syncdeferredmaterialization",
            constraint=models.UniqueConstraint(
                fields=("source_node", "model_label", "remote_record_id"),
                name="unique_deferred_sync_source_record",
            ),
        ),
        migrations.AddIndex(
            model_name="syncdeferredmaterialization",
            index=models.Index(fields=["status", "created_at"], name="core_syncde_status_5dc100_idx"),
        ),
    ]
