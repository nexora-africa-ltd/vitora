# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant procedure indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        (
            "procedures",
            "0010_rename_procedures_e_request__f43bc4_idx_procedures__request_f45ce2_idx_and_more",
        ),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="externalprocedureorderrequest",
            name="procedures__request_f45ce2_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="procedurecatalog",
            name="procedures__code_0a662c_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="procedureorder",
            name="procedures__order_n_c967a4_idx",
        ),
    ]
