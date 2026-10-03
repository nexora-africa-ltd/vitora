# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove a redundant insurance index with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("insurance", "0010_alter_insurancevisitauthorization_options_and_more"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="insuranceclaim",
            name="insurance_i_claim_n_de6fe8_idx",
        ),
    ]
