# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove a redundant inpatient index with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("inpatient", "0058_bed_assignment_request"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="adversetransfusionreaction",
            name="inpatient_a_transfu_cae45f_idx",
        ),
    ]
