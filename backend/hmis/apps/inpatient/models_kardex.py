# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401
"""Inpatient models kardex for Vitora HMIS.

What this file is for:
- Implement models kardex logic for the inpatient domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.core.pii import encrypted_pii_property

from .clearance import calculate_patient_blocking_balance
from .models_ward_admission import MATERNITY_CONTINUITY_ACTION_CHOICES, Admission, Ward

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser
    from django.db.models import QuerySet

User = get_user_model()


class NursingKardex(models.Model):
    """
    Nursing Kardex for inpatient care coordination.

    One-to-one relationship with Admission. Auto-created when admission is saved.
    Contains nursing care plan, risk assessments, and related shift/handover notes.
    """

    RISK_CHOICES = [
        ("LOW", "Low"),
        ("MODERATE", "Moderate"),
        ("HIGH", "High"),
    ]
    CODE_STATUS_CHOICES = [
        ("FULL_CODE", "Full Code"),
        ("DNR", "Do Not Resuscitate (DNR)"),
        ("DNI", "Do Not Intubate (DNI)"),
        ("LIMITED", "Limited Intervention"),
        ("UNKNOWN", "Unknown / Not Documented"),
    ]

    admission = models.OneToOneField(
        Admission,
        on_delete=models.CASCADE,
        related_name="kardex",
        help_text="One Kardex per admission",
    )

    # Basic care information
    mobility_status = models.CharField(
        max_length=100,
        blank=True,
        help_text="Patient mobility status (e.g., Ambulatory, Wheelchair, Bedridden)",
    )
    dietary_requirements = models.CharField(
        max_length=200, blank=True, help_text="Dietary requirements (e.g., Regular, Diabetic, NPO)"
    )
    allergies = models.TextField(blank=True, help_text="Known allergies")
    iv_access = models.CharField(
        max_length=200, blank=True, help_text="IV access details (e.g., Right arm IV cannula)"
    )
    code_status = models.CharField(
        max_length=20,
        choices=CODE_STATUS_CHOICES,
        default="UNKNOWN",
        help_text="Resuscitation/code status (e.g., Full Code, DNR)",
    )
    code_status_notes = models.TextField(
        blank=True,
        help_text="Optional context for code status decisions",
    )
    current_medications = models.TextField(
        blank=True,
        help_text="Current medications snapshot for nursing handoff",
    )
    iv_fluids = models.TextField(
        blank=True,
        help_text="Current IV fluids and rates",
    )
    hygiene_precautions = models.TextField(
        blank=True,
        help_text="Personal hygiene needs or safety precautions",
    )
    maternity_continuity_action = models.CharField(
        max_length=40,
        choices=MATERNITY_CONTINUITY_ACTION_CHOICES,
        default="NONE",
        help_text="Current postpartum continuity action the nursing team is working toward",
    )
    maternity_continuity_notes = models.TextField(
        blank=True,
        help_text="Operational postpartum continuity notes for nursing handoff and discharge workflow",
    )

    # Legacy nursing care plan fields (deprecated - use care_plan_entries instead)
    nursing_problems = models.TextField(
        blank=True,
        help_text="DEPRECATED: Use care_plan_entries. Identified nursing problems/diagnoses",
    )
    interventions = models.TextField(
        blank=True,
        help_text="DEPRECATED: Use care_plan_entries. Nursing interventions and care activities",
    )
    monitoring_requirements = models.TextField(
        blank=True,
        help_text="DEPRECATED: Use care_plan_entries. What to monitor and how often",
    )
    care_task_frequency = models.TextField(
        blank=True,
        help_text="DEPRECATED: Use care_plan_entries. Frequency of care tasks",
    )

    # Risk assessments (CharFields with choices)
    fall_risk = models.CharField(
        max_length=20, choices=RISK_CHOICES, default="LOW", help_text="Patient fall risk level"
    )
    pressure_sore_risk = models.CharField(
        max_length=20,
        choices=RISK_CHOICES,
        default="LOW",
        help_text="Patient pressure sore risk level",
    )

    # Isolation requirements
    isolation_required = models.BooleanField(
        default=False, help_text="Whether patient requires isolation"
    )
    isolation_type = models.CharField(
        max_length=100, blank=True, help_text="Type of isolation (e.g., Contact, Droplet, Airborne)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Nursing Kardexes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Kardex for {self.admission.patient} - Admission {self.admission.admission_number}"


class KardexFieldChange(models.Model):
    """Audit trail of key NursingKardex field updates over time."""

    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name="field_change_history",
        help_text="Kardex this field change belongs to",
    )
    field_name = models.CharField(max_length=100, help_text="Field that was changed")
    old_value = models.TextField(blank=True, help_text="Previous value before update")
    new_value = models.TextField(blank=True, help_text="New value after update")
    changed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="kardex_field_changes",
        help_text="User who made the change",
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at"]
        indexes = [
            models.Index(fields=["kardex", "-changed_at"]),
            models.Index(fields=["field_name", "-changed_at"]),
        ]

    def __str__(self):
        return f"Kardex {self.kardex_id}: {self.field_name} updated at {self.changed_at}"


class KardexScheduleItem(models.Model):
    """Scheduled nursing/clinical tasks linked to a Kardex record."""

    ITEM_TYPE_CHOICES = [
        ("TREATMENT", "Treatment"),
        ("DIAGNOSTIC_TEST", "Diagnostic Test"),
        ("VITALS_CHECK", "Vitals Check"),
        ("MEDICATION", "Medication"),
    ]
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name="schedule_items",
        help_text="Kardex this schedule item belongs to",
    )
    item_type = models.CharField(max_length=30, choices=ITEM_TYPE_CHOICES)
    title = models.CharField(max_length=255)
    scheduled_for = models.DateTimeField(help_text="Scheduled date and time for this task")
    frequency = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="kardex_schedule_items_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["scheduled_for", "id"]
        indexes = [
            models.Index(fields=["kardex", "scheduled_for"]),
            models.Index(fields=["status", "scheduled_for"]),
        ]

    def __str__(self):
        return f"{self.get_item_type_display()}: {self.title} ({self.scheduled_for:%Y-%m-%d %H:%M})"


class NursingCarePlanEntry(models.Model):
    """
    Individual nursing care plan entry (one row on the 24-hour care plan form).

    Follows the ADPIE nursing process structure matching the Kenya physical form:
    Assessment → Diagnosis → Planning → Implementation → Evaluation.

    Each entry represents a single nursing problem/diagnosis with its complete
    care plan, tracked with date/time and the recording nurse.
    """

    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("ONGOING", "Ongoing"),
        ("RESOLVED", "Resolved"),
        ("DISCONTINUED", "Discontinued"),
    ]

    # Terminal statuses — entries in these states cannot be further updated
    TERMINAL_STATUSES = {"RESOLVED", "DISCONTINUED"}
    REVIEW_WINDOW_HOURS = 24

    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name="care_plan_entries",
        help_text="Parent Kardex for this care plan entry",
    )

    # DATE & TIME
    recorded_at = models.DateTimeField(help_text="Date and time the entry was recorded")
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="nursing_care_plan_entries",
        help_text="Nurse who recorded this entry",
    )

    # ASSESSMENT (cluster of cues)
    assessment = models.TextField(help_text="Assessment findings / cluster of cues observed")

    # NURSING DIAGNOSIS
    nursing_diagnosis = models.TextField(help_text="Nursing diagnosis derived from assessment")

    # GOAL AND OUTCOME CRITERIA
    goal_and_outcome_criteria = models.TextField(
        help_text="Expected goals and measurable outcome criteria"
    )

    # NURSING PLAN OF ACTION/INTERVENTION
    plan_of_action = models.TextField(help_text="Nursing plan of action / planned interventions")

    # SCIENTIFIC RATIONALE
    scientific_rationale = models.TextField(
        help_text="Scientific rationale for the planned interventions"
    )

    # IMPLEMENTATION
    implementation = models.TextField(
        blank=True,
        help_text="What was actually implemented / carried out",
    )

    # EVALUATION
    evaluation = models.TextField(
        blank=True,
        help_text="Evaluation of whether goals and outcomes were met",
    )

    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACTIVE",
        help_text="Current status of this care plan entry",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this care plan was last clinically reviewed/updated",
    )

    class Meta:
        verbose_name = "Nursing Care Plan Entry"
        verbose_name_plural = "Nursing Care Plan Entries"
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["kardex", "-recorded_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return (
            f"Care Plan: {self.nursing_diagnosis[:50]} "
            f"({self.get_status_display()}) - {self.recorded_at:%Y-%m-%d %H:%M}"
        )

    @property
    def review_anchor_at(self):
        """Reference datetime for review cadence: last review, else original recording time."""
        return self.last_reviewed_at or self.recorded_at

    @property
    def review_due_at(self):
        """Datetime when this entry should be reviewed (24h after recording)."""
        review_anchor = self.review_anchor_at
        if not review_anchor:
            return None
        return review_anchor + timedelta(hours=self.REVIEW_WINDOW_HOURS)

    @property
    def is_review_due(self) -> bool:
        """Whether an active/ongoing entry has crossed its 24-hour review window."""
        if self.status in self.TERMINAL_STATUSES:
            return False
        review_due_at = self.review_due_at
        if review_due_at is None:
            return False
        return timezone.now() >= review_due_at


class NursingCarePlanEntryChange(models.Model):
    """Audit-friendly change history entries for NursingCarePlanEntry lifecycle and edits."""

    ACTION_CHOICES = [
        ("CREATE", "Created"),
        ("UPDATE", "Updated"),
        ("RESOLVE", "Resolved"),
        ("DISCONTINUE", "Discontinued"),
        ("BULK_RESOLVE", "Bulk Resolved"),
    ]

    care_plan_entry = models.ForeignKey(
        NursingCarePlanEntry,
        on_delete=models.CASCADE,
        related_name="change_history",
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    changed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nursing_care_plan_changes",
    )
    changed_fields = models.JSONField(default=list, blank=True)
    before_data = models.JSONField(default=dict, blank=True)
    after_data = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["care_plan_entry", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
        ]

    def __str__(self):
        return f"CarePlanChange[{self.action}] entry={self.care_plan_entry_id} at {self.created_at}"


class KardexShiftNote(models.Model):
    """
    Individual shift note entry in Kardex (append-only design).

    Nurses add notes throughout their shift documenting patient status,
    care provided, and observations. Notes are immutable once created
    (timestamp auto-set on creation and cannot be changed).
    """

    SHIFT_CHOICES = [
        ("DAY", "Day Shift"),
        ("NIGHT", "Night Shift"),
    ]

    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name="shift_notes",
        help_text="Kardex this note belongs to",
    )
    shift = models.CharField(
        max_length=10, choices=SHIFT_CHOICES, help_text="Which shift this note is from"
    )
    nurse = models.ForeignKey(
        User, on_delete=models.PROTECT, help_text="Nurse who created this note"
    )
    content = models.TextField(
        help_text="Shift note content - observations, care provided, patient status"
    )
    timestamp = models.DateTimeField(
        auto_now_add=True, help_text="When this note was created (immutable)"
    )

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["kardex", "-timestamp"]),
            models.Index(fields=["shift", "-timestamp"]),
        ]

    def __str__(self):
        return f"{self.shift} shift note by {self.nurse.username} at {self.timestamp}"


class KardexHandoverNote(models.Model):
    """
    Handover notes for shift transitions.

    Documents pending tasks, escalations, and important information
    to be communicated between outgoing and incoming nursing staff.
    """

    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name="handover_notes",
        help_text="Kardex this handover belongs to",
    )
    outgoing_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="kardex_handovers_given",
        help_text="Nurse ending their shift",
    )
    incoming_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="kardex_handovers_received",
        help_text="Nurse starting their shift",
    )
    shift_ending = models.CharField(max_length=10, help_text="Which shift is ending (DAY/NIGHT)")
    pending_tasks = models.TextField(help_text="Tasks that need completion in next shift")
    escalations = models.TextField(
        blank=True, help_text="Issues escalated to doctors or management"
    )
    acknowledged_at = models.DateTimeField(
        null=True, blank=True, help_text="When incoming nurse acknowledged the handover"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["kardex", "-created_at"]),
        ]

    def __str__(self):
        status = "✓ Acknowledged" if self.acknowledged_at else "Pending"
        return f"Handover from {self.outgoing_nurse.username} to {self.incoming_nurse.username} - {status}"


class InpatientConsumableUsage(TimeStampedModel):
    """Recorded inpatient use of a stocked consumable from pharmacy inventory."""

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="consumable_usages",
        help_text="Admission where the consumable was used",
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="inpatient_consumable_usages",
        help_text="Consumable item used during admission",
    )
    batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.PROTECT,
        related_name="inpatient_consumable_usages",
        help_text="Stock batch debited for this usage",
    )
    quantity_used = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Quantity consumed from stock",
    )
    notes = models.TextField(blank=True, help_text="Optional usage notes")
    used_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="recorded_inpatient_consumable_usages",
        help_text="User who recorded the consumable use",
    )
    used_at = models.DateTimeField(default=timezone.now)

    is_reversed = models.BooleanField(default=False)
    reversed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reversed_inpatient_consumable_usages",
    )
    reversed_at = models.DateTimeField(null=True, blank=True)
    reverse_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-used_at", "-created_at"]
        indexes = [
            models.Index(fields=["admission", "-used_at"]),
            models.Index(fields=["drug", "-used_at"]),
            models.Index(fields=["is_reversed"]),
        ]

    def __str__(self):
        return (
            f"{self.drug.generic_name} x{self.quantity_used} for {self.admission.admission_number}"
        )

    def clean(self):
        super().clean()

        if self.batch_id and self.drug_id and self.batch.drug_id != self.drug_id:
            raise ValidationError({"batch": "Selected batch does not belong to the selected drug."})

        if self.pk is None and self.batch_id and self.quantity_used > self.batch.quantity_available:
            raise ValidationError(
                {
                    "quantity_used": (
                        f"Cannot use {self.quantity_used} units. "
                        f"Only {self.batch.quantity_available} available in batch."
                    )
                }
            )

    def save(self, *args, **kwargs):
        is_new = self.pk is None

        if self.batch_id and not self.drug_id:
            self.drug = self.batch.drug

        if is_new:
            self.full_clean()
            self.batch.dispense(self.quantity_used)

        super().save(*args, **kwargs)

    def reverse(self, user: AbstractUser, reason: str) -> None:
        """Reverse a previously recorded consumable usage and restore stock."""
        if self.is_reversed:
            raise ValueError("This consumable usage has already been reversed.")

        if not reason.strip():
            raise ValueError("A reversal reason is required.")

        self.batch.return_stock(self.quantity_used)
        self.is_reversed = True
        self.reversed_by = user
        self.reversed_at = timezone.now()
        self.reverse_reason = reason.strip()
        self.save()


class ShiftHandover(TimeStampedModel):
    """
    Formal ward-level shift handover record.

    Documents shift handovers between nursing teams for ward-level patient care
    coordination. Tracks patient counts, critical cases, and pending tasks.

    Attributes:
        ward: Hospital ward where handover occurs
        shift_date: Date of the shift
        shift_ending: Shift that is ending (DAY, EVENING, NIGHT)
        outgoing_nurse: Nurse handing over shift
        incoming_nurse: Nurse receiving handover
        total_patients: Total patient count in ward
        critical_patients: Number of critical/unstable patients
        new_admissions: Number of new admissions during shift
        discharges_pending: Number of pending discharges
        general_notes: General shift notes
        acknowledged_at: When incoming nurse acknowledged handover
    """

    SHIFT_CHOICES = [
        ("DAY", "Day Shift (07:00-15:00)"),
        ("EVENING", "Evening Shift (15:00-23:00)"),
        ("NIGHT", "Night Shift (23:00-07:00)"),
    ]

    ward = models.ForeignKey(
        Ward,
        on_delete=models.CASCADE,
        related_name="shift_handovers",
        help_text="Ward where handover occurs",
    )
    shift_date = models.DateField(help_text="Date of the shift")
    shift_ending = models.CharField(
        max_length=10, choices=SHIFT_CHOICES, help_text="Shift that is ending"
    )
    outgoing_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="handovers_given",
        help_text="Nurse handing over shift",
    )
    incoming_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="handovers_received",
        help_text="Nurse receiving handover",
    )

    # Patient counts
    total_patients = models.PositiveIntegerField(help_text="Total patient count in ward")
    critical_patients = models.PositiveIntegerField(
        default=0, help_text="Number of critical/unstable patients"
    )
    new_admissions = models.PositiveIntegerField(
        default=0, help_text="Number of new admissions during shift"
    )
    discharges_pending = models.PositiveIntegerField(
        default=0, help_text="Number of pending discharges"
    )

    # Notes
    general_notes = models.TextField(blank=True, help_text="General shift notes and observations")
    acknowledged_at = models.DateTimeField(
        null=True, blank=True, help_text="When incoming nurse acknowledged handover"
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-shift_date", "-created_at"]
        unique_together = ["ward", "shift_date", "shift_ending"]
        indexes = [
            models.Index(fields=["ward", "-shift_date"]),
            models.Index(fields=["shift_date", "shift_ending"]),
        ]

    def __str__(self) -> str:
        # get_shift_ending_display() is auto-generated by Django for choice fields
        shift_display: str = self.get_shift_ending_display()  # type: ignore[attr-defined]
        return f"{self.ward.name} - {shift_display} - {self.shift_date}"

    @property
    def is_acknowledged(self) -> bool:
        """Check if handover has been acknowledged."""
        return self.acknowledged_at is not None

    def acknowledge(self, user: AbstractUser) -> None:
        """
        Acknowledge handover receipt.

        Args:
            user: User acknowledging the handover (should be incoming_nurse)
        """
        self.acknowledged_at = timezone.now()
        self.save(update_fields=["acknowledged_at"])

    def auto_populate_counts(self) -> None:
        """
        Auto-populate patient counts from ward data.

        Queries current ward admissions to calculate:
        - Total patients
        - Critical patients (based on ward round condition status)
        - New admissions today
        - Discharges pending
        """

        # Get all active admissions in this ward
        active_admissions = Admission.objects.filter(ward=self.ward, discharge__isnull=True)

        self.total_patients = active_admissions.count()

        # Count new admissions for this shift date
        self.new_admissions = active_admissions.filter(admission_date__date=self.shift_date).count()

        # Count critical patients (patients with DETERIORATING status in latest ward round)
        critical_count = 0
        for admission in active_admissions:
            latest_round = admission.ward_rounds.order_by("-round_date").first()
            if latest_round and latest_round.condition_status == "DETERIORATING":
                critical_count += 1
        self.critical_patients = critical_count

        # Count pending discharges (admissions with recent discharge recommendations)
        # TODO : This is a simplified count - could be enhanced with actual discharge orders
        self.discharges_pending = 0  # Placeholder - implement based on your workflow

        self.save()


class SupervisorAlertAcknowledgment(TimeStampedModel):
    """
    Acknowledgment record for supervisor critical violation alerts.

    Tracks when supervisors acknowledge critical constraint violations
    that were overridden during admission.

    Attributes:
        admission: Admission with critical violation(s)
        acknowledged_by: Supervisor who acknowledged the alert
        acknowledged_at: When the alert was acknowledged
        notes: Optional notes from the supervisor
    """

    admission = models.OneToOneField(
        Admission,
        on_delete=models.CASCADE,
        related_name="alert_acknowledgment",
        help_text="Admission with critical violation(s)",
    )
    acknowledged_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="inpatient_acknowledged_alerts",
        help_text="Supervisor who acknowledged the alert",
    )
    acknowledged_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the alert was acknowledged",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Optional notes from the supervisor",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-acknowledged_at"]
        verbose_name = "Supervisor Alert Acknowledgment"
        verbose_name_plural = "Supervisor Alert Acknowledgments"

    def __str__(self):
        return f"Alert acknowledged for {self.admission.admission_number} by {self.acknowledged_by.username}"


# ============================================================================
# Observation Charts
# ============================================================================
