from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inpatient", "0021_admission_mch_registration"),
        ("mch", "0005_delivery_maternity_links"),
    ]

    operations = [
        migrations.AddField(
            model_name="pncvisit",
            name="admission",
            field=models.ForeignKey(
                blank=True,
                help_text="Linked postpartum admission, if this PNC visit follows inpatient care",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pnc_visits",
                to="inpatient.admission",
            ),
        ),
        migrations.AddField(
            model_name="pncvisit",
            name="discharge",
            field=models.ForeignKey(
                blank=True,
                help_text="Linked inpatient discharge that this PNC follow-up references",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pnc_visits",
                to="inpatient.discharge",
            ),
        ),
        migrations.AddField(
            model_name="historicalpncvisit",
            name="admission",
            field=models.ForeignKey(
                blank=True,
                db_constraint=False,
                help_text="Linked postpartum admission, if this PNC visit follows inpatient care",
                null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name="+",
                to="inpatient.admission",
            ),
        ),
        migrations.AddField(
            model_name="historicalpncvisit",
            name="discharge",
            field=models.ForeignKey(
                blank=True,
                db_constraint=False,
                help_text="Linked inpatient discharge that this PNC follow-up references",
                null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name="+",
                to="inpatient.discharge",
            ),
        ),
    ]