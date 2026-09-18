# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add emergency deferred-completion fields to Encounter.

What this file is for:
- Introduce encounter-level emergency capture and deferred documentation state.

How to use it:
- Applied automatically by Django migrations via `python manage.py migrate`.

Supported inputs/args:
- No CLI args besides standard Django migration commands.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0096_emergency_access_scope_mode_fields"),
        ("encounters", "0036_encounter_disposition_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="encounter",
            name="deferred_completion_completed_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Timestamp when deferred emergency documentation was completed.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="encounter",
            name="deferred_completion_due_at",
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text="Deadline for completing deferred emergency documentation.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="encounter",
            name="deferred_completion_status",
            field=models.CharField(
                choices=[
                    ("NOT_REQUIRED", "Not Required"),
                    ("PENDING", "Pending"),
                    ("COMPLETED", "Completed"),
                    ("OVERDUE", "Overdue"),
                ],
                db_index=True,
                default="NOT_REQUIRED",
                help_text="Status of deferred documentation required after emergency capture.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="encounter",
            name="emergency_access",
            field=models.ForeignKey(
                blank=True,
                help_text="Break-glass session used for emergency encounter capture.",
                null=True,
                on_delete=models.SET_NULL,
                related_name="encounters_created",
                to="core.emergencyaccess",
            ),
        ),
        migrations.AddField(
            model_name="encounter",
            name="is_emergency_capture",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="True when encounter was created via emergency minimal-capture workflow.",
            ),
        ),
        migrations.AddIndex(
            model_name="encounter",
            index=models.Index(
                fields=["deferred_completion_status", "deferred_completion_due_at"],
                name="encounters__deferre_28c30d_idx",
            ),
        ),
    ]
