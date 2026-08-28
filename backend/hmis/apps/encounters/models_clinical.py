# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Encounters models clinical for Vitora HMIS.

What this file is for:
- Implement models clinical logic for the encounters domain.

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


from hmis.apps.encounters.models_encounter_core import Encounter, ICD10Code


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


def _next_reserved_fhir_id(model_class, floor: int) -> int:
    """Allocate IDs from a model-specific reserved range for FHIR Observation reads."""
    current_max = model_class.objects.order_by("-fhir_id").values_list("fhir_id", flat=True).first()
    return (current_max or (floor - 1)) + 1
