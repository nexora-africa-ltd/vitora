# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Enforce the minimum seven-year audit-record retention policy.

Applied by: python manage.py migrate
Inputs: no runtime arguments; normalizes legacy organization settings below seven years
and adds a database constraint that prevents future reductions below the regulatory minimum.
"""

from django.core.validators import MinValueValidator
from django.db import migrations, models


def normalize_legacy_retention_periods(apps, schema_editor):
    """Raise legacy organization retention settings to the mandatory minimum."""
    Organization = apps.get_model("core", "Organization")
    Organization.objects.filter(data_retention_years__lt=7).update(data_retention_years=7)


class Migration(migrations.Migration):
    dependencies = [("core", "0108_configurable_mfa_requirements")]

    operations = [
        migrations.RunPython(normalize_legacy_retention_periods, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="organization",
            name="data_retention_years",
            field=models.PositiveIntegerField(
                default=7,
                help_text="Minimum data retention period in years (Kenya DPA default: 7).",
                validators=[
                    MinValueValidator(
                        7, message="Audit records must be retained for at least 7 years."
                    )
                ],
            ),
        ),
        migrations.AddConstraint(
            model_name="organization",
            constraint=models.CheckConstraint(
                condition=models.Q(data_retention_years__gte=7),
                name="organization_audit_retention_minimum_seven_years",
            ),
        ),
    ]
