from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0060_invoice_public_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="shaclaim",
            name="dha_invoice_number",
            field=models.CharField(
                blank=True,
                default="",
                help_text="DHA-side invoice number from ILM preview (e.g. INV/12345/67890)",
                max_length=64,
            ),
        ),
    ]
