from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("licensing", "0004_phase4_phase5_distribution_hardening"),
    ]

    operations = [
        migrations.AddField(
            model_name="installation",
            name="eula_accepted_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When the Hub EULA was accepted during activation.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="eula_version",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Version of the EULA accepted during activation.",
                max_length=32,
            ),
        ),
    ]
