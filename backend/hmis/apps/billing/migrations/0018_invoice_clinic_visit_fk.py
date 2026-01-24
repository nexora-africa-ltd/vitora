from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("clinics", "0003_alter_clinicvisit_encounter"),
        ("billing", "0017_proforma_invoice_support"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="clinic_visit",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="invoices",
                to="clinics.clinicvisit",
            ),
        ),
    ]
