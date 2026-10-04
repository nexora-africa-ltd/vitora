# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove a redundant KENHDD index with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("kenhdd", "0003_kenhddfailedrecord_facility_and_more"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="kenhdddataelement",
            name="kenhdd_kenh_element_34841c_idx",
        ),
    ]
