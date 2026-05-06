"""
Models for Delta Checks & Auto-Verification.
Phase L2 of Vitora LIS Implementation Plan.

All models inherit FacilityScopedModel for multi-tenant isolation.
"""

from django.contrib.auth import get_user_model
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

User = get_user_model()


# =============================================================================
# Delta Check Rules
# =============================================================================


class DeltaCheckRule(FacilityScopedModel, TimeStampedModel):
    """
    Configurable delta check thresholds per test.
    Compares a new result to the patient's most recent prior result.
    """

    class Action(models.TextChoices):
        FLAG_FOR_REVIEW = "FLAG_FOR_REVIEW", "Flag for Review"
        BLOCK_RELEASE = "BLOCK_RELEASE", "Block Release"
        ALERT_ONLY = "ALERT_ONLY", "Alert Only"

    class CheckType(models.TextChoices):
        PERCENT = "PERCENT", "Percentage Change"
        ABSOLUTE = "ABSOLUTE", "Absolute Difference"
        BOTH = "BOTH", "Both (either triggers)"

    test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.CASCADE,
        related_name="delta_check_rules",
    )
    check_type = models.CharField(
        max_length=20,
        choices=CheckType.choices,
        default=CheckType.PERCENT,
    )
    threshold_percent = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(1000)],
        help_text="Percentage change threshold (e.g., 50 = 50% change)",
    )
    threshold_absolute = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Absolute value change threshold",
    )
    lookback_hours = models.IntegerField(
        default=168,  # 7 days
        validators=[MinValueValidator(1), MaxValueValidator(8760)],  # 1 hour to 1 year
        help_text="Hours to look back for the previous result",
    )
    action = models.CharField(
        max_length=20,
        choices=Action.choices,
        default=Action.FLAG_FOR_REVIEW,
    )
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True)

    class Meta:
        verbose_name = "Delta Check Rule"
        verbose_name_plural = "Delta Check Rules"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "test"],
                name="unique_delta_rule_per_test_per_facility",
            )
        ]
        ordering = ["test__name"]

    def __str__(self):
        return f"Delta: {self.test.name} ({self.get_check_type_display()})"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.check_type == self.CheckType.PERCENT and self.threshold_percent is None:
            raise ValidationError({"threshold_percent": "Required for percent check type."})
        if self.check_type == self.CheckType.ABSOLUTE and self.threshold_absolute is None:
            raise ValidationError({"threshold_absolute": "Required for absolute check type."})
        if self.check_type == self.CheckType.BOTH and (
            self.threshold_percent is None or self.threshold_absolute is None
        ):
            raise ValidationError("Both thresholds required for 'BOTH' check type.")


class DeltaCheckResult(FacilityScopedModel, TimeStampedModel):
    """
    Records the outcome of a delta check evaluation on a specific result.
    """

    class Outcome(models.TextChoices):
        PASS = "PASS", "Pass"
        FAIL = "FAIL", "Fail"
        NO_PRIOR = "NO_PRIOR", "No Prior Result"
        SKIPPED = "SKIPPED", "Skipped (Rule Inactive)"

    result = models.OneToOneField(
        "laboratory.LabResult",
        on_delete=models.CASCADE,
        related_name="delta_check",
    )
    rule = models.ForeignKey(
        DeltaCheckRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="check_results",
    )
    previous_result = models.ForeignKey(
        "laboratory.LabResult",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    outcome = models.CharField(max_length=20, choices=Outcome.choices)
    current_value = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    previous_value = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    delta_percent = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Percentage change from previous",
    )
    delta_absolute = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Absolute change from previous",
    )
    action_taken = models.CharField(
        max_length=20,
        choices=DeltaCheckRule.Action.choices,
        blank=True,
    )
    evaluated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "Delta Check Result"
        verbose_name_plural = "Delta Check Results"
        ordering = ["-evaluated_at"]

    def __str__(self):
        return f"Delta {self.outcome} for Result #{self.result_id}"


# =============================================================================
# Auto-Verification Rules
# =============================================================================


class AutoVerifyRule(FacilityScopedModel, TimeStampedModel):
    """
    Auto-verification rules per test. Results that pass ALL active rules
    for a test are auto-verified without human intervention.
    """

    class ConditionType(models.TextChoices):
        IN_REFERENCE_RANGE = "IN_REFERENCE_RANGE", "Result within Reference Range"
        DELTA_CHECK_PASS = "DELTA_CHECK_PASS", "Delta Check Passes"
        QC_IN_CONTROL = "QC_IN_CONTROL", "QC Within Limits"
        NO_CRITICAL_FLAG = "NO_CRITICAL_FLAG", "No Critical Flags"
        SPECIMEN_AGE_OK = "SPECIMEN_AGE_OK", "Specimen Age Acceptable"
        NUMERIC_RESULT = "NUMERIC_RESULT", "Result is Numeric"
        NOT_AMENDED = "NOT_AMENDED", "Not an Amended Result"

    test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.CASCADE,
        related_name="auto_verify_rules",
    )
    condition_type = models.CharField(
        max_length=30,
        choices=ConditionType.choices,
    )
    is_active = models.BooleanField(default=True)
    priority = models.PositiveIntegerField(
        default=10,
        help_text="Evaluation order (lower = evaluated first). First failing rule is the reported blocker.",
    )
    parameters = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional parameters for the condition (e.g., max_specimen_age_hours: 24)",
    )
    description = models.TextField(blank=True)

    class Meta:
        verbose_name = "Auto-Verify Rule"
        verbose_name_plural = "Auto-Verify Rules"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "test", "condition_type"],
                name="unique_autoverify_rule_per_condition",
            )
        ]
        ordering = ["priority", "test__name", "condition_type"]

    def __str__(self):
        return f"AutoVerify: {self.test.name} - {self.get_condition_type_display()}"


class AutoVerifyConfig(FacilityScopedModel, TimeStampedModel):
    """
    Facility-level auto-verification configuration.
    Controls global settings like percentage caps.
    """

    is_enabled = models.BooleanField(
        default=False,
        help_text="Master switch for auto-verification at this facility",
    )
    max_auto_verify_percent = models.IntegerField(
        default=70,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Maximum percentage of results that can be auto-verified per day",
    )
    excluded_priorities = models.JSONField(
        default=list,
        blank=True,
        help_text="Priority levels excluded from auto-verify (e.g., ['STAT'])",
    )
    require_qc_pass = models.BooleanField(
        default=True,
        help_text="Require QC to be in control before auto-verifying",
    )
    max_specimen_age_hours = models.IntegerField(
        default=24,
        validators=[MinValueValidator(1)],
        help_text="Default max specimen age for auto-verification",
    )

    class Meta:
        verbose_name = "Auto-Verify Configuration"
        verbose_name_plural = "Auto-Verify Configurations"
        constraints = [
            models.UniqueConstraint(
                fields=["facility"],
                name="unique_autoverify_config_per_facility",
            )
        ]

    def __str__(self):
        status = "Enabled" if self.is_enabled else "Disabled"
        return f"AutoVerify Config ({status}) - {self.facility}"


class AutoVerifyLog(FacilityScopedModel, TimeStampedModel):
    """
    Audit log of every auto-verification attempt.
    Records which rules were evaluated and the final outcome.
    """

    class Outcome(models.TextChoices):
        AUTO_VERIFIED = "AUTO_VERIFIED", "Auto-Verified"
        BLOCKED = "BLOCKED", "Blocked (Rule Failed)"
        SKIPPED = "SKIPPED", "Skipped (Disabled)"
        CAP_EXCEEDED = "CAP_EXCEEDED", "Blocked (Daily Cap Exceeded)"

    result = models.OneToOneField(
        "laboratory.LabResult",
        on_delete=models.CASCADE,
        related_name="auto_verify_log",
    )
    outcome = models.CharField(max_length=20, choices=Outcome.choices)
    rules_evaluated = models.JSONField(
        default=list,
        help_text="List of {rule_id, condition_type, passed, detail}",
    )
    blocking_rule = models.ForeignKey(
        AutoVerifyRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="blocked_results",
        help_text="First rule that failed (if blocked)",
    )
    evaluated_at = models.DateTimeField(default=timezone.now)
    auto_verified_by_system = models.BooleanField(
        default=False,
        help_text="True if the system marked it verified",
    )

    class Meta:
        verbose_name = "Auto-Verify Log"
        verbose_name_plural = "Auto-Verify Logs"
        ordering = ["-evaluated_at"]

    def __str__(self):
        return f"AutoVerify {self.outcome} for Result #{self.result_id}"
