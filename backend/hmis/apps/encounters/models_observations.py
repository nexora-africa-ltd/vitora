# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: structured observation/history encounter models (social, pregnancy, chronic conditions, medication/surgery/family history, vital suggestions).
How to use: imported by `hmis.apps.encounters.models` compatibility module for model registration.
Supported inputs/args: Django model fields and methods for structured encounter-adjacent observations.
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


def _next_reserved_fhir_id(model_class, floor: int) -> int:
    """Allocate IDs from a model-specific reserved range for FHIR Observation reads."""
    current_max = model_class.objects.order_by("-fhir_id").values_list("fhir_id", flat=True).first()
    return (current_max or (floor - 1)) + 1


class SocialHistoryObservation(FacilityScopedModel, TimeStampedModel):
    """Structured social-history observations exposed as standalone FHIR Observations."""

    class ObservationType(models.TextChoices):
        ALCOHOL_USE = "ALCOHOL_USE", "Alcohol use"
        TOBACCO_USE = "TOBACCO_USE", "Tobacco use"
        OCCUPATION = "OCCUPATION", "Occupation"
        LIFESTYLE = "LIFESTYLE", "Lifestyle"

    class UsageStatus(models.TextChoices):
        CURRENT = "CURRENT", "Current use"
        FORMER = "FORMER", "Former use"
        NEVER = "NEVER", "Never used"
        UNKNOWN = "UNKNOWN", "Unknown"

    FHIR_ID_FLOOR = 700000000

    fhir_id = models.PositiveIntegerField(unique=True, editable=False, db_index=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="social_history_observations",
    )
    encounter = models.ForeignKey(
        Encounter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="social_history_observations",
    )
    observation_type = models.CharField(max_length=30, choices=ObservationType.choices)
    status = models.CharField(
        max_length=20, choices=UsageStatus.choices, default=UsageStatus.UNKNOWN
    )
    value_text = models.TextField(blank=True, default="")
    effective_date = models.DateField(default=timezone.localdate)
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_social_history_observations",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-effective_date", "-created_at"]
        indexes = [
            models.Index(fields=["fhir_id"]),
            models.Index(fields=["patient", "observation_type"]),
        ]

    def __str__(self) -> str:
        label = dict(self.ObservationType.choices).get(self.observation_type, self.observation_type)
        return f"{label} - {self.patient}"

    def save(self, *args, **kwargs):
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        if not self.fhir_id:
            self.fhir_id = _next_reserved_fhir_id(self.__class__, self.FHIR_ID_FLOOR)
        super().save(*args, **kwargs)


class PregnancyObservation(FacilityScopedModel, TimeStampedModel):
    """Structured pregnancy observations exposed as standalone FHIR Observations."""

    class ObservationType(models.TextChoices):
        PREGNANCY_STATUS = "PREGNANCY_STATUS", "Pregnancy status"
        PREGNANCY_EXPECTED_DELIVERY_DATE = (
            "PREGNANCY_EXPECTED_DELIVERY_DATE",
            "Estimated delivery date",
        )
        PREGNANCY_OUTCOME = "PREGNANCY_OUTCOME", "Pregnancy outcome"

    class StatusValue(models.TextChoices):
        PREGNANT = "PREGNANT", "Pregnant"
        POSTPARTUM = "POSTPARTUM", "Postpartum"
        NOT_PREGNANT = "NOT_PREGNANT", "Not pregnant"
        UNKNOWN = "UNKNOWN", "Unknown"
        LIVE_BIRTH = "LIVE_BIRTH", "Live birth"
        STILLBIRTH = "STILLBIRTH", "Stillbirth"
        MISCARRIAGE = "MISCARRIAGE", "Miscarriage"
        ABORTION = "ABORTION", "Abortion"
        ECTOPIC = "ECTOPIC", "Ectopic pregnancy"

    FHIR_ID_FLOOR = 710000000

    fhir_id = models.PositiveIntegerField(unique=True, editable=False, db_index=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="pregnancy_observations",
    )
    encounter = models.ForeignKey(
        Encounter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pregnancy_observations",
    )
    mch_registration = models.ForeignKey(
        "mch.MCHRegistration",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pregnancy_observations",
    )
    delivery = models.ForeignKey(
        "mch.Delivery",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pregnancy_observations",
    )
    observation_type = models.CharField(max_length=40, choices=ObservationType.choices)
    status_value = models.CharField(
        max_length=20,
        choices=StatusValue.choices,
        blank=True,
        default="",
    )
    value_date = models.DateField(null=True, blank=True)
    effective_date = models.DateField(default=timezone.localdate)
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_pregnancy_observations",
    )
    notes = models.TextField(blank=True, default="")

    class Meta(TimeStampedModel.Meta):
        ordering = ["-effective_date", "-created_at"]
        indexes = [
            models.Index(fields=["fhir_id"]),
            models.Index(fields=["patient", "observation_type"]),
        ]

    def __str__(self) -> str:
        label = dict(self.ObservationType.choices).get(self.observation_type, self.observation_type)
        return f"{label} - {self.patient}"

    def clean(self):
        super().clean()
        if self.observation_type == self.ObservationType.PREGNANCY_EXPECTED_DELIVERY_DATE:
            if (
                not self.value_date
                and self.mch_registration is not None
                and self.mch_registration.edd
            ):
                self.value_date = self.mch_registration.edd
            if not self.value_date:
                raise ValidationError({"value_date": "EDD observations require a value_date."})
        elif not self.status_value:
            raise ValidationError(
                {"status_value": "This pregnancy observation requires a status value."}
            )

    def save(self, *args, **kwargs):
        if getattr(self, "patient_id", None) is None:
            if self.mch_registration is not None:
                self.patient = self.mch_registration.mother
            elif self.delivery is not None:
                self.patient = self.delivery.registration.mother

        if (
            self.observation_type == self.ObservationType.PREGNANCY_EXPECTED_DELIVERY_DATE
            and not self.value_date
            and self.mch_registration is not None
        ):
            self.value_date = self.mch_registration.edd
            if not self.value_date and getattr(self.mch_registration, "anc_enrollment_id", None):
                lmp = self.mch_registration.anc_enrollment.lmp
                if lmp:
                    self.value_date = lmp + timedelta(days=280)

        if (
            self.observation_type == self.ObservationType.PREGNANCY_OUTCOME
            and not self.status_value
            and self.delivery is not None
        ):
            self.status_value = self.delivery.delivery_outcome

        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        self.full_clean()
        if not self.fhir_id:
            self.fhir_id = _next_reserved_fhir_id(self.__class__, self.FHIR_ID_FLOOR)
        super().save(*args, **kwargs)


# =============================================================================
# Structured History Models (FHIR-aligned)
# =============================================================================


class ChronicCondition(FacilityScopedModel, TimeStampedModel):
    """Structured chronic/ongoing condition for a patient (FHIR Condition)."""

    class ConditionStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        REMISSION = "REMISSION", "In remission"
        RESOLVED = "RESOLVED", "Resolved"
        UNKNOWN = "UNKNOWN", "Unknown"

    FHIR_ID_FLOOR = 720000000

    fhir_id = models.PositiveIntegerField(unique=True, editable=False, db_index=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="chronic_conditions_structured",
    )
    encounter = models.ForeignKey(
        Encounter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chronic_conditions_structured",
    )
    condition_name = models.CharField(max_length=255)
    icd10_code = models.CharField(max_length=20, blank=True, default="")
    status = models.CharField(
        max_length=20, choices=ConditionStatus.choices, default=ConditionStatus.ACTIVE
    )
    onset_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_chronic_conditions",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["fhir_id"]),
            models.Index(fields=["patient", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.condition_name} ({self.get_status_display()}) - {self.patient}"

    def save(self, *args, **kwargs):
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        if not self.fhir_id:
            self.fhir_id = _next_reserved_fhir_id(self.__class__, self.FHIR_ID_FLOOR)
        super().save(*args, **kwargs)


class VitalFlagSuggestion(FacilityScopedModel, TimeStampedModel):
    """Clinician-reviewable suggestion raised from vitals/triage rule evaluation."""

    class SourceType(models.TextChoices):
        TRIAGE = "TRIAGE", "Triage"
        ENCOUNTER = "ENCOUNTER", "Encounter"
        BACKGROUND_RULE = "BACKGROUND_RULE", "Background Rule"

    class Severity(models.TextChoices):
        INFO = "INFO", "Info"
        WARNING = "WARNING", "Warning"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
        MAPPED = "MAPPED", "Mapped"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        EXPIRED = "EXPIRED", "Expired"
        SUPERSEDED = "SUPERSEDED", "Superseded"

    class MappingStatus(models.TextChoices):
        UNMAPPED = "UNMAPPED", "Unmapped"
        AUTO_MAPPED = "AUTO_MAPPED", "Auto mapped"
        NEEDS_REVIEW = "NEEDS_REVIEW", "Needs review"
        CONFIRMED = "CONFIRMED", "Confirmed"

    class ResolutionAction(models.TextChoices):
        CREATE_DIAGNOSIS_PROVISIONAL = (
            "CREATE_DIAGNOSIS_PROVISIONAL",
            "Create provisional diagnosis",
        )
        CREATE_DIAGNOSIS_CONFIRMED = "CREATE_DIAGNOSIS_CONFIRMED", "Create confirmed diagnosis"
        ADD_CHRONIC_CONDITION = "ADD_CHRONIC_CONDITION", "Add chronic condition"
        NOTE_ONLY = "NOTE_ONLY", "Note only"
        NO_ACTION = "NO_ACTION", "No action"

    OPEN_STATUSES = [Status.NEW, Status.ACKNOWLEDGED, Status.MAPPED]

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="vital_flag_suggestions",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="vital_flag_suggestions",
    )
    triage_assessment = models.ForeignKey(
        "triage.TriageAssessment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vital_flag_suggestions",
    )

    source_type = models.CharField(max_length=24, choices=SourceType.choices)
    flag_key = models.CharField(max_length=64)
    clinical_domain = models.CharField(max_length=64, blank=True, default="")
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.WARNING)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW)

    detected_at = models.DateTimeField(default=timezone.now)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    rule_id = models.CharField(max_length=80, blank=True, default="")
    rule_version = models.CharField(max_length=40, blank=True, default="")
    evidence_json = models.JSONField(default=dict, blank=True)

    mapping_status = models.CharField(
        max_length=24,
        choices=MappingStatus.choices,
        default=MappingStatus.UNMAPPED,
    )
    suggested_icd10 = models.ForeignKey(
        ICD10Code,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vital_flag_suggested_by",
    )
    suggested_icd11_code = models.CharField(max_length=50, blank=True, default="")
    suggested_icd11_title = models.CharField(max_length=500, blank=True, default="")

    selected_icd10 = models.ForeignKey(
        ICD10Code,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vital_flag_selected_by",
    )
    selected_icd11_code = models.CharField(max_length=50, blank=True, default="")
    selected_icd11_title = models.CharField(max_length=500, blank=True, default="")

    resolution_action = models.CharField(
        max_length=40,
        choices=ResolutionAction.choices,
        blank=True,
        default="",
    )
    resolution_note = models.TextField(blank=True, default="")
    resolved_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_vital_flag_suggestions",
    )

    linked_diagnosis = models.ForeignKey(
        "encounters.Diagnosis",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_vital_flag_suggestions",
    )
    linked_chronic_condition = models.ForeignKey(
        "encounters.ChronicCondition",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_vital_flag_suggestions",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-detected_at", "-created_at"]
        indexes = [
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["encounter", "status"]),
            models.Index(fields=["flag_key", "status"]),
            models.Index(fields=["detected_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "encounter", "flag_key"],
                condition=models.Q(status__in=["NEW", "ACKNOWLEDGED", "MAPPED"]),
                name="unique_open_vital_flag_per_patient_encounter",
            )
        ]

    def __str__(self) -> str:
        return f"{self.flag_key} ({self.status}) - patient {self.patient_id}"

    def save(self, *args, **kwargs):
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        super().save(*args, **kwargs)


class VitalFlagSuggestionAction(models.Model):
    """Immutable state/action log for VitalFlagSuggestion transitions."""

    class ActionType(models.TextChoices):
        DETECTED = "DETECTED", "Detected"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
        MAPPING_UPDATED = "MAPPING_UPDATED", "Mapping updated"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        EXPIRED = "EXPIRED", "Expired"
        SUPERSEDED = "SUPERSEDED", "Superseded"

    suggestion = models.ForeignKey(
        VitalFlagSuggestion,
        on_delete=models.CASCADE,
        related_name="actions",
    )
    action_type = models.CharField(max_length=20, choices=ActionType.choices)
    from_status = models.CharField(max_length=16, blank=True, default="")
    to_status = models.CharField(max_length=16, blank=True, default="")
    actor = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vital_flag_suggestion_actions",
    )
    payload_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["suggestion", "created_at"]),
            models.Index(fields=["action_type", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.action_type} suggestion={self.suggestion_id}"


class CurrentMedication(FacilityScopedModel, TimeStampedModel):
    """Structured current medication statement for patient intake (FHIR MedicationStatement)."""

    class MedicationStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "Currently taking"
        ON_HOLD = "ON_HOLD", "On hold"
        STOPPED = "STOPPED", "Stopped"
        UNKNOWN = "UNKNOWN", "Unknown"

    FHIR_ID_FLOOR = 730000000

    fhir_id = models.PositiveIntegerField(unique=True, editable=False, db_index=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="current_medications_structured",
    )
    encounter = models.ForeignKey(
        Encounter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="current_medications_structured",
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="current_medication_statements",
        help_text="Optional link to drug catalog entry (for structured medication recording)",
    )
    medication_name = models.CharField(max_length=255)
    dosage = models.CharField(max_length=100, blank=True, default="")
    frequency = models.CharField(max_length=100, blank=True, default="")
    route = models.CharField(max_length=50, blank=True, default="")
    status = models.CharField(
        max_length=20, choices=MedicationStatus.choices, default=MedicationStatus.ACTIVE
    )
    start_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_current_medications",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["fhir_id"]),
            models.Index(fields=["patient", "status"]),
        ]

    def __str__(self) -> str:
        dosage_str = f" {self.dosage}" if self.dosage else ""
        return f"{self.medication_name}{dosage_str} ({self.get_status_display()}) - {self.patient}"

    def save(self, *args, **kwargs):
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        if not self.fhir_id:
            self.fhir_id = _next_reserved_fhir_id(self.__class__, self.FHIR_ID_FLOOR)
        super().save(*args, **kwargs)


class PastSurgery(FacilityScopedModel, TimeStampedModel):
    """Structured past surgery/procedure record for a patient (FHIR Procedure)."""

    class SurgeryOutcome(models.TextChoices):
        SUCCESSFUL = "SUCCESSFUL", "Successful"
        COMPLICATED = "COMPLICATED", "Complicated"
        UNKNOWN = "UNKNOWN", "Unknown"

    FHIR_ID_FLOOR = 740000000

    fhir_id = models.PositiveIntegerField(unique=True, editable=False, db_index=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="past_surgeries_structured",
    )
    encounter = models.ForeignKey(
        Encounter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="past_surgeries_structured",
    )
    procedure_name = models.CharField(max_length=255)
    procedure_date = models.DateField(null=True, blank=True)
    outcome = models.CharField(
        max_length=20, choices=SurgeryOutcome.choices, default=SurgeryOutcome.UNKNOWN
    )
    notes = models.TextField(blank=True, default="")
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_past_surgeries",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-procedure_date", "-created_at"]
        verbose_name_plural = "past surgeries"
        indexes = [
            models.Index(fields=["fhir_id"]),
            models.Index(fields=["patient"]),
        ]

    def __str__(self) -> str:
        date_str = f" ({self.procedure_date})" if self.procedure_date else ""
        return f"{self.procedure_name}{date_str} - {self.patient}"

    def save(self, *args, **kwargs):
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        if not self.fhir_id:
            self.fhir_id = _next_reserved_fhir_id(self.__class__, self.FHIR_ID_FLOOR)
        super().save(*args, **kwargs)


class FamilyHistory(FacilityScopedModel, TimeStampedModel):
    """Structured family history record for a patient (FHIR FamilyMemberHistory)."""

    class Relationship(models.TextChoices):
        FATHER = "FATHER", "Father"
        MOTHER = "MOTHER", "Mother"
        SIBLING = "SIBLING", "Sibling"
        GRANDPARENT = "GRANDPARENT", "Grandparent"
        CHILD = "CHILD", "Child"
        UNCLE_AUNT = "UNCLE_AUNT", "Uncle/Aunt"
        COUSIN = "COUSIN", "Cousin"
        OTHER = "OTHER", "Other"

    FHIR_ID_FLOOR = 750000000

    fhir_id = models.PositiveIntegerField(unique=True, editable=False, db_index=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="family_history_structured",
    )
    encounter = models.ForeignKey(
        Encounter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="family_history_structured",
    )
    relationship = models.CharField(max_length=20, choices=Relationship.choices)
    condition_name = models.CharField(max_length=255)
    deceased = models.BooleanField(default=False)
    age_at_onset = models.CharField(max_length=50, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_family_history",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-created_at"]
        verbose_name_plural = "family histories"
        indexes = [
            models.Index(fields=["fhir_id"]),
            models.Index(fields=["patient", "relationship"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_relationship_display()}: {self.condition_name} - {self.patient}"

    def save(self, *args, **kwargs):
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        if not self.fhir_id:
            self.fhir_id = _next_reserved_fhir_id(self.__class__, self.FHIR_ID_FLOOR)
        super().save(*args, **kwargs)
