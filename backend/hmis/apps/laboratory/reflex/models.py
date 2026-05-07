"""
Models for Reflexive Testing.
Phase L6.1 of Vitora LIS Implementation Plan.

Auto-adds follow-up tests based on initial results.
Example: TSH > 10 → auto-order Free T4
"""

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

User = get_user_model()


class ReflexRule(FacilityScopedModel, TimeStampedModel):
    """
    Defines when a follow-up test should be automatically added
    based on the result of a trigger test.
    """

    class Operator(models.TextChoices):
        GREATER_THAN = "GT", "Greater Than (>)"
        LESS_THAN = "LT", "Less Than (<)"
        GREATER_EQUAL = "GTE", "Greater Than or Equal (>=)"
        LESS_EQUAL = "LTE", "Less Than or Equal (<=)"
        EQUALS = "EQ", "Equals (==)"
        NOT_EQUALS = "NEQ", "Not Equals (!=)"
        IN_RANGE = "IN_RANGE", "In Range (between)"
        OUT_OF_RANGE = "OUT_OF_RANGE", "Out of Range"
        CONTAINS = "CONTAINS", "Contains (text)"
        CRITICAL = "CRITICAL", "Is Critical Value"
        ABNORMAL = "ABNORMAL", "Is Abnormal"

    class Action(models.TextChoices):
        AUTO_ORDER = "AUTO_ORDER", "Auto-Order Test"
        SUGGEST = "SUGGEST", "Suggest (Manual Approval)"

    trigger_test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.CASCADE,
        related_name="reflex_rules_as_trigger",
        help_text="The test whose result triggers the reflex",
    )
    reflex_test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.CASCADE,
        related_name="reflex_rules_as_reflex",
        help_text="The test to add when the condition is met",
    )
    operator = models.CharField(
        max_length=20,
        choices=Operator.choices,
        default=Operator.GREATER_THAN,
    )
    threshold_value = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Numeric threshold for comparison operators",
    )
    threshold_high = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Upper bound for IN_RANGE/OUT_OF_RANGE operators",
    )
    text_value = models.CharField(
        max_length=200,
        blank=True,
        help_text="Text value for CONTAINS/EQUALS operators",
    )
    action = models.CharField(
        max_length=20,
        choices=Action.choices,
        default=Action.SUGGEST,
    )
    priority = models.CharField(
        max_length=20,
        choices=[
            ("ROUTINE", "Routine"),
            ("URGENT", "Urgent"),
            ("STAT", "STAT"),
        ],
        default="ROUTINE",
        help_text="Priority for the reflexed test order",
    )
    description = models.TextField(
        blank=True,
        help_text="Human-readable description (e.g., 'TSH > 10 → order Free T4')",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Reflex Rule"
        verbose_name_plural = "Reflex Rules"
        ordering = ["trigger_test__name", "reflex_test__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "trigger_test", "reflex_test", "operator"],
                name="unique_reflex_rule_per_facility",
            )
        ]

    def __str__(self):
        return (
            f"Reflex: {self.trigger_test.name} {self.get_operator_display()} "
            f"{self.threshold_value or self.text_value} → {self.reflex_test.name}"
        )

    def evaluate(self, result_value, lab_result=None):
        """
        Evaluate whether this rule's condition is met.

        Args:
            result_value: The numeric or text value of the trigger test result
            lab_result: Optional LabResult instance for CRITICAL/ABNORMAL checks

        Returns:
            bool: True if the condition is met and reflex should fire
        """
        if not self.is_active:
            return False

        op = self.operator

        if op == self.Operator.CRITICAL:
            return lab_result and getattr(lab_result, "is_critical_result", False)

        if op == self.Operator.ABNORMAL:
            return lab_result and getattr(lab_result, "result_flag", "") not in ("", "NORMAL")

        if op == self.Operator.CONTAINS:
            return self.text_value.lower() in str(result_value).lower()

        try:
            val = float(result_value)
        except (TypeError, ValueError):
            return False

        threshold = float(self.threshold_value) if self.threshold_value is not None else None

        if op == self.Operator.GREATER_THAN:
            return threshold is not None and val > threshold
        elif op == self.Operator.LESS_THAN:
            return threshold is not None and val < threshold
        elif op == self.Operator.GREATER_EQUAL:
            return threshold is not None and val >= threshold
        elif op == self.Operator.LESS_EQUAL:
            return threshold is not None and val <= threshold
        elif op == self.Operator.EQUALS:
            return threshold is not None and val == threshold
        elif op == self.Operator.NOT_EQUALS:
            return threshold is not None and val != threshold
        elif op == self.Operator.IN_RANGE:
            high = float(self.threshold_high) if self.threshold_high is not None else None
            return threshold is not None and high is not None and threshold <= val <= high
        elif op == self.Operator.OUT_OF_RANGE:
            high = float(self.threshold_high) if self.threshold_high is not None else None
            return threshold is not None and high is not None and (val < threshold or val > high)

        return False


class ReflexExecution(FacilityScopedModel, TimeStampedModel):
    """
    Records each time a reflex rule fires and the resulting action.
    """

    class Status(models.TextChoices):
        TRIGGERED = "TRIGGERED", "Triggered"
        ORDERED = "ORDERED", "Auto-Ordered"
        SUGGESTED = "SUGGESTED", "Suggested"
        APPROVED = "APPROVED", "Approved (Manual)"
        REJECTED = "REJECTED", "Rejected (Manual)"
        CANCELLED = "CANCELLED", "Cancelled"

    rule = models.ForeignKey(
        ReflexRule,
        on_delete=models.SET_NULL,
        null=True,
        related_name="executions",
    )
    trigger_result = models.ForeignKey(
        "laboratory.LabResult",
        on_delete=models.CASCADE,
        related_name="reflex_triggered",
        help_text="The result that triggered the reflex",
    )
    reflex_order = models.ForeignKey(
        "laboratory.LabOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reflex_source",
        help_text="The auto-created lab order (if AUTO_ORDER)",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.TRIGGERED,
    )
    trigger_value = models.CharField(
        max_length=100,
        blank=True,
        help_text="Value that triggered the reflex",
    )
    executed_at = models.DateTimeField(default=timezone.now)
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_reflexes",
    )
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = "Reflex Execution"
        verbose_name_plural = "Reflex Executions"
        ordering = ["-executed_at"]

    def __str__(self):
        return f"Reflex #{self.pk} ({self.get_status_display()})"

    def approve(self, user):
        """Approve a suggested reflex and create the order."""
        self.status = self.Status.APPROVED
        self.approved_by = user
        self.save(update_fields=["status", "approved_by"])

    def reject(self, user, notes=""):
        """Reject a suggested reflex."""
        self.status = self.Status.REJECTED
        self.approved_by = user
        self.notes = notes
        self.save(update_fields=["status", "approved_by", "notes"])
