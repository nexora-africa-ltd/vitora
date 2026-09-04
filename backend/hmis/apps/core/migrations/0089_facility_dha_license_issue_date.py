# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add facility license issue date cache field.

What this file is for:
- Adds `Facility.dha_license_issue_date` for LIS onboarding identity completeness.

How to use it:
- Applied automatically via Django migrations.

Supported inputs/args:
- `python manage.py migrate` (no custom args).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0088_expand_subscription_tiers_for_standalone_plans"),
    ]

    operations = [
        migrations.AddField(
            model_name="facility",
            name="dha_license_issue_date",
            field=models.CharField(
                blank=True,
                default="",
                help_text="License issue date string from DHA.",
                max_length=30,
            ),
        ),
    ]
