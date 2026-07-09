# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0073_add_workstation_id_to_facility"),
    ]

    operations = [
        migrations.AddField(
            model_name="facility",
            name="has_procedures",
            field=models.BooleanField(
                default=False,
                help_text="Clinical procedures / treatment room capability at this facility.",
            ),
        ),
        migrations.AddField(
            model_name="facility",
            name="has_analytics",
            field=models.BooleanField(
                default=False,
                help_text="Analytics and BI dashboards enabled at this facility (requires plan custom_reports feature).",
            ),
        ),
    ]
