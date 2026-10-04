# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove a redundant clinical-template index with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("clinical_templates", "0002_add_template_snapshot"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="clinicaltemplatesnapshot",
            name="clinical_te_encount_e6ff28_idx",
        ),
    ]
