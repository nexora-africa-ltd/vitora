# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant core indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("core", "0099_organization_pii_key_version"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="auditlog",
            name="core_auditl_sequenc_928bf7_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="clinicqueuestats",
            name="idx_cqs_facility",
        ),
        ConcurrentRemoveIndex(
            model_name="documentshare",
            name="core_docume_shared__d8908b_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="emailverificationtoken",
            name="core_emailv_token_aabf9a_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="passwordresettoken",
            name="core_passwo_token_95f98a_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="pharmacyqueuestats",
            name="idx_pqs_facility",
        ),
        ConcurrentRemoveIndex(
            model_name="staffinvitation",
            name="core_staffi_token_c31a28_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="staffinvitation",
            name="core_staffi_email_h_8642c7_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="wardoccupancystats",
            name="idx_wos_facility",
        ),
    ]
