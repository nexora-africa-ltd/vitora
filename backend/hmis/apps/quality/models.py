# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Quality Measures & Reporting models for Vitora HMIS.

This module contains:
- QuarterlyReport: Aggregates 3 MonthlyClinicReports per quarter
- AnnualReport: Aggregates 4 QuarterlyReports per year
- QualityMeasure: Standard quality measure definitions (CQM)
- QualityMeasureResult: Calculated measure outcomes per reporting period

Implements Sprint 2.C of the DHA Compliance Gap Closure Roadmap.
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from hmis.apps.clinics.models import Clinic, MonthlyClinicReport
from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

# =============================================================================
# QuarterlyReport Model
# =============================================================================


class QuarterlyReport(TimeStampedModel):
    """Quarterly aggregate statistics (aggregates 3 MonthlyClinicReports).

    Quarter mapping:
    - Q1: January–March (months 1–3)
    - Q2: April–June (months 4–6)
    - Q3: July–September (months 7–9)
    - Q4: October–December (months 10–12)
    """

    QUARTER_CHOICES = [
        (1, "Q1 (Jan–Mar)"),
        (2, "Q2 (Apr–Jun)"),
        (3, "Q3 (Jul–Sep)"),
        (4, "Q4 (Oct–Dec)"),
    ]

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="quarterly_reports",
    )
    year = models.PositiveIntegerField()
    quarter = models.PositiveIntegerField(
        choices=QUARTER_CHOICES,
        validators=[MinValueValidator(1), MaxValueValidator(4)],
    )

    # Aggregated visit statistics
    total_visits = models.PositiveIntegerField(default=0)
    new_visits = models.PositiveIntegerField(default=0)
    revisits = models.PositiveIntegerField(default=0)

    # Priority breakdown
    priority_red = models.PositiveIntegerField(default=0)
    priority_orange = models.PositiveIntegerField(default=0)
    priority_yellow = models.PositiveIntegerField(default=0)
    priority_green = models.PositiveIntegerField(default=0)
    priority_blue = models.PositiveIntegerField(default=0)

    # Demographics
    male_visits = models.PositiveIntegerField(default=0)
    female_visits = models.PositiveIntegerField(default=0)
    under_5_visits = models.PositiveIntegerField(default=0)
    under_18_visits = models.PositiveIntegerField(default=0)
    adult_visits = models.PositiveIntegerField(default=0)
    over_60_visits = models.PositiveIntegerField(default=0)

    # Chronic care
    new_enrollments = models.PositiveIntegerField(default=0)
    active_enrollments = models.PositiveIntegerField(default=0)
    defaulters = models.PositiveIntegerField(default=0)

    # ANC specific
    anc_first_visits = models.PositiveIntegerField(default=0)
    anc_revisits = models.PositiveIntegerField(default=0)
    deliveries = models.PositiveIntegerField(default=0)

    # Revenue
    total_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    sha_claims_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    cash_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))

    # Source tracking
    monthly_reports = models.ManyToManyField(
        MonthlyClinicReport,
        blank=True,
        related_name="quarterly_report_refs",
        help_text="The monthly reports aggregated into this quarterly report.",
    )

    # DHIS2 sync
    dhis2_submitted = models.BooleanField(default=False)
    dhis2_submitted_at = models.DateTimeField(null=True, blank=True)
    dhis2_response = models.JSONField(null=True, blank=True)

    # Generation metadata
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        unique_together = ["clinic", "year", "quarter"]
        ordering = ["-year", "-quarter", "clinic__name"]
        permissions = [
            ("regenerate", "Can regenerate quarterly report"),
            ("export_sdmx", "Can export quarterly report as SDMX"),
        ]

    def __str__(self) -> str:
        return f"{self.clinic.name} - {self.year} Q{self.quarter}"

    @property
    def quarter_display(self) -> str:
        return f"Q{self.quarter}"

    @property
    def months(self) -> list[int]:
        """Return the 3 months in this quarter."""
        start = (self.quarter - 1) * 3 + 1
        return [start, start + 1, start + 2]


# =============================================================================
# AnnualReport Model
# =============================================================================


class AnnualReport(TimeStampedModel):
    """Annual aggregate statistics (aggregates 4 QuarterlyReports)."""

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="annual_reports",
    )
    year = models.PositiveIntegerField()

    # Aggregated visit statistics
    total_visits = models.PositiveIntegerField(default=0)
    new_visits = models.PositiveIntegerField(default=0)
    revisits = models.PositiveIntegerField(default=0)

    # Priority breakdown
    priority_red = models.PositiveIntegerField(default=0)
    priority_orange = models.PositiveIntegerField(default=0)
    priority_yellow = models.PositiveIntegerField(default=0)
    priority_green = models.PositiveIntegerField(default=0)
    priority_blue = models.PositiveIntegerField(default=0)

    # Demographics
    male_visits = models.PositiveIntegerField(default=0)
    female_visits = models.PositiveIntegerField(default=0)
    under_5_visits = models.PositiveIntegerField(default=0)
    under_18_visits = models.PositiveIntegerField(default=0)
    adult_visits = models.PositiveIntegerField(default=0)
    over_60_visits = models.PositiveIntegerField(default=0)

    # Chronic care
    new_enrollments = models.PositiveIntegerField(default=0)
    active_enrollments = models.PositiveIntegerField(default=0)
    defaulters = models.PositiveIntegerField(default=0)

    # ANC specific
    anc_first_visits = models.PositiveIntegerField(default=0)
    anc_revisits = models.PositiveIntegerField(default=0)
    deliveries = models.PositiveIntegerField(default=0)

    # Revenue
    total_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    sha_claims_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    cash_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))

    # Source tracking
    quarterly_reports = models.ManyToManyField(
        QuarterlyReport,
        blank=True,
        related_name="annual_report_refs",
        help_text="The quarterly reports aggregated into this annual report.",
    )

    # DHIS2 sync
    dhis2_submitted = models.BooleanField(default=False)
    dhis2_submitted_at = models.DateTimeField(null=True, blank=True)
    dhis2_response = models.JSONField(null=True, blank=True)

    # Generation metadata
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        unique_together = ["clinic", "year"]
        ordering = ["-year", "clinic__name"]
        permissions = [
            ("regenerate", "Can regenerate annual report"),
            ("export_sdmx", "Can export annual report as SDMX"),
        ]

    def __str__(self) -> str:
        return f"{self.clinic.name} - {self.year}"


# =============================================================================
# QualityMeasure Model - Standard Quality Measure Definitions (CQM)
# =============================================================================


class QualityMeasure(TimeStampedModel):
    """Standard Clinical Quality Measure definition.

    Represents a measurable quality indicator (e.g., "Percentage of diabetic
    patients with HbA1c < 7%"). The numerator_logic and denominator_logic
    fields describe how to compute the measure programmatically.
    """

    DOMAIN_CHOICES = [
        ("CLINICAL", "Clinical Quality"),
        ("PATIENT_SAFETY", "Patient Safety"),
        ("EFFICIENCY", "Efficiency"),
        ("PATIENT_EXPERIENCE", "Patient Experience"),
        ("PUBLIC_HEALTH", "Public Health"),
        ("CARE_COORDINATION", "Care Coordination"),
    ]

    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("DRAFT", "Draft"),
        ("RETIRED", "Retired"),
    ]

    PERIOD_CHOICES = [
        ("MONTHLY", "Monthly"),
        ("QUARTERLY", "Quarterly"),
        ("ANNUAL", "Annual"),
    ]

    # Identification
    code = models.CharField(
        max_length=30,
        unique=True,
        help_text="Unique measure code (e.g., 'KE-CQM-001', 'KHIS-ANC-01')",
    )
    name = models.CharField(
        max_length=200,
        help_text="Human-readable measure name",
    )
    description = models.TextField(
        blank=True,
        help_text="Full description of what this measure assesses",
    )
    domain = models.CharField(
        max_length=30,
        choices=DOMAIN_CHOICES,
        default="CLINICAL",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="DRAFT",
    )

    # Measure logic
    numerator_logic = models.TextField(
        help_text=(
            "JSON or text description of the numerator criteria. "
            "E.g., 'patients with HbA1c < 7% in the reporting period'"
        ),
    )
    denominator_logic = models.TextField(
        help_text=(
            "JSON or text description of the denominator criteria. "
            "E.g., 'all diabetic patients enrolled in the reporting period'"
        ),
    )
    exclusion_logic = models.TextField(
        blank=True,
        default="",
        help_text="Criteria for excluding patients from the denominator",
    )

    # Targets & thresholds
    target_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Target performance percentage (e.g., 90.00 for 90%)",
    )
    low_threshold = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Below this percentage is considered poor performance",
    )

    # Reporting
    reporting_period = models.CharField(
        max_length=20,
        choices=PERIOD_CHOICES,
        default="QUARTERLY",
    )

    # External references
    dhis2_indicator_id = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="DHIS2 indicator ID for mapping",
    )
    reference_url = models.URLField(
        blank=True,
        default="",
        help_text="URL to measure specification or evidence base",
    )

    # Applicable clinic types (empty = all)
    applicable_clinic_types = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "List of clinic type codes this measure applies to. Empty list means all clinic types."
        ),
    )

    # Automated evaluation rule (structured JSON for the evaluation engine)
    evaluation_rule = models.JSONField(
        null=True,
        blank=True,
        help_text=(
            "Structured rule for automated evaluation. Format: "
            '{"type": "rule_type", "params": {...}}. '
            "Supported types: bp_control, lab_threshold, wait_time, "
            "visit_count, enrollment_active, stock_availability, immunization_completeness."
        ),
    )

    class Meta:
        ordering = ["code"]
        permissions = [
            ("import_csv", "Can import quality measures from CSV"),
            ("export_csv", "Can export quality measures to CSV"),
        ]

    def __str__(self) -> str:
        return f"{self.code}: {self.name}"


# =============================================================================
# QualityMeasureResult Model - Calculated results per period
# =============================================================================


class QualityMeasureResult(TimeStampedModel):
    """Calculated result of a quality measure for a specific period and clinic."""

    measure = models.ForeignKey(
        QualityMeasure,
        on_delete=models.CASCADE,
        related_name="results",
    )
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="quality_results",
    )
    year = models.PositiveIntegerField()
    period = models.PositiveIntegerField(
        help_text="Month (1-12), quarter (1-4), or 0 for annual",
        validators=[MinValueValidator(0), MaxValueValidator(12)],
    )
    period_type = models.CharField(
        max_length=20,
        choices=QualityMeasure.PERIOD_CHOICES,
    )

    # Results
    numerator = models.PositiveIntegerField(default=0)
    denominator = models.PositiveIntegerField(default=0)
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Calculated percentage (numerator / denominator * 100)",
    )
    meets_target = models.BooleanField(
        default=False,
        help_text="Whether the result meets the measure's target_percentage",
    )

    # Metadata
    calculation_notes = models.TextField(
        blank=True,
        default="",
        help_text="Notes about the calculation (e.g., data quality issues)",
    )
    calculated_at = models.DateTimeField(auto_now=True)
    calculated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        unique_together = ["measure", "clinic", "year", "period", "period_type"]
        ordering = ["-year", "-period", "measure__code"]

    def __str__(self) -> str:
        return f"{self.measure.code} - {self.clinic.name} ({self.year} P{self.period})"

    def save(self, *args, **kwargs):  # type: ignore[override]
        """Auto-calculate percentage and meets_target before saving."""
        if self.denominator > 0:
            self.percentage = Decimal(str(self.numerator / self.denominator * 100)).quantize(
                Decimal("0.01")
            )
        else:
            self.percentage = Decimal("0.00")

        if self.measure.target_percentage is not None:
            self.meets_target = self.percentage >= self.measure.target_percentage
        else:
            self.meets_target = False

        super().save(*args, **kwargs)


# =============================================================================
# BenchmarkObservation Model (SDMX Inbound)
# =============================================================================


class BenchmarkObservation(models.Model):
    """
    Stores imported SDMX observations for facility benchmarking.

    Data comes from national registries (KNBS, KHIS, WHO) and enables
    facilities to compare their indicators against national/regional averages.
    """

    indicator_code = models.CharField(
        max_length=100,
        db_index=True,
        help_text="SDMX indicator code (e.g., 'TOTAL_VISITS', 'MMR')",
    )
    time_period = models.CharField(
        max_length=20,
        db_index=True,
        help_text="Time period (e.g., '2025-Q1', '2025-01', '2025')",
    )
    facility_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        db_index=True,
        help_text="Facility MFL code (empty for aggregate/national data)",
    )
    source = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Data source (e.g., 'KNBS', 'KHIS', 'WHO')",
    )
    value = models.CharField(
        max_length=100,
        help_text="Observation value (string to handle numeric and coded values)",
    )
    dimensions = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional SDMX dimension key-values",
    )
    attributes = models.JSONField(
        default=dict,
        blank=True,
        help_text="SDMX observation attributes",
    )
    dataset_id = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Source SDMX dataset ID for traceability",
    )
    imported_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this observation was imported",
    )

    class Meta:
        unique_together = ("indicator_code", "time_period", "facility_code", "source")
        ordering = ["-time_period", "indicator_code"]

    def __str__(self) -> str:
        return f"{self.indicator_code} = {self.value} ({self.time_period}, {self.source})"


# =============================================================================
# SDMX Platform Configuration
# =============================================================================


class SDMXContract(TimeStampedModel):
    """Versioned DHA/KHIS SDMX contract managed by Nexora platform staff."""

    class Partner(models.TextChoices):
        DHA = "DHA", "DHA"
        KHIS = "KHIS", "KHIS"
        OTHER = "OTHER", "Other"

    class Environment(models.TextChoices):
        SANDBOX = "SANDBOX", "Sandbox"
        PRODUCTION = "PRODUCTION", "Production"

    partner = models.CharField(max_length=20, choices=Partner.choices)
    environment = models.CharField(max_length=20, choices=Environment.choices)
    agency_id = models.CharField(max_length=100)
    dataflow_id = models.CharField(max_length=100)
    dsd_id = models.CharField(max_length=100)
    version = models.CharField(max_length=50)
    endpoint_url = models.URLField()
    receiver_id = models.CharField(max_length=100)
    secret_reference = models.CharField(max_length=255, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_until = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_sdmx_contracts",
    )

    class Meta:
        ordering = ["partner", "dataflow_id", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["partner", "environment", "agency_id", "dataflow_id", "version"],
                name="unique_sdmx_contract_external_version",
            ),
            models.CheckConstraint(
                condition=models.Q(effective_until__isnull=True)
                | models.Q(effective_from__isnull=True)
                | models.Q(effective_until__gte=models.F("effective_from")),
                name="sdmx_contract_effective_range_valid",
            ),
        ]

    @property
    def display_name(self) -> str:
        """Return the stable human-readable contract label."""
        return f"{self.partner} {self.dataflow_id} v{self.version}"

    def __str__(self) -> str:
        return f"{self.display_name} ({self.get_environment_display()})"


class SDMXCodeMapping(TimeStampedModel):
    """Map Vitora reporting values to authoritative codes for an SDMX contract."""

    class Dimension(models.TextChoices):
        INDICATOR = "INDICATOR", "Indicator"
        FACILITY = "FACILITY", "Facility"
        GEOGRAPHY = "GEOGRAPHY", "Geography"
        DISEASE = "DISEASE", "Disease"
        AGE_GROUP = "AGE_GROUP", "Age group"
        SEX = "SEX", "Sex"
        FREQUENCY = "FREQUENCY", "Frequency"
        UNIT = "UNIT", "Unit"

    contract = models.ForeignKey(SDMXContract, on_delete=models.CASCADE, related_name="mappings")
    dimension = models.CharField(max_length=30, choices=Dimension.choices)
    source_code = models.CharField(max_length=150)
    target_code = models.CharField(max_length=150)
    target_name = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["dimension", "source_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["contract", "dimension", "source_code"],
                name="unique_sdmx_source_mapping",
            )
        ]

    def clean(self):
        """Require an authoritative target code before activating a mapping."""
        if self.is_active and not self.target_code.strip():
            raise ValidationError({"target_code": "An active mapping requires a target code."})

    def __str__(self) -> str:
        return f"{self.contract.display_name}: {self.dimension} {self.source_code} -> {self.target_code}"


class SDMXSubmission(TimeStampedModel):
    """Immutable journal entry for a generated SDMX delivery attempt."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        VALIDATED = "VALIDATED", "Validated"
        QUEUED = "QUEUED", "Queued"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        FAILED = "FAILED", "Failed"

    contract = models.ForeignKey(SDMXContract, on_delete=models.PROTECT, related_name="submissions")
    facility = models.ForeignKey(
        "core.Facility",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="sdmx_submissions",
    )
    report_type = models.CharField(max_length=50)
    report_id = models.BigIntegerField()
    reporting_period = models.CharField(max_length=30)
    payload_sha256 = models.CharField(max_length=64, db_index=True)
    idempotency_key = models.CharField(max_length=128, unique=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    remote_reference = models.CharField(max_length=255, blank=True)
    response_body = models.JSONField(default=dict, blank=True)
    retry_count = models.PositiveIntegerField(default=0)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_sdmx_submissions",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["contract", "status"]),
            models.Index(fields=["facility", "report_type", "report_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.contract.display_name} {self.report_type}#{self.report_id} ({self.status})"


class FacilitySDMXConfiguration(FacilityScopedModel, TimeStampedModel):
    """Facility-specific enablement and readiness state for an SDMX contract."""

    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="sdmx_configurations",
    )
    contract = models.ForeignKey(
        SDMXContract, on_delete=models.PROTECT, related_name="facility_configs"
    )
    is_enabled = models.BooleanField(default=False)
    facility_code = models.CharField(max_length=100, blank=True)
    report_types = models.JSONField(default=list, blank=True)
    last_validated_at = models.DateTimeField(null=True, blank=True)
    last_successful_submission_at = models.DateTimeField(null=True, blank=True)
    enabled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="enabled_sdmx_facilities",
    )

    class Meta:
        ordering = ["facility__name", "contract__partner", "contract__dataflow_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "contract"],
                name="unique_facility_sdmx_contract_config",
            )
        ]

    @property
    def is_ready(self) -> bool:
        """Return whether an enabled facility has the minimum local mapping context."""
        return self.is_enabled and bool(self.facility_code.strip()) and bool(self.report_types)

    def __str__(self) -> str:
        return f"{self.facility} - {self.contract.display_name}"
