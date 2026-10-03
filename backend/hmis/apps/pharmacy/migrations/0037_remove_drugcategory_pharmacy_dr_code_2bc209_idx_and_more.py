# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant pharmacy indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("pharmacy", "0036_remove_redundant_hpt_code_index"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="drugcategory",
            name="pharmacy_dr_code_2bc209_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="externalprescriptionrequest",
            name="pharmacy_ex_message_f51889_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="externalprescriptionrequest",
            name="pharmacy_ex_externa_2a376a_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="walkincustomer",
            name="pharmacy_wa_registr_622a26_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="walkincustomer",
            name="pharmacy_wa_nationa_75d9a0_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="walkincustomer",
            name="pharmacy_wa_phone_n_adf390_idx",
        ),
    ]
