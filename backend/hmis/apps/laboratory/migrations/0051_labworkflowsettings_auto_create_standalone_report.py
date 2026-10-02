# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add standalone diagnostic-report auto-create toggle to lab workflow settings.

What this file is for:
- Adds `auto_create_standalone_diagnostic_report_draft` to `LabWorkflowSettings`.

How to use it:
- Apply with `python manage.py migrate`.

Supported inputs/args:
- Standard Django migration runtime inputs; no standalone CLI arguments.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("laboratory", "0050_laboratory_alert_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="labworkflowsettings",
            name="auto_create_standalone_diagnostic_report_draft",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Automatically create a draft DiagnosticReport when a standalone "
                    "(walk-in) lab order reaches COMPLETED status"
                ),
            ),
        ),
    ]
