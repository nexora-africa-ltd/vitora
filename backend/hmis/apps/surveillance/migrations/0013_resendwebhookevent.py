# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Persist Resend/Svix webhook event IDs to prevent replayed delivery updates.

This migration is applied with `python manage.py migrate`.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("surveillance", "0012_countynotificationdelivery_delivered_at_and_more")]

    operations = [
        migrations.CreateModel(
            name="ResendWebhookEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_id", models.CharField(max_length=255, unique=True)),
                ("received_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"indexes": [models.Index(fields=["received_at"], name="surveillanc_receive_aa7f47_idx")]},
        )
    ]
