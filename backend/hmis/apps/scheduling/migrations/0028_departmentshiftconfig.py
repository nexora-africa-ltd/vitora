# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create department-specific facility shift configuration overrides.

Applied by Django migrations with: python manage.py migrate
Inputs: none.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0090_add_laboratory_license_fields"),
        ("scheduling", "0027_shiftvacancy"),
    ]

    operations = [
        migrations.CreateModel(
            name="DepartmentShiftConfig",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "origin_hub_id",
                    models.CharField(
                        blank=True,
                        db_index=True,
                        help_text="Hub ID where this record was originally created (null = cloud-created).",
                        max_length=100,
                        null=True,
                    ),
                ),
                (
                    "origin_local_id",
                    models.BigIntegerField(
                        blank=True,
                        db_index=True,
                        help_text="Original PK on the source hub (for dedup on cloud receipt).",
                        null=True,
                    ),
                ),
                (
                    "shift_type",
                    models.CharField(
                        choices=[
                            ("DAY", "Day Shift"),
                            ("NIGHT", "Night Shift"),
                            ("MORNING", "Morning Shift"),
                            ("AFTERNOON", "Afternoon Shift"),
                            ("ON_CALL", "On-Call"),
                            ("OVERTIME", "Overtime"),
                            ("DAY_OFF", "Day Off"),
                            ("NIGHT_OFF", "Night Off"),
                            ("OFF", "Off (Full Day)"),
                            ("AFTERNOON_OFF", "Afternoon Off"),
                            ("LEAVE", "Leave"),
                            ("SICK_LEAVE", "Sick Leave"),
                            ("REST", "Rest Day"),
                        ],
                        help_text="The shift type this departmental configuration applies to",
                        max_length=30,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("label", models.CharField(blank=True, default="", max_length=100)),
                ("start_time", models.TimeField()),
                ("end_time", models.TimeField()),
                ("color", models.CharField(blank=True, default="", max_length=7)),
                ("min_staff", models.PositiveIntegerField(default=1)),
                ("max_staff", models.PositiveIntegerField(blank=True, null=True)),
                ("default_shift_pattern", models.JSONField(blank=True, default=list)),
                (
                    "department",
                    models.ForeignKey(
                        help_text="Department this shift configuration applies to",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="department_shift_configs",
                        to="core.department",
                    ),
                ),
                (
                    "facility",
                    models.ForeignKey(
                        blank=True,
                        help_text="Facility (branch) where this record was created.",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_set",
                        to="core.facility",
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        help_text="Owning organization (tenant).",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_set",
                        to="core.organization",
                    ),
                ),
            ],
            options={
                "verbose_name": "Department Shift Configuration",
                "verbose_name_plural": "Department Shift Configurations",
                "ordering": ["department__name", "shift_type"],
            },
        ),
        migrations.AddConstraint(
            model_name="departmentshiftconfig",
            constraint=models.UniqueConstraint(
                fields=("facility", "department", "shift_type"),
                name="unique_department_shift_type_per_facility",
            ),
        ),
    ]
