
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inpatient", "0013_add_admission_integrity_constraints"),
    ]

    operations = [
        migrations.AddField(
            model_name="ward",
            name="gender_restriction",
            field=models.CharField(
                choices=[
                    ("ANY", "Any Gender"),
                    ("MALE_ONLY", "Male Only"),
                    ("FEMALE_ONLY", "Female Only"),
                ],
                default="ANY",
                help_text="Gender restriction for patient admission",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="ward",
            name="min_age_years",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Minimum patient age in years (null = no minimum)",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="ward",
            name="max_age_years",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Maximum patient age in years (null = no maximum)",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="ward",
            name="isolation_capable",
            field=models.BooleanField(
                default=False,
                help_text="Whether ward can handle isolation patients",
            ),
        ),
        migrations.AddField(
            model_name="ward",
            name="oxygen_equipped",
            field=models.BooleanField(
                default=False,
                help_text="Whether beds have oxygen supply",
            ),
        ),
        migrations.AddField(
            model_name="ward",
            name="ventilator_capable",
            field=models.BooleanField(
                default=False,
                help_text="Whether ward supports ventilated patients",
            ),
        ),
        migrations.AddField(
            model_name="admission",
            name="constraint_override",
            field=models.BooleanField(
                default=False,
                help_text="Whether compatibility constraints were overridden",
            ),
        ),
        migrations.AddField(
            model_name="admission",
            name="constraint_override_reason",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Reason for overriding compatibility constraints",
            ),
        ),
        migrations.AddField(
            model_name="admission",
            name="constraint_violations",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="List of violated constraints at admission time",
            ),
        ),
    ]
