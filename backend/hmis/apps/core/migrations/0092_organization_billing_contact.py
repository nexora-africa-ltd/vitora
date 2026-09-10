# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add tenant-managed organization billing contact metadata.

Apply with: python manage.py migrate
Inputs: no command arguments; values are updated through billing-contact API.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0091_subscription_period")]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="billing_contact_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="organization",
            name="billing_kra_pin",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
    ]
