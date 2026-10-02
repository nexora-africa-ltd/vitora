# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Scope patient identification blind-index uniqueness to its organization."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0099_organization_pii_key_version"),
        ("patients", "0028_historicalallergy"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="patient",
            name="unique_patient_identification_hmac",
        ),
        migrations.AddConstraint(
            model_name="patient",
            constraint=models.UniqueConstraint(
                condition=~models.Q(identification_number_hmac=""),
                fields=("organization", "identification_type", "identification_number_hmac"),
                name="unique_patient_identification_hmac",
            ),
        ),
    ]
