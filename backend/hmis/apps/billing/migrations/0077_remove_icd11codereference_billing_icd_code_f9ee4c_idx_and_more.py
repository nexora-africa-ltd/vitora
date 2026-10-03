# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant billing indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("billing", "0076_facility_scoped_service_categories"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="icd11codereference",
            name="billing_icd_code_f9ee4c_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="payment",
            name="billing_pay_payment_55e196_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="receipt",
            name="billing_rec_receipt_47a6d6_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="shaclaim",
            name="billing_sha_sha_cla_641b26_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="shamember",
            name="billing_sha_sha_num_ecf0b0_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="shamember",
            name="billing_sha_nationa_82c940_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="sharemittance",
            name="billing_sha_bank_re_470e9d_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="shatariff",
            name="billing_sha_code_75a5e8_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="supplierbill",
            name="billing_sup_supplie_2887a5_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="supplierpayment",
            name="billing_sup_bill_id_99bdcb_idx",
        ),
    ]
