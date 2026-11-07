# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Durable IDSR DHIS2/KHIS submission-attempt records.

Use these models through ``hmis.apps.surveillance.models``.  Each attempt
captures the validation, request outcome, and retry schedule for one weekly
IDSR report submission.
"""

from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel


class IDSRSubmissionAttemptStatus(models.TextChoices):
    """Lifecycle states for an outbound IDSR submission attempt."""

    PENDING = "PENDING", "Pending"
    VALIDATION_FAILED = "VALIDATION_FAILED", "Validation Failed"
    SUBMITTED = "SUBMITTED", "Submitted"
    RETRY_SCHEDULED = "RETRY_SCHEDULED", "Retry Scheduled"
    FAILED = "FAILED", "Failed"


class IDSRSubmissionAttempt(FacilityScopedModel):
    """An immutable operational record of a DHIS2/KHIS submission attempt."""

    report = models.ForeignKey(
        "surveillance.IDSRWeeklyReport",
        on_delete=models.CASCADE,
        related_name="submission_attempts",
    )
    status = models.CharField(
        max_length=20,
        choices=IDSRSubmissionAttemptStatus.choices,
        default=IDSRSubmissionAttemptStatus.PENDING,
    )
    trigger = models.CharField(max_length=20, default="manual")
    attempt_number = models.PositiveIntegerField(default=1)
    request_payload = models.JSONField(default=dict, blank=True)
    validation_response = models.JSONField(default=dict, blank=True)
    response = models.JSONField(default=dict, blank=True)
    http_status = models.PositiveSmallIntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True, default="")
    attempted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-attempt_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["report", "attempt_number"],
                name="unique_idsr_report_submission_attempt",
            )
        ]
        indexes = [models.Index(fields=["status", "next_retry_at"])]
