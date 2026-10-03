# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant counselling indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("counselling", "0005_remove_counsellingtype_sha_claimable"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="counsellingreferral",
            name="counselling_referra_e6506e_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="counsellingsession",
            name="counselling_session_7fbf5f_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="counsellingtype",
            name="counselling_code_97f636_idx",
        ),
    ]
