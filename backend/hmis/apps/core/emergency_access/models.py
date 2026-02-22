"""
Emergency Access models for break-glass functionality.

This module provides the data models for emergency access requests,
tracking who requested access, why, for how long, and who approved it.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class EmergencyAccessReason(models.TextChoices):
    """Predefined reasons for emergency access requests."""

    LIFE_THREATENING = "LIFE_THREATENING", "Life-threatening emergency"
    UNCONSCIOUS_PATIENT = "UNCONSCIOUS_PATIENT", "Patient unconscious/unable to consent"
    MASS_CASUALTY = "MASS_CASUALTY", "Mass casualty incident"
    CRITICAL_LAB_RESULT = "CRITICAL_LAB_RESULT", "Critical lab result requiring immediate action"
    MEDICATION_EMERGENCY = "MEDICATION_EMERGENCY", "Urgent medication information needed"
    DISASTER_RESPONSE = "DISASTER_RESPONSE", "Disaster/emergency response"
    OTHER = "OTHER", "Other (requires justification)"


class EmergencyAccessStatus(models.TextChoices):
    """Status of an emergency access request."""

    ACTIVE = "ACTIVE", "Active"
    EXPIRED = "EXPIRED", "Expired"
    REVOKED = "REVOKED", "Revoked"
    REVIEWED = "REVIEWED", "Reviewed and Closed"


class EmergencyAccess(models.Model):
    """
    Emergency Access (Break-Glass) record.

    This model tracks when a user invokes emergency access to bypass
    normal access controls. All emergency access is:
    - Time-limited (default 4 hours, max 24 hours)
    - Requires explicit reason
    - Automatically logged to audit trail
    - Subject to mandatory review by administrators
    - Triggers escalation alerts

    DHA Compliance: Emergency Access Procedures (P1 Required)
    Kenya DPA 2019: Vital interests lawful basis (Section 32)
    """

    # Who requested emergency access
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="emergency_access_requests",
        help_text="User who invoked emergency access",
    )

    # What patient (optional - can be system-wide emergency)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="emergency_access_records",
        help_text="Patient record being accessed (null for system-wide access)",
    )

    # Reason for emergency access
    reason = models.CharField(
        max_length=30,
        choices=EmergencyAccessReason.choices,
        help_text="Predefined reason for emergency access",
    )
    reason_details = models.TextField(
        help_text="Detailed justification for emergency access (required)",
    )

    # Duration
    requested_at = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        help_text="When emergency access was requested",
    )
    expires_at = models.DateTimeField(
        help_text="When emergency access expires",
    )
    duration_minutes = models.PositiveIntegerField(
        default=240,  # 4 hours default
        help_text="Duration of emergency access in minutes (max 1440 = 24 hours)",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=EmergencyAccessStatus.choices,
        default=EmergencyAccessStatus.ACTIVE,
        db_index=True,
        help_text="Current status of the emergency access",
    )

    # Approval (post-hoc approval for audit purposes)
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="emergency_access_approvals",
        help_text="Administrator who reviewed/approved the emergency access",
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the emergency access was reviewed",
    )
    approval_notes = models.TextField(
        blank=True,
        default="",
        help_text="Notes from the approver during review",
    )

    # Revocation
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="emergency_access_revocations",
        help_text="User who revoked the emergency access",
    )
    revoked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the emergency access was revoked",
    )
    revocation_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for revoking the emergency access",
    )

    # Escalation tracking
    escalation_sent = models.BooleanField(
        default=False,
        help_text="Whether escalation notification was sent",
    )
    escalation_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When escalation notification was sent",
    )

    # Audit trail
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="IP address of the request",
    )
    user_agent = models.TextField(
        blank=True,
        default="",
        help_text="User agent string from the request",
    )

    class Meta:
        """Meta options for EmergencyAccess model."""

        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["user", "requested_at"]),
            models.Index(fields=["status", "requested_at"]),
            models.Index(fields=["patient", "requested_at"]),
            models.Index(fields=["expires_at"]),
        ]
        verbose_name = "Emergency Access"
        verbose_name_plural = "Emergency Access Records"
        permissions = [
            ("approve_emergency_access", "Can approve emergency access requests"),
            ("revoke_emergency_access", "Can revoke emergency access"),
            ("view_emergency_dashboard", "Can view emergency access dashboard"),
        ]

    def __str__(self) -> str:
        """String representation of the emergency access record."""
        patient_str = f" for {self.patient.mrn}" if self.patient else ""
        return f"EmergencyAccess by {self.user.username}{patient_str} at {self.requested_at.isoformat()}"

    def save(self, *args, **kwargs) -> None:
        """Set expires_at based on duration_minutes if not set."""
        if not self.expires_at:
            self.expires_at = self.requested_at + timezone.timedelta(minutes=self.duration_minutes)
        super().save(*args, **kwargs)

    @property
    def is_active(self) -> bool:
        """Check if emergency access is currently active."""
        if self.status != EmergencyAccessStatus.ACTIVE:
            return False
        return timezone.now() < self.expires_at

    @property
    def is_expired(self) -> bool:
        """Check if emergency access has expired."""
        return timezone.now() >= self.expires_at

    @property
    def remaining_minutes(self) -> int:
        """Get remaining minutes of access."""
        if not self.is_active:
            return 0
        delta = self.expires_at - timezone.now()
        return max(0, int(delta.total_seconds() / 60))

    def revoke(self, user, reason: str = "") -> None:
        """
        Revoke this emergency access.

        Args:
            user: User performing the revocation
            reason: Reason for revocation
        """
        self.status = EmergencyAccessStatus.REVOKED
        self.revoked_by = user
        self.revoked_at = timezone.now()
        self.revocation_reason = reason
        self.save(update_fields=["status", "revoked_by", "revoked_at", "revocation_reason"])

    def mark_reviewed(self, approver, notes: str = "") -> None:
        """
        Mark this emergency access as reviewed.

        Args:
            approver: Administrator who reviewed
            notes: Review notes
        """
        self.status = EmergencyAccessStatus.REVIEWED
        self.approver = approver
        self.approved_at = timezone.now()
        self.approval_notes = notes
        self.save(update_fields=["status", "approver", "approved_at", "approval_notes"])

    def check_expired(self) -> bool:
        """
        Check and update status if expired.

        Returns:
            True if status was updated to EXPIRED
        """
        if self.status == EmergencyAccessStatus.ACTIVE and self.is_expired:
            self.status = EmergencyAccessStatus.EXPIRED
            self.save(update_fields=["status"])
            return True
        return False

    @classmethod
    def get_active_for_user(cls, user) -> "models.QuerySet[EmergencyAccess]":
        """Get all active emergency access records for a user."""
        return cls.objects.filter(
            user=user,
            status=EmergencyAccessStatus.ACTIVE,
            expires_at__gt=timezone.now(),
        )

    @classmethod
    def get_pending_review(cls) -> "models.QuerySet[EmergencyAccess]":
        """Get all emergency access records pending review."""
        return cls.objects.filter(
            status__in=[EmergencyAccessStatus.ACTIVE, EmergencyAccessStatus.EXPIRED]
        ).order_by("-requested_at")

    @classmethod
    def has_active_access(cls, user, patient=None) -> bool:
        """
        Check if user has active emergency access.

        Args:
            user: User to check
            patient: Optional patient to check specific access

        Returns:
            True if user has active emergency access
        """
        qs = cls.get_active_for_user(user)
        if patient:
            qs = qs.filter(models.Q(patient=patient) | models.Q(patient__isnull=True))
        return qs.exists()
