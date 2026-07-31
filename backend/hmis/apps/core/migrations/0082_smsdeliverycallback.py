# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0081_rename_core_docume_documen_918fdd_idx_core_docume_documen_e20161_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="SMSDeliveryCallback",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("provider", models.CharField(db_index=True, default="africastalking", max_length=40)),
                ("provider_message_id", models.CharField(blank=True, db_index=True, default="", max_length=120)),
                ("status", models.CharField(blank=True, db_index=True, default="", max_length=80)),
                (
                    "delivery_status",
                    models.CharField(
                        choices=[
                            ("DELIVERED", "Delivered"),
                            ("FAILED", "Failed"),
                            ("PENDING", "Pending"),
                            ("UNKNOWN", "Unknown"),
                        ],
                        db_index=True,
                        default="UNKNOWN",
                        max_length=20,
                    ),
                ),
                ("phone_last4", models.CharField(blank=True, db_index=True, default="", max_length=4)),
                ("network_code", models.CharField(blank=True, default="", max_length=20)),
                ("retry_count", models.PositiveIntegerField(default=0)),
                ("failure_reason", models.TextField(blank=True, default="")),
                ("callback_payload", models.JSONField(blank=True, default=dict)),
                ("callback_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("token_valid", models.BooleanField(default=False)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
