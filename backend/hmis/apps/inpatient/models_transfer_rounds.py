# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Inpatient models transfer rounds for Vitora HMIS.

What this file is for:
- Implement models transfer rounds logic for the inpatient domain.

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
from .models_ward_admission import (
    MATERNITY_CONTINUITY_ACTION_CHOICES,
    Admission,
    Bed,
    Discharge,
    Ward,
)

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser
    from django.db.models import QuerySet

User = get_user_model()


class InterFacilityTransfer(TimeStampedModel):
    """Operational workflow record for inter-facility inpatient transfer."""

    class TransferStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING_ACCEPTANCE = "PENDING_ACCEPTANCE", "Pending Acceptance"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        IN_TRANSIT = "IN_TRANSIT", "In Transit"
        ARRIVED = "ARRIVED", "Arrived"
        CANCELLED = "CANCELLED", "Cancelled"

    class TransferPriority(models.TextChoices):
        ROUTINE = "ROUTINE", "Routine"
        URGENT = "URGENT", "Urgent"
        STAT = "STAT", "STAT"

    class TransferReason(models.TextChoices):
        HIGHER_LEVEL_CARE = "HIGHER_LEVEL_CARE", "Higher-level Care"
        SPECIALIST_INPUT = "SPECIALIST_INPUT", "Specialist Input"
        NO_CAPACITY = "NO_CAPACITY", "No Bed/Service Capacity"
        EQUIPMENT_LIMITATION = "EQUIPMENT_LIMITATION", "Equipment Limitation"
        PATIENT_REQUEST = "PATIENT_REQUEST", "Patient/Family Request"
        OTHER = "OTHER", "Other"

    class TransportMode(models.TextChoices):
        AMBULANCE = "AMBULANCE", "Ambulance"
        PRIVATE = "PRIVATE", "Private Vehicle"
        OTHER = "OTHER", "Other"

    public_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        db_index=True,
        editable=False,
        help_text="Stable UUID for transfer workflow references.",
    )
    transfer_number = models.CharField(
        max_length=30,
        unique=True,
        db_index=True,
        blank=True,
        help_text="Auto-generated transfer number (IFT-YYYYMMDD-XXXX).",
    )

    source_admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="interfacility_transfers",
        help_text="Admission being transferred out.",
    )
    source_discharge = models.OneToOneField(
        Discharge,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interfacility_transfer",
        help_text="Linked discharge event once transfer-out is finalized.",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="interfacility_transfers",
    )
    source_facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.PROTECT,
        related_name="outgoing_interfacility_transfers",
    )
    destination_facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="incoming_interfacility_transfers",
    )
    destination_admission = models.ForeignKey(
        Admission,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="destination_interfacility_transfers",
        help_text="Admission created at destination facility for this transfer workflow.",
    )
    destination_facility_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Fallback destination facility name when not mapped in-system.",
    )

    status = models.CharField(
        max_length=24,
        choices=TransferStatus.choices,
        default=TransferStatus.DRAFT,
    )
    priority = models.CharField(
        max_length=12,
        choices=TransferPriority.choices,
        default=TransferPriority.ROUTINE,
    )
    reason_code = models.CharField(
        max_length=32,
        choices=TransferReason.choices,
    )
    reason_details = models.TextField(blank=True, default="")
    clinical_summary = models.TextField(blank=True, default="")
    handover_notes = models.TextField(blank=True, default="")

    transport_mode = models.CharField(
        max_length=20,
        choices=TransportMode.choices,
        default=TransportMode.AMBULANCE,
    )
    escort_required = models.BooleanField(default=False)
    escort_name = models.CharField(max_length=255, blank=True, default="")

    requested_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="interfacility_transfer_requests",
    )
    accepted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interfacility_transfer_acceptances",
    )
    dispatched_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interfacility_transfer_dispatches",
    )
    arrived_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interfacility_transfer_arrivals",
    )
    cancelled_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interfacility_transfer_cancellations",
    )

    accepted_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    cancellation_reason = models.TextField(blank=True, default="")

    class Meta(TimeStampedModel.Meta):
        ordering = ["-created_at"]
        verbose_name = "Inter-facility Transfer"
        verbose_name_plural = "Inter-facility Transfers"
        permissions = [
            ("submit_interfacility_transfer", "Can submit inter-facility transfer"),
            ("accept_interfacility_transfer", "Can accept inter-facility transfer"),
            ("reject_interfacility_transfer", "Can reject inter-facility transfer"),
            ("dispatch_interfacility_transfer", "Can dispatch inter-facility transfer"),
            ("arrive_interfacility_transfer", "Can mark inter-facility transfer as arrived"),
            ("cancel_interfacility_transfer", "Can cancel inter-facility transfer"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["source_admission"],
                condition=models.Q(
                    status__in=[
                        "DRAFT",
                        "PENDING_ACCEPTANCE",
                        "ACCEPTED",
                        "IN_TRANSIT",
                    ]
                ),
                name="unique_open_interfacility_transfer_per_admission",
            )
        ]

    def __str__(self):
        return f"{self.transfer_number} ({self.get_status_display()})"

    VALID_TRANSITIONS = {
        TransferStatus.DRAFT: {TransferStatus.PENDING_ACCEPTANCE, TransferStatus.CANCELLED},
        TransferStatus.PENDING_ACCEPTANCE: {
            TransferStatus.ACCEPTED,
            TransferStatus.REJECTED,
            TransferStatus.CANCELLED,
        },
        TransferStatus.ACCEPTED: {TransferStatus.IN_TRANSIT, TransferStatus.CANCELLED},
        TransferStatus.REJECTED: set(),
        TransferStatus.IN_TRANSIT: {TransferStatus.ARRIVED, TransferStatus.CANCELLED},
        TransferStatus.ARRIVED: set(),
        TransferStatus.CANCELLED: set(),
    }

    def save(self, *args, **kwargs):
        if not self.transfer_number:
            self.transfer_number = self.generate_transfer_number()

        if self.source_admission_id:
            if not self.patient_id:
                self.patient = self.source_admission.patient
            if not self.source_facility_id:
                self.source_facility = self.source_admission.facility

        if self.destination_facility_id and not self.destination_facility_name:
            self.destination_facility_name = self.destination_facility.name

        super().save(*args, **kwargs)

    def clean(self):
        super().clean()

        if not self.destination_facility_id and not self.destination_facility_name:
            raise ValidationError("Destination facility or destination facility name is required.")

        if (
            self.destination_facility_id
            and self.source_facility_id
            and self.destination_facility_id == self.source_facility_id
        ):
            raise ValidationError("Destination facility must differ from source facility.")

        if self.source_discharge_id:
            if self.source_discharge.admission_id != self.source_admission_id:
                raise ValidationError("Linked discharge must belong to the source admission.")
            if self.source_discharge.discharge_type != "TRANSFERRED":
                raise ValidationError("Linked discharge must have discharge_type='TRANSFERRED'.")

    def generate_transfer_number(self) -> str:
        import re

        from django.db.models import Max

        today = timezone.now().strftime("%Y%m%d")
        prefix = f"IFT-{today}-"
        last_number = InterFacilityTransfer.objects.filter(
            transfer_number__startswith=prefix
        ).aggregate(Max("transfer_number"))["transfer_number__max"]

        if last_number:
            match = re.search(r"-(\d{4})$", last_number)
            sequence = int(match.group(1)) + 1 if match else 1
        else:
            sequence = 1

        return f"{prefix}{sequence:04d}"

    def can_transition_to(self, next_status: str) -> bool:
        return next_status in self.VALID_TRANSITIONS.get(self.status, set())

    def transition_to(self, next_status: str, *, user, reason: str = "") -> None:
        if not self.can_transition_to(next_status):
            raise ValidationError(
                f"Cannot transition inter-facility transfer from {self.status} to {next_status}."
            )

        now = timezone.now()
        update_fields = ["status", "updated_at"]

        if next_status == self.TransferStatus.PENDING_ACCEPTANCE:
            if not self.clinical_summary.strip() or not self.handover_notes.strip():
                raise ValidationError(
                    "Clinical summary and handover notes are required before submitting."
                )
            self.rejection_reason = ""
            self.cancellation_reason = ""
            update_fields.extend(["rejection_reason", "cancellation_reason"])

        elif next_status == self.TransferStatus.ACCEPTED:
            self.accepted_by = user
            self.accepted_at = now
            self.rejection_reason = ""
            update_fields.extend(["accepted_by", "accepted_at", "rejection_reason"])

        elif next_status == self.TransferStatus.REJECTED:
            if not reason.strip():
                raise ValidationError("Rejection reason is required.")
            self.rejection_reason = reason.strip()
            self.accepted_by = None
            self.accepted_at = None
            update_fields.extend(
                [
                    "rejection_reason",
                    "accepted_by",
                    "accepted_at",
                ]
            )

        elif next_status == self.TransferStatus.IN_TRANSIT:
            self.dispatched_by = user
            self.dispatched_at = now
            update_fields.extend(["dispatched_by", "dispatched_at"])

        elif next_status == self.TransferStatus.ARRIVED:
            self.arrived_by = user
            self.arrived_at = now
            update_fields.extend(["arrived_by", "arrived_at"])

        elif next_status == self.TransferStatus.CANCELLED:
            if not reason.strip():
                raise ValidationError("Cancellation reason is required.")
            self.cancelled_by = user
            self.cancelled_at = now
            self.cancellation_reason = reason.strip()
            update_fields.extend(["cancelled_by", "cancelled_at", "cancellation_reason"])

        self.status = next_status
        self.save(update_fields=update_fields)


class InterFacilityTransferEvent(TimeStampedModel):
    """Chronological timeline event for inter-facility transfer workflow."""

    class EventType(models.TextChoices):
        CREATED = "CREATED", "Created"
        SUBMITTED = "SUBMITTED", "Submitted"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        DISPATCHED = "DISPATCHED", "Dispatched"
        ARRIVED = "ARRIVED", "Arrived"
        AUTO_ADMITTED = "AUTO_ADMITTED", "Auto Admitted"
        DISCHARGE_SUMMARY_REQUESTED = (
            "DISCHARGE_SUMMARY_REQUESTED",
            "Discharge Summary Requested",
        )
        DISCHARGE_SUMMARY_SHARED = "DISCHARGE_SUMMARY_SHARED", "Discharge Summary Shared"
        CANCELLED = "CANCELLED", "Cancelled"

    transfer = models.ForeignKey(
        InterFacilityTransfer,
        on_delete=models.CASCADE,
        related_name="timeline_events",
    )
    event_type = models.CharField(max_length=40, choices=EventType.choices)
    from_status = models.CharField(max_length=24, blank=True, default="")
    to_status = models.CharField(max_length=24, blank=True, default="")
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interfacility_transfer_timeline_events",
    )
    note = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TimeStampedModel.Meta):
        ordering = ["occurred_at", "id"]
        verbose_name = "Inter-facility Transfer Event"
        verbose_name_plural = "Inter-facility Transfer Events"

    def __str__(self):
        return f"{self.transfer.transfer_number} - {self.event_type}"


class Transfer(TimeStampedModel):
    """
    Patient transfer between wards.

    Documents the transfer of a patient from one ward to another,
    with automatic bed status updates and admission tracking.

    Attributes:
        admission: Admission being transferred
        source_ward: Ward patient is transferring from
        source_bed: Bed patient is leaving
        destination_ward: Ward patient is transferring to
        destination_bed: Bed patient is moving to
        reason: Reason for transfer
        reason_details: Additional details about transfer
        transferred_by: User who processed the transfer
        transfer_date: Date and time of transfer
        clinical_handover_notes: Clinical information for receiving team
    """

    TRANSFER_REASON_CHOICES = [
        ("STEP_UP", "Step Up Care (e.g., to ICU)"),
        ("STEP_DOWN", "Step Down Care"),
        ("SPECIALTY", "Specialty Care"),
        ("BED_MANAGEMENT", "Bed Management"),
        ("PATIENT_REQUEST", "Patient Request"),
        ("OTHER", "Other"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="transfers",
        help_text="Admission being transferred",
    )

    # Source
    source_ward = models.ForeignKey(
        Ward,
        on_delete=models.PROTECT,
        related_name="transfers_out",
        help_text="Ward patient is transferring from",
    )
    source_bed = models.ForeignKey(
        Bed,
        on_delete=models.PROTECT,
        related_name="transfers_out",
        help_text="Bed patient is leaving",
    )

    # Destination
    destination_ward = models.ForeignKey(
        Ward,
        on_delete=models.PROTECT,
        related_name="transfers_in",
        help_text="Ward patient is transferring to",
    )
    destination_bed = models.ForeignKey(
        Bed,
        on_delete=models.PROTECT,
        related_name="transfers_in",
        help_text="Bed patient is moving to",
    )

    # Details
    reason = models.CharField(
        max_length=20,
        choices=TRANSFER_REASON_CHOICES,
        help_text="Reason for transfer",
    )
    reason_details = models.TextField(
        blank=True,
        default="",
        help_text="Additional details about transfer reason",
    )
    transferred_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="transfers_processed",
        help_text="User who processed the transfer",
    )
    transfer_date = models.DateTimeField(
        help_text="Date and time of transfer",
    )

    # Handover
    clinical_handover_notes = models.TextField(
        help_text="Clinical information for receiving team",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Transfer model."""

        ordering = ["-transfer_date"]
        verbose_name = "Transfer"
        verbose_name_plural = "Transfers"

    def __str__(self):
        """Return string representation."""
        return f"Transfer: {self.admission.admission_number} - {self.source_ward.name} → {self.destination_ward.name}"

    def save(self, *args, **kwargs):
        """Override save to update bed and admission status."""
        # Call parent save first
        super().save(*args, **kwargs)

        # Move source bed into housekeeping turnover workflow
        if self.source_bed.status == "OCCUPIED":
            self.source_bed.mark_cleaning(
                self.transferred_by,
                reason=(
                    f"Patient transferred to {self.destination_ward.code} on "
                    f"{self.transfer_date.isoformat()} - awaiting housekeeping"
                ),
            )

        # Update destination bed status to OCCUPIED
        if self.destination_bed.status == "AVAILABLE":
            self.destination_bed.status = "OCCUPIED"
            self.destination_bed.status_changed_by = self.transferred_by
            self.destination_bed.save()

        # Update admission's current ward and bed
        self.admission.ward = self.destination_ward
        self.admission.bed = self.destination_bed
        self.admission.save()

    def clean(self):
        """Validate transfer data."""
        from django.core.exceptions import ValidationError

        # Prevent transfer within same ward
        if self.source_ward == self.destination_ward:
            raise ValidationError("Cannot transfer patient within the same ward")

        # Validate destination bed is available
        if self.destination_bed.status != "AVAILABLE":
            raise ValidationError("Destination bed must be available")

        # Validate transfer date is not before admission date
        if self.transfer_date < self.admission.admission_date:
            raise ValidationError("Transfer date cannot be before admission date")


class WardRound(TimeStampedModel):
    """Daily ward round documentation using SOAP notes format."""

    CONDITION_STATUS_CHOICES = [
        ("STABLE", "Stable"),
        ("IMPROVING", "Improving"),
        ("DETERIORATING", "Deteriorating"),
        ("CRITICAL", "Critical"),
    ]

    REVIEW_TYPE_CHOICES = [
        ("WARD_ROUND", "Scheduled Ward Round"),
        ("URGENT_REVIEW", "Urgent Review"),
        ("CONSULTANT_REVIEW", "Consultant Review"),
        ("TRANSFER_REVIEW", "Transfer Assessment"),
        ("PRE_DISCHARGE", "Pre-Discharge Assessment"),
    ]

    admission = models.ForeignKey(Admission, on_delete=models.CASCADE, related_name="ward_rounds")
    round_date = models.DateField()
    round_time = models.TimeField()
    conducted_by = models.ForeignKey(User, on_delete=models.PROTECT)

    # Review type - differentiates scheduled rounds from urgent/consultant reviews
    review_type = models.CharField(
        max_length=20,
        choices=REVIEW_TYPE_CHOICES,
        default="WARD_ROUND",
        help_text="Type of review being conducted",
    )

    # Link to review request (if this fulfills a pending request)
    review_request = models.ForeignKey(
        "ReviewRequest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ward_rounds",
        help_text="Review request this ward round fulfills (if applicable)",
    )

    # SOAP notes
    subjective = models.TextField(help_text="Patient complaints, symptoms")
    objective = models.TextField(help_text="Examination findings, vitals, observations")
    assessment = models.TextField(help_text="Clinical assessment, diagnosis updates")
    plan = models.TextField(help_text="Treatment plan, orders, next steps")

    # Structured bedside observations
    temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("30.0"))],
        help_text="Temperature in °C",
    )
    pulse = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Pulse rate in BPM",
    )
    blood_pressure = models.CharField(
        max_length=20,
        blank=True,
        help_text="Blood pressure (e.g., '120/80')",
    )
    respiratory_rate = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Respiratory rate in breaths/min",
    )
    spo2 = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.0"))],
        help_text="Oxygen saturation percentage",
    )

    # ICU / SOFA bedside context
    gcs_total = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(3), MaxValueValidator(15)],
        help_text="Glasgow Coma Scale total score (3-15)",
    )
    on_vasopressors = models.BooleanField(
        null=True,
        blank=True,
        help_text="Whether patient is currently on vasopressor support",
    )
    vasopressor_dose_mcg_kg_min = models.DecimalField(
        max_digits=6,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.000"))],
        help_text="Current vasopressor dose in mcg/kg/min where known",
    )
    on_mechanical_ventilation = models.BooleanField(
        null=True,
        blank=True,
        help_text="Whether patient is currently mechanically ventilated",
    )
    urine_output_ml_24h = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Estimated or measured total urine output in the last 24 hours (mL)",
    )

    maternity_continuity_action = models.CharField(
        max_length=40,
        choices=MATERNITY_CONTINUITY_ACTION_CHOICES,
        default="NONE",
        help_text="Planned postpartum continuity step captured during ward review",
    )
    maternity_continuity_notes = models.TextField(
        blank=True,
        default="",
        help_text="Postpartum continuity notes for the next nursing or discharge workflow step",
    )

    # Patient condition tracking
    condition_status = models.CharField(max_length=20, choices=CONDITION_STATUS_CHOICES)

    # Consultant review flags
    requires_consultant_review = models.BooleanField(default=False)
    consultant_specialty = models.CharField(max_length=100, blank=True)

    class Meta(TimeStampedModel.Meta):
        ordering = ["-round_date", "-round_time"]
        verbose_name = "Ward Round"
        verbose_name_plural = "Ward Rounds"

    def __str__(self):
        return f"Ward Round - {self.admission.patient} on {self.round_date}"

    def clean(self):
        """Validate ward round data."""
        super().clean()

        # Validate round date is not in the future
        from datetime import date

        if self.round_date and self.round_date > date.today():
            raise ValidationError({"round_date": "Round date cannot be in the future"})


class ReviewRequest(TimeStampedModel):
    """
    Request for patient review (urgent, consultant, or scheduled).

    Tracks pending review requests that need attention. When fulfilled,
    links to the WardRound that addresses the request.
    """

    URGENCY_CHOICES = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent"),
        ("STAT", "STAT (Immediate)"),
    ]

    REVIEW_TYPE_CHOICES = [
        ("URGENT_REVIEW", "Urgent Review"),
        ("CONSULTANT_REVIEW", "Consultant Review"),
        ("TRANSFER_REVIEW", "Transfer Assessment"),
        ("PRE_DISCHARGE", "Pre-Discharge Assessment"),
    ]

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="review_requests",
        help_text="Admission requiring review",
    )
    review_type = models.CharField(
        max_length=20,
        choices=REVIEW_TYPE_CHOICES,
        help_text="Type of review requested",
    )
    urgency = models.CharField(
        max_length=20,
        choices=URGENCY_CHOICES,
        default="ROUTINE",
        help_text="Urgency level of the review",
    )
    reason = models.TextField(
        help_text="Clinical reason for review request",
    )
    requested_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="review_requests_made",
        help_text="User who requested the review",
    )
    requested_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the review was requested",
    )

    # For consultant reviews
    consultant_specialty = models.CharField(
        max_length=100,
        blank=True,
        help_text="Specialty required (for consultant reviews)",
    )
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="review_requests_assigned",
        help_text="Clinician assigned to handle this review",
    )

    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
        help_text="Current status of the review request",
    )
    acknowledged_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the request was acknowledged",
    )
    acknowledged_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="review_requests_acknowledged",
        help_text="User who acknowledged the request",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the review was completed",
    )

    # Notes
    clinical_context = models.TextField(
        blank=True,
        help_text="Additional clinical context (e.g., latest vitals, observations)",
    )
    cancellation_reason = models.TextField(
        blank=True,
        help_text="Reason for cancellation (if cancelled)",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-requested_at"]
        verbose_name = "Review Request"
        verbose_name_plural = "Review Requests"

    def __str__(self):
        return f"{self.get_review_type_display()} - {self.admission.patient} ({self.status})"

    def acknowledge(self, user: AbstractUser) -> None:
        """Mark the review request as acknowledged/in progress."""
        self.status = "IN_PROGRESS"
        self.acknowledged_at = timezone.now()
        self.acknowledged_by = user
        if not self.assigned_to:
            self.assigned_to = user
        self.save()

    def complete(self) -> None:
        """Mark the review request as completed."""
        self.status = "COMPLETED"
        self.completed_at = timezone.now()
        self.save()

    def cancel(self, reason: str) -> None:
        """Cancel the review request with a reason."""
        self.status = "CANCELLED"
        self.cancellation_reason = reason
        self.save()

    @property
    def is_overdue(self) -> bool:
        """Check if request is overdue based on urgency."""
        if self.status != "PENDING":
            return False

        now = timezone.now()
        time_since_request = now - self.requested_at

        # STAT: overdue if pending > 30 minutes
        if self.urgency == "STAT":
            return time_since_request > timedelta(minutes=30)
        # URGENT: overdue if pending > 2 hours
        elif self.urgency == "URGENT":
            return time_since_request > timedelta(hours=2)
        # ROUTINE: overdue if pending > 24 hours
        else:
            return time_since_request > timedelta(hours=24)
