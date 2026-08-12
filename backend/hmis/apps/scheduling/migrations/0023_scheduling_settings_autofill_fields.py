from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0022_shift_type_config"),
    ]

    operations = [
        migrations.AddField(
            model_name="schedulingsettings",
            name="autofill_run_history",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Recent autofill run reports for this facility. Stored as an append-only list (latest first) for review/compare in UI.",
            ),
        ),
        migrations.AddField(
            model_name="schedulingsettings",
            name="autofill_weights",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Per-facility scoring weights for weekly roster autofill, e.g. {'weekly_load': 30, 'history_hours': 4, 'night_penalty': 16}. Missing keys fall back to system defaults.",
            ),
        ),
    ]
