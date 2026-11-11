# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add durable DHIS2/KHIS IDSR submission-attempt audit records.

Applied by Django migrations; no command-line arguments are supported.
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0105_terminologyconceptcache_terminologybinding"),
        ("surveillance", "0015_idsr_report_facility_identity"),
    ]

    operations = [
        migrations.CreateModel(
            name="IDSRSubmissionAttempt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("VALIDATION_FAILED", "Validation Failed"), ("SUBMITTED", "Submitted"), ("RETRY_SCHEDULED", "Retry Scheduled"), ("FAILED", "Failed")], default="PENDING", max_length=20)),
                ("trigger", models.CharField(default="manual", max_length=20)),
                ("attempt_number", models.PositiveIntegerField(default=1)),
                ("request_payload", models.JSONField(blank=True, default=dict)),
                ("validation_response", models.JSONField(blank=True, default=dict)),
                ("response", models.JSONField(blank=True, default=dict)),
                ("http_status", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("error_message", models.TextField(blank=True, default="")),
                ("attempted_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("next_retry_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("facility", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="%(class)s_set", to="core.facility")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="%(class)s_set", to="core.organization")),
                ("report", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="submission_attempts", to="surveillance.idsrweeklyreport")),
            ],
            options={"ordering": ["-attempt_number"]},
        ),
        migrations.AddConstraint(
            model_name="idsrsubmissionattempt",
            constraint=models.UniqueConstraint(fields=("report", "attempt_number"), name="unique_idsr_report_submission_attempt"),
        ),
        migrations.AddIndex(
            model_name="idsrsubmissionattempt",
            index=models.Index(fields=["status", "next_retry_at"], name="surveillanc_status_70d2dc_idx"),
        ),
    ]
