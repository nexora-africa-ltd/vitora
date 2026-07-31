from django.db import migrations


RULES_BY_CODE = {
    "KE-CQM-002": {
        "type": "skilled_birth_attendance",
        "params": {
            "require_documented_attendant": True,
            "delivery_status": "COMPLETED",
            "include_outcomes": ["LIVE_BIRTH", "STILLBIRTH", "NEONATAL_DEATH"],
        },
    },
    "KE-CQM-004": {
        "type": "tb_treatment_success",
        "params": {
            "success_statuses": ["COMPLETED"],
            "success_keywords": ["cured", "treatment complete", "completed"],
            "use_outcome_reason": True,
            "require_outcome_date": True,
            "cohort_statuses": [
                "COMPLETED",
                "TRANSFERRED_OUT",
                "LOST_TO_FOLLOW_UP",
                "DECEASED",
                "SUSPENDED",
            ],
        },
    },
    "KE-CQM-007": {
        "type": "immunization_completeness",
        "params": {
            "vaccine_program": "KEPI",
            "max_patient_age_years": 5,
            "strict_due_in_period": True,
        },
    },
    "KE-CQM-009": {
        "type": "maternal_mortality_ratio",
        "params": {
            "ratio_multiplier": 100000,
            "delivery_status": "COMPLETED",
        },
    },
    "KE-CQM-010": {
        "type": "idsr_timeliness",
        "params": {
            "submission_statuses": ["SUBMITTED"],
            "include_approved": False,
            "deadline_days_after_week_end": 1,
            "require_dhis2_timestamp": True,
        },
    },
}


def forward(apps, schema_editor):
    QualityMeasure = apps.get_model("quality", "QualityMeasure")
    for code, rule in RULES_BY_CODE.items():
        QualityMeasure.objects.filter(code=code, evaluation_rule__isnull=True).update(
            evaluation_rule=rule
        )


def backward(apps, schema_editor):
    QualityMeasure = apps.get_model("quality", "QualityMeasure")
    for code, rule in RULES_BY_CODE.items():
        QualityMeasure.objects.filter(code=code, evaluation_rule=rule).update(
            evaluation_rule=None
        )


class Migration(migrations.Migration):

    dependencies = [
        ("quality", "0004_benchmark_observation"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
