from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("mch", "0004_ancvisit_clinic_visit_and_more"),
        ("inpatient", "0020_temperaturereading_fluid_intake_ml_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="admission",
            name="mch_registration",
            field=models.ForeignKey(
                blank=True,
                help_text="Pregnancy registration linked to this maternity admission",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="admissions",
                to="mch.mchregistration",
            ),
        ),
    ]
