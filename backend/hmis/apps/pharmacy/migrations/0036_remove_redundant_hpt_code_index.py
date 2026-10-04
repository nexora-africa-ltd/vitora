# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove the duplicate Drug.hpt_code index without blocking writes.

This migration retains the field-level db_index created for hpt_code and drops
the redundant Meta.indexes copy. Run with Django migrations; no arguments.
"""

from django.db import migrations

from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    """Drop the redundant HPT code index while preserving model state."""

    atomic = False

    dependencies = [
        ("pharmacy", "0035_stock_alert_digest"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="drug",
            name="pharmacy_dr_hpt_cod_024b45_idx",
        ),
    ]
