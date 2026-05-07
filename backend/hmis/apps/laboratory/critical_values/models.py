"""
Models for Critical Value Management.
Phase L6.2 of Vitora LIS Implementation Plan.

Provides:
- Configurable critical ranges per test (separate from reference ranges)
- Mandatory notification workflow (call clinician, document who/when)
- Read-back verification
- Compliance reporting (% notified within 30 minutes)
"""

from django.contrib.auth import get_user_model
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

User = get_user_model()


# =============================================================================
# Critical Value Range
# =============================================================================


class CriticalValueRange(FacilityScopedModel, TimeStampedModel):
    """
    Facility-specific critical value ranges per test.
    Separate from normal reference ranges — critical values require
    mandatory clinician notification.
    """

    test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.CASCADE,
        related_name="critical_value_ranges",
    )
    critical_low = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Results below this are critically low",
    )
    critical_high = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Results above this are critically high",
    )
    panic_low = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Panic value (lower) — life-threatening",
    )
    panic_high = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Panic value (upper) — life-threatening",
    )
    notification_deadline_minutes = models.IntegerField(
        default=30,
        validators=[MinValueValidator(5), MaxValueValidator(120)],
        help_text="Max minutes to notify clinician after result entry",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Critical Value Range"
        verbose_name_plural = "Critical Value Ranges"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "test"],
                name="unique_critical_range_per_test_per_facility",
            )
        ]
        ordering = ["test__name"]

    def __str__(self):
        return (
            f"Critical Range: {self.test.name} (low={self.critical_low}, high={self.critical_high})"
        )

    def is_critical(self, value):
        """Check if a numeric value falls in the critical range."""
        try:
            val = float(value)
        except (TypeError, ValueError):
            return False

        if self.critical_low is not None and val <= float(self.critical_low):
            return True
        return self.critical_high is not None and val >= float(self.critical_high)

    def is_panic(self, value):
        """Check if a numeric value falls in the panic range (life-threatening)."""
        try:
            val = float(value)
        except (TypeError, ValueError):
            return False

        if self.panic_low is not None and val <= float(self.panic_low):
            return True
        return self.panic_high is not None and val >= float(self.panic_high)


# =============================================================================
# Critical Value Notification
# =============================================================================


class CriticalValueNotification(FacilityScopedModel, TimeStampedModel):
    """
    Tracks notification of critical values to clinicians.
    Mandatory workflow: detect → notify → read-back → acknowledge.
    """

    class NotificationMethod(models.TextChoices):
        PHONE_CALL = "PHONE_CALL", "Phone Call"
        IN_PERSON = "IN_PERSON", "In Person"
        SMS = "SMS", "SMS"
        PUSH = "PUSH", "Push Notification"
        SYSTEM_ALERT = "SYSTEM_ALERT", "System Alert"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Notification"
        NOTIFIED = "NOTIFIED", "Clinician Notified"
        READ_BACK = "READ_BACK", "Read-Back Verified"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
        ESCALATED = "ESCALATED", "Escalated"
        FAILED = "FAILED", "Notification Failed"

    class Severity(models.TextChoices):
        CRITICAL = "CRITICAL", "Critical"
        PANIC = "PANIC", "Panic (Life-Threatening)"

    # Result reference
    result = models.ForeignKey(
        "laboratory.LabResult",
        on_delete=models.CASCADE,
        related_name="critical_notifications",
    )
    critical_range = models.ForeignKey(
        CriticalValueRange,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )

    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    severity = models.CharField(
        max_length=20,
        choices=Severity.choices,
        default=Severity.CRITICAL,
    )

    # Value that triggered the notification
    critical_value = models.CharField(
        max_length=50,
        help_text="The actual critical value",
    )
    test_name = models.CharField(max_length=200, blank=True)
    patient_name = models.CharField(max_length=200, blank=True)

    # Notification details
    notification_method = models.CharField(
        max_length=20,
        choices=NotificationMethod.choices,
        blank=True,
    )
    notified_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="critical_value_notifications_received",
        help_text="Clinician who was notified",
    )
    notified_to_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Name of person notified (in case they're not a system user)",
    )
    notified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="critical_value_notifications_sent",
        help_text="Lab tech who made the notification",
    )

    # Timestamps
    detected_at = models.DateTimeField(default=timezone.now)
    notified_at = models.DateTimeField(null=True, blank=True)
    read_back_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    # Read-back verification
    read_back_verified = models.BooleanField(
        default=False,
        help_text="Whether the clinician read back the value correctly",
    )
    read_back_value = models.CharField(
        max_length=50,
        blank=True,
        help_text="Value read back by clinician for verification",
    )

    # Escalation
    escalation_notes = models.TextField(blank=True)
    escalated_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="critical_value_escalations",
    )

    # Notes
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = "Critical Value Notification"
        verbose_name_plural = "Critical Value Notifications"
        ordering = ["-detected_at"]

    def __str__(self):
        return f"CV Notification #{self.pk}: {self.test_name} = {self.critical_value} ({self.get_status_display()})"

    @property
    def is_overdue(self):
        """Check if notification exceeds the deadline."""
        if self.status not in (self.Status.PENDING, self.Status.NOTIFIED):
            return False
        if not self.critical_range:
            deadline_mins = 30
        else:
            deadline_mins = self.critical_range.notification_deadline_minutes
        elapsed = (timezone.now() - self.detected_at).total_seconds() / 60
        return elapsed > deadline_mins

    @property
    def minutes_elapsed(self):
        """Minutes since detection."""
        return (timezone.now() - self.detected_at).total_seconds() / 60

    @property
    def notification_time_minutes(self):
        """Minutes from detection to notification (if notified)."""
        if self.notified_at:
            return (self.notified_at - self.detected_at).total_seconds() / 60
        return None

    def notify(self, notified_by, notified_to=None, notified_to_name="", method="PHONE_CALL"):
        """Record that the clinician has been notified."""
        self.status = self.Status.NOTIFIED
        self.notified_by = notified_by
        self.notified_to = notified_to
        self.notified_to_name = notified_to_name
        self.notification_method = method
        self.notified_at = timezone.now()
        self.save(
            update_fields=[
                "status",
                "notified_by",
                "notified_to",
                "notified_to_name",
                "notification_method",
                "notified_at",
            ]
        )

    def verify_read_back(self, read_back_value):
        """Record read-back verification."""
        self.status = self.Status.READ_BACK
        self.read_back_at = timezone.now()
        self.read_back_value = read_back_value
        self.read_back_verified = read_back_value.strip() == self.critical_value.strip()
        self.save(
            update_fields=[
                "status",
                "read_back_at",
                "read_back_value",
                "read_back_verified",
            ]
        )

    def acknowledge(self):
        """Mark as fully acknowledged."""
        self.status = self.Status.ACKNOWLEDGED
        self.acknowledged_at = timezone.now()
        self.save(update_fields=["status", "acknowledged_at"])

    def escalate(self, escalated_to=None, notes=""):
        """Escalate an overdue notification."""
        self.status = self.Status.ESCALATED
        self.escalated_to = escalated_to
        self.escalation_notes = notes
        self.save(update_fields=["status", "escalated_to", "escalation_notes"])
