# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant patient indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("patients", "0029_patient_organization_hmac_unique"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="patient",
            name="patients_pa_mrn_d0102f_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="patient",
            name="patients_pa_cr_numb_cb5244_idx",
        ),
    ]
