# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Make procedure catalogue codes unique within each facility.

This migration is applied with ``python manage.py migrate``. It removes the
legacy global uniqueness constraint and adds a portable composite constraint.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    """Scope procedure catalog codes to their owning facility."""

    dependencies = [
        ("procedures", "0012_procedure_catalog_terminology_provenance"),
    ]

    operations = [
        migrations.AlterField(
            model_name="procedurecatalog",
            name="code",
            field=models.CharField(
                help_text="Internal procedure code, unique within the facility (e.g., PROC-001)",
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name="procedurecatalog",
            constraint=models.UniqueConstraint(
                fields=("facility", "code"),
                name="unique_procedure_catalog_code_per_facility",
            ),
        ),
    ]
