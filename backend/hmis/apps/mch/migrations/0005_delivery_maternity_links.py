from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inpatient", "0021_admission_mch_registration"),
        ("mch", "0004_ancvisit_clinic_visit_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="admission",
            field=models.ForeignKey(
                blank=True,
                help_text="Maternity admission linked to this delivery",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="deliveries",
                to="inpatient.admission",
            ),
        ),
        migrations.AddField(
            model_name="historicaldelivery",
            name="admission",
            field=models.ForeignKey(
                blank=True,
                db_constraint=False,
                help_text="Maternity admission linked to this delivery",
                null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name="+",
                to="inpatient.admission",
            ),
        ),
        migrations.AddField(
            model_name="delivery",
            name="partograph",
            field=models.OneToOneField(
                blank=True,
                help_text="Labour partograph that culminated in this delivery",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="delivery",
                to="mch.labourpartograph",
            ),
        ),
        migrations.AddField(
            model_name="historicaldelivery",
            name="partograph",
            field=models.ForeignKey(
                blank=True,
                db_constraint=False,
                help_text="Labour partograph that culminated in this delivery",
                null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name="+",
                to="mch.labourpartograph",
            ),
        ),
    ]