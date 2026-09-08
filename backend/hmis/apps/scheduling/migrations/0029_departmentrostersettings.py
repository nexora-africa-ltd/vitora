# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create canonical department rotas and migrate legacy override patterns.

Applied by Django migrations with: python manage.py migrate
Inputs: existing DepartmentShiftConfig.default_shift_pattern values.
"""

import django.db.models.deletion
from django.db import migrations, models


def migrate_department_patterns(apps, _schema_editor):
    """Copy the first non-empty legacy pattern for each facility and department."""
    DepartmentShiftConfig = apps.get_model("scheduling", "DepartmentShiftConfig")
    DepartmentRosterSettings = apps.get_model("scheduling", "DepartmentRosterSettings")

    migrated_departments = set()
    for config in DepartmentShiftConfig.objects.exclude(default_shift_pattern=[]).order_by("id"):
        key = (config.facility_id, config.department_id)
        if key in migrated_departments or not config.default_shift_pattern:
            continue
        DepartmentRosterSettings.objects.create(
            facility_id=config.facility_id,
            organization_id=config.organization_id,
            department_id=config.department_id,
            repeating_shift_pattern=config.default_shift_pattern,
        )
        migrated_departments.add(key)


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0028_departmentshiftconfig"),
    ]

    operations = [
        migrations.CreateModel(
            name="DepartmentRosterSettings",
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
                    "repeating_shift_pattern",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="Repeating ordered shift types, e.g. ['DAY', 'DAY', 'NIGHT', 'OFF'].",
                    ),
                ),
                (
                    "department",
                    models.ForeignKey(
                        help_text="Department this repeating rota applies to",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="department_roster_settings",
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
                "verbose_name": "Department Roster Settings",
                "verbose_name_plural": "Department Roster Settings",
                "ordering": ["department__name"],
            },
        ),
        migrations.AddConstraint(
            model_name="departmentrostersettings",
            constraint=models.UniqueConstraint(
                fields=("facility", "department"),
                name="unique_department_roster_settings_per_facility",
            ),
        ),
        migrations.RunPython(migrate_department_patterns, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="departmentshiftconfig",
            name="default_shift_pattern",
        ),
    ]
