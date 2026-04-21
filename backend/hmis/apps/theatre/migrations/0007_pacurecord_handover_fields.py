from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("theatre", "0006_theatreconsumableallocation"),
    ]

    operations = [
        migrations.AddField(
            model_name="pacurecord",
            name="handover_completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="pacurecord",
            name="handover_given_to",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="pacurecord",
            name="handover_notes",
            field=models.TextField(blank=True, default=""),
        ),
    ]
