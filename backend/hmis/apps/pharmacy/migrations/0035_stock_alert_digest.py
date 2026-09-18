# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Persist pharmacy stock digest delivery state and its facility interval.

Applied by Django migrations; no arguments or environment variables are used.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("pharmacy", "0034_move_lab_alert_settings_to_laboratory")]

    operations = [
        migrations.AddField(
            model_name="alertsettings",
            name="stock_alert_digest_minutes",
            field=models.PositiveSmallIntegerField(
                default=15,
                help_text="Minutes to coalesce pharmacy stock alerts into one email digest.",
            ),
        ),
        migrations.AddField(
            model_name="stockalert",
            name="stock_digest_sent_at",
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text="When this stock alert was included in a facility email digest.",
                null=True,
            ),
        ),
    ]
