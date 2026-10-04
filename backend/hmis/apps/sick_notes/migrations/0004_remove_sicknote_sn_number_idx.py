# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove a redundant sick-note index with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("sick_notes", "0003_remove_redundant_sick_note_encounter_index"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="sicknote",
            name="sn_number_idx",
        ),
    ]
