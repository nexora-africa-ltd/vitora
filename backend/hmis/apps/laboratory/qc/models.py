"""
Quality Control models for Vitora LIS.

Phase L1: QC Material & Lot Management, QC Data Entry, Westgard Rules,
Proficiency Testing (EQA).

All models inherit FacilityScopedModel for multi-tenant isolation.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

User = get_user_model()


# ============================================================================
# L1.1 — QC Material & Lot Management
# ============================================================================


class QCMaterial(FacilityScopedModel, TimeStampedModel):
    """
    Quality Control material (commercial control product).

    Represents a QC product registered at a facility (e.g., Bio-Rad Liquichek).
    """

    name = models.CharField(max_length=200, help_text="Material/product name")
    manufacturer = models.CharField(max_length=200, help_text="Manufacturer name")
    catalog_number = models.CharField(
        max_length=100, blank=True, help_text="Manufacturer catalog/part number"
    )
    description = models.TextField(blank=True, help_text="Additional description")
    storage_conditions = models.CharField(
        max_length=200, blank=True, help_text="Storage requirements (e.g., 2-8°C)"
    )
    is_active = models.BooleanField(default=True, help_text="Whether material is in active use")

    class Meta:
        verbose_name = "QC Material"
        verbose_name_plural = "QC Materials"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.manufacturer})"


class QCLot(FacilityScopedModel, TimeStampedModel):
    """
    A specific lot/batch of a QC material.

    Each lot has its own target values and expiry. Multiple lots of the same
    material may exist simultaneously (e.g., during lot-to-lot crossover).
    """

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"
        EXHAUSTED = "EXHAUSTED", "Exhausted"
        CLOSED = "CLOSED", "Closed"

    material = models.ForeignKey(QCMaterial, on_delete=models.CASCADE, related_name="lots")
    lot_number = models.CharField(max_length=100, help_text="Manufacturer lot number")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    open_date = models.DateField(null=True, blank=True, help_text="Date lot was opened/put in use")
    expiry_date = models.DateField(help_text="Lot expiry date")
    storage_conditions = models.CharField(
        max_length=200, blank=True, help_text="Storage conditions override"
    )
    notes = models.TextField(blank=True, help_text="Lot-specific notes")

    class Meta:
        verbose_name = "QC Lot"
        verbose_name_plural = "QC Lots"
        ordering = ["-expiry_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["material", "lot_number"],
                name="unique_lot_per_material",
            )
        ]

    def __str__(self):
        return f"{self.material.name} — Lot {self.lot_number}"

    @property
    def is_expired(self) -> bool:
        return self.expiry_date < timezone.now().date()

    @property
    def days_until_expiry(self) -> int:
        return (self.expiry_date - timezone.now().date()).days

    def clean(self):
        super().clean()
        if self.open_date and self.expiry_date and self.open_date > self.expiry_date:
            raise ValidationError({"open_date": "Open date cannot be after expiry date."})


class QCTarget(FacilityScopedModel, TimeStampedModel):
    """
    Target values (mean, SD) for a QC lot on a specific test/analyte.

    Defines the expected performance of a QC lot for each analyte
    it covers on a given instrument.
    """

    lot = models.ForeignKey(QCLot, on_delete=models.CASCADE, related_name="targets")
    test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.CASCADE,
        related_name="qc_targets",
        help_text="Test/analyte this target applies to",
    )
    instrument = models.ForeignKey(
        "laboratory.Instrument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qc_targets",
        help_text="Specific instrument (null = all instruments)",
    )
    mean = models.DecimalField(max_digits=12, decimal_places=4, help_text="Target mean value")
    sd = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[MinValueValidator(0)],
        help_text="Standard deviation",
    )
    cv_percent = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Coefficient of variation (%)",
    )
    unit = models.CharField(max_length=50, help_text="Unit of measurement")
    n_values = models.PositiveIntegerField(
        default=20, help_text="Number of data points used to establish targets"
    )

    class Meta:
        verbose_name = "QC Target"
        verbose_name_plural = "QC Targets"
        constraints = [
            models.UniqueConstraint(
                fields=["lot", "test", "instrument"],
                name="unique_target_per_lot_test_instrument",
            )
        ]

    def __str__(self):
        instr = f" ({self.instrument.code})" if self.instrument else ""
        return f"{self.lot} / {self.test.name}{instr}: {self.mean}±{self.sd} {self.unit}"

    def save(self, *args, **kwargs):
        # Auto-calculate CV% if not set
        if self.cv_percent is None and self.mean and self.sd and self.mean != 0:
            self.cv_percent = round((self.sd / self.mean) * 100, 2)
        super().save(*args, **kwargs)


# ============================================================================
# L1.2 — QC Data Entry & Westgard Rules
# ============================================================================


class QCResult(FacilityScopedModel, TimeStampedModel):
    """
    A single QC measurement/run.

    Records the value obtained when running a QC sample through an analyzer.
    Evaluated against Westgard rules for acceptance.
    """

    lot = models.ForeignKey(QCLot, on_delete=models.CASCADE, related_name="results")
    test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.CASCADE,
        related_name="qc_results",
    )
    instrument = models.ForeignKey(
        "laboratory.Instrument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qc_results",
    )
    value = models.DecimalField(max_digits=12, decimal_places=4, help_text="Measured QC value")
    run_date = models.DateTimeField(default=timezone.now, help_text="Date/time of QC run")
    operator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qc_results_operated",
        help_text="Lab tech who performed the run",
    )
    accepted = models.BooleanField(
        default=True, help_text="Whether QC result was accepted (passed rules)"
    )
    comment = models.TextField(blank=True, help_text="Operator notes/comments")
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qc_results_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "QC Result"
        verbose_name_plural = "QC Results"
        ordering = ["-run_date"]
        indexes = [
            models.Index(fields=["lot", "test", "-run_date"]),
            models.Index(fields=["run_date"]),
        ]

    def __str__(self):
        return f"QC {self.test.name}: {self.value} ({self.run_date:%Y-%m-%d %H:%M})"

    @property
    def z_score(self):
        """Calculate z-score (number of SDs from mean)."""
        target = self._get_target()
        if not target or target.sd == 0:
            return None
        return float((self.value - target.mean) / target.sd)

    def _get_target(self):
        """Find matching QCTarget for this result."""
        # Try instrument-specific target first
        target = QCTarget.objects.filter(
            lot=self.lot, test=self.test, instrument=self.instrument
        ).first()
        if not target:
            # Fall back to non-instrument-specific target
            target = QCTarget.objects.filter(
                lot=self.lot, test=self.test, instrument__isnull=True
            ).first()
        return target


class QCRule(FacilityScopedModel, TimeStampedModel):
    """
    Westgard QC rule definition.

    Defines which rules are active for a given test/facility. When a QC
    result is entered, active rules are evaluated to determine acceptance.
    """

    class RuleType(models.TextChoices):
        RULE_1_2S = "1_2S", "1-2s (Warning)"
        RULE_1_3S = "1_3S", "1-3s (Reject)"
        RULE_2_2S = "2_2S", "2-2s (Reject)"
        RULE_R_4S = "R_4S", "R-4s (Reject)"
        RULE_4_1S = "4_1S", "4-1s (Reject)"
        RULE_10X = "10X", "10x (Reject)"
        CUSTOM = "CUSTOM", "Custom Rule"

    class Severity(models.TextChoices):
        WARNING = "WARNING", "Warning"
        REJECT = "REJECT", "Reject"

    name = models.CharField(max_length=100, help_text="Rule display name")
    rule_type = models.CharField(
        max_length=20, choices=RuleType.choices, help_text="Westgard rule type"
    )
    severity = models.CharField(
        max_length=20,
        choices=Severity.choices,
        default=Severity.REJECT,
        help_text="Whether violation is a warning or rejection",
    )
    description = models.TextField(blank=True, help_text="Rule description/explanation")
    custom_expression = models.TextField(
        blank=True,
        help_text="Custom rule expression (for CUSTOM type only)",
    )
    is_active = models.BooleanField(default=True, help_text="Whether rule is currently active")
    applies_to_test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qc_rules",
        help_text="Specific test (null = applies to all tests)",
    )

    class Meta:
        verbose_name = "QC Rule"
        verbose_name_plural = "QC Rules"
        ordering = ["rule_type"]

    def __str__(self):
        scope = f" [{self.applies_to_test.code}]" if self.applies_to_test else " [All]"
        return f"{self.name}{scope}"


class QCRuleViolation(FacilityScopedModel, TimeStampedModel):
    """
    Record of a Westgard rule violation on a QC result.

    When a QC result triggers one or more rules, violations are recorded.
    Critical violations require mandatory acknowledgment before patient
    testing can continue.
    """

    qc_result = models.ForeignKey(QCResult, on_delete=models.CASCADE, related_name="violations")
    rule = models.ForeignKey(QCRule, on_delete=models.CASCADE, related_name="violations")
    severity = models.CharField(
        max_length=20, choices=QCRule.Severity.choices, help_text="Violation severity"
    )
    description = models.TextField(blank=True, help_text="Details of the violation")
    acknowledged = models.BooleanField(
        default=False, help_text="Whether violation has been acknowledged"
    )
    acknowledged_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qc_violations_acknowledged",
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    corrective_action = models.TextField(blank=True, help_text="Corrective action taken")

    class Meta:
        verbose_name = "QC Rule Violation"
        verbose_name_plural = "QC Rule Violations"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.rule.name} violation on {self.qc_result}"

    def acknowledge(self, user, corrective_action=""):
        """Acknowledge this violation."""
        self.acknowledged = True
        self.acknowledged_by = user
        self.acknowledged_at = timezone.now()
        if corrective_action:
            self.corrective_action = corrective_action
        self.save(
            update_fields=[
                "acknowledged",
                "acknowledged_by",
                "acknowledged_at",
                "corrective_action",
            ]
        )


# ============================================================================
# L1.3 — Proficiency Testing (EQA)
# ============================================================================


class EQASurvey(FacilityScopedModel, TimeStampedModel):
    """
    External Quality Assessment (EQA) / Proficiency Testing survey.

    Tracks participation in programs like HUQAS, NEQAS, CAP.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        SUBMITTED = "SUBMITTED", "Submitted"
        RESULTS_RECEIVED = "RESULTS_RECEIVED", "Results Received"
        CLOSED = "CLOSED", "Closed"

    provider = models.CharField(max_length=200, help_text="EQA provider (e.g., HUQAS, NEQAS, CAP)")
    survey_id = models.CharField(max_length=100, help_text="Provider's survey/cycle identifier")
    name = models.CharField(max_length=200, help_text="Survey/cycle name")
    category = models.CharField(
        max_length=50, blank=True, help_text="Discipline (e.g., Chemistry, Hematology)"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    received_date = models.DateField(null=True, blank=True, help_text="Date EQA samples received")
    due_date = models.DateField(help_text="Deadline for result submission")
    submitted_date = models.DateField(
        null=True, blank=True, help_text="Date results were submitted to provider"
    )
    results_received_date = models.DateField(
        null=True, blank=True, help_text="Date performance report received"
    )
    overall_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Overall performance score (%)",
    )
    notes = models.TextField(blank=True, help_text="Survey notes")

    class Meta:
        verbose_name = "EQA Survey"
        verbose_name_plural = "EQA Surveys"
        ordering = ["-due_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "provider", "survey_id"],
                name="unique_eqa_survey_per_facility",
            )
        ]

    def __str__(self):
        return f"{self.provider} — {self.name} ({self.survey_id})"

    @property
    def is_overdue(self) -> bool:
        if self.status in (self.Status.SUBMITTED, self.Status.RESULTS_RECEIVED, self.Status.CLOSED):
            return False
        return self.due_date < timezone.now().date()


class EQASample(FacilityScopedModel, TimeStampedModel):
    """
    Individual sample within an EQA survey.

    Each survey cycle contains one or more samples with expected results.
    """

    survey = models.ForeignKey(EQASurvey, on_delete=models.CASCADE, related_name="samples")
    sample_id = models.CharField(max_length=100, help_text="Provider's sample identifier")
    test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.CASCADE,
        related_name="eqa_samples",
        help_text="Test/analyte being assessed",
    )
    expected_value = models.CharField(
        max_length=200, blank=True, help_text="Expected result (provided after survey closes)"
    )
    expected_unit = models.CharField(max_length=50, blank=True, help_text="Unit of expected value")
    acceptable_range_low = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    acceptable_range_high = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )

    class Meta:
        verbose_name = "EQA Sample"
        verbose_name_plural = "EQA Samples"
        constraints = [
            models.UniqueConstraint(
                fields=["survey", "sample_id", "test"],
                name="unique_eqa_sample",
            )
        ]

    def __str__(self):
        return f"{self.survey.provider} — Sample {self.sample_id} ({self.test.name})"


class EQASubmission(FacilityScopedModel, TimeStampedModel):
    """
    Facility's submitted result for an EQA sample.

    Records what value the lab submitted, plus the returned performance score.
    """

    class Performance(models.TextChoices):
        ACCEPTABLE = "ACCEPTABLE", "Acceptable"
        WARNING = "WARNING", "Warning"
        UNACCEPTABLE = "UNACCEPTABLE", "Unacceptable"
        PENDING = "PENDING", "Pending Review"

    sample = models.ForeignKey(EQASample, on_delete=models.CASCADE, related_name="submissions")
    instrument = models.ForeignKey(
        "laboratory.Instrument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="eqa_submissions",
    )
    submitted_value = models.CharField(max_length=200, help_text="Value submitted to EQA provider")
    submitted_unit = models.CharField(max_length=50, blank=True)
    method = models.CharField(max_length=200, blank=True, help_text="Analytical method used")
    submitted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="eqa_submissions",
    )
    submitted_at = models.DateTimeField(
        null=True, blank=True, help_text="When result was submitted"
    )

    # Performance feedback from EQA provider
    z_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Z-score returned by provider",
    )
    bias_percent = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Bias percentage from peer group mean",
    )
    performance = models.CharField(
        max_length=20,
        choices=Performance.choices,
        default=Performance.PENDING,
        help_text="Overall performance assessment",
    )
    peer_group_mean = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    peer_group_sd = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    peer_group_n = models.PositiveIntegerField(null=True, blank=True)
    comments = models.TextField(blank=True)

    class Meta:
        verbose_name = "EQA Submission"
        verbose_name_plural = "EQA Submissions"
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.sample} → {self.submitted_value} (z={self.z_score})"

    @property
    def is_acceptable(self) -> bool:
        if self.z_score is None:
            return True  # Not yet evaluated
        return abs(float(self.z_score)) <= 2.0

    def evaluate_performance(self):
        """Auto-set performance based on z-score."""
        if self.z_score is None:
            self.performance = self.Performance.PENDING
        elif abs(float(self.z_score)) <= 2.0:
            self.performance = self.Performance.ACCEPTABLE
        elif abs(float(self.z_score)) <= 3.0:
            self.performance = self.Performance.WARNING
        else:
            self.performance = self.Performance.UNACCEPTABLE
        self.save(update_fields=["performance"])
