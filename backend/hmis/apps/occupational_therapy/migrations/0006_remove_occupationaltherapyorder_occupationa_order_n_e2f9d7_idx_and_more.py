# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant occupational-therapy indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("occupational_therapy", "0005_remove_ottreatmenttype_sha_claimable"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="occupationaltherapyorder",
            name="occupationa_order_n_e2f9d7_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="occupationaltherapyorder",
            name="occupationa_patient_414f9d_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="occupationaltherapyorder",
            name="occupationa_assigne_ae57ca_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="otsession",
            name="occupationa_order_i_e073ce_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="otsession",
            name="occupationa_therapi_fedd7c_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="ottreatmenttype",
            name="occupationa_code_b22a58_idx",
        ),
    ]
