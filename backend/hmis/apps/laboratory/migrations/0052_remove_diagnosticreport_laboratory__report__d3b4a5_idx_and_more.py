# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant laboratory indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("laboratory", "0051_labworkflowsettings_auto_create_standalone_report"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="diagnosticreport",
            name="laboratory__report__d3b4a5_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="diagnosticreport",
            name="laboratory__lab_ord_065e23_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="diagnosticreport",
            name="laboratory__superse_0a845b_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="externalorderrequest",
            name="laboratory__message_48769f_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="externalorderrequest",
            name="laboratory__placer__a82508_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="externalorderrequest",
            name="laboratory__trace_i_b91116_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="externalorderrequest",
            name="laboratory__idempot_e5f0d1_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="inboundingestionevent",
            name="laboratory__idempot_58a3a5_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="inboundingestionevent",
            name="laboratory__source__000d0b_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="inboundingestionevent",
            name="laboratory__trace_i_639e8d_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="instrument",
            name="laboratory__code_32f5c1_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="laborder",
            name="laboratory__patient_11fe5c_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="labqueue",
            name="laboratory__queue_n_95ff64_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="resultdeliverylog",
            name="laboratory__trace_i_97569e_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="specimen",
            name="laboratory__barcode_ba6eff_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="walkinpatient",
            name="laboratory__registr_415d38_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="walkinpatient",
            name="laboratory__nationa_ef1f3a_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="walkinpatient",
            name="laboratory__phone_n_dea4e6_idx",
        ),
    ]
