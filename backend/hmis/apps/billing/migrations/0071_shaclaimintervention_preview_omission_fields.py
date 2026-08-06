from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0070_invoiceitem_inpatient_consumable_usage"),
    ]

    operations = [
        migrations.AddField(
            model_name="shaclaimintervention",
            name="auto_retired_by_omission",
            field=models.BooleanField(
                default=False,
                help_text="True when intervention was soft-retired after repeated omission from preview",
            ),
        ),
        migrations.AddField(
            model_name="shaclaimintervention",
            name="last_seen_in_preview_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Last time this intervention code appeared in DHA preview payload",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="shaclaimintervention",
            name="preview_missing_streak",
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text="Consecutive preview reconciliations where this intervention code was absent",
            ),
        ),
    ]
