# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Encounters models encounter core for Vitora HMIS.

What this file is for:
- Implement models encounter core logic for the encounters domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
import re
import uuid
from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin
from hmis.apps.core.mixins import FacilityScopedModel, resolve_tenant_from_related
from hmis.apps.core.models import TimeStampedModel

logger = logging.getLogger(__name__)

# ICD-10 code format validator
icd10_code_validator = RegexValidator(
    regex=r"^[A-Z]\d{2}(\.\d{1,2})?$",
    message="ICD-10 code must be in format: Letter + 2 digits (e.g., A09) "
    "or Letter + 2 digits + decimal + 1-2 digits (e.g., J18.9)",
)


import logging
import re
import uuid
from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin
from hmis.apps.core.mixins import FacilityScopedModel, resolve_tenant_from_related
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.encounters.models_encounter_behaviors import EncounterBehaviorMixin

logger = logging.getLogger(__name__)

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


class Encounter(EncounterBehaviorMixin, HistoryMixin, FacilityScopedModel):
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
    public_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        db_index=True,
        editable=False,
        help_text="Stable public UUID for external APIs and links.",
    )

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
        ("CANCELLED", "Cancelled"),
    ]

    # Required fields
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
        ("SCHEDULED_PROCEDURE", "Scheduled Procedure"),
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

    # -------------------------------------------------------------------------
    # Template → Flat field denormalization
    # -------------------------------------------------------------------------

    # Maps template section names to flat model fields.
    # Each section's key-value pairs are joined as "key: value" lines.
    TEMPLATE_SECTION_FIELD_MAP = {
        "History of Present Illness": "history_of_present_illness",
        "HPI": "history_of_present_illness",
        "Physical Examination": "physical_examination",
        "Examination": "physical_examination",
        "Assessment": "assessment",
        "Clinical Assessment": "assessment",
    }

    def _denormalize_template_data(self):
        """
        Flatten clinical_template_data sections into the corresponding
        flat text fields. Only overwrites a flat field if it is currently empty.
        """
        for section_name, field_name in self.TEMPLATE_SECTION_FIELD_MAP.items():
            section = self.clinical_template_data.get(section_name)
            if not section or not isinstance(section, dict):
                continue
            # Skip if the flat field already has content
            current_value = getattr(self, field_name, "")
            if current_value and current_value.strip():
                continue
            # Flatten section key-value pairs into readable text
            lines = []
            for key, value in section.items():
                if value and str(value).strip():
                    label = key.replace("_", " ").title()
                    lines.append(f"{label}: {value}")
            if lines:
                setattr(self, field_name, "\n".join(lines))

    def save(self, *args, **kwargs):
        """Override save to auto-set triage and tenant fields."""
        preserve_triage_requirement = bool(kwargs.pop("preserve_triage_requirement", False))

        # --- Tenant auto-resolution ---
        # If facility is not set, inherit from patient's registered facility.
        # This prevents orphaned encounters when created outside
        # TenantScopedViewMixin (e.g. triage check-in, inpatient admission).
        if not self.facility_id and self.patient_id:
            try:
                patient = self.patient
                if patient.registered_at_facility_id:
                    self.facility_id = patient.registered_at_facility_id
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                pass  # patient not loaded yet (raw FK only)

        # --- Denormalize clinical_template_data into flat SOAP fields ---
        # When template data is present and flat fields are empty, flatten the
        # structured template sections into the SOAP text fields. This ensures
        # downstream consumers (FHIR export, search, reports, SOAP display)
        # always have populated flat fields regardless of input mode.
        if self.clinical_template_data and isinstance(self.clinical_template_data, dict):
            self._denormalize_template_data()

        # Auto-set triage_requirement based on encounter_type
        if self.encounter_type and not preserve_triage_requirement:
            expected_requirement = self.ENCOUNTER_TYPE_TRIAGE_MAP.get(
                self.encounter_type, "MANDATORY"
            )
            self.triage_requirement = expected_requirement

        # Auto-set triage_status for NOT_REQUIRED encounters
        if self.triage_requirement == "NOT_REQUIRED":
            if self.triage_status == "PENDING":
                self.triage_status = "NOT_APPLICABLE"

        super().save(*args, **kwargs)
