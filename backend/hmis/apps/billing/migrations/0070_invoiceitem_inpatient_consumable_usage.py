from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inpatient", "0053_add_hdu_nbu_ward_types"),
        ("billing", "0069_shaclaimintervention_full_metadata"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoiceitem",
            name="inpatient_consumable_usage",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.PROTECT,
                related_name="invoice_items",
                to="inpatient.inpatientconsumableusage",
            ),
        ),
    ]
