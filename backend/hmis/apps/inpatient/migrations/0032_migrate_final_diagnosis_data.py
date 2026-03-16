"""
Data migration: Move existing Discharge.final_diagnosis into DischargeDiagnosis.

For each Discharge that has a non-empty final_diagnosis, create a
DischargeDiagnosis with role=PRIMARY containing the code and text.
"""

from django.db import migrations


def migrate_final_diagnosis_forward(apps, schema_editor):
    Discharge = apps.get_model("inpatient", "Discharge")
    DischargeDiagnosis = apps.get_model("inpatient", "DischargeDiagnosis")

    diagnoses_to_create = []
    for discharge in Discharge.objects.exclude(final_diagnosis=""):
        diagnoses_to_create.append(
            DischargeDiagnosis(
                discharge=discharge,
                role="PRIMARY",
                code=discharge.final_diagnosis,
                description=discharge.final_diagnosis_text or discharge.final_diagnosis,
            )
        )

    if diagnoses_to_create:
        DischargeDiagnosis.objects.bulk_create(diagnoses_to_create, batch_size=500)


def migrate_final_diagnosis_backward(apps, schema_editor):
    """Reverse: copy PRIMARY DischargeDiagnosis back to Discharge fields."""
    Discharge = apps.get_model("inpatient", "Discharge")
    DischargeDiagnosis = apps.get_model("inpatient", "DischargeDiagnosis")

    for dd in DischargeDiagnosis.objects.filter(role="PRIMARY"):
        Discharge.objects.filter(pk=dd.discharge_id).update(
            final_diagnosis=dd.code[:10],
            final_diagnosis_text=dd.description[:255],
        )


class Migration(migrations.Migration):
    dependencies = [
        ("inpatient", "0031_add_discharge_diagnosis_model"),
    ]

    operations = [
        migrations.RunPython(
            migrate_final_diagnosis_forward,
            migrate_final_diagnosis_backward,
        ),
    ]
