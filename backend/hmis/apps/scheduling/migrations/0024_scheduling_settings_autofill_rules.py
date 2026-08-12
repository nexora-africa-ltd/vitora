from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0023_scheduling_settings_autofill_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="schedulingsettings",
            name="autofill_min_staff_per_shift",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Per-shift minimum staffing coverage targets for autofill, e.g. {"DAY": 3, "NIGHT": 2}. Missing keys default to 1.',
            ),
        ),
        migrations.AddField(
            model_name="schedulingsettings",
            name="autofill_mode",
            field=models.CharField(
                choices=[
                    ("MIN_COVERAGE", "Minimum Coverage"),
                    ("BALANCED_UTILIZATION", "Balanced Utilization"),
                ],
                default="BALANCED_UTILIZATION",
                help_text="Autofill strategy mode. MIN_COVERAGE fills only required coverage slots. BALANCED_UTILIZATION also adds assignments to reach target days per staff.",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="schedulingsettings",
            name="autofill_target_days_per_staff",
            field=models.PositiveIntegerField(
                default=4,
                help_text="Target scheduled working days per staff per week when autofill mode is BALANCED_UTILIZATION.",
            ),
        ),
    ]
