from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0044_remove_testcatalog_sha_claimable"),
    ]

    operations = [
        migrations.AddField(
            model_name="diagnosticreport",
            name="supersedes",
            field=models.ForeignKey(
                blank=True,
                help_text="Earlier report superseded by this report revision",
                null=True,
                on_delete=models.PROTECT,
                related_name="superseding_reports",
                to="laboratory.diagnosticreport",
            ),
        ),
        migrations.AddIndex(
            model_name="diagnosticreport",
            index=models.Index(fields=["supersedes"], name="lab_diag_supersedes_idx"),
        ),
    ]
