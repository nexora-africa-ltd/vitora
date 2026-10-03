# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove a redundant surveillance index with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("surveillance", "0013_resendwebhookevent"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="idsrweeklyreport",
            name="surveillanc_county__296530_idx",
        ),
    ]
