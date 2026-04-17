import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0027_encrypt_mpesa_credentials"),
        ("core", "0040_add_has_inventory_to_facility"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentpoint",
            name="facility",
            field=models.ForeignKey(
                blank=True,
                help_text="Facility this payment point belongs to.",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="payment_points",
                to="core.facility",
            ),
        ),
        migrations.AddField(
            model_name="paymentpoint",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Organization (auto-set from facility).",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="payment_points",
                to="core.organization",
            ),
        ),
    ]
