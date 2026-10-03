# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove the duplicate SickNote.encounter index without blocking writes.

Django automatically indexes ForeignKey fields. Run with Django migrations; no
arguments are supported.
"""

from django.db import migrations

from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    """Drop the Meta index duplicated by Django's ForeignKey index."""

    atomic = False

    dependencies = [
        ("sick_notes", "0002_historicalsicknote_origin_hub_id_and_more"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="sicknote",
            name="sn_encounter_idx",
        ),
    ]
