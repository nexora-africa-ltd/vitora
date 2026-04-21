from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("theatre", "0006_theatreconsumableallocation"),
        ("billing", "0030_facility_scoped_model_fix"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoiceitem",
            name="surgery_case",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.PROTECT,
                related_name="invoice_items",
                to="theatre.surgerycase",
            ),
        ),
        migrations.AddField(
            model_name="invoiceitem",
            name="theatre_consumable",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.PROTECT,
                related_name="invoice_items",
                to="theatre.theatreconsumable",
            ),
        ),
    ]
