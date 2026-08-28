# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F405
"""Clinics models sessions visits for Vitora HMIS.

What this file is for:
- Implement models sessions visits logic for the clinics domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

# =============================================================================
# Clinic Model - Organizational Unit / Service Delivery Point
# =============================================================================
from hmis.apps.clinics.models_core import *  # noqa: F403
from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel


class ClinicSession(FacilityScopedModel, TimeStampedModel):
    """
    Represents a single day's operation of a clinic.

    Each clinic has one session per day. Sessions track:
    - Patients seen
    - Staff on duty
    - Session statistics
    """

    STATUS_CHOICES = [
        ("SCHEDULED", "Scheduled"),
        ("OPEN", "Open"),
        ("CLOSED", "Closed"),
        ("CANCELLED", "Cancelled"),
    ]

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    session_date = models.DateField(
        help_text="Date of this clinic session",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="SCHEDULED",
    )
    opened_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the session was opened",
    )
    closed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the session was closed",
    )
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opened_clinic_sessions",
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="closed_clinic_sessions",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Session notes (e.g., issues, supply shortages)",
    )

    # Session statistics (computed)
    patients_registered = models.PositiveIntegerField(default=0)
    patients_seen = models.PositiveIntegerField(default=0)
    patients_waiting = models.PositiveIntegerField(default=0)

    class Meta:
        """Meta options for ClinicSession model."""

        ordering = ["-session_date", "clinic"]
        unique_together = ["clinic", "session_date"]
        verbose_name = "Clinic Session"
        verbose_name_plural = "Clinic Sessions"

    def __str__(self):
        """Return string representation."""
        return f"{self.clinic.name} - {self.session_date}"

    def save(self, *args, **kwargs):
        """Auto-resolve tenant from parent clinic."""
        if not self.facility_id and self.clinic_id:
            try:
                clinic = self.clinic
                if clinic.facility_id:
                    self.facility_id = clinic.facility_id
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                pass
        super().save(*args, **kwargs)

    def open_session(self, user):
        """Open the clinic session."""
        self.status = "OPEN"
        self.opened_at = timezone.now()
        self.opened_by = user
        self.save()

    def close_session(self, user):
        """Close the clinic session."""
        self.status = "CLOSED"
        self.closed_at = timezone.now()
        self.closed_by = user
        self.save()

    def update_statistics(self):
        """Update session statistics from visits."""
        visits = self.visits.all()
        self.patients_registered = visits.count()
        self.patients_seen = visits.filter(status="COMPLETED").count()
        self.patients_waiting = visits.filter(status__in=["WAITING", "CALLED"]).count()
        self.save(update_fields=["patients_registered", "patients_seen", "patients_waiting"])


# =============================================================================
# ClinicVisit Model - Queue Entry
# =============================================================================


class ClinicVisit(FacilityScopedModel, TimeStampedModel):
    """
    Represents a patient's visit to a specific clinic.

    This is the queue entry - tracks the patient's journey through
    the clinic from arrival to consultation completion.
    """

    # =========================================================================
    # Status Choices (Queue States)
    # =========================================================================
    STATUS_CHOICES = [
        ("REGISTERED", "Registered - In queue"),
        ("WAITING", "Waiting to be called"),
        ("CALLED", "Called - Patient summoned"),
        ("IN_CONSULTATION", "In Consultation"),
        ("COMPLETED", "Completed"),
        ("REFERRED", "Referred to another clinic"),
        ("NO_SHOW", "No Show"),
        ("CANCELLED", "Cancelled"),
    ]

    # =========================================================================
    # Priority Choices
    # =========================================================================
    PRIORITY_CHOICES = [
        ("EMERGENCY", "Emergency (RED)"),
        ("URGENT", "Urgent (ORANGE)"),
        ("PRIORITY", "Priority (YELLOW)"),
        ("STANDARD", "Standard (GREEN)"),
        ("NON_URGENT", "Non-urgent (BLUE)"),
    ]

    # =========================================================================
    # Visit Type Choices
    # =========================================================================
    VISIT_TYPE_CHOICES = [
        ("NEW", "New Patient"),
        ("RETURN", "Return Visit"),
        ("FOLLOW_UP", "Follow-up"),
        ("REFERRAL", "Referral from another clinic"),
        ("SCHEDULED", "Scheduled Appointment"),
        ("EMERGENCY", "Emergency"),
    ]

    # =========================================================================
    # Source Choices
    # =========================================================================
    SOURCE_CHOICES = [
        ("TRIAGE", "From Triage"),
        ("DIRECT", "Direct to Clinic"),
        ("REFERRAL", "Referral from Clinic"),
        ("APPOINTMENT", "Scheduled Appointment"),
        ("INPATIENT", "From Inpatient Ward"),
    ]

    # =========================================================================
    # Core Fields
    # =========================================================================
    session = models.ForeignKey(
        ClinicSession,
        on_delete=models.CASCADE,
        related_name="visits",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="clinic_visits",
    )

    # =========================================================================
    # Queue Management
    # =========================================================================
    queue_number = models.PositiveIntegerField(
        help_text="Queue number for this session",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="REGISTERED",
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default="STANDARD",
    )
    visit_type = models.CharField(
        max_length=20,
        choices=VISIT_TYPE_CHOICES,
        default="NEW",
    )
    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default="TRIAGE",
    )
    source_module = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Source module or workflow that created this visit (for traceability)",
    )
    source_record_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Source record identifier used during live linking and backfill reconciliation",
    )

    # =========================================================================
    # Timestamps
    # =========================================================================
    registered_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When patient was added to clinic queue",
    )
    called_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When patient was called",
    )
    consultation_started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When consultation started",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When visit was completed",
    )
    cancelled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When visit was cancelled",
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_clinic_visits",
        help_text="User who cancelled the visit",
    )
    no_show_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When patient was marked as no-show",
    )
    no_show_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="no_show_clinic_visits",
        help_text="User who marked the visit as no-show",
    )

    # =========================================================================
    # Clinical Links
    # =========================================================================
    encounter = models.OneToOneField(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visit_o2o",
        help_text="Encounter created for this visit",
    )
    triage_assessment = models.ForeignKey(
        "triage.TriageAssessment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visits",
        help_text="Triage assessment that routed patient here",
    )

    # =========================================================================
    # Referral Tracking
    # =========================================================================
    referred_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referrals_out",
        help_text="If referred, the source clinic visit",
    )
    referred_to_clinic = models.ForeignKey(
        Clinic,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_referrals",
        help_text="Clinic patient was referred to",
    )
    referral_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for referral",
    )

    # =========================================================================
    # Staff Assignment
    # =========================================================================
    assigned_clinician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_clinic_visits",
        help_text="Clinician assigned to see this patient",
    )
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="registered_clinic_visits",
        help_text="Staff who registered the visit",
    )

    # =========================================================================
    # Room Assignment (set when patient is called)
    # =========================================================================
    room = models.ForeignKey(
        "scheduling.Resource",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visits",
        limit_choices_to={"resource_type": "PLACE"},
        help_text="Room assigned to this visit (auto-set from clinician's active shift)",
    )

    # =========================================================================
    # Chief Complaint (from triage or direct entry)
    # =========================================================================
    chief_complaint = models.TextField(
        blank=True,
        default="",
        help_text="Chief complaint / reason for visit",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes",
    )

    # =========================================================================
    # Billing
    # =========================================================================
    consultation_fee_charged = models.BooleanField(
        default=False,
        help_text="Whether consultation fee has been charged",
    )
    billing_line_item = models.ForeignKey(
        "billing.InvoiceItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visits",
        help_text="Associated billing line item",
    )

    class Meta:
        """Meta options for ClinicVisit model."""

        ordering = ["session", "priority", "queue_number"]
        verbose_name = "Clinic Visit"
        verbose_name_plural = "Clinic Visits"
        indexes = [
            models.Index(fields=["session", "status"]),
            models.Index(fields=["patient", "session"]),
            models.Index(fields=["status", "priority"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "queue_number"],
                name="unique_queue_number_per_session",
            ),
            # Prevent duplicate active visits for same patient in same session
            models.UniqueConstraint(
                fields=["session", "patient"],
                condition=models.Q(
                    status__in=["REGISTERED", "WAITING", "CALLED", "IN_CONSULTATION"]
                ),
                name="unique_active_patient_per_session",
            ),
        ]

    def __str__(self):
        """Return string representation."""
        return f"{self.patient} - {self.session.clinic.name} #{self.queue_number}"

    def save(self, *args, **kwargs):
        """Override save to auto-assign queue number and tenant fields."""
        if not self.queue_number:
            last_visit = (
                ClinicVisit.objects.filter(session=self.session).order_by("-queue_number").first()
            )
            self.queue_number = (last_visit.queue_number + 1) if last_visit else 1

        # Auto-resolve tenant from session (Strategy B)
        if not self.facility_id and self.session_id:
            try:
                session = self.session
                if session.facility_id:
                    self.facility_id = session.facility_id
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                pass

        super().save(*args, **kwargs)

        # Backward compatibility:
        # If a ClinicVisit is linked to an Encounter via the legacy OneToOne field,
        # ensure the new Encounter.clinic_visit FK is kept in sync for reporting.
        if self.encounter_id:
            encounter = self.encounter
            if encounter.clinic_visit_id != self.pk:
                encounter.clinic_visit = self
                encounter.save(update_fields=["clinic_visit", "updated_at"])

    def _update_encounter_consultation_status(self, target_status: str) -> None:
        """Sync consultation status on linked encounter while preserving history records."""
        if not self.encounter_id:
            return

        encounter = self.encounter
        if encounter.consultation_status not in {"WAITING", "CALLED", "IN_PROGRESS"}:
            return

        if encounter.consultation_status == target_status:
            return

        encounter.consultation_status = target_status
        encounter.save(update_fields=["consultation_status", "updated_at"])

    def call_patient(self, clinician):
        """Call patient for consultation.

        Auto-assigns the room from the clinician's active shift for this clinic.
        """
        self.status = "CALLED"
        self.called_at = timezone.now()
        self.assigned_clinician = clinician

        # Auto-assign room from clinician's active shift
        from hmis.apps.scheduling.models import Shift

        active_shift = (
            Shift.objects.filter(
                staff_resource__staff_profile__user=clinician,
                shift_date=timezone.localdate(),
                status__in=["ACTIVE", "ON_BREAK"],
                clinic=self.session.clinic,
                room__isnull=False,
            )
            .select_related("room")
            .first()
        )
        if active_shift:
            self.room = active_shift.room

        self.save()

        # Sync encounter consultation_status to CALLED + assign clinician
        if self.encounter_id:
            encounter = self.encounter
            if encounter.consultation_status == "WAITING":
                encounter.consultation_status = "CALLED"
                encounter.assigned_clinician = clinician
                encounter.claimed_at = timezone.now()
                encounter.save(
                    update_fields=[
                        "consultation_status",
                        "assigned_clinician",
                        "claimed_at",
                        "updated_at",
                    ]
                )

    def ensure_consultation_encounter(self, existing_encounter=None):
        """Ensure this clinic visit is linked to a consultation-ready encounter."""
        from hmis.apps.clinics.services.template_routing import resolve_default_clinical_template
        from hmis.apps.encounters.models import Encounter

        resolved_template = resolve_default_clinical_template(self.session.clinic)
        encounter = self.encounter or existing_encounter

        if not encounter:
            encounter_data = {
                "patient": self.patient,
                "encounter_type": self._map_clinic_to_encounter_type(),
                "chief_complaint": self.chief_complaint or "See clinic notes",
                "triage_status": ("COMPLETED" if self.triage_assessment else "NOT_APPLICABLE"),
                "clinic_visit": self,
                "clinical_template": resolved_template,
            }

            if getattr(self, "facility_id", None):
                encounter_data["facility"] = self.facility
            if getattr(self, "organization_id", None):
                encounter_data["organization"] = self.organization

            if self.triage_assessment:
                ta = self.triage_assessment
                if ta.temperature is not None:
                    encounter_data["temperature"] = ta.temperature
                if ta.heart_rate is not None:
                    encounter_data["pulse"] = ta.heart_rate
                if ta.respiratory_rate is not None:
                    encounter_data["respiratory_rate"] = ta.respiratory_rate
                if ta.spo2 is not None:
                    encounter_data["spo2"] = ta.spo2
                if ta.weight is not None:
                    encounter_data["weight"] = ta.weight
                if ta.height is not None:
                    encounter_data["height"] = ta.height
                if ta.systolic_bp is not None and ta.diastolic_bp is not None:
                    encounter_data["blood_pressure"] = f"{ta.systolic_bp}/{ta.diastolic_bp}"
                encounter_data["vitals_source"] = "TRIAGE"
                encounter_data["vitals_recorded_at"] = ta.triage_end_time or ta.created_at
                if ta.triaged_by:
                    encounter_data["vitals_recorded_by"] = ta.triaged_by

            encounter = Encounter.objects.create(**encounter_data)

        encounter_updates = []
        if encounter.clinic_visit_id != self.id:
            encounter.clinic_visit = self
            encounter_updates.append("clinic_visit")

        if encounter.triage_status not in ("COMPLETED", "BYPASSED", "NOT_APPLICABLE"):
            encounter.triage_status = "COMPLETED" if self.triage_assessment else "NOT_APPLICABLE"
            encounter_updates.append("triage_status")

        if not encounter.chief_complaint and self.chief_complaint:
            encounter.chief_complaint = self.chief_complaint
            encounter_updates.append("chief_complaint")

        if encounter.clinical_template_id is None and resolved_template is not None:
            encounter.clinical_template = resolved_template
            encounter_updates.append("clinical_template")

        if encounter_updates:
            encounter.save(update_fields=encounter_updates)

        if self.encounter_id != encounter.id:
            self.encounter = encounter
            self.save(update_fields=["encounter"])

        return encounter

    def start_consultation(self, user=None):
        """
        Start consultation - creates encounter and generates billing.

        Args:
            user: Optional user initiating the consultation (for billing audit)

        Returns:
            Encounter: The created or existing encounter

        This method:
        1. Creates an Encounter if one doesn't exist
        2. Copies vitals from triage assessment if available
        3. Generates an Invoice for the consultation fee if not already charged
        4. Links the billing to the clinic visit
        """
        self.status = "IN_CONSULTATION"
        self.consultation_started_at = timezone.now()
        encounter = self.ensure_consultation_encounter()

        # Sync encounter consultation status (single source of truth)
        # This ensures the encounter is removed from the consultation queue
        if encounter.consultation_status not in ("IN_PROGRESS", "COMPLETED"):
            encounter.begin_consultation()

        # Ensure assigned_clinician is set on encounter (for "my active" list)
        if user and not encounter.assigned_clinician_id:
            encounter.assigned_clinician = user
            encounter.claimed_at = timezone.now()
            encounter.save(update_fields=["assigned_clinician", "claimed_at"])

        # Generate billing if consultation fee not already charged
        if not self.consultation_fee_charged:
            self._generate_consultation_billing(user=user)

        self.save()
        return encounter

    def _generate_consultation_billing(self, user=None):
        """
        Generate billing for consultation fee.

        Creates or uses existing invoice and adds consultation fee line item.
        """
        from hmis.apps.billing.services.clinic_billing import create_consultation_invoice

        # The service will mark this visit as charged and link billing line item.
        create_consultation_invoice(self, created_by=user)

    def complete_visit(self):
        """Mark visit as completed."""
        self.status = "COMPLETED"
        self.completed_at = timezone.now()
        self.save()
        self.session.update_statistics()

        # Sync encounter consultation_status to COMPLETED
        self._update_encounter_consultation_status("COMPLETED")

    def cancel_visit(self, user=None):
        """Cancel a clinic visit."""
        self.status = "CANCELLED"
        self.cancelled_at = timezone.now()
        self.cancelled_by = user
        self.save()
        self.session.update_statistics()

        # Sync encounter consultation_status to CANCELLED
        self._update_encounter_consultation_status("CANCELLED")

    def mark_no_show(self, user=None):
        """Mark a clinic visit as no-show."""
        self.status = "NO_SHOW"
        self.no_show_at = timezone.now()
        self.no_show_by = user
        self.save()
        self.session.update_statistics()

        # Sync encounter consultation_status to NO_SHOW
        self._update_encounter_consultation_status("NO_SHOW")

    def refer_to_clinic(self, target_clinic, reason, user):
        """Refer patient to another clinic."""
        self.status = "REFERRED"
        self.referred_to_clinic = target_clinic
        self.referral_reason = reason
        self.save()

        # Create visit in target clinic
        target_session = target_clinic.get_current_session()
        new_visit = ClinicVisit.objects.create(
            session=target_session,
            patient=self.patient,
            visit_type="REFERRAL",
            source="REFERRAL",
            referred_from=self,
            chief_complaint=f"Referred from {self.session.clinic.name}: {reason}",
            priority=self.priority,
            registered_by=user,
        )
        return new_visit

    def _map_clinic_to_encounter_type(self):
        """Map clinic type to encounter type."""
        mapping = {
            "GENERAL_OPD": "OPD",
            "ANC": "ANC",
            "CWC": "PAEDIATRIC",
            "CCC": "CHRONIC_STABLE",
            "DIABETIC": "CHRONIC_STABLE",
            "HYPERTENSION": "CHRONIC_STABLE",
            "DENTAL": "SPECIALIST_CLINIC",
            "EYE": "SPECIALIST_CLINIC",
            "SURGICAL": "PROCEDURE",
            "PROCEDURE": "PROCEDURE",
        }
        return mapping.get(self.session.clinic.clinic_type, "OPD")

    @property
    def wait_time_minutes(self):
        """Calculate current wait time in minutes."""
        end = self.consultation_started_at if self.consultation_started_at else timezone.now()
        delta = end - self.registered_at
        return int(delta.total_seconds() / 60)


# =============================================================================
# ClinicEnrollment Model - Chronic Care Programs
# =============================================================================
