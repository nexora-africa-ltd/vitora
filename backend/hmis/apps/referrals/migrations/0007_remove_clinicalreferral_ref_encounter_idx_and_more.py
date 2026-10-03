# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant referral indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("referrals", "0006_clinicalreferral_origin_hub_id_and_more"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="clinicalreferral",
            name="ref_encounter_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="clinicalreferral",
            name="ref_referred_by_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="clinicalreferral",
            name="ref_number_idx",
        ),
    ]
