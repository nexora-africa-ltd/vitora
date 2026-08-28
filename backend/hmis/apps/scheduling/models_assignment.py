# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Scheduling models assignment for Vitora HMIS.

What this file is for:
- Implement models assignment logic for the scheduling domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

# =============================================================================
# Resource Model - Schedulable Resources
# =============================================================================
from hmis.apps.scheduling.models_resource_schedule import *  # noqa: F403


class AssignmentRuleManager(models.Manager):
    """Custom manager for AssignmentRule with utility methods."""

    def get_active_for_type(self, applies_to: str, for_date: date = None):
        """
        Get active rules for a specific assignment type.

        Args:
            applies_to: The assignment type (APPOINTMENT, SHIFT, BED_ASSIGNMENT, etc.)
            for_date: Optional date to check effective range (defaults to today)

        Returns:
            QuerySet of active rules ordered by priority (highest first)
        """
        if for_date is None:
            for_date = date.today()

        return (
            self.filter(
                applies_to=applies_to,
                is_active=True,
                effective_from__lte=for_date,
            )
            .filter(
                models.Q(effective_until__isnull=True) | models.Q(effective_until__gte=for_date)
            )
            .order_by("-priority")
        )


class AssignmentRule(FacilityScopedModel, TimeStampedModel):
    """
    Defines rules for automatic resource assignment.

    Rules are stored as JSON (DSL format) and evaluated by the RuleEvaluator.
    Supports versioning, priority ordering, and effective date ranges.

    Rule Definition DSL Structure:
    {
        "version": "1.0",
        "when": { conditions for rule applicability },
        "constraints": [ required conditions for candidates ],
        "scoring": [ scoring factors for ranking candidates ],
        "fallback": { action when no candidates match }
    }
    """

    APPLIES_TO_CHOICES = [
        ("APPOINTMENT", "Doctor to Appointment"),
        ("SHIFT", "Staff to Shift"),
        ("BED_ASSIGNMENT", "Bed to Admission"),
        ("LAB_BATCH", "Lab Technician to Test Batch"),
        ("THEATRE_SLOT", "Theatre to Procedure"),
    ]

    name = models.CharField(
        max_length=200,
        help_text="Human-readable rule name",
    )
    rule_code = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Unique rule identifier (e.g., assign_doctor_to_opd)",
    )
    applies_to = models.CharField(
        max_length=30,
        choices=APPLIES_TO_CHOICES,
        db_index=True,
        help_text="Type of assignment this rule applies to",
    )
    rule_definition = models.JSONField(
        default=dict,
        help_text="Rule definition in DSL format (JSON)",
    )
    version = models.PositiveIntegerField(
        default=1,
        help_text="Rule version for tracking changes",
    )
    priority = models.IntegerField(
        default=100,
        db_index=True,
        help_text="Priority for rule ordering (higher = evaluated first)",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether rule is currently active",
    )
    effective_from = models.DateField(
        default=date.today,
        help_text="When rule becomes effective",
    )
    effective_until = models.DateField(
        null=True,
        blank=True,
        help_text="When rule expires (null = indefinite)",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Detailed description of what this rule does",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_assignment_rules",
        help_text="User who created this rule",
    )

    objects = AssignmentRuleManager()

    class Meta(TimeStampedModel.Meta):
        """Meta options for AssignmentRule model."""

        ordering = ["-priority", "name"]
        verbose_name = "Assignment Rule"
        verbose_name_plural = "Assignment Rules"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "rule_code"],
                name="scheduling_rule_unique_code_per_facility",
            ),
        ]

    def __str__(self) -> str:
        """Return string representation."""
        return f"{self.rule_code} v{self.version} ({self.applies_to})"

    def clean(self) -> None:
        """Validate rule data."""
        super().clean()
        errors = {}

        # Validate applies_to
        valid_types = [choice[0] for choice in self.APPLIES_TO_CHOICES]
        if self.applies_to not in valid_types:
            errors["applies_to"] = f"Invalid type. Must be one of: {valid_types}"

        # Validate effective dates
        if self.effective_until and self.effective_until < self.effective_from:
            errors["effective_until"] = "Effective until must be after effective from"

        if errors:
            raise ValidationError(errors)

    def is_effective_on(self, check_date: date) -> bool:
        """
        Check if rule is effective on a given date.

        Args:
            check_date: Date to check

        Returns:
            bool: True if rule is effective
        """
        if not self.is_active:
            return False
        if check_date < self.effective_from:
            return False
        if self.effective_until and check_date > self.effective_until:
            return False
        return True


class AssignmentDecisionManager(models.Manager):
    """Custom manager for AssignmentDecision with utility methods."""

    def get_for_target(self, target_type: str, target_id: int):
        """
        Get all decisions for a specific target.

        Args:
            target_type: Type of target (e.g., "Appointment")
            target_id: ID of the target

        Returns:
            QuerySet of decisions ordered by most recent first
        """
        return self.filter(
            target_type=target_type,
            target_id=target_id,
        ).order_by("-created_at")


class AssignmentDecision(TimeStampedModel):
    """
    Logs every assignment decision for full auditability and explainability.

    Records all inputs, evaluated candidates, scoring details, and the final
    outcome. Designed to be immutable after creation (audit trail).

    Key Rule: Every decision is logged, even if no assignment was made.
    """

    OUTCOME_CHOICES = [
        ("ASSIGNED", "Resource Assigned"),
        ("UNASSIGNED", "Left Unassigned (No Match)"),
        ("SKIPPED", "Rule Skipped (Conditions Not Met)"),
        ("ERROR", "Error During Evaluation"),
    ]

    # Target identification
    assignment_type = models.CharField(
        max_length=30,
        db_index=True,
        help_text="Type of assignment (APPOINTMENT, SHIFT, etc.)",
    )
    target_id = models.BigIntegerField(
        db_index=True,
        help_text="ID of the target object being assigned to",
    )
    target_type = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Model name of the target (e.g., Appointment)",
    )

    # Rule and result
    rule_applied = models.ForeignKey(
        AssignmentRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decisions",
        help_text="Rule that was applied (null if no matching rule)",
    )
    assigned_resource = models.ForeignKey(
        Resource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assignment_decisions",
        help_text="Resource that was assigned (null if unassigned)",
    )
    decision_outcome = models.CharField(
        max_length=20,
        choices=OUTCOME_CHOICES,
        db_index=True,
        help_text="Outcome of the decision",
    )
    decision_reason = models.TextField(
        help_text="Human-readable explanation of the decision",
    )

    # Evaluation details (for explainability)
    candidates_evaluated = models.JSONField(
        default=list,
        blank=True,
        help_text="List of candidates that were evaluated with their scores",
    )
    scoring_details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Detailed scoring breakdown",
    )
    evaluation_inputs = models.JSONField(
        default=dict,
        blank=True,
        help_text="All inputs used for evaluation (context snapshot)",
    )
    evaluation_time_ms = models.PositiveIntegerField(
        default=0,
        help_text="Time taken for evaluation in milliseconds",
    )

    # Tracking
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triggered_decisions",
        help_text="User who triggered this assignment",
    )

    objects = AssignmentDecisionManager()

    class Meta(TimeStampedModel.Meta):
        """Meta options for AssignmentDecision model."""

        ordering = ["-created_at"]
        verbose_name = "Assignment Decision"
        verbose_name_plural = "Assignment Decisions"
        indexes = [
            models.Index(fields=["target_type", "target_id"]),
            models.Index(fields=["assignment_type", "decision_outcome"]),
        ]

    def __str__(self) -> str:
        """Return string representation."""
        resource_name = self.assigned_resource.name if self.assigned_resource else "None"
        return f"Decision: {self.target_type}#{self.target_id} -> {resource_name} ({self.decision_outcome})"


class AssignmentOverrideManager(models.Manager):
    """Custom manager for AssignmentOverride with utility methods."""

    def get_for_target(self, target_type: str, target_id: int):
        """
        Get all overrides for a specific target.

        Args:
            target_type: Type of target (e.g., "Appointment")
            target_id: ID of the target

        Returns:
            QuerySet of overrides ordered by most recent first
        """
        return self.filter(
            target_type=target_type,
            target_id=target_id,
        ).order_by("-created_at")


class AssignmentOverride(TimeStampedModel):
    """
    Tracks manual overrides of automatic assignments.

    Key Rule: Humans can always override automatic assignments.
    Every override requires justification for audit purposes.

    Supports approval workflow for sensitive overrides.
    """

    OVERRIDE_REASON_CHOICES = [
        ("PATIENT_REQUEST", "Patient Request"),
        ("STAFF_UNAVAILABLE", "Staff Unavailable"),
        ("EMERGENCY", "Emergency Situation"),
        ("SPECIALIZATION_NEEDED", "Specialization Required"),
        ("LOAD_BALANCING", "Load Balancing"),
        ("ADMINISTRATIVE", "Administrative Decision"),
        ("OTHER", "Other"),
    ]

    APPROVAL_STATUS_CHOICES = [
        ("PENDING", "Pending Approval"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("NOT_REQUIRED", "Approval Not Required"),
    ]

    # Target identification
    target_type = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Model name of the target (e.g., Appointment)",
    )
    target_id = models.BigIntegerField(
        db_index=True,
        help_text="ID of the target object",
    )

    # Override details
    original_resource = models.ForeignKey(
        Resource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="overrides_from",
        help_text="Originally assigned resource (null if was unassigned)",
    )
    new_resource = models.ForeignKey(
        Resource,
        on_delete=models.PROTECT,
        related_name="overrides_to",
        help_text="Newly assigned resource",
    )
    override_reason = models.CharField(
        max_length=30,
        choices=OVERRIDE_REASON_CHOICES,
        help_text="Category of override reason",
    )
    justification = models.TextField(
        help_text="Detailed justification for the override (required)",
    )

    # Override tracking
    overridden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assignment_overrides",
        help_text="User who made the override",
    )

    # Approval workflow
    requires_approval = models.BooleanField(
        default=False,
        help_text="Whether this override requires supervisor approval",
    )
    approval_status = models.CharField(
        max_length=20,
        choices=APPROVAL_STATUS_CHOICES,
        default="NOT_REQUIRED",
        help_text="Current approval status",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_overrides",
        help_text="User who approved this override",
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When override was approved",
    )
    approval_notes = models.TextField(
        blank=True,
        default="",
        help_text="Notes from approver",
    )
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rejected_overrides",
        help_text="User who rejected this override",
    )
    rejected_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When override was rejected",
    )
    rejection_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for rejection",
    )

    objects = AssignmentOverrideManager()

    class Meta(TimeStampedModel.Meta):
        """Meta options for AssignmentOverride model."""

        ordering = ["-created_at"]
        verbose_name = "Assignment Override"
        verbose_name_plural = "Assignment Overrides"
        indexes = [
            models.Index(fields=["target_type", "target_id"]),
        ]

    def __str__(self) -> str:
        """Return string representation."""
        orig = self.original_resource.name if self.original_resource else "None"
        return f"Override: {self.target_type}#{self.target_id}: {orig} -> {self.new_resource.name}"

    def clean(self) -> None:
        """Validate override data."""
        super().clean()
        errors = {}

        # Require justification
        if not self.justification or not self.justification.strip():
            errors["justification"] = "Justification is required for all overrides"

        # Validate override reason
        valid_reasons = [choice[0] for choice in self.OVERRIDE_REASON_CHOICES]
        if self.override_reason not in valid_reasons:
            errors["override_reason"] = f"Invalid reason. Must be one of: {valid_reasons}"

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        """Save with approval status update."""
        # Set initial approval status
        if not self.pk:
            if self.requires_approval:
                self.approval_status = "PENDING"
            else:
                self.approval_status = "NOT_REQUIRED"
        super().save(*args, **kwargs)

    def approve(self, user, notes: str = "") -> None:
        """
        Approve this override.

        Args:
            user: User approving the override
            notes: Optional approval notes
        """
        if self.approval_status != "PENDING":
            raise ValueError(f"Cannot approve override with status: {self.approval_status}")

        self.approval_status = "APPROVED"
        self.approved_by = user
        self.approved_at = timezone.now()
        self.approval_notes = notes
        self.save()

    def reject(self, user, reason: str) -> None:
        """
        Reject this override.

        Args:
            user: User rejecting the override
            reason: Rejection reason (required)
        """
        if self.approval_status != "PENDING":
            raise ValueError(f"Cannot reject override with status: {self.approval_status}")

        if not reason or not reason.strip():
            raise ValueError("Rejection reason is required")

        self.approval_status = "REJECTED"
        self.rejected_by = user
        self.rejected_at = timezone.now()
        self.rejection_reason = reason
        self.save()


# =============================================================================
# Phase 3: Shift / Duty Roster Management
# =============================================================================
