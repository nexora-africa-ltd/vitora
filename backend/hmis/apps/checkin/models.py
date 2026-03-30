"""
Check-in models for Vitora HMIS.

This module contains models for patient check-in tracking:
- CheckIn: Daily check-in record for a patient
- CheckInStateHistory: Audit trail for check-in state changes

Sprint: Returning Patient Workflow - Sprint 1
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.models import TimeStampedModel


class CheckIn(TimeStampedModel):
    """
    Represents a patient check-in event.

    Tracks when patients arrive and where they are routed:
    - To triage queue
    - Direct to clinic (skip triage)

    This model provides a daily check-in audit trail and enables
    the front desk to view today's activity.
    """

    # =========================================================================
    # Destination Type Choices
    # =========================================================================
    DESTINATION_TYPE_CHOICES = [
        ("TRIAGE", "Triage Queue"),
        ("CLINIC", "Direct to Clinic"),
        ("EMERGENCY", "Emergency Department"),
    ]

    # =========================================================================
    # Visit Type Choices (auto-detected or overridden)
    # =========================================================================
    VISIT_TYPE_CHOICES = [
        ("NEW", "New Patient"),
        ("RETURN", "Returning Patient"),
        ("FOLLOW_UP", "Follow-up Visit"),
        ("EMERGENCY", "Emergency"),
        ("SCHEDULED", "Scheduled Appointment"),
    ]

    # =========================================================================
    # Visit Reason Choices
    # =========================================================================
    VISIT_REASON_CHOICES = [
        ("NEW_COMPLAINT", "New Complaint"),
        ("FOLLOW_UP", "Follow-up"),
        ("EMERGENCY", "Emergency"),
        ("CHRONIC_CARE", "Chronic Care Review"),
        ("SCHEDULED_PROCEDURE", "Scheduled Procedure"),
        ("PROCEDURE_REVIEW", "Post-Procedure Review"),
        ("REFILL_ONLY", "Medication Refill Only"),
        ("LAB_REVIEW", "Lab Results Review"),
        ("REFERRAL_VISIT", "Referral from Another Facility"),
        ("OTHER", "Other"),
    ]

    # =========================================================================
    # Identity Verification Method Choices
    # =========================================================================
    IDENTITY_METHOD_CHOICES = [
        ("MRN", "Medical Record Number"),
        ("NATIONAL_ID", "National ID"),
        ("PHONE", "Phone Number"),
        ("BIOMETRIC", "Biometric Scan"),
        ("MANUAL", "Manual Verification"),
    ]

    # =========================================================================
    # Status Choices
    # =========================================================================
    STATUS_CHOICES = [
        ("WAITING", "Waiting"),
        ("IN_TRIAGE", "In Triage"),
        ("TRIAGED", "Triaged"),
        ("IN_CONSULTATION", "In Consultation"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("NO_SHOW", "No Show"),
    ]

    # =========================================================================
    # Core Fields
    # =========================================================================
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="checkins",
        help_text="Patient being checked in",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkins",
        help_text="Encounter created for this check-in",
    )
    linked_encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="follow_up_checkins",
        help_text="Previous encounter this visit is following up on",
    )

    # =========================================================================
    # Destination Fields
    # =========================================================================
    destination_type = models.CharField(
        max_length=20,
        choices=DESTINATION_TYPE_CHOICES,
        default="TRIAGE",
        help_text="Where patient is routed",
    )
    destination_clinic = models.ForeignKey(
        "clinics.Clinic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkins",
        help_text="Clinic if routed directly (skip triage)",
    )
    skip_triage = models.BooleanField(
        default=False,
        help_text="Whether triage was bypassed",
    )

    # =========================================================================
    # Visit Classification
    # =========================================================================
    visit_type = models.CharField(
        max_length=20,
        choices=VISIT_TYPE_CHOICES,
        default="NEW",
        help_text="Type of visit (auto-detected or specified)",
    )
    visit_reason = models.CharField(
        max_length=30,
        choices=VISIT_REASON_CHOICES,
        default="NEW_COMPLAINT",
        help_text="Reason for visit",
    )

    # =========================================================================
    # Timing
    # =========================================================================
    checked_in_at = models.DateTimeField(
        default=timezone.now,
        help_text="When patient checked in",
    )

    # =========================================================================
    # Identity Verification
    # =========================================================================
    identity_method = models.CharField(
        max_length=20,
        choices=IDENTITY_METHOD_CHOICES,
        default="MRN",
        help_text="How patient identity was verified",
    )

    # =========================================================================
    # Status Tracking
    # =========================================================================
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="WAITING",
        help_text="Current check-in status",
    )

    # =========================================================================
    # Staff
    # =========================================================================
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patient_checkins",
        help_text="Staff who performed the check-in",
    )

    # =========================================================================
    # Additional Info
    # =========================================================================
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional check-in notes",
    )
    chief_complaint = models.TextField(
        blank=True,
        default="",
        help_text="Initial chief complaint captured at check-in",
    )

    # =========================================================================
    # Queue Links
    # =========================================================================
    waiting_queue_entry = models.ForeignKey(
        "triage.WaitingQueue",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkin",
        help_text="Link to triage waiting queue entry",
    )
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkin",
        help_text="Link to clinic visit queue entry",
    )

    class Meta:
        ordering = ["-checked_in_at"]
        verbose_name = "Check-in"
        verbose_name_plural = "Check-ins"
        indexes = [
            models.Index(fields=["checked_in_at"]),
            models.Index(fields=["patient", "checked_in_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"Check-in: {self.patient} @ {self.checked_in_at.strftime('%Y-%m-%d %H:%M')}"

    @classmethod
    def get_today_checkins(cls):
        """Get all check-ins for today."""
        today = timezone.localdate()
        return (
            cls.objects.filter(checked_in_at__date=today)
            .select_related("patient", "destination_clinic", "checked_in_by", "encounter")
            .order_by("-checked_in_at")
        )

    @classmethod
    def patient_checked_in_today(cls, patient_id: int) -> bool:
        """Check if a patient has already checked in today."""
        today = timezone.localdate()
        return cls.objects.filter(
            patient_id=patient_id,
            checked_in_at__date=today,
        ).exists()

    def update_status(self, new_status: str, user=None):
        """Update check-in status with history tracking."""
        old_status = self.status
        self.status = new_status
        self.save(update_fields=["status", "updated_at"])

        # Create history entry
        CheckInStateHistory.objects.create(
            checkin=self,
            from_status=old_status,
            to_status=new_status,
            changed_by=user,
        )


class CheckInStateHistory(models.Model):
    """
    Audit trail for check-in state changes.

    Records all status transitions for compliance and debugging.
    """

    checkin = models.ForeignKey(
        CheckIn,
        on_delete=models.CASCADE,
        related_name="state_history",
    )
    from_status = models.CharField(
        max_length=20,
        help_text="Previous status",
    )
    to_status = models.CharField(
        max_length=20,
        help_text="New status",
    )
    changed_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the status changed",
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkin_status_changes",
    )
    reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for status change (optional)",
    )

    class Meta:
        ordering = ["-changed_at"]
        verbose_name = "Check-in State History"
        verbose_name_plural = "Check-in State Histories"

    def __str__(self):
        return f"{self.checkin.patient}: {self.from_status} → {self.to_status}"
