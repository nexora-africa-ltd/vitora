from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0065_shaclaim_dha_discharge_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="facilitybillingconfig",
            name="hide_capitation_interventions",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When enabled, intervention lookups for this facility hide CAPITATION "
                    "codes unless explicitly requested via payment_mechanism."
                ),
            ),
        ),
    ]
