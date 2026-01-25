from __future__ import annotations

from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clinics", "0003_alter_clinicvisit_encounter"),
    ]

    operations = [
        migrations.CreateModel(
            name="MonthlyClinicReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("year", models.PositiveIntegerField()),
                ("month", models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])),
                ("total_visits", models.PositiveIntegerField(default=0)),
                ("new_visits", models.PositiveIntegerField(default=0)),
                ("revisits", models.PositiveIntegerField(default=0)),
                ("priority_red", models.PositiveIntegerField(default=0)),
                ("priority_orange", models.PositiveIntegerField(default=0)),
                ("priority_yellow", models.PositiveIntegerField(default=0)),
                ("priority_green", models.PositiveIntegerField(default=0)),
                ("priority_blue", models.PositiveIntegerField(default=0)),
                ("male_visits", models.PositiveIntegerField(default=0)),
                ("female_visits", models.PositiveIntegerField(default=0)),
                ("under_5_visits", models.PositiveIntegerField(default=0)),
                ("under_18_visits", models.PositiveIntegerField(default=0)),
                ("adult_visits", models.PositiveIntegerField(default=0)),
                ("over_60_visits", models.PositiveIntegerField(default=0)),
                ("new_enrollments", models.PositiveIntegerField(default=0)),
                ("active_enrollments", models.PositiveIntegerField(default=0)),
                ("defaulters", models.PositiveIntegerField(default=0)),
                ("anc_first_visits", models.PositiveIntegerField(default=0)),
                ("anc_revisits", models.PositiveIntegerField(default=0)),
                ("deliveries", models.PositiveIntegerField(default=0)),
                ("total_revenue", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("sha_claims_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("cash_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("dhis2_submitted", models.BooleanField(default=False)),
                ("dhis2_submitted_at", models.DateTimeField(blank=True, null=True)),
                ("dhis2_response", models.JSONField(blank=True, null=True)),
                (
                    "clinic",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="monthly_reports",
                        to="clinics.clinic",
                    ),
                ),
            ],
            options={
                "ordering": ["-year", "-month", "clinic__name"],
                "unique_together": {("clinic", "year", "month")},
            },
        ),
    ]
