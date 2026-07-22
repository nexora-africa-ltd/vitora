from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0064_preview_line_flags"),
    ]

    operations = [
        migrations.AddField(
            model_name="shaclaim",
            name="dha_discharge_snapshot",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    "Compact discharge-time DHA payload snapshot (status, totals, key identifiers) "
                    "captured for audit/reporting."
                ),
            ),
        ),
    ]
