# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0096_emergency_access_scope_mode_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="auditlog",
            name="hash_algorithm",
            field=models.CharField(
                blank=True,
                choices=[("SHA256", "SHA-256"), ("HMAC_SHA256", "HMAC-SHA256")],
                db_index=True,
                help_text="Hash algorithm used for this entry",
                max_length=20,
                null=True,
            ),
        ),
    ]
