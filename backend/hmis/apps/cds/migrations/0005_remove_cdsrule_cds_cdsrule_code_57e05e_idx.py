# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove a redundant CDS index with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("cds", "0004_cdsalert_origin_hub_id_cdsalert_origin_local_id"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="cdsrule",
            name="cds_cdsrule_code_57e05e_idx",
        ),
    ]
