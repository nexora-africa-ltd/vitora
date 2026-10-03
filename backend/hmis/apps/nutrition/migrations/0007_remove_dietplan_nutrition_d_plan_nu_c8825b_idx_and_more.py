# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant nutrition indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("nutrition", "0006_remove_historicalnutritionconsultation_sha_claimable"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="dietplan",
            name="nutrition_d_plan_nu_c8825b_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="nutritionconsultation",
            name="nutrition_n_consult_65ebc7_idx",
        ),
    ]
