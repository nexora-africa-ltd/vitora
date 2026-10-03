# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant encounter indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("encounters", "0037_encounter_emergency_deferred_completion"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="chroniccondition",
            name="encounters__fhir_id_e9646d_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="currentmedication",
            name="encounters__fhir_id_c946b2_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="familyhistory",
            name="encounters__fhir_id_217c4e_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="icd10code",
            name="encounters__code_d529a9_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="pastsurgery",
            name="encounters__fhir_id_621e67_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="pastsurgery",
            name="encounters__patient_e4dc56_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="pregnancyobservation",
            name="encounters__fhir_id_55591b_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="socialhistoryobservation",
            name="encounters__fhir_id_118ca6_idx",
        ),
    ]
