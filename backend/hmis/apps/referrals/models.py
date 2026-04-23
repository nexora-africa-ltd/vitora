"""
Referral models for Vitora HMIS.

This module provides a unified referral system that cleanly separates
the clinician's role (creating a referral) from the specialist's role
(performing the consultation/assessment).

Models:
- ClinicalReferral: Lightweight referral created by a clinician during
  an encounter. Links to the source encounter and captures only what
  the clinician needs to provide (reason, priority, clinical notes).

Referral Types:
- ALLIED_HEALTH: Routes to allied health services (physio, nutrition, OT, etc.)
- SPECIALTY_CLINIC: Routes to specialty clinics (ENT, dental, eye, etc.)
- ADMISSION: Recommends inpatient admission (replaces AdmissionRecommendation)
- EXTERNAL: Refers to another facility entirely

The specialist's detailed assessment is captured in the module-specific
models (PhysiotherapyOrder, NutritionConsultation, etc.) which are
auto-created via signals when a referral is accepted.
"""

from datetime import datetime, timedelta

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin
from hmis.apps.core.models import TimeStampedModel


def generate_referral_number():
    """
    Generate a unique Referral Number.

    Format: REF-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique referral number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"REF-{today}-"

    ClinicalReferral = apps.get_model("referrals", "ClinicalReferral")

    latest = (
        ClinicalReferral.objects.filter(referral_number__startswith=prefix)
        .order_by("-referral_number")
        .first()
    )

    if latest:
        last_sequence = int(latest.referral_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        sequence = 1

    return f"{prefix}{sequence:04d}"


def default_referral_expiry():
    """Return default expiry time (48 hours from now)."""
    return timezone.now() + timedelta(hours=48)


class ClinicalReferral(HistoryMixin, TimeStampedModel):
    """
    A lightweight referral created by a clinician during an encounter.

    This model captures ONLY the clinician's perspective: why the patient
    needs to be seen by another service, the urgency, and relevant
    clinical context. The specialist's detailed assessment is captured
    in module-specific models (linked via allied_health_content_type
    and allied_health_object_id).

    Lifecycle:
        DRAFT → PENDING → ACCEPTED → IN_PROGRESS → COMPLETED
                  ↓            ↓
              CANCELLED    DECLINED
                  ↓
              EXPIRED
    """

    # =========================================================================
    # Referral Type Choices
    # =========================================================================
    REFERRAL_TYPE_CHOICES = [
        ("ALLIED_HEALTH", "Allied Health Service"),
        ("SPECIALTY_CLINIC", "Specialty Clinic"),
        ("ADMISSION", "Inpatient Admission"),
        ("EXTERNAL", "External Facility"),
    ]

    # =========================================================================
    # Target Service Choices
    # =========================================================================
    TARGET_SERVICE_CHOICES = [
        # Allied Health
        ("PHYSIOTHERAPY", "Physiotherapy"),
        ("NUTRITION", "Nutrition / Dietetics"),
        ("OCCUPATIONAL_THERAPY", "Occupational Therapy"),
        ("COUNSELLING", "Counselling"),
        ("SOCIAL_WORK", "Social Work"),
        # Specialty Clinics
        ("DENTAL", "Dental"),
        ("EYE", "Eye / Ophthalmology"),
        ("ENT", "ENT"),
        ("SURGICAL", "Surgical"),
        ("ORTHO", "Orthopedic"),
        ("DERM", "Dermatology"),
        ("CARDIOLOGY", "Cardiology"),
        ("ONCOLOGY", "Oncology"),
        ("MENTAL_HEALTH", "Mental Health / Psychiatry"),
        ("DIALYSIS", "Dialysis"),
        # Maternal & Child Health
        ("ANC", "Antenatal Care"),
        ("PNC", "Postnatal Care"),
        ("FP", "Family Planning"),
        ("CWC", "Child Welfare"),
        # Chronic Care
        ("CCC", "Comprehensive Care (HIV)"),
        ("TB", "TB Clinic"),
        ("DIABETIC", "Diabetic Clinic"),
        ("HYPERTENSION", "Hypertension Clinic"),
        # Inpatient
        ("GENERAL_WARD", "General Ward"),
        ("MEDICAL_WARD", "Medical Ward"),
        ("SURGICAL_WARD", "Surgical Ward"),
        ("MATERNITY_WARD", "Maternity Ward"),
        ("PEDIATRIC_WARD", "Pediatric Ward"),
        ("ICU", "Intensive Care Unit"),
        ("HDU", "High Dependency Unit"),
        # Other
        ("PROCEDURE_ROOM", "Procedure Room"),
        ("OTHER", "Other"),
    ]

    # =========================================================================
    # Priority Choices
    # =========================================================================
    PRIORITY_CHOICES = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent"),
        ("EMERGENCY", "Emergency"),
    ]

    # =========================================================================
    # Status Choices (State Machine)
    # =========================================================================
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("PENDING", "Pending Review"),
        ("ACCEPTED", "Accepted"),
        ("DECLINED", "Declined"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("EXPIRED", "Expired"),
    ]

    STATUS_TRANSITIONS = {
        "DRAFT": ["PENDING", "CANCELLED"],
        "PENDING": ["ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"],
        "ACCEPTED": ["IN_PROGRESS", "CANCELLED"],
        "DECLINED": [],  # Terminal state
        "IN_PROGRESS": ["COMPLETED", "CANCELLED"],
        "COMPLETED": [],  # Terminal state
        "CANCELLED": [],  # Terminal state
        "EXPIRED": [],  # Terminal state
    }

    # =========================================================================
    # Mapping: target_service → referral_type (auto-derived)
    # =========================================================================
    SERVICE_TO_TYPE = {
        "PHYSIOTHERAPY": "ALLIED_HEALTH",
        "NUTRITION": "ALLIED_HEALTH",
        "OCCUPATIONAL_THERAPY": "ALLIED_HEALTH",
        "COUNSELLING": "ALLIED_HEALTH",
        "SOCIAL_WORK": "ALLIED_HEALTH",
        "GENERAL_WARD": "ADMISSION",
        "MEDICAL_WARD": "ADMISSION",
        "SURGICAL_WARD": "ADMISSION",
        "MATERNITY_WARD": "ADMISSION",
        "PEDIATRIC_WARD": "ADMISSION",
        "ICU": "ADMISSION",
        "HDU": "ADMISSION",
    }

    # Mapping: target_service → clinic_type (for queue routing)
    SERVICE_TO_CLINIC_TYPE = {
        "PHYSIOTHERAPY": "PHYSIO",
        "NUTRITION": "NUTRITION",
        "OCCUPATIONAL_THERAPY": "OT",
        "COUNSELLING": "COUNSELLING",
        "SOCIAL_WORK": "SOCIAL_WORK",
        "DENTAL": "DENTAL",
        "EYE": "EYE",
        "ENT": "ENT",
        "SURGICAL": "SURGICAL",
        "ORTHO": "ORTHO",
        "DERM": "DERM",
        "MENTAL_HEALTH": "MENTAL_HEALTH",
        "ONCOLOGY": "ONCOLOGY",
        "DIALYSIS": "DIALYSIS",
        "ANC": "ANC",
        "PNC": "PNC",
        "FP": "FP",
        "CWC": "CWC",
        "CCC": "CCC",
        "TB": "TB",
        "DIABETIC": "DIABETIC",
        "HYPERTENSION": "HYPERTENSION",
        "PROCEDURE_ROOM": "PROCEDURE",
    }

    # =========================================================================
    # Core Identity
    # =========================================================================
    referral_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        help_text="Auto-generated referral number (REF-YYYYMMDD-XXXX)",
    )
    referral_type = models.CharField(
        max_length=20,
        choices=REFERRAL_TYPE_CHOICES,
        help_text="Auto-derived from target_service. ALLIED_HEALTH, SPECIALTY_CLINIC, ADMISSION, or EXTERNAL.",
    )
    target_service = models.CharField(
        max_length=30,
        choices=TARGET_SERVICE_CHOICES,
        help_text="The specific service/clinic/ward being referred to",
    )

    # =========================================================================
    # Source Context (auto-populated from encounter)
    # =========================================================================
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="referrals",
        help_text="Encounter that generated this referral",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="referrals",
        help_text="Patient being referred",
    )

    # =========================================================================
    # Clinician Input (what the clinician fills)
    # =========================================================================
    reason = models.TextField(
        help_text="Clinical reason for referral",
    )
    clinical_notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional clinical context for the receiving service",
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default="ROUTINE",
        help_text="Urgency of the referral",
    )

    # =========================================================================
    # Auto-captured Clinical Context (snapshot from encounter)
    # =========================================================================
    relevant_diagnoses = models.JSONField(
        default=list,
        blank=True,
        help_text="Snapshot of encounter diagnoses at referral time",
    )
    relevant_vitals = models.JSONField(
        default=dict,
        blank=True,
        help_text="Snapshot of encounter vitals at referral time",
    )

    # =========================================================================
    # Admission-specific fields (only for ADMISSION type)
    # =========================================================================
    provisional_diagnosis = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text="ICD-10 code for provisional diagnosis (admission referrals)",
    )
    provisional_diagnosis_text = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Text description of provisional diagnosis",
    )
    preferred_ward_type = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Preferred ward type for admission",
    )

    # =========================================================================
    # External Referral fields (only for EXTERNAL type)
    # =========================================================================
    external_facility_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Name of external facility",
    )
    external_facility_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="MFL code of external facility (Kenya Master Facility List)",
    )
    referral_letter = models.TextField(
        blank=True,
        default="",
        help_text="Referral letter content for external facility",
    )

    # =========================================================================
    # Status & Tracking
    # =========================================================================
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
        help_text="Current referral status",
    )
    referred_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="referrals_made",
        help_text="Clinician who created the referral",
    )
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referrals_accepted",
        help_text="Person who accepted the referral",
    )
    declined_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referrals_declined",
        help_text="Person who declined the referral",
    )
    decline_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason if referral was declined",
    )

    # =========================================================================
    # Timestamps
    # =========================================================================
    accepted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the referral was accepted",
    )
    declined_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the referral was declined",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the referral was completed",
    )
    expires_at = models.DateTimeField(
        default=default_referral_expiry,
        help_text="When the referral expires if not acted upon (default 48h)",
    )

    # =========================================================================
    # Linked Specialist Record (GenericForeignKey alternative: simple fields)
    # We store the type + ID to link to the module-specific record that the
    # specialist fills in (e.g., PhysiotherapyOrder, NutritionConsultation).
    # =========================================================================
    linked_module = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Module name of linked specialist record (e.g., 'physiotherapy')",
    )
    linked_model = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Model name of linked specialist record (e.g., 'PhysiotherapyOrder')",
    )
    linked_object_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="PK of the linked specialist record",
    )

    # =========================================================================
    # Clinic Queue Integration
    # =========================================================================
    destination_clinic = models.ForeignKey(
        "clinics.Clinic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_clinical_referrals",
        help_text="Explicit clinic destination for clinic-routed referrals.",
    )
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referrals",
        help_text="Clinic visit created for queue routing",
    )

    # =========================================================================
    # Sensitive Handling
    # =========================================================================
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Whether this referral involves sensitive data (HIV, GBV, etc.)",
    )

    # =========================================================================
    # History
    # =========================================================================
    history = HistoricalRecords()

    class Meta(TimeStampedModel.Meta):
        ordering = ["-created_at"]
        verbose_name = "Clinical Referral"
        verbose_name_plural = "Clinical Referrals"
        permissions = [
            ("accept_referral", "Can accept referrals"),
            ("decline_referral", "Can decline referrals"),
            ("view_sensitive_referral", "Can view sensitive referrals"),
        ]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="ref_status_created_idx"),
            models.Index(fields=["patient", "-created_at"], name="ref_patient_created_idx"),
            models.Index(fields=["encounter"], name="ref_encounter_idx"),
            models.Index(fields=["referral_type"], name="ref_type_idx"),
            models.Index(fields=["target_service"], name="ref_service_idx"),
            models.Index(fields=["referred_by"], name="ref_referred_by_idx"),
            models.Index(fields=["referral_number"], name="ref_number_idx"),
        ]

    def __str__(self):
        return f"{self.referral_number} - {self.get_target_service_display()} ({self.status})"

    def save(self, *args, **kwargs):
        """Auto-generate referral number and derive referral_type."""
        if not self.referral_number:
            self.referral_number = generate_referral_number()

        # Auto-derive referral_type from target_service
        if self.target_service:
            derived_type = self.SERVICE_TO_TYPE.get(self.target_service)
            if derived_type:
                self.referral_type = derived_type
            elif not self.referral_type:
                # Default to SPECIALTY_CLINIC for services not in the map
                self.referral_type = "SPECIALTY_CLINIC"

        # Auto-set patient from encounter if not set
        if self.encounter and not self.patient_id:
            self.patient = self.encounter.patient

        super().save(*args, **kwargs)

    def clean(self):
        """Validate referral data."""
        errors = {}

        # Admission referrals need provisional diagnosis
        if self.referral_type == "ADMISSION":
            if not self.provisional_diagnosis_text:
                errors["provisional_diagnosis_text"] = (
                    "Provisional diagnosis is required for admission referrals."
                )

        # External referrals need facility name
        if self.referral_type == "EXTERNAL":
            if not self.external_facility_name:
                errors["external_facility_name"] = (
                    "External facility name is required for external referrals."
                )

        if errors:
            raise ValidationError(errors)

    def update_status(self, new_status, user=None, reason=""):
        """
        Transition the referral to a new status with validation.

        Args:
            new_status: The target status
            user: The user performing the transition
            reason: Optional reason (required for DECLINED)

        Raises:
            ValidationError: If the transition is not valid
        """
        valid_transitions = self.STATUS_TRANSITIONS.get(self.status, [])
        if new_status not in valid_transitions:
            raise ValidationError(
                f"Cannot transition from {self.status} to {new_status}. "
                f"Valid transitions: {valid_transitions}"
            )

        if new_status == "DECLINED" and not reason:
            raise ValidationError("A reason is required when declining a referral.")

        self.status = new_status

        if new_status == "ACCEPTED":
            self.accepted_at = timezone.now()
            self.accepted_by = user
        elif new_status == "DECLINED":
            self.declined_at = timezone.now()
            self.declined_by = user
            self.decline_reason = reason
        elif new_status == "COMPLETED":
            self.completed_at = timezone.now()

        self.save()

    def accept(self, user):
        """Accept the referral."""
        self.update_status("ACCEPTED", user=user)

    def decline(self, user, reason):
        """Decline the referral with a reason."""
        self.update_status("DECLINED", user=user, reason=reason)

    def cancel(self, user=None):
        """Cancel the referral."""
        self.update_status("CANCELLED", user=user)

    def complete(self):
        """Mark the referral as completed."""
        self.update_status("COMPLETED")

    def expire(self):
        """Mark the referral as expired."""
        if self.status == "PENDING":
            self.status = "EXPIRED"
            self.save(update_fields=["status", "updated_at"])

    @property
    def is_active(self):
        """Whether the referral is still actionable."""
        return self.status in ("DRAFT", "PENDING", "ACCEPTED", "IN_PROGRESS")

    @property
    def is_terminal(self):
        """Whether the referral is in a terminal state."""
        return self.status in ("COMPLETED", "CANCELLED", "DECLINED", "EXPIRED")

    @property
    def is_admission(self):
        """Whether this is an admission referral."""
        return self.referral_type == "ADMISSION"

    @property
    def is_external(self):
        """Whether this is an external referral."""
        return self.referral_type == "EXTERNAL"

    @property
    def is_allied_health(self):
        """Whether this is an allied health referral."""
        return self.referral_type == "ALLIED_HEALTH"

    def get_clinic_type(self):
        """Get the corresponding clinic type for queue routing."""
        return self.SERVICE_TO_CLINIC_TYPE.get(self.target_service)

    def snapshot_encounter_context(self):
        """
        Capture current diagnoses and vitals from the encounter.

        Called before save to provide clinical context to the
        receiving service without them needing to look it up.
        """
        if not self.encounter:
            return

        # Snapshot diagnoses
        try:
            diagnoses = self.encounter.diagnoses.all()
            self.relevant_diagnoses = [
                {
                    "code": d.icd10_code.code if d.icd10_code else "",
                    "description": d.icd10_code.description if d.icd10_code else d.description,
                    "diagnosis_type": d.diagnosis_type,
                }
                for d in diagnoses
            ]
        except Exception:
            self.relevant_diagnoses = []

        # Snapshot vitals
        vitals = {}
        for field in [
            "temperature",
            "pulse",
            "blood_pressure",
            "respiratory_rate",
            "spo2",
            "weight",
            "height",
        ]:
            value = getattr(self.encounter, field, None)
            if value is not None:
                vitals[field] = str(value)
        self.relevant_vitals = vitals
