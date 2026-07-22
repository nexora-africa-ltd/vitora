from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0063_invoice_payer_type_consistency"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoiceitem",
            name="is_preview_materialized",
            field=models.BooleanField(
                default=False,
                help_text="True when this line is auto-materialized from DHA preview data",
            ),
        ),
        migrations.AddField(
            model_name="shaclaimitem",
            name="is_preview_line",
            field=models.BooleanField(
                default=False,
                help_text="True when this claim line originates from DHA preview apply",
            ),
        ),
    ]
