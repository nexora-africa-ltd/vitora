"""
Sick Note / Medical Certificate models for Vitora HMIS.

Provides a model for clinicians to issue medical certificates (sick notes)
for patients, documenting the medical reason for absence from work or school.
Complies with Kenya Employment Act 2007 requirements for medical leave documentation.

Model:
- SickNote: Medical certificate issued by a clinician for a patient,
  linked to an encounter, with diagnosis, leave dates, and recommendations.
"""

from datetime import datetime

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin
from hmis.apps.core.mixins import FacilityScopedModel, resolve_tenant_from_related
from hmis.apps.core.models import TimeStampedModel


def generate_sick_note_number():
    """Format: SN-YYYYMMDD-XXXX"""
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"SN-{today}-"
    SickNote = apps.get_model("sick_notes", "SickNote")
    with transaction.atomic():
        qs = SickNote.objects.filter(note_number__startswith=prefix).order_by("-note_number")
        try:
            latest = qs.select_for_update().first()
        except transaction.TransactionManagementError:
            latest = qs.first()
        if latest:
            last_sequence = int(latest.note_number.split("-")[-1])
            sequence = last_sequence + 1
        else:
            sequence = 1
    return f"{prefix}{sequence:04d}"


class SickNote(HistoryMixin, FacilityScopedModel, TimeStampedModel):
    """Medical certificate / sick note issued by a clinician.

    Lifecycle: DRAFT → ISSUED → REVOKED
                ↓
             CANCELLED
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ISSUED = "ISSUED", "Issued"
        CANCELLED = "CANCELLED", "Cancelled"
        REVOKED = "REVOKED", "Revoked"

    STATUS_TRANSITIONS = {
        "DRAFT": ["ISSUED", "CANCELLED"],
        "ISSUED": ["REVOKED"],
        "CANCELLED": [],
        "REVOKED": [],
    }

    # Core Identity
    note_number = models.CharField(max_length=30, unique=True, editable=False)

    # Source Context
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="sick_notes",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="sick_notes",
    )

    # Clinician
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sick_notes_issued",
    )

    # Leave Dates
    leave_start_date = models.DateField(help_text="First day of medical leave")
    leave_end_date = models.DateField(help_text="Last day of medical leave")

    # Diagnosis
    diagnosis_text = models.CharField(
        max_length=500,
        help_text="Diagnosis description (may be general for privacy)",
    )
    diagnosis_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="ICD-10 code (optional)",
    )

    # Employer / Institution
    employer_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Name of employer or school",
    )
    employer_contact = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Employer contact details",
    )

    # Recommendations
    recommendations = models.TextField(
        blank=True,
        default="",
        help_text="Clinical recommendations (e.g., rest, avoid strenuous activity)",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional clinician notes",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    issued_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sick_notes_revoked",
    )
    revoke_reason = models.TextField(blank=True, default="")
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sick_notes_cancelled",
    )

    # History
    history = HistoricalRecords()

    class Meta(TimeStampedModel.Meta):
        ordering = ["-created_at"]
        verbose_name = "Sick Note"
        verbose_name_plural = "Sick Notes"
        indexes = [
            models.Index(fields=["status", "-created_at"], name="sn_status_created_idx"),
            models.Index(fields=["patient", "-created_at"], name="sn_patient_created_idx"),
            models.Index(fields=["encounter"], name="sn_encounter_idx"),
            models.Index(fields=["note_number"], name="sn_number_idx"),
            models.Index(
                fields=["leave_start_date", "leave_end_date"],
                name="sn_leave_dates_idx",
            ),
        ]

    def __str__(self):
        return f"{self.note_number} - {self.patient} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.note_number:
            self.note_number = generate_sick_note_number()
        if self.encounter and not self.patient_id:
            self.patient = self.encounter.patient
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        super().save(*args, **kwargs)

    def clean(self):
        errors = {}
        if (
            self.leave_start_date
            and self.leave_end_date
            and self.leave_end_date < self.leave_start_date
        ):
            errors["leave_end_date"] = "End date cannot be before start date."
        if errors:
            raise ValidationError(errors)

    @property
    def leave_days(self) -> int | None:
        """Number of leave days (inclusive)."""
        if self.leave_start_date and self.leave_end_date:
            return (self.leave_end_date - self.leave_start_date).days + 1
        return None

    @property
    def is_active(self) -> bool:
        """True if issued and leave period has not ended."""
        if self.status != self.Status.ISSUED:
            return False
        if self.leave_end_date:
            return timezone.now().date() <= self.leave_end_date
        return True

    def issue(self, user=None):
        """Transition from DRAFT to ISSUED."""
        self._transition_to(self.Status.ISSUED, user)
        self.issued_at = timezone.now()
        if user:
            self.issued_by = user
        self.save()

    def cancel(self, user=None):
        """Cancel a draft sick note."""
        self._transition_to(self.Status.CANCELLED, user)
        self.cancelled_at = timezone.now()
        self.cancelled_by = user
        self.save()

    def revoke(self, user=None, reason=""):
        """Revoke an issued sick note."""
        self._transition_to(self.Status.REVOKED, user)
        self.revoked_at = timezone.now()
        self.revoked_by = user
        self.revoke_reason = reason
        self.save()

    def _transition_to(self, new_status, _user=None):
        valid = self.STATUS_TRANSITIONS.get(self.status, [])
        if new_status not in valid:
            raise ValidationError(
                f"Cannot transition from {self.status} to {new_status}. Valid: {valid}"
            )
        self.status = new_status
