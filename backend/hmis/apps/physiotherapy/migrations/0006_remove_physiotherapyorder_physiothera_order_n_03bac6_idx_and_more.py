# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant physiotherapy indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("physiotherapy", "0005_remove_physiotherapytreatmenttype_sha_claimable"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="physiotherapyorder",
            name="physiothera_order_n_03bac6_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="physiotherapyorder",
            name="physiothera_patient_52dbfe_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="physiotherapyorder",
            name="physiothera_assigne_909473_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="physiotherapysession",
            name="physiothera_order_i_998a14_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="physiotherapysession",
            name="physiothera_therapi_06df1c_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="physiotherapytreatmenttype",
            name="physiothera_code_9b16b6_idx",
        ),
    ]
