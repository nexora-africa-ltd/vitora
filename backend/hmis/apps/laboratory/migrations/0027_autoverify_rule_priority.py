from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0026_autoverify_phase_l2"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="autoverifyrule",
            options={
                "ordering": ["priority", "test__name", "condition_type"],
                "verbose_name": "Auto-Verify Rule",
                "verbose_name_plural": "Auto-Verify Rules",
            },
        ),
        migrations.AddField(
            model_name="autoverifyrule",
            name="priority",
            field=models.PositiveIntegerField(
                default=10,
                help_text="Evaluation order (lower = evaluated first). First failing rule is the reported blocker.",
            ),
        ),
    ]
