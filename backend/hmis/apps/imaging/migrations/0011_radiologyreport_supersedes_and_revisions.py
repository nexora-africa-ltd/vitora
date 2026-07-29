from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("imaging", "0010_remove_imagingprocedure_sha_claimable"),
    ]

    operations = [
        migrations.AlterField(
            model_name="radiologyreport",
            name="imaging_order",
            field=models.ForeignKey(
                help_text="The imaging order this report is for",
                on_delete=models.PROTECT,
                related_name="reports",
                to="imaging.imagingorder",
            ),
        ),
        migrations.AddField(
            model_name="radiologyreport",
            name="supersedes",
            field=models.ForeignKey(
                blank=True,
                help_text="Previous finalized report revision superseded by this draft/report",
                null=True,
                on_delete=models.PROTECT,
                related_name="superseding_reports",
                to="imaging.radiologyreport",
            ),
        ),
        migrations.AddIndex(
            model_name="radiologyreport",
            index=models.Index(fields=["supersedes"], name="imaging_rad_supersede_idx"),
        ),
    ]
