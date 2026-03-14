"""
KENHDD (Kenya National Health Data Dictionary) Models.

Provides schema validation for Kenya's standardised health data elements,
ensuring that Patient, Encounter, Diagnosis, Facility, Lab Result,
Prescription, and MCH Visit records conform to the KENHDD specification.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

from django.conf import settings
from django.db import models


# ──────────────────────────── TextChoices ────────────────────────────


class KENHDDResourceType(models.TextChoices):
    """Resource types covered by KENHDD validation."""

    PATIENT = "PATIENT", "Patient"
    ENCOUNTER = "ENCOUNTER", "Encounter"
    DIAGNOSIS = "DIAGNOSIS", "Diagnosis"
    FACILITY = "FACILITY", "Facility"
    LAB_RESULT = "LAB_RESULT", "Lab Result"
    PRESCRIPTION = "PRESCRIPTION", "Prescription"
    MCH_VISIT = "MCH_VISIT", "MCH Visit"


class KENHDDRequirementLevel(models.TextChoices):
    """Requirement level for a KENHDD data element."""

    MANDATORY = "MANDATORY", "Mandatory"
    CONDITIONAL = "CONDITIONAL", "Conditional"
    OPTIONAL = "OPTIONAL", "Optional"


class KENHDDDataType(models.TextChoices):
    """Data type of a KENHDD data element."""

    STRING = "STRING", "String"
    DATE = "DATE", "Date"
    INTEGER = "INTEGER", "Integer"
    DECIMAL = "DECIMAL", "Decimal"
    CODED = "CODED", "Coded"
    BOOLEAN = "BOOLEAN", "Boolean"
    IDENTIFIER = "IDENTIFIER", "Identifier"


class KENHDDCodingSystem(models.TextChoices):
    """Coding system for CODED data elements."""

    ICD10 = "ICD10", "ICD-10"
    ICD11 = "ICD11", "ICD-11"
    SNOMED_CT = "SNOMED_CT", "SNOMED CT"
    LOINC = "LOINC", "LOINC"
    MFL = "MFL", "Master Facility List"
    CIEL = "CIEL", "CIEL"
    LOCAL = "LOCAL", "Local Code Set"


class KENHDDValidationStatus(models.TextChoices):
    """Status of a single element validation check."""

    PASS = "PASS", "Pass"
    FAIL = "FAIL", "Fail"
    WARNING = "WARNING", "Warning"
    SKIPPED = "SKIPPED", "Skipped"


# ──────────────────────────── Models ────────────────────────────


class KENHDDDataElement(models.Model):
    """
    A KENHDD data element definition.

    Each element maps a standard field name to a Django model field path
    and defines validation rules (required, type, format, coding system).
    """

    element_id = models.CharField(
        max_length=30,
        unique=True,
        help_text="Unique KENHDD element code (e.g. KENHDD-PAT-001)",
    )
    name = models.CharField(
        max_length=200,
        help_text="Human-readable element name",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Description of the data element",
    )
    resource_type = models.CharField(
        max_length=20,
        choices=KENHDDResourceType.choices,
        help_text="Resource type this element applies to",
    )
    model_field = models.CharField(
        max_length=100,
        help_text="Dot-path to the Django model field (e.g. county.name)",
    )
    requirement_level = models.CharField(
        max_length=15,
        choices=KENHDDRequirementLevel.choices,
        help_text="Whether this element is mandatory, conditional, or optional",
    )
    data_type = models.CharField(
        max_length=15,
        choices=KENHDDDataType.choices,
        help_text="Expected data type",
    )
    coding_system = models.CharField(
        max_length=15,
        choices=KENHDDCodingSystem.choices,
        blank=True,
        default="",
        help_text="Coding system (for CODED data type only)",
    )
    max_length = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum length for STRING/IDENTIFIER types",
    )
    format_pattern = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Regex pattern for format validation",
    )
    condition_expression = models.TextField(
        blank=True,
        default="",
        help_text="Human-readable condition for CONDITIONAL requirements",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this element is actively validated",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["resource_type", "element_id"]
        verbose_name = "KENHDD Data Element"
        verbose_name_plural = "KENHDD Data Elements"
        indexes = [
            models.Index(fields=["resource_type", "is_active"]),
            models.Index(fields=["element_id"]),
        ]

    def __str__(self) -> str:
        return f"[{self.element_id}] {self.name}"


class KENHDDValidationRun(models.Model):
    """
    A record of a KENHDD compliance validation run.

    Stores aggregate results for auditing and trend analysis.
    """

    resource_type = models.CharField(
        max_length=20,
        choices=KENHDDResourceType.choices,
        help_text="Resource type that was validated",
    )
    records_checked = models.PositiveIntegerField(
        help_text="Number of records sampled for validation",
    )
    records_compliant = models.PositiveIntegerField(
        help_text="Number of records fully compliant",
    )
    compliance_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Compliance percentage (0-100)",
    )
    mandatory_pass_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Percentage of mandatory elements passing (0-100)",
    )
    violations = models.JSONField(
        default=dict,
        blank=True,
        help_text="Violation summary keyed by element_id",
    )
    run_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="kenhdd_runs",
        help_text="User who initiated the run",
    )
    run_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-run_at"]
        verbose_name = "KENHDD Validation Run"
        verbose_name_plural = "KENHDD Validation Runs"
        indexes = [
            models.Index(fields=["resource_type", "-run_at"]),
        ]

    def __str__(self) -> str:
        return (
            f"KENHDD Run [{self.resource_type}] "
            f"{self.compliance_score}% — {self.run_at:%Y-%m-%d %H:%M}"
        )


class KENHDDFailedRecord(models.Model):
    """
    A record that failed validation during a KENHDD compliance run.

    Stores the record PK, whether it was compliant, and the per-element
    violation details so administrators can drill down into a run and see
    exactly which records need remediation.
    """

    run = models.ForeignKey(
        KENHDDValidationRun,
        on_delete=models.CASCADE,
        related_name="failed_records",
        help_text="The validation run this failure belongs to",
    )
    record_id = models.CharField(
        max_length=50,
        help_text="Primary key of the failing record",
    )
    is_compliant = models.BooleanField(
        default=False,
        help_text="Whether the record passed all mandatory checks",
    )
    pass_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of elements that passed",
    )
    fail_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of elements that failed",
    )
    warning_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of elements with warnings",
    )
    violation_details = models.JSONField(
        default=list,
        blank=True,
        help_text="List of failed/warning element results with messages",
    )

    class Meta:
        ordering = ["-fail_count"]
        verbose_name = "KENHDD Failed Record"
        verbose_name_plural = "KENHDD Failed Records"
        indexes = [
            models.Index(fields=["run", "-fail_count"]),
        ]

    def __str__(self) -> str:
        return (
            f"Record {self.record_id} — "
            f"{self.fail_count} fail(s), {self.warning_count} warning(s)"
        )
