"""
Two-step migration to make ProcedureOrder.encounter non-nullable.

Step 1: RunPython — backfill existing orders that have encounter=NULL
        by auto-creating a PROCEDURE-type Encounter for each.
Step 2: AlterField — drop NULL/blank, change on_delete to CASCADE.
"""

from django.db import migrations, models
import django.db.models.deletion


def backfill_encounters(apps, schema_editor):
    """Create PROCEDURE encounters for any procedure orders missing one."""
    ProcedureOrder = apps.get_model("procedures", "ProcedureOrder")
    Encounter = apps.get_model("encounters", "Encounter")

    orders_without_encounter = ProcedureOrder.objects.filter(encounter__isnull=True)
    for order in orders_without_encounter:
        encounter = Encounter.objects.create(
            patient=order.patient,
            encounter_type="PROCEDURE",
            chief_complaint=f"Procedure: {order.procedure.name}",
            visit_reason="SCHEDULED_PROCEDURE",
            created_by=order.ordered_by,
            organization=order.organization,
            facility=order.facility,
        )
        order.encounter = encounter
        order.save(update_fields=["encounter"])


class Migration(migrations.Migration):
    dependencies = [
        ("procedures", "0003_procedure_clinic_integration"),
        ("encounters", "0025_multitenancy_clinical_fks"),
    ]

    operations = [
        migrations.RunPython(backfill_encounters, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="procedureorder",
            name="encounter",
            field=models.ForeignKey(
                help_text="Encounter for this procedure (auto-created if not provided)",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="procedure_orders",
                to="encounters.encounter",
            ),
        ),
    ]
