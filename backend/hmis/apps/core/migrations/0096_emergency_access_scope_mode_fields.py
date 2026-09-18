# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add scoped capability fields to emergency access records."""

from django.db import migrations, models
from django.utils import timezone


def backfill_emergency_access_scope(apps, schema_editor):
    """Map legacy records to scoped defaults and set review deadlines."""
    EmergencyAccess = apps.get_model("core", "EmergencyAccess")
    for record in EmergencyAccess.objects.all().iterator():
        update_fields = []
        if record.patient_id is None:
            record.scope_type = "SYSTEM"
            update_fields.append("scope_type")
        if record.review_due_at is None and record.requested_at is not None:
            record.review_due_at = record.requested_at + timezone.timedelta(hours=24)
            update_fields.append("review_due_at")
        if record.status in {"EXPIRED", "REVOKED", "REVIEWED"} and record.closed_at is None:
            record.closed_at = record.expires_at or timezone.now()
            update_fields.append("closed_at")
        if update_fields:
            record.save(update_fields=update_fields)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0095_facility_custom_email_module"),
    ]

    operations = [
        migrations.AddField(
            model_name="emergencyaccess",
            name="access_mode",
            field=models.CharField(
                choices=[("READ_ONLY", "Read only"), ("LIMITED_WRITE", "Limited write")],
                default="READ_ONLY",
                help_text="Access mode granted during the emergency window",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="emergencyaccess",
            name="closed_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When requester explicitly closed the emergency session",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="emergencyaccess",
            name="granted_permissions",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Effective capabilities granted during this emergency access",
            ),
        ),
        migrations.AddField(
            model_name="emergencyaccess",
            name="review_due_at",
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text="Deadline for post-hoc compliance review",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="emergencyaccess",
            name="scope_type",
            field=models.CharField(
                choices=[("PATIENT", "Patient specific"), ("SYSTEM", "System wide")],
                db_index=True,
                default="PATIENT",
                help_text="Scope of access granted by this emergency request",
                max_length=20,
            ),
        ),
        migrations.RunPython(backfill_emergency_access_scope, migrations.RunPython.noop),
    ]
