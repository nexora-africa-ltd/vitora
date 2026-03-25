"""
Encounter model for Vitora HMIS.

This module defines the Encounter model and related functionality,
including ICD-10 diagnosis codes and treatment plans.

Sprint 1.1-1.2: Enhanced encounter management with diagnosis and treatment tracking.
"""

import re
from datetime import date

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin

# ICD-10 code format validator
icd10_code_validator = RegexValidator(
    regex=r"^[A-Z]\d{2}(\.\d{1,2})?$",
    message="ICD-10 code must be in format: Letter + 2 digits (e.g., A09) "
    "or Letter + 2 digits + decimal + 1-2 digits (e.g., J18.9)",
)


class ICD10Code(models.Model):
    """
    ICD-10 diagnosis code reference model.

    International Classification of Diseases, 10th Revision codes
    used for standardized diagnosis coding.

    Attributes:
        code: ICD-10 code (e.g., A09, J18.9)
        description: Full description of the diagnosis
        category: Disease category
        chapter: ICD-10 chapter number (1-22)
    """

    code = models.CharField(
        max_length=10,
        unique=True,
        validators=[icd10_code_validator],
        help_text="ICD-10 code (e.g., A09, J18.9)",
    )
    short_description = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Short description of the diagnosis",
    )
    description = models.CharField(
        max_length=500,
        help_text="Full description of the diagnosis",
    )
    long_description = models.TextField(
        blank=True,
        default="",
        help_text="Detailed long description of the diagnosis",
    )
    category = models.CharField(
        max_length=200,
        help_text="Disease category (e.g., Certain infectious and parasitic diseases)",
    )
    chapter = models.IntegerField(
        help_text="ICD-10 chapter number (1-22)",
    )
    is_billable = models.BooleanField(
        default=True,
        help_text="Whether this is a billable/terminal code",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this code is currently active/valid",
    )

    class Meta:
        ordering = ["code"]
        verbose_name = "ICD-10 Code"
        verbose_name_plural = "ICD-10 Codes"
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["chapter"]),
            models.Index(fields=["short_description"]),
        ]

    def __str__(self) -> str:
        return f"{self.code} - {self.description}"

    def clean(self):
        """Validate ICD-10 code format."""
        super().clean()
        if self.code:
            # Uppercase the code
            self.code = self.code.upper()
            # Validate format
            if not re.match(r"^[A-Z]\d{2}(\.\d{1,2})?$", self.code):
                raise ValidationError(
                    {
                        "code": "ICD-10 code must be in format: Letter + 2 digits (e.g., A09) "
                        "or Letter + 2 digits + decimal + 1-2 digits (e.g., J18.9)"
                    }
                )

    def save(self, *args, **kwargs):
        """Ensure code is uppercased on save."""
        if self.code:
            self.code = self.code.upper()
        super().save(*args, **kwargs)


class Encounter(HistoryMixin, models.Model):
    """
    Encounter model representing a patient encounter/visit.

    Attributes:
        patient: Foreign key to Patient model
        encounter_type: Type of encounter (OPD/IPD/EMERGENCY/etc.)
        encounter_date: Date of the encounter
        chief_complaint: Patient's main complaint
        temperature: Body temperature in Celsius
        pulse: Pulse rate (beats per minute)
        blood_pressure: Blood pressure (systolic/diastolic format)
        respiratory_rate: Respiratory rate (breaths per minute)
        weight: Patient weight in kg
        height: Patient height in cm
        notes: Additional clinical notes
        triage_requirement: Whether triage is MANDATORY/OPTIONAL/NOT_REQUIRED
        triage_status: Current triage status (PENDING/COMPLETED/BYPASSED/etc.)
        consultation_status: Current consultation status (WAITING/CALLED/etc.)
        created_at: Timestamp when the record was created
        updated_at: Timestamp when the record was last updated
        history: Version history tracked by django-simple-history
    """

    # =========================================================================
    # Extended Encounter Type Choices (Phase 1 - Consultation Queue)
    # =========================================================================
    ENCOUNTER_TYPE_CHOICES = [
        # Existing (MANDATORY triage)
        ("OPD", "Outpatient Department"),
        ("IPD", "Inpatient Department"),
        ("EMERGENCY", "Emergency"),
        # High-risk clinics (MANDATORY triage)
        ("ANC", "Antenatal Clinic"),
        ("PAEDIATRIC", "Paediatric Clinic"),
        ("DIALYSIS", "Dialysis Unit"),
        ("ONCOLOGY", "Oncology Clinic"),
        # Scheduled visits (OPTIONAL triage)
        ("SCHEDULED_OPD", "Scheduled Outpatient"),
        ("FOLLOW_UP", "Follow-up Visit"),
        ("CONSULTANT_REVIEW", "Consultant Review"),
        ("CHRONIC_STABLE", "Stable Chronic Care"),
        ("SPECIALIST_CLINIC", "Specialist Clinic"),
        # Pre-assessed (NOT_REQUIRED triage)
        ("PROCEDURE", "Scheduled Procedure"),
        ("DAY_CASE", "Day Case"),
        ("WARD_ROUND", "Ward Round"),
        ("DISCHARGE_REVIEW", "Discharge Review"),
    ]

    # =========================================================================
    # Triage Requirement Choices
    # =========================================================================
    TRIAGE_REQUIREMENT_CHOICES = [
        ("MANDATORY", "Mandatory - Must complete triage"),
        ("OPTIONAL", "Optional - Can bypass triage"),
        ("NOT_REQUIRED", "Not Required - Skip triage"),
    ]

    # Mapping from encounter type to triage requirement
    ENCOUNTER_TYPE_TRIAGE_MAP = {
        # Mandatory triage types
        "OPD": "MANDATORY",
        "IPD": "MANDATORY",
        "EMERGENCY": "MANDATORY",
        "ANC": "MANDATORY",
        "PAEDIATRIC": "MANDATORY",
        "DIALYSIS": "MANDATORY",
        "ONCOLOGY": "MANDATORY",
        # Optional triage types
        "SCHEDULED_OPD": "OPTIONAL",
        "FOLLOW_UP": "OPTIONAL",
        "CONSULTANT_REVIEW": "OPTIONAL",
        "CHRONIC_STABLE": "OPTIONAL",
        "SPECIALIST_CLINIC": "OPTIONAL",
        # Not required triage types
        "PROCEDURE": "NOT_REQUIRED",
        "DAY_CASE": "NOT_REQUIRED",
        "WARD_ROUND": "NOT_REQUIRED",
        "DISCHARGE_REVIEW": "NOT_REQUIRED",
    }

    # =========================================================================
    # Triage Status Choices
    # =========================================================================
    TRIAGE_STATUS_CHOICES = [
        ("PENDING", "Pending - Awaiting triage"),
        ("IN_PROGRESS", "In Progress - Being triaged"),
        ("COMPLETED", "Completed - Triage done"),
        ("BYPASSED", "Bypassed - Triage skipped"),
        ("NOT_APPLICABLE", "Not Applicable - Triage not required"),
    ]

    # =========================================================================
    # Triage Bypass Reason Choices
    # =========================================================================
    TRIAGE_BYPASS_REASON_CHOICES = [
        ("STABLE_FOLLOW_UP", "Stable follow-up patient"),
        ("CONSULTANT_DECISION", "Consultant/senior decision"),
        ("CHRONIC_CARE_REVIEW", "Chronic care review"),
        ("STAFF_SHORTAGE", "Staff shortage"),
        ("PATIENT_PREFERENCE", "Patient preference"),
        ("OTHER", "Other reason"),
    ]

    # =========================================================================
    # Consultation Status Choices
    # =========================================================================
    CONSULTATION_STATUS_CHOICES = [
        ("WAITING", "Waiting for consultation"),
        ("CALLED", "Called - Patient summoned"),
        ("IN_PROGRESS", "In Progress - Being seen"),
        ("COMPLETED", "Completed - Consultation done"),
    ]

    # Required fields
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="encounters",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="encounters",
        null=True,
        blank=True,
        help_text="Facility where this encounter took place.",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="encounters",
        help_text="Patient associated with this encounter",
    )

    # Clinic Visit Integration (Sprint 2.5 - Clinic Integration)
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="encounters",
        help_text="Clinic visit that initiated this encounter (if routed via clinic queue)",
    )
    encounter_type = models.CharField(
        max_length=20, choices=ENCOUNTER_TYPE_CHOICES, help_text="Type of encounter"
    )
    encounter_date = models.DateField(default=date.today, help_text="Date of the encounter")
    chief_complaint = models.TextField(help_text="Patient's chief complaint")

    # Vital signs (optional)
    temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Body temperature in Celsius",
    )
    pulse = models.IntegerField(null=True, blank=True, help_text="Pulse rate (beats per minute)")
    blood_pressure = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Blood pressure (e.g., 120/80)",
    )
    respiratory_rate = models.IntegerField(
        null=True, blank=True, help_text="Respiratory rate (breaths per minute)"
    )

    # Vitals metadata (source tracking)
    VITALS_SOURCE_CHOICES = [
        ("TRIAGE", "Triage"),
        ("CONSULTATION", "Consultation"),
        ("NURSING", "Nursing"),
    ]
    vitals_source = models.CharField(
        max_length=20,
        choices=VITALS_SOURCE_CHOICES,
        null=True,
        blank=True,
        help_text="Where the vitals were recorded (e.g., triage)",
    )
    vitals_recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="encounter_vitals_recorded",
        help_text="User who recorded the vitals",
    )
    vitals_recorded_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when vitals were recorded",
    )
    weight = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Patient weight in kg",
    )
    height = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Patient height in cm",
    )
    spo2 = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Oxygen saturation percentage (SpO2)",
    )

    # Medical History Section
    allergies = models.TextField(
        blank=True,
        default="",
        help_text="Known allergies (medications, food, environmental)",
    )
    chronic_conditions = models.TextField(
        blank=True,
        default="",
        help_text="Chronic conditions (e.g., Diabetes, Hypertension, Asthma)",
    )
    current_medications = models.TextField(
        blank=True,
        default="",
        help_text="Current medications with dosage",
    )
    past_surgeries = models.TextField(
        blank=True,
        default="",
        help_text="Past surgical procedures with dates",
    )
    family_history = models.TextField(
        blank=True,
        default="",
        help_text="Relevant family medical history",
    )
    social_history = models.TextField(
        blank=True,
        default="",
        help_text="Social history (smoking, alcohol, occupation, lifestyle)",
    )

    # Clinical notes
    notes = models.TextField(blank=True, default="", help_text="Additional clinical notes")

    # SOAP Note Fields (Sprint 1.5-1.6: Clinical Documentation)
    history_of_present_illness = models.TextField(
        blank=True,
        default="",
        help_text="History of Present Illness (HPI) - detailed narrative of the patient's condition",
    )
    physical_examination = models.TextField(
        blank=True,
        default="",
        help_text="Physical Examination findings",
    )
    assessment = models.TextField(
        blank=True,
        default="",
        help_text="Clinical assessment/impression (SOAP 'A')",
    )
    # Note: SOAP 'P' (Plan) is stored in TreatmentPlan.clinical_notes

    # Clinical Template Data (stores structured assessment data from templates)
    clinical_template = models.ForeignKey(
        "clinical_templates.ClinicalTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="encounters",
        help_text="Clinical template used for this encounter",
    )
    clinical_template_data = models.JSONField(
        null=True,
        blank=True,
        help_text="Structured data collected using the clinical template (JSON)",
    )

    # Encounter Status (Sprint 2 - Enhanced State Machine)
    STATUS_CHOICES = [
        ("CREATED", "Created"),
        ("CHECKED_IN", "Checked In"),
        ("TRIAGED", "Triaged"),
        ("IN_PROGRESS", "In Progress"),
        ("ON_HOLD", "On Hold"),
        ("ORDERS_PLACED", "Orders Placed"),
        ("RESULTS_PENDING", "Results Pending"),
        ("READY_TO_CLOSE", "Ready to Close"),
        ("CLOSED", "Closed"),
        ("CANCELLED", "Cancelled"),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="CREATED",
        help_text="Encounter status lifecycle",
    )
    finalized_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finalized_encounters",
        help_text="User who finalized/completed this encounter",
    )
    finalized_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the encounter was finalized/completed",
    )
    cancellation_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for cancellation (if status is CANCELLED)",
    )

    # =========================================================================
    # Disposition Fields (Clinical Documentation Enhancement)
    # =========================================================================
    DISPOSITION_CHOICES = [
        ("", "Not Set"),
        ("ADVICE_ONLY", "Advice Only"),
        ("TREATED_DISCHARGED", "Treated & Discharged"),
        ("REFERRED", "Referred to Specialist"),
        ("ADMITTED", "Admitted to Inpatient"),
        ("FOLLOW_UP_SCHEDULED", "Follow-up Scheduled"),
        ("LEFT_AMA", "Left Against Medical Advice"),
    ]
    disposition = models.CharField(
        max_length=30,
        choices=DISPOSITION_CHOICES,
        blank=True,
        default="",
        help_text="Encounter outcome/disposition",
    )
    disposition_notes = models.TextField(
        blank=True,
        default="",
        help_text="Required for ADVICE_ONLY and LEFT_AMA dispositions",
    )

    # =========================================================================
    # Triage Fields (Phase 1 - Consultation Queue)
    # =========================================================================
    triage_requirement = models.CharField(
        max_length=20,
        choices=TRIAGE_REQUIREMENT_CHOICES,
        default="MANDATORY",
        help_text="Whether triage is mandatory, optional, or not required",
    )
    triage_status = models.CharField(
        max_length=20,
        choices=TRIAGE_STATUS_CHOICES,
        default="PENDING",
        help_text="Current triage status",
    )
    triage_bypass_reason = models.CharField(
        max_length=30,
        choices=TRIAGE_BYPASS_REASON_CHOICES,
        blank=True,
        default="",
        help_text="Reason for bypassing triage (if applicable)",
    )
    triage_bypassed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triage_bypasses",
        help_text="User who bypassed the triage",
    )
    triage_bypassed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when triage was bypassed",
    )

    # =========================================================================
    # Consultation Status Fields (Phase 1 - Consultation Queue)
    # =========================================================================
    consultation_status = models.CharField(
        max_length=20,
        choices=CONSULTATION_STATUS_CHOICES,
        default="WAITING",
        help_text="Current consultation status",
    )
    called_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when patient was called for consultation",
    )
    consultation_started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when consultation started",
    )

    # =========================================================================
    # Chief Complaint Edit Tracking (Audit Trail)
    # =========================================================================
    CHIEF_COMPLAINT_EDIT_REASON_CHOICES = [
        ("ADDITIONAL_SYMPTOMS", "Additional symptoms identified"),
        ("PATIENT_DETAILS", "Patient provided more details"),
        ("INCORRECT_INITIAL", "Incorrect initial assessment"),
        ("CLARIFICATION", "Clarification after examination"),
        ("MISUNDERSTANDING", "Triage miscommunication"),
        ("OTHER", "Other (specify)"),
    ]

    chief_complaint_original = models.TextField(
        blank=True,
        default="",
        help_text="Original chief complaint from triage (preserved for audit)",
    )
    chief_complaint_edited = models.BooleanField(
        default=False,
        help_text="Whether the chief complaint was edited after triage",
    )
    chief_complaint_edit_reason = models.CharField(
        max_length=30,
        choices=CHIEF_COMPLAINT_EDIT_REASON_CHOICES,
        blank=True,
        default="",
        help_text="Reason for editing chief complaint",
    )
    chief_complaint_edit_reason_other = models.TextField(
        blank=True,
        default="",
        help_text="Details if 'Other' reason selected",
    )
    chief_complaint_edited_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chief_complaint_edits",
        help_text="User who edited the chief complaint",
    )
    chief_complaint_edited_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when chief complaint was edited",
    )

    # =========================================================================
    # Clinician Assignment Fields (Data Integrity - Sprint 1.7)
    # =========================================================================
    assigned_clinician = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_encounters",
        help_text="Clinician currently attending this encounter",
    )
    claimed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when clinician claimed this encounter",
    )

    # =========================================================================
    # Encounter Linking (Sprint 2 - Phase 2B)
    # =========================================================================
    linked_encounter = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="follow_up_encounters",
        help_text="Previous encounter this visit is following up on",
    )

    # =========================================================================
    # Visit Reason Taxonomy (Sprint 2 - Phase 2D)
    # =========================================================================
    VISIT_REASON_CHOICES = [
        ("NEW_COMPLAINT", "New Complaint"),
        ("FOLLOW_UP", "Follow-up"),
        ("CHRONIC_CARE", "Chronic Care Review"),
        ("PROCEDURE_REVIEW", "Post-Procedure Review"),
        ("REFILL_ONLY", "Medication Refill Only"),
        ("LAB_REVIEW", "Lab Results Review"),
        ("REFERRAL_VISIT", "Referral from Another Facility"),
        ("OTHER", "Other"),
    ]
    visit_reason = models.CharField(
        max_length=30,
        choices=VISIT_REASON_CHOICES,
        default="NEW_COMPLAINT",
        help_text="Reason for visit",
    )

    created_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_encounters",
        help_text="User who created this encounter",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Version history tracking (DHA Audit Trail Enhancement)
    history = HistoricalRecords(
        table_name="encounters_encounter_history",
        excluded_fields=["updated_at"],  # Auto-updated field not useful in history
    )

    class Meta:
        """Meta options for Encounter model."""

        ordering = ["-encounter_date", "-created_at"]
        indexes = [
            models.Index(fields=["patient", "-encounter_date"]),
            models.Index(fields=["encounter_type"]),
            models.Index(fields=["encounter_date"]),
            models.Index(fields=["assigned_clinician", "status"]),
        ]
        constraints = [
            # Only ONE IN_PROGRESS encounter per patient at a time
            models.UniqueConstraint(
                fields=["patient"],
                condition=models.Q(status="IN_PROGRESS"),
                name="unique_active_encounter_per_patient",
            ),
        ]
        verbose_name = "Encounter"
        verbose_name_plural = "Encounters"

    def __str__(self) -> str:
        """String representation of the encounter."""
        return f"{self.patient.mrn} - {self.encounter_type} - {self.encounter_date}"

    def clean(self):
        """Validate the model fields."""
        super().clean()

        # Validate temperature range (30-45°C)
        # Lower bound allows recording severe hypothermia (<32°C)
        if self.temperature is not None and (self.temperature < 30.0 or self.temperature > 45.0):
            raise ValidationError({"temperature": "Temperature must be between 30°C and 45°C."})

        # Validate pulse range (30-200 bpm)
        if self.pulse is not None and (self.pulse < 30 or self.pulse > 200):
            raise ValidationError({"pulse": "Pulse must be between 30 and 200 beats per minute."})

        # Validate blood pressure format
        if self.blood_pressure:
            bp_pattern = r"^\d{2,3}/\d{2,3}$"
            if not re.match(bp_pattern, self.blood_pressure):
                raise ValidationError(
                    {
                        "blood_pressure": "Blood pressure must be in format 'systolic/diastolic' (e.g., 120/80)."
                    }
                )

        # Validate respiratory rate (8-40 breaths/min)
        if self.respiratory_rate is not None and (
            self.respiratory_rate < 8 or self.respiratory_rate > 40
        ):
            raise ValidationError(
                {
                    "respiratory_rate": "Respiratory rate must be between 8 and 40 breaths per minute."
                }
            )

        # Validate weight (positive value, reasonable range 0.5-300 kg)
        if self.weight is not None and (self.weight <= 0 or self.weight > 300):
            raise ValidationError({"weight": "Weight must be between 0.5 and 300 kg."})

        # Validate height (positive value, reasonable range 20-250 cm)
        if self.height is not None and (self.height <= 0 or self.height > 250):
            raise ValidationError({"height": "Height must be between 20 and 250 cm."})

        # Validate SpO2 (0-100%)
        if self.spo2 is not None and (self.spo2 < 0 or self.spo2 > 100):
            raise ValidationError({"spo2": "SpO2 must be between 0 and 100%."})

        # =====================================================================
        # Triage Validation (Phase 1 - Consultation Queue)
        # =====================================================================

        # Validate bypass reason required when status is BYPASSED
        if self.triage_status == "BYPASSED" and not self.triage_bypass_reason:
            raise ValidationError(
                {
                    "triage_bypass_reason": "Bypass reason is required when triage status is BYPASSED."
                }
            )

        # Validate that mandatory triage cannot be bypassed
        if self.triage_requirement == "MANDATORY" and self.triage_status == "BYPASSED":
            raise ValidationError(
                {
                    "triage_status": "Mandatory triage cannot be bypassed. Complete triage assessment or change encounter type."
                }
            )

        # =====================================================================
        # Clinician Assignment Validation (Data Integrity - Sprint 1.7)
        # =====================================================================

        # Prevent reassigning an encounter that's already being attended
        if self.pk and self.assigned_clinician:
            try:
                original = Encounter.objects.get(pk=self.pk)
                if (
                    original.assigned_clinician
                    and original.assigned_clinician != self.assigned_clinician
                    and original.status == "IN_PROGRESS"
                ):
                    raise ValidationError(
                        {
                            "assigned_clinician": f"This encounter is already being attended by "
                            f"{original.assigned_clinician.username}. "
                            f"They must release it before another clinician can claim it."
                        }
                    )
            except Encounter.DoesNotExist:
                pass  # New encounter, no validation needed

    def save(self, *args, **kwargs):
        """Override save to auto-set triage fields based on encounter type."""
        # Auto-set triage_requirement based on encounter_type
        if self.encounter_type:
            expected_requirement = self.ENCOUNTER_TYPE_TRIAGE_MAP.get(
                self.encounter_type, "MANDATORY"
            )
            self.triage_requirement = expected_requirement

        # Auto-set triage_status for NOT_REQUIRED encounters
        if self.triage_requirement == "NOT_REQUIRED":
            if self.triage_status == "PENDING":
                self.triage_status = "NOT_APPLICABLE"

        super().save(*args, **kwargs)

    def can_enter_consultation(self) -> bool:
        """
        Check if the encounter can enter consultation queue.

        Returns True if:
        - Triage is COMPLETED
        - Triage is BYPASSED (for optional triage)
        - Triage is NOT_APPLICABLE (for not required triage)

        Returns False if:
        - Triage is PENDING and requirement is MANDATORY
        - Triage is IN_PROGRESS
        - Triage is PENDING and requirement is OPTIONAL (must bypass or complete)

        Returns:
            bool: True if can enter consultation, False otherwise
        """
        return self.triage_status in ("COMPLETED", "BYPASSED", "NOT_APPLICABLE")

    def begin_consultation(self) -> "Encounter":
        """
        Start consultation for this encounter.

        Sets consultation_status to IN_PROGRESS and records the start time.
        This is the single source of truth for starting consultations,
        called by both the Encounter API and ClinicVisit workflows.

        Raises:
            ValueError: If encounter cannot enter consultation (triage required)
                or consultation is already in progress/completed.

        Returns:
            Encounter: Self, for method chaining.
        """
        from django.utils import timezone

        if not self.can_enter_consultation():
            raise ValueError("Encounter cannot enter consultation. Triage may be required.")

        if self.consultation_status == "IN_PROGRESS":
            raise ValueError("Consultation is already in progress.")

        if self.consultation_status == "COMPLETED":
            raise ValueError("Consultation is already completed.")

        self.consultation_status = "IN_PROGRESS"
        self.consultation_started_at = timezone.now()
        self.save(update_fields=["consultation_status", "consultation_started_at"])

        return self

    def has_critical_vitals(self) -> bool:
        """
        Check if any vital signs are in critical ranges.

        Uses age-appropriate ranges for pediatric patients.

        Returns:
            bool: True if any vital signs are critical
        """
        # Check each vital using the age-aware get_vital_status method
        vitals_to_check = [
            "temperature",
            "pulse",
            "respiratory_rate",
            "spo2",
            "systolic_bp",
            "diastolic_bp",
        ]

        for vital in vitals_to_check:
            status = self.get_vital_status(vital)
            if status == "critical":
                return True

        return False

    def get_alerts(self) -> str:
        """
        Get alert messages for critical vital signs.

        Uses age-appropriate ranges for pediatric patients.

        Returns:
            str: Alert messages for critical vitals
        """
        alerts = []
        age_suffix = " (pediatric)" if self.is_pediatric_patient() else ""

        # Temperature alerts (aligned with triage thresholds)
        if self.temperature is not None:
            temp_status = self.get_vital_status("temperature")
            if temp_status == "critical":
                if float(self.temperature) >= 40.0:
                    alerts.append(f"High fever / Hyperpyrexia{age_suffix}")
                else:
                    alerts.append(f"Severe hypothermia{age_suffix}")

        # Pulse alerts
        if self.pulse is not None:
            pulse_status = self.get_vital_status("pulse")
            if pulse_status == "critical":
                ranges = self._get_vital_ranges_for_patient()["pulse"]
                if self.pulse > ranges["normal"][1]:
                    alerts.append(f"High pulse rate (tachycardia){age_suffix}")
                else:
                    alerts.append(f"Low pulse rate (bradycardia){age_suffix}")

        # Respiratory rate alerts
        if self.respiratory_rate is not None:
            rr_status = self.get_vital_status("respiratory_rate")
            if rr_status == "critical":
                ranges = self._get_vital_ranges_for_patient()["respiratory_rate"]
                if self.respiratory_rate > ranges["normal"][1]:
                    alerts.append(f"High respiratory rate (tachypnea){age_suffix}")
                else:
                    alerts.append(f"Low respiratory rate (bradypnea){age_suffix}")

        # SpO2 alerts (critical threshold same for all ages: <90%)
        if self.spo2 is not None:
            spo2_val = float(self.spo2)
            spo2_status = self.get_vital_status("spo2")
            if spo2_status == "critical":
                alerts.append(
                    f"CRITICAL: Severe hypoxemia (SpO2 {spo2_val:.0f}% < 90%) - urgent evaluation needed{age_suffix}"
                )
            elif spo2_status == "warning" and spo2_val < 92:
                alerts.append(
                    f"Low oxygen saturation (SpO2 {spo2_val:.0f}%) - medical advice recommended{age_suffix}"
                )

        # Blood pressure alerts
        systolic = self.get_systolic_bp()
        _ = self.get_diastolic_bp()  # Calculated but not yet used in alerts
        if systolic is not None:
            bp_status = self.get_vital_status("systolic_bp")
            if bp_status == "critical":
                ranges = self._get_vital_ranges_for_patient()["systolic_bp"]
                if systolic > ranges["normal"][1]:
                    alerts.append(f"Hypertensive crisis{age_suffix}")
                else:
                    alerts.append(f"Hypotension (low blood pressure){age_suffix}")

        return ", ".join(alerts) if alerts else ""

    def get_systolic_bp(self) -> int | None:
        """
        Extract systolic blood pressure from blood_pressure string.

        Returns:
            int | None: Systolic BP value or None if not set
        """
        if not self.blood_pressure:
            return None
        try:
            parts = self.blood_pressure.split("/")
            return int(parts[0]) if len(parts) == 2 else None
        except (ValueError, IndexError):
            return None

    def get_diastolic_bp(self) -> int | None:
        """
        Extract diastolic blood pressure from blood_pressure string.

        Returns:
            int | None: Diastolic BP value or None if not set
        """
        if not self.blood_pressure:
            return None
        try:
            parts = self.blood_pressure.split("/")
            return int(parts[1]) if len(parts) == 2 else None
        except (ValueError, IndexError):
            return None

    def calculate_bmi(self) -> float | None:
        """
        Calculate Body Mass Index from weight and height.

        BMI = weight (kg) / height (m)^2

        Returns:
            float | None: BMI value or None if weight/height missing
        """
        if not self.weight or not self.height:
            return None
        height_m = float(self.height) / 100  # Convert cm to m
        bmi = float(self.weight) / (height_m**2)
        return round(bmi, 1)

    def get_bmi_classification(self) -> str | None:
        """
        Get BMI classification based on WHO standards.

        Returns:
            str | None: BMI classification or None if BMI cannot be calculated
        """
        bmi = self.calculate_bmi()
        if bmi is None:
            return None
        if bmi < 18.5:
            return "Underweight"
        elif bmi < 25:
            return "Normal"
        elif bmi < 30:
            return "Overweight"
        else:
            return "Obese"

    # =========================================================================
    # Encounter Status Workflow Methods (Sprint 1.1-1.2)
    # =========================================================================

    # Valid status transitions (Sprint 2 - Enhanced State Machine)
    VALID_TRANSITIONS = {
        "CREATED": {"CHECKED_IN", "CANCELLED"},
        "CHECKED_IN": {"TRIAGED", "IN_PROGRESS", "CANCELLED"},
        "TRIAGED": {"IN_PROGRESS", "CANCELLED"},
        "IN_PROGRESS": {"ON_HOLD", "ORDERS_PLACED", "READY_TO_CLOSE", "CANCELLED"},
        "ON_HOLD": {"IN_PROGRESS", "CANCELLED"},
        "ORDERS_PLACED": {"RESULTS_PENDING", "READY_TO_CLOSE"},
        "RESULTS_PENDING": {"READY_TO_CLOSE"},
        "READY_TO_CLOSE": {"CLOSED"},
        "CLOSED": set(),  # Terminal state - immutable
        "CANCELLED": set(),  # Terminal state
    }

    def has_vitals(self) -> bool:
        """
        Check if any vital signs have been recorded for this encounter.

        Returns True if at least one of the core vital sign fields has a value:
        temperature, pulse, blood_pressure, respiratory_rate, or spo2.

        Returns:
            bool: True if vitals have been recorded, False otherwise
        """
        return any([
            self.temperature is not None,
            self.pulse is not None,
            self.blood_pressure,  # Non-empty string
            self.respiratory_rate is not None,
            self.spo2 is not None,
        ])

    def can_edit(self) -> bool:
        """
        Check if the encounter can be edited.

        CLOSED and CANCELLED encounters are immutable.
        All other statuses allow editing.

        Returns:
            bool: True if the encounter can be edited, False otherwise
        """
        return self.status not in ("CLOSED", "CANCELLED")

    def is_valid_transition(self, new_status: str) -> bool:
        """
        Check if a status transition is valid.

        Args:
            new_status: The target status to transition to

        Returns:
            bool: True if the transition is valid, False otherwise
        """
        return new_status in self.VALID_TRANSITIONS.get(self.status, set())

    def start_progress(self) -> None:
        """
        Transition encounter to IN_PROGRESS.

        Raises:
            ValidationError: If the encounter cannot transition to IN_PROGRESS
        """
        from django.core.exceptions import ValidationError

        if not self.is_valid_transition("IN_PROGRESS"):
            raise ValidationError(
                f"Cannot start progress on encounter with status '{self.status}'. "
                "Only CREATED, CHECKED_IN, TRIAGED, or ON_HOLD encounters can be started."
            )

        self.status = "IN_PROGRESS"
        self.save(update_fields=["status", "updated_at"])

    def finalize(self, user) -> None:
        """
        Finalize/close the encounter.

        Sets status to CLOSED, records the finalizing user and timestamp.
        Creates an audit log entry for the status change.

        Validates that the encounter has sufficient clinical documentation
        (treatment plan, diagnosis, prescription) OR has an explicit disposition.
        ADVICE_ONLY and LEFT_AMA dispositions require disposition_notes.

        Args:
            user: The user who is finalizing the encounter

        Raises:
            ValidationError: If the encounter is already CLOSED, CANCELLED,
                           or lacks required documentation/disposition.
        """
        from django.core.exceptions import ValidationError
        from django.utils import timezone

        from hmis.apps.core.models import AuditLog

        if self.status == "CLOSED":
            raise ValidationError(
                "Encounter is already closed. Closed encounters cannot be finalized again."
            )

        if self.status == "CANCELLED":
            raise ValidationError(
                "Cannot finalize a cancelled encounter. Cancelled encounters are terminal."
            )

        # Validate documentation requirements
        self._validate_close_requirements()

        old_status = self.status
        self.status = "CLOSED"
        self.finalized_by = user
        self.finalized_at = timezone.now()
        self.save(update_fields=["status", "finalized_by", "finalized_at", "updated_at"])

        # Create audit log entry
        AuditLog.log(
            action="encounter_finalize",
            user=user,
            resource_type="Encounter",
            resource_id=self.id,
            ip_address=None,
            user_agent="",
            patient_id=self.patient_id,
            details={
                "old_status": old_status,
                "new_status": "CLOSED",
                "encounter_type": self.encounter_type,
            },
        )

    def cancel(self, reason: str = "") -> None:
        """
        Cancel the encounter.

        Sets status to CANCELLED and records the reason.

        Args:
            reason: The reason for cancellation

        Raises:
            ValidationError: If the encounter is already CLOSED or CANCELLED
        """
        from django.core.exceptions import ValidationError

        if self.status == "CLOSED":
            raise ValidationError(
                "Cannot cancel a closed encounter. "
                "Closed encounters require a correction workflow."
            )

        if self.status == "CANCELLED":
            # Already cancelled, no action needed
            return

        if not self.is_valid_transition("CANCELLED"):
            raise ValidationError(f"Cannot cancel encounter with status '{self.status}'.")

        self.status = "CANCELLED"
        self.cancellation_reason = reason
        self.save(update_fields=["status", "cancellation_reason", "updated_at"])

    def _validate_close_requirements(self) -> None:
        """
        Validate that the encounter has sufficient documentation before closing.

        An encounter can be closed if ANY of the following are true:
        - Has at least one diagnosis
        - Has a treatment plan
        - Has at least one prescription
        - Has disposition set to ADVICE_ONLY, REFERRED, ADMITTED, FOLLOW_UP_SCHEDULED, or LEFT_AMA

        For ADVICE_ONLY and LEFT_AMA dispositions, disposition_notes are required.
        For REFERRED disposition without other documentation, notes are required.

        Raises:
            ValidationError: If documentation requirements are not met.
        """
        from django.core.exceptions import ValidationError

        # Check for clinical documentation
        has_diagnosis = self.diagnoses.exists()
        has_treatment_plan = hasattr(self, "treatment_plan") and self.treatment_plan is not None
        has_prescription = self.prescriptions.exists() if hasattr(self, "prescriptions") else False

        has_documentation = has_diagnosis or has_treatment_plan or has_prescription

        # Check disposition-based closure
        dispositions_requiring_notes = {"ADVICE_ONLY", "LEFT_AMA"}
        dispositions_allowing_close = {
            "ADVICE_ONLY",
            "REFERRED",
            "ADMITTED",
            "FOLLOW_UP_SCHEDULED",
            "LEFT_AMA",
            "TREATED_DISCHARGED",
        }

        if has_documentation:
            # Has clinical documentation, can close without explicit disposition
            return

        # No clinical documentation - need explicit disposition
        if not self.disposition:
            raise ValidationError(
                "Cannot close encounter without clinical documentation (diagnosis, treatment plan, or prescription). "
                "Either add documentation or set a disposition (e.g., 'Advice Only', 'Referred')."
            )

        if self.disposition not in dispositions_allowing_close:
            raise ValidationError(
                f"Disposition '{self.disposition}' is not sufficient to close without clinical documentation."
            )

        # Check notes requirement for specific dispositions
        if self.disposition in dispositions_requiring_notes and not self.disposition_notes:
            disposition_display = dict(self.DISPOSITION_CHOICES).get(
                self.disposition, self.disposition
            )
            raise ValidationError(
                f"'{disposition_display}' disposition requires disposition notes documenting the advice given."
            )

        # REFERRED without other documentation needs notes
        if self.disposition == "REFERRED" and not self.disposition_notes:
            raise ValidationError(
                "Referred encounters require disposition notes specifying the referral details."
            )

    def get_spo2_interpretation(self) -> dict | None:
        """
        Get SpO2 interpretation with age-appropriate classification and disclaimer.

        Returns:
            dict | None: Dictionary with classification, status, message and disclaimer,
                        or None if SpO2 not recorded.
        """
        if self.spo2 is None:
            return None

        spo2_val = float(self.spo2)
        status = self.get_vital_status("spo2")
        age_group = self.get_pediatric_age_group()

        # Determine classification based on value
        if spo2_val >= 97:
            classification = "Normal (Ideal)"
        elif spo2_val >= 95:
            classification = "Normal"
        elif spo2_val >= 92:
            classification = "Mildly low - monitor"
        elif spo2_val >= 90:
            classification = "Low - medical advice recommended"
        else:
            classification = "CRITICAL - urgent evaluation needed"

        # Build interpretation message
        if age_group == "infant":
            age_note = (
                "For infants (<1yr): values 92-94% are borderline and often monitored closely."
            )
        elif age_group in ("newborn", "toddler", "preschool", "school_age", "adolescent"):
            age_note = "Children may compensate well even with low SpO2. Watch for symptoms: fast breathing, chest retractions, blue lips/nails, lethargy."
        else:
            age_note = (
                "Adults: persistent SpO2 <92% or any reading <90% warrants medical attention."
            )

        return {
            "value": spo2_val,
            "status": status,
            "classification": classification,
            "age_group_note": age_note,
            "altitude_disclaimer": (
                "Note: SpO2 readings can be affected by altitude. At higher elevations (>2500m/8000ft), "
                "normal SpO2 may be 1-5% lower than at sea level. Patients acclimatized to high altitude "
                "may have baseline SpO2 of 90-95% which is normal for their location."
            ),
            "when_to_seek_help": (
                "Seek medical help if: SpO2 persistently below 92%, any reading below 90%, "
                "rapid drop from normal, breathing difficulty, chest pain, confusion, or bluish color."
            ),
        }

    # Vital sign ranges for status classification (Adult defaults)
    # Temperature aligned with triage thresholds:
    # - Normal: 36-37.5°C
    # - Warning low: 32-36°C (mild 35-36, moderate 32-35)
    # - Warning high: 37.6-39.9°C (low-grade 37.6-38.4, moderate 38.5-39.9)
    # - Critical low: <32°C (severe hypothermia)
    # - Critical high: ≥40°C (high fever / hyperpyrexia)
    VITAL_RANGES = {
        "temperature": {
            "unit": "°C",
            "normal": (36.0, 37.5),
            "warning_low": (32.0, 35.9),
            "warning_high": (37.6, 39.9),
            "critical_low": 32.0,
            "critical_high": 40.0,
        },
        "pulse": {
            "unit": "bpm",
            "normal": (60, 100),
            "warning_low": (50, 59),
            "warning_high": (101, 120),
            "critical_low": 50,
            "critical_high": 120,
        },
        "systolic_bp": {
            "unit": "mmHg",
            "normal": (90, 120),
            "warning_low": None,  # No warning, jump to critical
            "warning_high": (121, 139),
            "critical_low": 90,  # <90 is hypotension
            "critical_high": 140,
        },
        "diastolic_bp": {
            "unit": "mmHg",
            "normal": (60, 80),
            "warning_low": None,  # No warning, jump to critical
            "warning_high": (81, 89),
            "critical_low": 60,  # <60 is hypotension
            "critical_high": 90,
        },
        "respiratory_rate": {
            "unit": "/min",
            "normal": (12, 20),
            "warning_low": None,  # No warning, <12 is critical
            "warning_high": (21, 25),
            "critical_low": 12,  # <12 is bradypnea (critical)
            "critical_high": 25,
        },
        "spo2": {
            "unit": "%",
            "normal": (95, 100),
            "warning_low": (90, 94),  # Mildly low - monitor, especially if symptoms
            "warning_high": None,
            "critical_low": 90,  # <90% is critical - requires urgent evaluation
            "critical_high": None,
        },
    }

    # Age-specific SpO2 ranges (used in addition to base ranges)
    # Note: SpO2 interpretation should also consider altitude
    SPO2_AGE_RANGES = {
        "infant": {  # < 1 year
            "normal": (95, 100),
            "borderline": (92, 94),  # Often monitored closely
            "critical": 90,  # <90% requires urgent care
        },
        "child": {  # 1-17 years
            "normal": (95, 100),
            "mildly_low": (92, 94),  # Monitor, especially if symptoms
            "low": (90, 91),  # Medical advice recommended
            "critical": 90,  # <90% requires urgent evaluation
        },
        "adult": {  # ≥18 years
            "normal": (95, 100),
            "mildly_low": (92, 94),  # Monitor, especially if symptoms
            "low": (90, 91),  # Medical advice recommended
            "critical": 90,  # <90% requires urgent evaluation
        },
    }

    # Pediatric vital sign ranges by age group
    # Based on PALS (Pediatric Advanced Life Support) guidelines
    PEDIATRIC_VITAL_RANGES = {
        "newborn": {  # 0-28 days
            "pulse": {
                "unit": "bpm",
                "normal": (100, 205),
                "warning_low": (90, 99),
                "warning_high": (206, 220),
                "critical_low": 90,
                "critical_high": 220,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (30, 60),
                "warning_low": (26, 29),
                "warning_high": (61, 64),
                "critical_low": 26,
                "critical_high": 64,
            },
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (60, 90),
                "warning_low": (50, 59),
                "warning_high": (91, 105),
                "critical_low": 50,
                "critical_high": 105,
            },
            "diastolic_bp": {
                "unit": "mmHg",
                "normal": (30, 60),
                "warning_low": (20, 29),
                "warning_high": (61, 70),
                "critical_low": 20,
                "critical_high": 70,
            },
        },
        "infant": {  # 1-12 months
            "pulse": {
                "unit": "bpm",
                "normal": (100, 180),
                "warning_low": (80, 99),
                "warning_high": (181, 200),
                "critical_low": 80,
                "critical_high": 200,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (30, 53),
                "warning_low": (25, 29),
                "warning_high": (54, 65),
                "critical_low": 25,
                "critical_high": 65,
            },
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (72, 104),
                "warning_low": (65, 71),
                "warning_high": (105, 115),
                "critical_low": 65,
                "critical_high": 115,
            },
            "diastolic_bp": {
                "unit": "mmHg",
                "normal": (37, 56),
                "warning_low": (30, 36),
                "warning_high": (57, 70),
                "critical_low": 30,
                "critical_high": 70,
            },
        },
        "toddler": {  # 1-3 years
            "pulse": {
                "unit": "bpm",
                "normal": (98, 140),
                "warning_low": (85, 97),
                "warning_high": (141, 160),
                "critical_low": 85,
                "critical_high": 160,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (22, 37),
                "warning_low": (18, 21),
                "warning_high": (38, 45),
                "critical_low": 18,
                "critical_high": 45,
            },
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (86, 106),
                "warning_low": (75, 85),
                "warning_high": (107, 120),
                "critical_low": 75,
                "critical_high": 120,
            },
            "diastolic_bp": {
                "unit": "mmHg",
                "normal": (42, 63),
                "warning_low": (35, 41),
                "warning_high": (64, 75),
                "critical_low": 35,
                "critical_high": 75,
            },
        },
        "preschool": {  # 3-6 years
            "pulse": {
                "unit": "bpm",
                "normal": (80, 120),
                "warning_low": (70, 79),
                "warning_high": (121, 140),
                "critical_low": 70,
                "critical_high": 140,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (20, 28),
                "warning_low": (16, 19),
                "warning_high": (29, 35),
                "critical_low": 16,
                "critical_high": 35,
            },
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (89, 112),
                "warning_low": (80, 88),
                "warning_high": (113, 125),
                "critical_low": 80,
                "critical_high": 125,
            },
            "diastolic_bp": {
                "unit": "mmHg",
                "normal": (46, 72),
                "warning_low": (40, 45),
                "warning_high": (73, 85),
                "critical_low": 40,
                "critical_high": 85,
            },
        },
        "school_age": {  # 6-12 years
            "pulse": {
                "unit": "bpm",
                "normal": (75, 118),
                "warning_low": (65, 74),
                "warning_high": (119, 135),
                "critical_low": 65,
                "critical_high": 135,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (18, 25),
                "warning_low": (14, 17),
                "warning_high": (26, 32),
                "critical_low": 14,
                "critical_high": 32,
            },
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (97, 120),
                "warning_low": (85, 96),
                "warning_high": (121, 135),
                "critical_low": 85,
                "critical_high": 135,
            },
            "diastolic_bp": {
                "unit": "mmHg",
                "normal": (57, 80),
                "warning_low": (50, 56),
                "warning_high": (81, 90),
                "critical_low": 50,
                "critical_high": 90,
            },
        },
        "adolescent": {  # 12-18 years (approaching adult values)
            "pulse": {
                "unit": "bpm",
                "normal": (60, 100),
                "warning_low": (50, 59),
                "warning_high": (101, 120),
                "critical_low": 50,
                "critical_high": 120,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (12, 20),
                "warning_low": (10, 11),
                "warning_high": (21, 25),
                "critical_low": 10,
                "critical_high": 25,
            },
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (90, 120),
                "warning_low": (80, 89),
                "warning_high": (121, 139),
                "critical_low": 80,
                "critical_high": 140,
            },
            "diastolic_bp": {
                "unit": "mmHg",
                "normal": (60, 80),
                "warning_low": (50, 59),
                "warning_high": (81, 89),
                "critical_low": 50,
                "critical_high": 90,
            },
        },
    }

    # Age thresholds in days for pediatric age groups
    PEDIATRIC_AGE_THRESHOLDS = {
        "newborn": (0, 28),  # 0-28 days
        "infant": (29, 365),  # 1-12 months
        "toddler": (366, 1095),  # 1-3 years
        "preschool": (1096, 2190),  # 3-6 years
        "school_age": (2191, 4380),  # 6-12 years
        "adolescent": (4381, 6570),  # 12-18 years
    }

    def get_patient_age_days(self) -> int:
        """
        Calculate patient's age in days at time of encounter.

        Returns:
            int: Patient's age in days
        """
        if not self.patient or not self.patient.date_of_birth:
            return 0
        encounter_date = self.encounter_date or date.today()

        dob = self.patient.date_of_birth
        if isinstance(dob, str):
            try:
                dob = date.fromisoformat(dob)
            except ValueError:
                return 0

        delta = encounter_date - dob
        return delta.days

    def get_patient_age_years(self) -> int:
        """
        Calculate patient's age in years at time of encounter.

        Returns:
            int: Patient's age in complete years
        """
        return self.get_patient_age_days() // 365

    def is_pediatric_patient(self) -> bool:
        """
        Check if patient is pediatric (under 18 years).

        Returns:
            bool: True if patient is under 18, False otherwise
        """
        return self.get_patient_age_years() < 18

    def get_pediatric_age_group(self) -> str | None:
        """
        Determine the pediatric age group for the patient.

        Returns:
            str | None: Age group name ('newborn', 'infant', 'toddler',
                       'preschool', 'school_age', 'adolescent') or None if adult
        """
        if not self.is_pediatric_patient():
            return None

        age_days = self.get_patient_age_days()

        for group, (min_days, max_days) in self.PEDIATRIC_AGE_THRESHOLDS.items():
            if min_days <= age_days <= max_days:
                return group

        return None

    def _get_vital_ranges_for_patient(self) -> dict:
        """
        Get appropriate vital sign ranges based on patient age.

        Returns pediatric ranges for children, adult ranges for adults.

        Returns:
            dict: Vital sign ranges appropriate for patient's age
        """
        age_group = self.get_pediatric_age_group()

        if age_group is None:
            # Adult patient - use default ranges
            return self.VITAL_RANGES

        # Pediatric patient - merge pediatric ranges with defaults
        # (temperature and SpO2 are same across ages)
        pediatric_ranges = self.PEDIATRIC_VITAL_RANGES.get(age_group, {})
        merged_ranges = self.VITAL_RANGES.copy()

        for vital_name, ranges in pediatric_ranges.items():
            merged_ranges[vital_name] = ranges

        return merged_ranges

    def get_vital_status(self, vital_name: str) -> str | None:
        """
        Get status ('normal', 'warning', 'critical') for a specific vital sign.

        Uses age-appropriate ranges for pediatric patients.

        Args:
            vital_name: Name of the vital sign (temperature, pulse, systolic_bp,
                       diastolic_bp, respiratory_rate, spo2)

        Returns:
            str | None: 'normal', 'warning', or 'critical', or None if not recorded

        Raises:
            ValueError: If vital_name is not recognized
        """
        valid_vitals = list(self.VITAL_RANGES.keys())
        if vital_name not in valid_vitals:
            raise ValueError(f"Unknown vital: {vital_name}. Valid options: {valid_vitals}")

        # Get the value
        if vital_name == "temperature":
            value = float(self.temperature) if self.temperature else None
        elif vital_name == "pulse":
            value = self.pulse
        elif vital_name == "systolic_bp":
            value = self.get_systolic_bp()
        elif vital_name == "diastolic_bp":
            value = self.get_diastolic_bp()
        elif vital_name == "respiratory_rate":
            value = self.respiratory_rate
        elif vital_name == "spo2":
            value = float(self.spo2) if self.spo2 else None
        else:
            value = None

        if value is None:
            return None

        # Get age-appropriate ranges (pediatric or adult)
        all_ranges = self._get_vital_ranges_for_patient()
        ranges = all_ranges[vital_name]

        # Check critical first
        if ranges.get("critical_low") and value < ranges["critical_low"]:
            return "critical"
        if ranges.get("critical_high") and value >= ranges["critical_high"]:
            return "critical"

        # Check warning
        if ranges.get("warning_low"):
            low_min, low_max = ranges["warning_low"]
            if low_min <= value <= low_max:
                return "warning"
        if ranges.get("warning_high"):
            high_min, high_max = ranges["warning_high"]
            if high_min <= value <= high_max:
                return "warning"

        # Check normal
        normal_min, normal_max = ranges["normal"]
        if normal_min <= value <= normal_max:
            return "normal"

        # Edge cases - classify as warning if not clearly critical
        return "warning"

    def get_all_vital_statuses(self) -> dict:
        """
        Get status dict for all recorded vitals.

        Returns:
            dict: Dictionary with vital name as key and dict with
                  'value', 'status', 'unit' as value (or None if not recorded)
        """
        statuses = {}

        # Temperature
        if self.temperature:
            statuses["temperature"] = {
                "value": float(self.temperature),
                "status": self.get_vital_status("temperature"),
                "unit": "°C",
            }
        else:
            statuses["temperature"] = None

        # Pulse
        if self.pulse:
            statuses["pulse"] = {
                "value": self.pulse,
                "status": self.get_vital_status("pulse"),
                "unit": "bpm",
            }
        else:
            statuses["pulse"] = None

        # Blood pressure systolic
        systolic = self.get_systolic_bp()
        if systolic:
            statuses["systolic_bp"] = {
                "value": systolic,
                "status": self.get_vital_status("systolic_bp"),
                "unit": "mmHg",
            }
        else:
            statuses["systolic_bp"] = None

        # Blood pressure diastolic
        diastolic = self.get_diastolic_bp()
        if diastolic:
            statuses["diastolic_bp"] = {
                "value": diastolic,
                "status": self.get_vital_status("diastolic_bp"),
                "unit": "mmHg",
            }
        else:
            statuses["diastolic_bp"] = None

        # Respiratory rate
        if self.respiratory_rate:
            statuses["respiratory_rate"] = {
                "value": self.respiratory_rate,
                "status": self.get_vital_status("respiratory_rate"),
                "unit": "/min",
            }
        else:
            statuses["respiratory_rate"] = None

        # SpO2
        if self.spo2:
            statuses["spo2"] = {
                "value": float(self.spo2),
                "status": self.get_vital_status("spo2"),
                "unit": "%",
            }
        else:
            statuses["spo2"] = None

        # Include MAP in statuses
        map_value = self.get_map()
        if map_value is not None:
            statuses["map"] = {
                "value": map_value,
                "status": self.get_map_status(),
                "unit": "mmHg",
            }
        else:
            statuses["map"] = None

        return statuses

    # MAP (Mean Arterial Pressure) ranges by age group
    # Based on clinical guidelines for organ perfusion
    # Reference: Pediatric and Adult Critical Care Guidelines
    MAP_RANGES_BY_AGE = {
        "adult": {  # ≥18 years
            "normal": (70, 100),
            "warning_low": (65, 69),
            "warning_high": (101, 105),
            "critical_low": 65,
            "critical_high": 120,
            "emergency_low": 55,
            "emergency_high": 130,
        },
        "adolescent": {  # 13-17 years
            "normal": (65, 95),
            "warning_low": (60, 64),
            "warning_high": (96, 100),
            "critical_low": 60,
            "critical_high": 115,
            "emergency_low": 50,
            "emergency_high": 125,
        },
        "school_age": {  # 6-12 years
            "normal": (60, 90),
            "warning_low": (55, 59),
            "warning_high": (91, 95),
            "critical_low": 55,
            "critical_high": 110,
            "emergency_low": 45,
            "emergency_high": 120,
        },
        "young_child": {  # 1-5 years
            "normal": (55, 85),
            "warning_low": (50, 54),
            "warning_high": (86, 90),
            "critical_low": 50,
            "critical_high": 100,
            "emergency_low": 40,
            "emergency_high": 110,
        },
        "infant": {  # 1-12 months
            "normal": (45, 70),
            "warning_low": (40, 44),
            "warning_high": (71, 75),
            "critical_low": 40,
            "critical_high": 90,
            "emergency_low": 30,
            "emergency_high": 100,
        },
        "neonate": {  # <1 month
            "normal": (40, 60),
            "warning_low": (35, 39),
            "warning_high": (61, 65),
            "critical_low": 35,
            "critical_high": 80,
            "emergency_low": 25,
            "emergency_high": 90,
        },
    }

    # Default MAP ranges for backward compatibility (adult values)
    MAP_RANGES = {
        "normal": (70, 100),
        "low": (65, 69),
        "high": (101, 105),
        "critical_low": 65,
        "critical_high": 120,
    }

    def _get_map_age_group(self) -> str:
        """Get age group for MAP thresholds."""
        age_years = self.get_patient_age_years()
        if age_years >= 18:
            return "adult"
        if age_years >= 13:
            return "adolescent"
        if age_years >= 6:
            return "school_age"
        if age_years >= 1:
            return "young_child"
        age_days = self.get_patient_age_days()
        if age_days >= 29:
            return "infant"
        return "neonate"

    def get_map(self) -> int | None:
        """
        Calculate Mean Arterial Pressure from blood pressure.

        MAP = DBP + 1/3(SBP - DBP)

        Returns:
            int | None: MAP value rounded to nearest integer, or None if BP not recorded
        """
        systolic = self.get_systolic_bp()
        diastolic = self.get_diastolic_bp()

        if systolic is None or diastolic is None:
            return None

        map_value = diastolic + (systolic - diastolic) / 3
        return round(map_value)

    def get_map_status(self) -> str | None:
        """
        Get status classification for Mean Arterial Pressure.
        Uses age-adjusted thresholds for accurate assessment.

        Status values:
        - 'normal': Within normal range for age
        - 'warning': Slightly abnormal, monitor closely
        - 'critical': Requires immediate attention
        - 'emergency': Life-threatening, immediate intervention needed

        Returns:
            str | None: Status string, or None if BP not recorded
        """
        map_value = self.get_map()

        if map_value is None:
            return None

        # Get age-appropriate ranges
        age_group = self._get_map_age_group()
        ranges = self.MAP_RANGES_BY_AGE.get(age_group, self.MAP_RANGES_BY_AGE["adult"])

        # Check emergency first (most severe)
        if map_value < ranges["emergency_low"]:
            return "emergency"
        if map_value > ranges["emergency_high"]:
            return "emergency"

        # Check critical
        if map_value < ranges["critical_low"]:
            return "critical"
        if map_value > ranges["critical_high"]:
            return "critical"

        # Check normal
        normal_min, normal_max = ranges["normal"]
        if normal_min <= map_value <= normal_max:
            return "normal"

        # Check warning (between normal and critical)
        warning_low_min, warning_low_max = ranges["warning_low"]
        if warning_low_min <= map_value <= warning_low_max:
            return "warning"

        warning_high_min, warning_high_max = ranges["warning_high"]
        if warning_high_min <= map_value <= warning_high_max:
            return "warning"

        # Edge case - classify as warning
        return "warning"

    def get_vitals_summary(self) -> str:
        """
        Get a formatted summary of all vital signs.

        Returns:
            str: Formatted vitals summary
        """
        parts = []
        if self.temperature:
            parts.append(f"Temp: {self.temperature}°C")
        if self.pulse:
            parts.append(f"Pulse: {self.pulse} bpm")
        if self.blood_pressure:
            parts.append(f"BP: {self.blood_pressure} mmHg")
        if self.respiratory_rate:
            parts.append(f"RR: {self.respiratory_rate}/min")
        if self.spo2:
            parts.append(f"SpO2: {self.spo2}%")
        if self.weight:
            parts.append(f"Weight: {self.weight} kg")
        if self.height:
            parts.append(f"Height: {self.height} cm")
        bmi = self.calculate_bmi()
        if bmi:
            parts.append(f"BMI: {bmi} ({self.get_bmi_classification()})")
        return " | ".join(parts) if parts else "No vitals recorded"

    def get_primary_diagnosis(self):
        """
        Get the primary diagnosis for this encounter.

        Returns:
            Diagnosis | None: The primary diagnosis or None if not set
        """
        return self.diagnoses.filter(diagnosis_type="PRIMARY").first()

    def get_diagnosis_codes_display(self) -> str:
        """
        Get all diagnosis codes as a comma-separated string.

        Returns:
            str: Comma-separated diagnosis codes
        """
        codes = []
        for diagnosis in self.diagnoses.all():
            if diagnosis.icd10_code:
                codes.append(diagnosis.icd10_code.code)
            elif diagnosis.free_text_diagnosis:
                codes.append(f"[{diagnosis.free_text_diagnosis[:20]}...]")
        return ", ".join(codes) if codes else "No diagnoses"

    @property
    def has_treatment_plan(self) -> bool:
        """Check if encounter has a treatment plan."""
        return hasattr(self, "treatment_plan") and self.treatment_plan is not None

    def get_treatment_summary(self) -> str:
        """
        Get summary of treatment plan including medications.

        Returns:
            str: Summary of treatment plan
        """
        if not self.has_treatment_plan:
            return "No treatment plan"

        plan = self.treatment_plan
        parts = []

        # Medication count
        med_count = plan.medications.count()
        parts.append(f"Medications: {med_count}")

        # Follow-up info
        if plan.follow_up_date:
            parts.append(f"Follow-up: {plan.follow_up_date}")

        return " | ".join(parts) if parts else "Treatment plan created"

    # =========================================================================
    # Billing Integration Methods (Sprint 1.5-1.6)
    # =========================================================================

    def get_invoice(self):
        """
        Get or create the invoice associated with this encounter.

        Returns:
            Invoice: The invoice for this encounter, or None if none exists.
        """
        from hmis.apps.billing.models import Invoice

        return Invoice.objects.filter(encounter=self).first()

    def add_service(self, service, quantity: int = 1):
        """
        Add a service to this encounter's invoice.

        Creates an InvoiceItem linked to the encounter's invoice.
        If the same service already exists, updates the quantity.

        Args:
            service: The Service instance to add
            quantity: The quantity of the service (default 1)

        Returns:
            InvoiceItem: The created or updated invoice item

        Raises:
            ValidationError: If the encounter is completed or has no invoice
        """
        from decimal import Decimal

        from django.core.exceptions import ValidationError

        from hmis.apps.billing.models import Invoice, InvoiceItem

        # Validate encounter status
        if self.status == "COMPLETED":
            raise ValidationError("Cannot add services to a completed encounter.")

        # Get the encounter's invoice
        invoice = self.get_invoice()
        if not invoice:
            raise ValidationError("Encounter has no associated invoice.")

        # Check if invoice is editable
        if invoice.status not in [Invoice.Status.DRAFT]:
            raise ValidationError(f"Cannot add services to invoice with status '{invoice.status}'.")

        # Check if same service already exists on this invoice
        existing_item = invoice.items.filter(service=service).first()

        if existing_item:
            # Update quantity
            existing_item.quantity += quantity
            existing_item.line_total = (existing_item.quantity * existing_item.unit_price).quantize(
                Decimal("0.01")
            )
            existing_item.save(update_fields=["quantity", "line_total", "updated_at"])
            item = existing_item
        else:
            # Create new invoice item
            item = InvoiceItem.objects.create(
                invoice=invoice,
                item_type=InvoiceItem.ItemType.SERVICE,
                service=service,
                description=service.name,
                quantity=quantity,
                unit_price=service.unit_price,
                line_total=(service.unit_price * Decimal(str(quantity))).quantize(Decimal("0.01")),
            )

        # Recalculate invoice totals
        invoice.calculate_totals()
        invoice.save(
            update_fields=[
                "subtotal",
                "tax_amount",
                "discount_amount",
                "total_amount",
                "balance_due",
                "updated_at",
            ]
        )

        return item

    def complete(self):
        """
        Complete the encounter and finalize its invoice.

        Changes the encounter status to COMPLETED and the associated
        invoice status from DRAFT to PENDING.

        Raises:
            ValidationError: If the encounter is already completed
        """
        from django.core.exceptions import ValidationError

        from hmis.apps.billing.models import Invoice

        if self.status == "COMPLETED":
            raise ValidationError("Encounter is already completed.")

        # Change encounter status
        self.status = "COMPLETED"
        self.save(update_fields=["status", "updated_at"])

        # Finalize the invoice
        invoice = self.get_invoice()
        if invoice and invoice.status == Invoice.Status.DRAFT:
            invoice.status = Invoice.Status.PENDING
            invoice.save(update_fields=["status", "updated_at"])


class Diagnosis(HistoryMixin, models.Model):
    """
    Diagnosis model linking encounters to ICD-10 codes.

    Supports primary, secondary, differential, and working diagnoses.
    Also supports free-text diagnosis when ICD-10 code is not known.

    Attributes:
        encounter: Foreign key to Encounter
        icd10_code: Foreign key to ICD10Code (optional)
        diagnosis_type: Type of diagnosis (PRIMARY, SECONDARY, etc.)
        free_text_diagnosis: Free-text diagnosis when code unknown
        notes: Additional clinical notes
        created_at: Timestamp when diagnosed
    """

    DIAGNOSIS_TYPE_CHOICES = [
        ("PRIMARY", "Primary Diagnosis"),
        ("SECONDARY", "Secondary Diagnosis"),
        ("DIFFERENTIAL", "Differential Diagnosis"),
        ("WORKING", "Working Diagnosis"),
    ]

    CERTAINTY_CHOICES = [
        ("confirmed", "Confirmed"),
        ("provisional", "Provisional"),
        ("ruled_out", "Ruled Out"),
        ("suspected", "Suspected"),
    ]

    # Ordering priority for diagnosis types
    DIAGNOSIS_TYPE_PRIORITY = {
        "PRIMARY": 0,
        "SECONDARY": 1,
        "DIFFERENTIAL": 2,
        "WORKING": 3,
    }

    encounter = models.ForeignKey(
        Encounter,
        on_delete=models.CASCADE,
        related_name="diagnoses",
        help_text="Encounter this diagnosis belongs to",
    )
    icd10_code = models.ForeignKey(
        ICD10Code,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="diagnoses",
        help_text="ICD-10 code for this diagnosis",
    )
    # ICD-11 support (WHO standard, used alongside or instead of ICD-10)
    icd11_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="ICD-11 code (e.g., 1A00, BA00.Z) from WHO ICD-11 API",
    )
    icd11_display = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="ICD-11 display text/title from WHO ICD-11 API",
    )
    # SNOMED CT support (supplementary coding for FHIR interoperability)
    snomed_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="SNOMED CT concept ID (e.g., 38341003) for FHIR interoperability",
    )
    snomed_display = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="SNOMED CT concept display text (e.g., 'Hypertensive disorder')",
    )
    diagnosis_type = models.CharField(
        max_length=20,
        choices=DIAGNOSIS_TYPE_CHOICES,
        help_text="Type of diagnosis",
    )
    free_text_diagnosis = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="Free-text diagnosis when ICD-10 code is unknown",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional clinical notes about the diagnosis",
    )
    is_confirmed = models.BooleanField(
        default=False,
        help_text="Whether the diagnosis has been confirmed",
    )
    certainty = models.CharField(
        max_length=20,
        choices=CERTAINTY_CHOICES,
        default="confirmed",
        help_text="Level of diagnostic certainty",
    )
    diagnosed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="diagnoses_made",
        help_text="Clinician who made the diagnosis",
    )
    diagnosed_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the diagnosis was made",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Version history tracking (DHA Audit Trail Enhancement)
    history = HistoricalRecords(
        table_name="encounters_diagnosis_history",
        excluded_fields=["updated_at"],
    )

    class Meta:
        # Note: For proper ordering by diagnosis_type priority, use
        # Diagnosis.objects.order_by_type() or annotate with Case/When
        ordering = ["created_at"]
        verbose_name = "Diagnosis"
        verbose_name_plural = "Diagnoses"
        indexes = [
            models.Index(fields=["encounter", "diagnosis_type"]),
        ]
        constraints = [
            # Only one principal/primary diagnosis per encounter
            models.UniqueConstraint(
                fields=["encounter"],
                condition=models.Q(diagnosis_type="PRIMARY"),
                name="unique_primary_diagnosis_per_encounter",
            ),
        ]

    @classmethod
    def order_by_type_priority(cls, queryset):
        """Order diagnoses by type priority (PRIMARY first, then SECONDARY, etc.)."""
        from django.db.models import Case, IntegerField, Value, When

        return queryset.annotate(
            type_priority=Case(
                When(diagnosis_type="PRIMARY", then=Value(0)),
                When(diagnosis_type="SECONDARY", then=Value(1)),
                When(diagnosis_type="DIFFERENTIAL", then=Value(2)),
                When(diagnosis_type="WORKING", then=Value(3)),
                default=Value(4),
                output_field=IntegerField(),
            )
        ).order_by("type_priority", "created_at")

    def __str__(self) -> str:
        if self.icd10_code:
            code_str = self.icd10_code.code
        elif self.icd11_code:
            code_str = self.icd11_code
        elif self.snomed_code:
            code_str = f"SNOMED:{self.snomed_code}"
        else:
            code_str = self.free_text_diagnosis[:30]
        return f"{code_str} ({self.diagnosis_type})"

    def clean(self):
        """Validate diagnosis constraints."""
        super().clean()

        # Either ICD-10 code, ICD-11 code, SNOMED CT code, or free text must be provided
        if (
            not self.icd10_code
            and not self.icd11_code
            and not self.snomed_code
            and not self.free_text_diagnosis
        ):
            raise ValidationError(
                "Either ICD-10 code, ICD-11 code, SNOMED CT code, "
                "or free-text diagnosis must be provided."
            )

        # Check for existing primary diagnosis
        if self.diagnosis_type == "PRIMARY":
            existing_primary = Diagnosis.objects.filter(
                encounter=self.encounter,
                diagnosis_type="PRIMARY",
            ).exclude(pk=self.pk)
            if existing_primary.exists():
                raise ValidationError(
                    {"diagnosis_type": "This encounter already has a primary diagnosis."}
                )

    def save(self, *args, **kwargs):
        """Save with validation."""
        self.full_clean()
        super().save(*args, **kwargs)


class TreatmentPlan(models.Model):
    """
    Treatment plan for an encounter.

    Each encounter can have one treatment plan that includes
    clinical notes, follow-up instructions, medications, procedures,
    diet recommendations, activity restrictions, and referral information.
    """

    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("ACTIVE", "Active"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    encounter = models.OneToOneField(
        Encounter,
        on_delete=models.CASCADE,
        related_name="treatment_plan",
        help_text="Encounter this treatment plan belongs to",
    )
    template = models.ForeignKey(
        "TreatmentPlanTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="treatment_plans",
        help_text="Template used to create this plan",
    )
    medications_json = models.TextField(
        blank=True,
        default="",
        help_text="Prescribed medications (JSON format for template imports)",
    )
    procedures_json = models.TextField(
        blank=True,
        default="",
        help_text="Planned procedures (JSON format)",
    )
    clinical_notes = models.TextField(
        blank=True,
        default="",
        help_text="Clinical notes and assessment",
    )
    follow_up_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Follow-up instructions for patient",
    )
    follow_up_date = models.DateField(
        null=True,
        blank=True,
        help_text="Scheduled follow-up date",
    )
    diet_recommendations = models.TextField(
        blank=True,
        default="",
        help_text="Dietary recommendations for the patient",
    )
    activity_restrictions = models.TextField(
        blank=True,
        default="",
        help_text="Activity restrictions and limitations",
    )
    # Referral fields
    referral_needed = models.BooleanField(
        default=False,
        help_text="Whether a referral is needed",
    )
    referral_specialty = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Specialty for referral",
    )
    referral_notes = models.TextField(
        blank=True,
        default="",
        help_text="Notes for the referral",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACTIVE",
        help_text="Status of the treatment plan",
    )
    # Tracking fields
    created_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_treatment_plans",
        help_text="User who created this plan",
    )
    approved_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_treatment_plans",
        help_text="User who approved this plan",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Treatment Plan"
        verbose_name_plural = "Treatment Plans"

    def __str__(self) -> str:
        return f"Treatment Plan for Encounter {self.encounter_id}"

    @property
    def has_follow_up(self) -> bool:
        """Check if treatment plan has a follow-up scheduled."""
        return self.follow_up_date is not None

    @property
    def has_referral(self) -> bool:
        """Check if treatment plan has a referral."""
        return self.referral_needed and bool(self.referral_specialty)

    def apply_template(self, template: "TreatmentPlanTemplate"):
        """
        Apply a treatment plan template to populate default values.

        Args:
            template: TreatmentPlanTemplate instance to apply
        """
        from datetime import timedelta

        self.template = template
        if template.default_medications:
            self.medications_json = template.default_medications
        if template.default_procedures:
            self.procedures_json = template.default_procedures
        if template.default_instructions:
            self.follow_up_instructions = template.default_instructions
        if template.follow_up_days:
            self.follow_up_date = date.today() + timedelta(days=template.follow_up_days)
        self.save()

    def clean(self):
        """Validate treatment plan constraints."""
        super().clean()

        # Check for existing treatment plan (for updates via forms)
        if not self.pk:
            existing = TreatmentPlan.objects.filter(encounter=self.encounter)
            if existing.exists():
                raise ValidationError("This encounter already has a treatment plan.")

        # Validate status transitions
        if self.pk:
            old_instance = TreatmentPlan.objects.get(pk=self.pk)
            if old_instance.status in ("COMPLETED", "CANCELLED") and self.status == "ACTIVE":
                raise ValidationError(
                    f"Cannot reactivate a {old_instance.status.lower()} treatment plan."
                )

        # Validate procedures JSON format if provided
        if self.procedures_json:
            import json

            try:
                json.loads(self.procedures_json)
            except json.JSONDecodeError:
                raise ValidationError({"procedures_json": "Invalid JSON format for procedures."})

    def save(self, *args, **kwargs):
        """Save with validation."""
        self.full_clean()
        super().save(*args, **kwargs)


class TreatmentPlanTemplate(models.Model):
    """
    Reusable treatment plan templates.

    Templates can be linked to specific diagnoses and contain
    default medications, instructions, and follow-up schedules.
    """

    name = models.CharField(
        max_length=200,
        help_text="Template name",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Template description",
    )
    diagnosis_codes = models.ManyToManyField(
        ICD10Code,
        blank=True,
        related_name="treatment_templates",
        help_text="Suggested diagnoses for this template",
    )
    default_medications = models.TextField(
        blank=True,
        default="",
        help_text="Default medications (JSON format)",
    )
    default_procedures = models.TextField(
        blank=True,
        default="",
        help_text="Default procedures (JSON format)",
    )
    default_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Default patient instructions",
    )
    follow_up_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Suggested follow-up in days",
    )
    department = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Department this template is for",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this template is currently active",
    )
    created_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_treatment_templates",
        help_text="User who created this template",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Treatment Plan Template"
        verbose_name_plural = "Treatment Plan Templates"

    def __str__(self) -> str:
        return self.name


class Medication(models.Model):
    """
    Medication prescription within a treatment plan.

    Records prescribed medications including dosage, frequency,
    duration, and special instructions.
    """

    ROUTE_CHOICES = [
        ("ORAL", "Oral"),
        ("IV", "Intravenous"),
        ("IM", "Intramuscular"),
        ("SC", "Subcutaneous"),
        ("TOPICAL", "Topical"),
        ("INHALED", "Inhaled"),
        ("RECTAL", "Rectal"),
        ("OPHTHALMIC", "Ophthalmic"),
        ("OTIC", "Otic"),
        ("NASAL", "Nasal"),
        ("OTHER", "Other"),
    ]

    treatment_plan = models.ForeignKey(
        TreatmentPlan,
        on_delete=models.CASCADE,
        related_name="medications",
        help_text="Treatment plan this medication belongs to",
    )
    name = models.CharField(
        max_length=200,
        help_text="Medication name",
    )
    dosage = models.CharField(
        max_length=100,
        help_text="Dosage (e.g., 500mg)",
    )
    frequency = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Frequency (e.g., Three times daily, TDS, BD)",
    )
    duration = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Duration (e.g., 7 days)",
    )
    route = models.CharField(
        max_length=20,
        choices=ROUTE_CHOICES,
        default="ORAL",
        help_text="Route of administration",
    )
    quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Quantity to dispense",
    )
    instructions = models.TextField(
        blank=True,
        default="",
        help_text="Special instructions (e.g., Take with food)",
    )
    start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Start date of medication",
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="End date of medication",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Medication"
        verbose_name_plural = "Medications"

    def __str__(self) -> str:
        return f"{self.name} {self.dosage}"

    @property
    def is_active(self) -> bool:
        """
        Check if medication is currently active.

        A medication is active if:
        - No end date is set, OR
        - End date is today or in the future
        """
        from datetime import date as date_type

        if self.end_date is None:
            return True
        return self.end_date >= date_type.today()

    def clean(self):
        """Validate medication fields."""
        super().clean()

        if not self.name:
            raise ValidationError({"name": "Medication name is required."})

    def save(self, *args, **kwargs):
        """Save with validation."""
        self.full_clean()
        super().save(*args, **kwargs)


class EncounterStateHistory(models.Model):
    """
    Audit trail for encounter state transitions.

    Records every status change for compliance, debugging, and
    encounter lifecycle tracking.

    Sprint 2 - Phase 2A: Encounter State Machine
    """

    encounter = models.ForeignKey(
        Encounter,
        on_delete=models.CASCADE,
        related_name="state_history",
        help_text="The encounter whose state changed",
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
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="encounter_state_changes",
        help_text="User who triggered the state change",
    )
    reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for status change (optional)",
    )

    class Meta:
        ordering = ["-changed_at"]
        verbose_name = "Encounter State History"
        verbose_name_plural = "Encounter State Histories"
        indexes = [
            models.Index(fields=["encounter", "-changed_at"]),
        ]

    def __str__(self):
        return f"Encounter {self.encounter_id}: {self.from_status} → {self.to_status}"
