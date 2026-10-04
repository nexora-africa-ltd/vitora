# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant social-work indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("social_work", "0004_historicalsocialworkreferral_origin_hub_id_and_more"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="casenote",
            name="social_work_case_id_b7765e_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="casenote",
            name="social_work_author__1a07e1_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="socialworkcase",
            name="social_work_case_nu_8a314a_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="socialworkcase",
            name="social_work_patient_57a641_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="socialworkcase",
            name="social_work_assigne_4cc1bd_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="socialworkintervention",
            name="social_work_case_id_73e191_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="socialworkreferral",
            name="social_work_referra_9e6aac_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="socialworkreferral",
            name="social_work_patient_9a98fe_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="socialworkreferral",
            name="social_work_assigne_527b9e_idx",
        ),
    ]
