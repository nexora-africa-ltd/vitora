"""Dialysis module models for Vitora HMIS."""

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel


class DialysisType(models.TextChoices):
    HEMODIALYSIS = "HEMODIALYSIS", "Hemodialysis"
    PERITONEAL = "PERITONEAL", "Peritoneal Dialysis"
    CRRT = "CRRT", "Continuous Renal Replacement Therapy"


class AccessType(models.TextChoices):
    AVF = "AVF", "Arteriovenous Fistula"
    AVG = "AVG", "Arteriovenous Graft"
    CVC_TEMPORARY = "CVC_TEMPORARY", "Temporary Central Venous Catheter"
    CVC_TUNNELED = "CVC_TUNNELED", "Tunneled Central Venous Catheter"
    PD_CATHETER = "PD_CATHETER", "Peritoneal Dialysis Catheter"


class AccessStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    MATURING = "MATURING", "Maturing"
    FAILED = "FAILED", "Failed"
    REMOVED = "REMOVED", "Removed"
    INFECTED = "INFECTED", "Infected"


class SessionStatus(models.TextChoices):
    SCHEDULED = "SCHEDULED", "Scheduled"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"
    ABORTED = "ABORTED", "Aborted"


class OrderFrequency(models.TextChoices):
    TWICE_WEEKLY = "TWICE_WEEKLY", "Twice Weekly"
    THRICE_WEEKLY = "THRICE_WEEKLY", "Thrice Weekly"
    DAILY = "DAILY", "Daily"
    AS_NEEDED = "AS_NEEDED", "As Needed"


class OrderStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    COMPLETED = "COMPLETED", "Completed"
    SUSPENDED = "SUSPENDED", "Suspended"
    CANCELLED = "CANCELLED", "Cancelled"


# =============================================================================
# Models
# =============================================================================


class VascularAccess(FacilityScopedModel, TimeStampedModel):
    """Patient's dialysis vascular access site."""

    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="vascular_accesses"
    )
    access_type = models.CharField(max_length=20, choices=AccessType.choices)
    status = models.CharField(
        max_length=15, choices=AccessStatus.choices, default=AccessStatus.ACTIVE
    )
    site = models.CharField(max_length=100, help_text="Anatomical site (e.g. Left forearm)")
    placed_date = models.DateField()
    placed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vascular_accesses_placed",
    )
    last_assessment_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-placed_date"]
        verbose_name_plural = "Vascular accesses"

    def __str__(self):
        return f"{self.patient} - {self.get_access_type_display()} ({self.site})"


class DialysisOrder(FacilityScopedModel, TimeStampedModel):
    """Standing dialysis prescription/order."""

    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="dialysis_orders"
    )
    ordered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="dialysis_orders_made"
    )
    vascular_access = models.ForeignKey(
        VascularAccess, on_delete=models.SET_NULL, null=True, blank=True, related_name="orders"
    )

    dialysis_type = models.CharField(
        max_length=20, choices=DialysisType.choices, default=DialysisType.HEMODIALYSIS
    )
    frequency = models.CharField(
        max_length=15, choices=OrderFrequency.choices, default=OrderFrequency.THRICE_WEEKLY
    )
    status = models.CharField(
        max_length=15, choices=OrderStatus.choices, default=OrderStatus.ACTIVE
    )

    # Prescription parameters
    target_duration_minutes = models.PositiveIntegerField(
        default=240, help_text="Session duration in minutes"
    )
    blood_flow_rate = models.PositiveIntegerField(default=300, help_text="mL/min")
    dialysate_flow_rate = models.PositiveIntegerField(default=500, help_text="mL/min")
    target_uf_volume = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Target ultrafiltration volume (L)",
    )
    dialysate_composition = models.CharField(max_length=100, blank=True)
    anticoagulation = models.CharField(max_length=100, default="Heparin")
    dry_weight_kg = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True, help_text="Target dry weight (kg)"
    )

    clinical_indication = models.TextField(help_text="Reason for dialysis")
    notes = models.TextField(blank=True)

    start_date = models.DateField(default=timezone.now)
    end_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.patient} - {self.get_dialysis_type_display()} ({self.get_frequency_display()})"
        )


class DialysisSession(FacilityScopedModel, TimeStampedModel):
    """Individual dialysis treatment session."""

    session_number = models.CharField(max_length=30, unique=True, editable=False)
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="dialysis_sessions"
    )
    order = models.ForeignKey(
        DialysisOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name="sessions"
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dialysis_sessions",
    )
    vascular_access = models.ForeignKey(
        VascularAccess, on_delete=models.SET_NULL, null=True, blank=True
    )

    dialysis_type = models.CharField(
        max_length=20, choices=DialysisType.choices, default=DialysisType.HEMODIALYSIS
    )
    status = models.CharField(
        max_length=15, choices=SessionStatus.choices, default=SessionStatus.SCHEDULED
    )

    # Timing
    scheduled_date = models.DateField(default=timezone.now)
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    actual_duration_minutes = models.PositiveIntegerField(null=True, blank=True)

    # Treatment parameters (actual values during session)
    blood_flow_rate = models.PositiveIntegerField(null=True, blank=True)
    dialysate_flow_rate = models.PositiveIntegerField(null=True, blank=True)
    uf_goal_ml = models.PositiveIntegerField(null=True, blank=True)
    uf_achieved_ml = models.PositiveIntegerField(null=True, blank=True)

    # Pre-dialysis vitals
    pre_weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    pre_bp = models.CharField(max_length=10, blank=True, help_text="e.g. 140/90")
    pre_pulse = models.PositiveIntegerField(null=True, blank=True)
    pre_temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)

    # Post-dialysis vitals
    post_weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    post_bp = models.CharField(max_length=10, blank=True)
    post_pulse = models.PositiveIntegerField(null=True, blank=True)

    # Complications
    complications = models.TextField(blank=True)
    machine_number = models.CharField(max_length=30, blank=True)

    # Staff
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dialysis_sessions_performed",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-scheduled_date", "-start_time"]

    def __str__(self):
        return f"{self.session_number} - {self.patient} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if not self.session_number:
            self.session_number = self._generate_session_number()
        # Auto-calculate duration
        if self.start_time and self.end_time and not self.actual_duration_minutes:
            delta = self.end_time - self.start_time
            self.actual_duration_minutes = int(delta.total_seconds() / 60)
        super().save(*args, **kwargs)

    def _generate_session_number(self):
        today = timezone.now().strftime("%Y%m%d")
        prefix = f"DS-{today}"
        last = (
            DialysisSession.objects.filter(session_number__startswith=prefix)
            .order_by("-session_number")
            .first()
        )
        seq = int(last.session_number.split("-")[-1]) + 1 if last else 1
        return f"{prefix}-{seq:04d}"

    def start(self, user=None):
        """Start dialysis session."""
        self.status = SessionStatus.IN_PROGRESS
        self.start_time = timezone.now()
        if user:
            self.performed_by = user
        self.save(update_fields=["status", "start_time", "performed_by", "updated_at"])

    def complete(self):
        """Complete dialysis session."""
        self.status = SessionStatus.COMPLETED
        self.end_time = timezone.now()
        if self.start_time:
            delta = self.end_time - self.start_time
            self.actual_duration_minutes = int(delta.total_seconds() / 60)
        self.save(update_fields=["status", "end_time", "actual_duration_minutes", "updated_at"])

    def abort(self, reason=""):
        """Abort session early."""
        self.status = SessionStatus.ABORTED
        self.end_time = timezone.now()
        if self.start_time:
            delta = self.end_time - self.start_time
            self.actual_duration_minutes = int(delta.total_seconds() / 60)
        if reason:
            self.complications = f"{self.complications}\nAborted: {reason}".strip()
        self.save(
            update_fields=[
                "status",
                "end_time",
                "actual_duration_minutes",
                "complications",
                "updated_at",
            ]
        )
