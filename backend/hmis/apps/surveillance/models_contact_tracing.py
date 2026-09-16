# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Contact tracing entities and workflow state for surveillance.

What this file is for:
- Model contact tracing contacts and follow-up workflows per notifiable case.

How to use it:
- Import models through `hmis.apps.surveillance.models` re-exports.

Supported inputs/args:
- Django ORM runtime only; no standalone CLI arguments.
"""

from datetime import timedelta

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.pii import encrypted_pii_property


class ContactRiskLevel(models.TextChoices):
    """Risk classification for a traced contact."""

    HIGH = "HIGH", "High"
    MEDIUM = "MEDIUM", "Medium"
    LOW = "LOW", "Low"


class ContactTracingStatus(models.TextChoices):
    """Workflow state of a traced contact."""

    IDENTIFIED = "IDENTIFIED", "Identified"
    CONTACTED = "CONTACTED", "Contacted"
    UNDER_MONITORING = "UNDER_MONITORING", "Under Monitoring"
    CLEARED = "CLEARED", "Cleared"
    SYMPTOMATIC = "SYMPTOMATIC", "Symptomatic"
    LOST_TO_FOLLOWUP = "LOST_TO_FOLLOWUP", "Lost To Follow-up"


class FollowUpMethod(models.TextChoices):
    """Contact follow-up method."""

    PHONE = "PHONE", "Phone"
    HOME_VISIT = "HOME_VISIT", "Home Visit"
    SMS = "SMS", "SMS"
    CLINIC = "CLINIC", "Clinic"


class FollowUpOutcome(models.TextChoices):
    """Outcome for a follow-up interaction."""

    CONTINUE_MONITORING = "CONTINUE_MONITORING", "Continue Monitoring"
    ESCALATE_TESTING = "ESCALATE_TESTING", "Escalate Testing"
    ESCALATE_ISOLATION = "ESCALATE_ISOLATION", "Escalate Isolation"
    CLEARED = "CLEARED", "Cleared"


class ContactTracingContact(FacilityScopedModel):
    """A person identified through contact tracing for a notifiable case."""

    case = models.ForeignKey(
        "surveillance.NotifiableCase",
        on_delete=models.CASCADE,
        related_name="traced_contacts",
    )
    full_name = models.CharField(max_length=255)

    phone_number_encrypted = models.TextField(default="", blank=True)
    phone_number = encrypted_pii_property("phone_number")

    relationship_to_case = models.CharField(max_length=100, blank=True, default="")
    risk_level = models.CharField(
        max_length=12,
        choices=ContactRiskLevel.choices,
        default=ContactRiskLevel.MEDIUM,
    )
    status = models.CharField(
        max_length=24,
        choices=ContactTracingStatus.choices,
        default=ContactTracingStatus.IDENTIFIED,
    )

    exposure_date = models.DateField(null=True, blank=True)
    monitoring_start_date = models.DateField(null=True, blank=True)
    monitoring_end_date = models.DateField(null=True, blank=True)
    next_followup_date = models.DateField(null=True, blank=True)
    last_followup_at = models.DateTimeField(null=True, blank=True)
    last_contact_attempt_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="surveillance_contacts_created",
    )
    updated_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="surveillance_contacts_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["case", "status"]),
            models.Index(fields=["risk_level", "status"]),
            models.Index(fields=["next_followup_date"]),
        ]

    def mark_contacted(self, user=None, notes: str = "") -> None:
        """Set contact as contacted and schedule monitoring follow-up."""
        self.status = ContactTracingStatus.CONTACTED
        self.last_contact_attempt_at = timezone.now()
        if notes:
            self.notes = f"{self.notes}\n[Contacted] {notes}".strip()
        if user:
            self.updated_by = user
        self.save(
            update_fields=[
                "status",
                "last_contact_attempt_at",
                "notes",
                "updated_by",
                "updated_at",
            ]
        )

    def start_monitoring(self, user=None, days: int = 14, notes: str = "") -> None:
        """Move contact to active monitoring with next follow-up date."""
        today = timezone.localdate()
        self.status = ContactTracingStatus.UNDER_MONITORING
        self.monitoring_start_date = today
        self.monitoring_end_date = today + timedelta(days=max(1, days))
        self.next_followup_date = today + timedelta(days=1)
        if notes:
            self.notes = f"{self.notes}\n[Monitoring] {notes}".strip()
        if user:
            self.updated_by = user
        self.save(
            update_fields=[
                "status",
                "monitoring_start_date",
                "monitoring_end_date",
                "next_followup_date",
                "notes",
                "updated_by",
                "updated_at",
            ]
        )

    def mark_symptomatic(self, user=None, notes: str = "") -> None:
        """Mark contact as symptomatic and requiring escalation."""
        self.status = ContactTracingStatus.SYMPTOMATIC
        if notes:
            self.notes = f"{self.notes}\n[Symptomatic] {notes}".strip()
        if user:
            self.updated_by = user
        self.save(update_fields=["status", "notes", "updated_by", "updated_at"])

    def mark_cleared(self, user=None, notes: str = "") -> None:
        """Mark contact as cleared and close monitoring."""
        self.status = ContactTracingStatus.CLEARED
        self.next_followup_date = None
        if notes:
            self.notes = f"{self.notes}\n[Cleared] {notes}".strip()
        if user:
            self.updated_by = user
        self.save(
            update_fields=["status", "next_followup_date", "notes", "updated_by", "updated_at"]
        )


class ContactTracingFollowUp(FacilityScopedModel):
    """A follow-up check recorded for a traced contact."""

    contact = models.ForeignKey(
        ContactTracingContact,
        on_delete=models.CASCADE,
        related_name="followups",
    )
    followup_date = models.DateField(default=timezone.localdate)
    method = models.CharField(
        max_length=20, choices=FollowUpMethod.choices, default=FollowUpMethod.PHONE
    )
    symptoms_present = models.BooleanField(default=False)
    temperature_c = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(30), MaxValueValidator(45)],
    )
    notes = models.TextField(blank=True, default="")
    outcome = models.CharField(
        max_length=24,
        choices=FollowUpOutcome.choices,
        default=FollowUpOutcome.CONTINUE_MONITORING,
    )
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="surveillance_contact_followups_recorded",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-followup_date", "-created_at"]
        indexes = [
            models.Index(fields=["contact", "followup_date"]),
            models.Index(fields=["outcome"]),
        ]
