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
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from hmis.apps.clinics.models import Clinic, MonthlyClinicReport
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
            "visit_count, enrollment_active, stock_availability."
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
