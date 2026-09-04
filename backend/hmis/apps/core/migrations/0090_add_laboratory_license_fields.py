# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add laboratory regulator licence fields to facilities.

What this file is for:
- Separates standalone laboratory licences from DHA registry cache fields.

How to use it:
- Applied automatically with `python manage.py migrate`.

Supported inputs/args:
- `python manage.py migrate` (no custom arguments).
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0089_facility_dha_license_issue_date")]

    operations = [
        migrations.AddField(
            model_name="facility",
            name="laboratory_license_expiry",
            field=models.DateField(blank=True, help_text="Laboratory licence expiry date.", null=True),
        ),
        migrations.AddField(
            model_name="facility",
            name="laboratory_license_issue_date",
            field=models.DateField(blank=True, help_text="Laboratory licence issue date.", null=True),
        ),
        migrations.AddField(
            model_name="facility",
            name="laboratory_license_issuer",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Laboratory regulator or authority that issued the licence.",
                max_length=100,
            ),
        ),
        migrations.AddField(
            model_name="facility",
            name="laboratory_license_number",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Laboratory licence number issued by the laboratory regulator.",
                max_length=100,
            ),
        ),
    ]
