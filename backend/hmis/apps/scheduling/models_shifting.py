# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Scheduling models shifting for Vitora HMIS.

What this file is for:
- Implement models shifting logic for the scheduling domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from datetime import datetime, timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

# =============================================================================
# Resource Model - Schedulable Resources
# =============================================================================
from hmis.apps.scheduling.models_assignment import *  # noqa: F403
from hmis.apps.scheduling.models_resource_schedule import *  # noqa: F403
from hmis.apps.scheduling.models_resource_schedule import Resource


class Shift(FacilityScopedModel, TimeStampedModel):
    """
    Represents a work shift assigned to a staff member.

    Shifts define when a staff member is on duty. They link a staff Resource
    to a specific date and time range, optionally associated with a department.

    Status Flow:
        SCHEDULED -> ACTIVE -> COMPLETED
                   |
                   v
                CANCELLED

    Attributes:
        staff_resource: The PERSON-type resource assigned to this shift
        shift_date: The date of the shift
        start_time: Shift start time
        end_time: Shift end time
        shift_type: Category of shift (DAY, NIGHT, ON_CALL, etc.)
        status: Current status of the shift
        department: Optional department assignment
        notes: Additional notes
    """

    SHIFT_TYPE_CHOICES = [
        ("DAY", "Day Shift"),
        ("NIGHT", "Night Shift"),
        ("MORNING", "Morning Shift"),
        ("AFTERNOON", "Afternoon Shift"),
        ("ON_CALL", "On-Call"),
        ("OVERTIME", "Overtime"),
        ("DAY_OFF", "Day Off"),
        ("NIGHT_OFF", "Night Off"),
        ("OFF", "Off (Full Day)"),
        ("AFTERNOON_OFF", "Afternoon Off"),
        ("LEAVE", "Leave"),
        ("SICK_LEAVE", "Sick Leave"),
        ("REST", "Rest Day"),
    ]

    STATUS_CHOICES = [
        ("SCHEDULED", "Scheduled"),
        ("ACTIVE", "Active"),
        ("ON_BREAK", "On Break"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("ABSENT", "Absent"),
    ]

    CLOCK_METHOD_CHOICES = [
        ("MANUAL", "Manual"),
        ("QR_CODE", "QR Code"),
    ]

    VALID_TRANSITIONS = {
        "SCHEDULED": ["ACTIVE", "CANCELLED", "ABSENT"],
        "ACTIVE": ["ON_BREAK", "COMPLETED"],
        "ON_BREAK": ["ACTIVE", "COMPLETED"],
        "COMPLETED": [],
        "CANCELLED": [],
        "ABSENT": [],
    }

    staff_resource = models.ForeignKey(
        Resource,
        on_delete=models.PROTECT,
        related_name="shifts",
        limit_choices_to={"resource_type": "PERSON"},
        help_text="Staff member assigned to this shift",
    )
    shift_date = models.DateField(
        db_index=True,
        help_text="Date of the shift",
    )
    start_time = models.TimeField(
        help_text="Shift start time",
    )
    end_time = models.TimeField(
        help_text="Shift end time",
    )
    shift_type = models.CharField(
        max_length=30,
        choices=SHIFT_TYPE_CHOICES,
        default="DAY",
        db_index=True,
        help_text="Type of shift",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="SCHEDULED",
        db_index=True,
        help_text="Current shift status",
    )
    department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shifts",
        db_index=True,
        help_text="Department for this shift",
    )
    department_legacy = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Legacy text department (migrating to FK). Do not use for new code.",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes about this shift",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_shifts",
        help_text="User who created the shift",
    )
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Actual shift start timestamp",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Actual shift end timestamp",
    )
    break_started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when current break started",
    )
    total_break_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Cumulative break minutes across all breaks in this shift",
    )
    clock_in_method = models.CharField(
        max_length=20,
        choices=CLOCK_METHOD_CHOICES,
        default="MANUAL",
        blank=True,
        help_text="Method used to clock in (MANUAL, QR_CODE)",
    )
    auto_clocked_out = models.BooleanField(
        default=False,
        help_text="True if system auto-closed this shift due to overtime/no-activity",
    )
    room = models.ForeignKey(
        "scheduling.Resource",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="room_shifts",
        limit_choices_to={"resource_type": "PLACE"},
        help_text="Room/location where this shift is being served",
    )
    clinic = models.ForeignKey(
        "clinics.Clinic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shifts",
        help_text="Clinic associated with this shift (set at clock-in)",
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_shifts",
        help_text="User who cancelled the shift",
    )
    cancellation_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for cancellation",
    )
    is_emergency = models.BooleanField(
        default=False,
        help_text="True if this shift was created via emergency clock-in (ad-hoc)",
    )
    emergency_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason provided for emergency clock-in",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Shift model."""

        ordering = ["shift_date", "start_time"]
        verbose_name = "Shift"
        verbose_name_plural = "Shifts"
        permissions = [
            ("manage_schedules", "Can manage schedules"),
        ]
        indexes = [
            models.Index(fields=["shift_date", "status"]),
            models.Index(fields=["staff_resource", "shift_date"]),
        ]

    def __str__(self) -> str:
        """Return string representation."""
        return (
            f"{self.staff_resource.name} - {self.shift_date} "
            f"{self.start_time}-{self.end_time} ({self.get_shift_type_display()})"
        )

    def clean(self) -> None:
        """Validate shift data."""
        super().clean()
        errors = {}

        if self.end_time and self.start_time and self.end_time <= self.start_time:
            # Allow overnight shifts via 24h logic if needed later
            errors["end_time"] = "End time must be after start time"

        if self.staff_resource_id:
            try:
                resource = Resource.objects.get(pk=self.staff_resource_id)
                if resource.resource_type != "PERSON":
                    errors["staff_resource"] = "Only PERSON-type resources can be assigned shifts"
            except Resource.DoesNotExist:
                pass

        if errors:
            raise ValidationError(errors)

    def _transition_to(self, new_status: str) -> None:
        """Validate and perform status transition."""
        valid_next = self.VALID_TRANSITIONS.get(self.status, [])
        if new_status not in valid_next:
            raise ValueError(
                f"Cannot transition from {self.status} to {new_status}. "
                f"Valid transitions: {valid_next}"
            )
        self.status = new_status

    def start_shift(self, room=None, clinic=None, method="MANUAL") -> None:
        """Mark shift as active (clock in).

        Args:
            room: Optional PLACE Resource for the room/location.
            clinic: Optional Clinic the clinician is serving in.
            method: Clock-in method (MANUAL, QR_CODE).
        """
        self._transition_to("ACTIVE")
        self.started_at = timezone.now()
        self.clock_in_method = method
        update_fields = ["status", "started_at", "clock_in_method", "updated_at"]
        if room is not None:
            self.room = room
            update_fields.append("room")
        if clinic is not None:
            self.clinic = clinic
            update_fields.append("clinic")
        self.save(update_fields=update_fields)

    def take_break(self) -> None:
        """Mark shift as on break."""
        self._transition_to("ON_BREAK")
        self.break_started_at = timezone.now()
        self.save()

    def resume_shift(self) -> None:
        """Resume shift from break. Accumulates break duration."""
        if self.break_started_at:
            delta = timezone.now() - self.break_started_at
            self.total_break_minutes += max(0, int(delta.total_seconds() / 60))
        self._transition_to("ACTIVE")
        self.break_started_at = None
        self.save()

    def complete_shift(self) -> None:
        """Mark shift as completed (clock out).

        If on break, accumulates remaining break duration before completing.
        """
        if self.break_started_at:
            delta = timezone.now() - self.break_started_at
            self.total_break_minutes += max(0, int(delta.total_seconds() / 60))
            self.break_started_at = None
        self._transition_to("COMPLETED")
        self.completed_at = timezone.now()
        self.save()

    def mark_absent(self) -> None:
        """Mark shift as absent (no clock-in detected)."""
        self._transition_to("ABSENT")
        self.save()

    def auto_complete(self) -> None:
        """System auto-clock-out for stale shifts."""
        if self.break_started_at:
            delta = timezone.now() - self.break_started_at
            self.total_break_minutes += max(0, int(delta.total_seconds() / 60))
            self.break_started_at = None
        self._transition_to("COMPLETED")
        self.completed_at = timezone.now()
        self.auto_clocked_out = True
        self.save()

    @property
    def late_minutes(self) -> int:
        """Minutes late for clock-in. 0 if on-time or not started."""
        if not self.started_at:
            return 0
        scheduled_start = (
            timezone.make_aware(datetime.combine(self.shift_date, self.start_time))
            if timezone.is_naive(datetime.combine(self.shift_date, self.start_time))
            else datetime.combine(self.shift_date, self.start_time)
        )
        diff = (self.started_at - scheduled_start).total_seconds() / 60
        return max(0, int(diff))

    @property
    def overtime_minutes(self) -> int:
        """Minutes of overtime beyond scheduled duration. 0 if under."""
        if not self.started_at or not self.completed_at:
            return 0
        actual_minutes = (self.completed_at - self.started_at).total_seconds() / 60
        actual_minutes -= self.total_break_minutes  # subtract breaks
        scheduled_minutes = self.duration_hours * 60
        return max(0, int(actual_minutes - scheduled_minutes))

    @property
    def is_early_departure(self) -> bool:
        """True if clocked out more than 30 min before shift end."""
        if not self.completed_at or self.auto_clocked_out:
            return False
        shift_end_naive = datetime.combine(self.shift_date, self.end_time)
        if self.end_time <= self.start_time:  # overnight
            shift_end_naive += timedelta(days=1)
        shift_end_dt = (
            timezone.make_aware(shift_end_naive)
            if timezone.is_naive(shift_end_naive)
            else shift_end_naive
        )
        diff = (shift_end_dt - self.completed_at).total_seconds() / 60
        return diff > 30

    def cancel(self, user, reason: str = "") -> None:
        """Cancel the shift."""
        self._transition_to("CANCELLED")
        self.cancelled_by = user
        self.cancellation_reason = reason
        self.save()

    @property
    def duration_hours(self) -> float:
        """Calculate scheduled shift duration in hours."""
        if not self.start_time or not self.end_time:
            return 0.0
        start_dt = datetime.combine(self.shift_date, self.start_time)
        end_dt = datetime.combine(self.shift_date, self.end_time)
        if self.end_time <= self.start_time:  # overnight shift
            end_dt += timedelta(days=1)
        delta = end_dt - start_dt
        return round(delta.total_seconds() / 3600, 1)

    @property
    def actual_hours(self) -> float | None:
        """Actual hours worked (started_at to completed_at minus breaks)."""
        if not self.started_at or not self.completed_at:
            return None
        total = (self.completed_at - self.started_at).total_seconds() / 3600
        total -= self.total_break_minutes / 60
        return round(max(0, total), 2)


# =============================================================================
# Phase 3b: Scheduling Settings & Staff Constraints
# =============================================================================


class SchedulingSettings(FacilityScopedModel, TimeStampedModel):
    """
    Per-facility scheduling configuration for the duty roster.

    Stores global scheduling rules such as maximum hours, minimum rest,
    and default shift patterns. Only one row per facility (enforced by
    unique_together on facility from FacilityScopedModel).
    """

    max_hours_per_week = models.PositiveIntegerField(
        default=48,
        help_text="Maximum scheduled hours per staff member per week",
    )
    max_consecutive_days = models.PositiveIntegerField(
        default=6,
        help_text="Maximum consecutive working days before a mandatory rest day",
    )
    min_rest_hours = models.PositiveIntegerField(
        default=11,
        help_text="Minimum rest hours between shifts",
    )
    max_night_shifts_per_week = models.PositiveIntegerField(
        default=4,
        help_text="Maximum night shifts per staff per week",
    )
    max_day_hours = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        default=12.0,
        help_text="Maximum hours per day shift",
    )
    max_night_hours = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        default=12.0,
        help_text="Maximum hours per night shift",
    )
    default_shift_pattern = models.JSONField(
        default=list,
        blank=True,
        help_text="Default weekly shift pattern for auto-fill, e.g. ['DAY','DAY','NIGHT','NIGHT','OFF','OFF','REST']",
    )
    active_shift_types = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Working shift types this facility uses for auto-fill coverage, "
            "e.g. ['MORNING','AFTERNOON','NIGHT']. "
            "When set, auto-fill distributes staff across ALL listed types each day."
        ),
    )
    overtime_threshold_hours = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        default=40.0,
        help_text="Weekly hours threshold after which shifts count as overtime",
    )
    require_swap_approval = models.BooleanField(
        default=True,
        help_text="When True, shift swaps require manager approval after peer acceptance. "
        "When False, accepted swaps are completed automatically.",
    )
    enforce_constraints = models.BooleanField(
        default=True,
        help_text="When True, the roster grid warns on constraint violations",
    )
    enforce_punctuality = models.BooleanField(
        default=False,
        help_text="When True, clock-in is blocked if staff is more than late_cutoff_minutes late",
    )
    late_cutoff_minutes = models.PositiveIntegerField(
        default=30,
        help_text="Minutes after shift start after which clock-in is blocked (0 = no limit)",
    )
    AUTOFILL_MODE_CHOICES = [
        ("MIN_COVERAGE", "Minimum Coverage"),
        ("BALANCED_UTILIZATION", "Balanced Utilization"),
    ]
    autofill_mode = models.CharField(
        max_length=32,
        choices=AUTOFILL_MODE_CHOICES,
        default="BALANCED_UTILIZATION",
        help_text=(
            "Autofill strategy mode. MIN_COVERAGE fills only required coverage slots. "
            "BALANCED_UTILIZATION also adds assignments to reach target days per staff."
        ),
    )
    autofill_target_days_per_staff = models.PositiveIntegerField(
        default=4,
        help_text=(
            "Target scheduled working days per staff per week when autofill mode is "
            "BALANCED_UTILIZATION."
        ),
    )
    autofill_min_staff_per_shift = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Per-shift minimum staffing coverage targets for autofill, e.g. "
            '{"DAY": 3, "NIGHT": 2}. Missing keys default to 1.'
        ),
    )
    autofill_group_minimums = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Group-specific minimum staffing rules for autofill, e.g. "
            '[{"scope": "DEPARTMENT", "value": "Nursing", "min_staff": 2, "shift_types": ["DAY", "NIGHT"]}].'
        ),
    )
    autofill_group_maximums = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Group-specific maximum staffing rules for autofill, e.g. "
            '[{"scope": "ROLE", "value": "Nurse", "max_staff": 3, "shift_types": ["NIGHT"]}].'
        ),
    )
    autofill_weights = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Per-facility scoring weights for weekly roster autofill, e.g. "
            '{"weekly_load": 30, "history_hours": 4, "night_penalty": 16}. '
            "Missing keys fall back to system defaults."
        ),
    )
    autofill_run_history = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Recent autofill run reports for this facility. "
            "Stored as an append-only list (latest first) for review/compare in UI."
        ),
    )

    class Meta(TimeStampedModel.Meta):
        verbose_name = "Scheduling Settings"
        verbose_name_plural = "Scheduling Settings"
        constraints = [
            models.UniqueConstraint(
                fields=["facility"],
                name="unique_scheduling_settings_per_facility",
            ),
        ]

    def __str__(self) -> str:
        fac = getattr(self, "facility", None)
        return f"Scheduling Settings ({fac})" if fac else "Scheduling Settings"


class ShiftTypeConfig(FacilityScopedModel, TimeStampedModel):
    """
    Per-facility configuration for shift type start/end times.

    Each facility can define custom times for each shift type they use.
    For example, Facility A may run DAY shifts from 07:00–19:00 while
    Facility B runs them from 08:00–16:00.

    When creating shifts, the system looks up the configured times for
    the facility + shift_type combination to pre-populate start/end times.
    """

    shift_type = models.CharField(
        max_length=30,
        choices=Shift.SHIFT_TYPE_CHOICES,
        help_text="The shift type this configuration applies to",
    )
    label = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Optional custom display label (e.g. 'Early Morning' instead of 'Morning Shift')",
    )
    start_time = models.TimeField(
        help_text="Default start time for this shift type at this facility",
    )
    end_time = models.TimeField(
        help_text="Default end time for this shift type at this facility",
    )
    color = models.CharField(
        max_length=7,
        blank=True,
        default="",
        help_text="Optional hex color code for roster display (e.g. '#4CAF50')",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this shift type is currently in use at this facility",
    )

    class Meta(TimeStampedModel.Meta):
        verbose_name = "Shift Type Configuration"
        verbose_name_plural = "Shift Type Configurations"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "shift_type"],
                name="unique_shift_type_per_facility",
            ),
        ]
        ordering = ["shift_type"]

    def __str__(self) -> str:
        label = self.label or self.get_shift_type_display()
        return f"{label} ({self.start_time:%H:%M}–{self.end_time:%H:%M})"

    @property
    def display_label(self) -> str:
        """Return custom label if set, otherwise the shift type display name."""
        return self.label or self.get_shift_type_display()


class StaffConstraint(FacilityScopedModel, TimeStampedModel):
    """
    Per-staff scheduling constraints / restrictions.

    Allows admins to configure individual staff rules, e.g. "cannot work
    night shifts", "max 36 hours/week", "preferred shift types".
    """

    CONSTRAINT_CHOICES = [
        ("NO_NIGHTS", "Cannot work night shifts"),
        ("NO_WEEKENDS", "Cannot work weekends"),
        ("MAX_HOURS", "Custom max hours per week"),
        ("MAX_CONSECUTIVE", "Custom max consecutive days"),
        ("PREFERRED_SHIFTS", "Preferred shift types only"),
        ("NO_OVERTIME", "No overtime shifts"),
        ("LIGHT_DUTY", "Light duty — day shifts only"),
        ("NO_SHARED_SHIFT_WITH", "Cannot share shift with specific staff"),
    ]

    staff_resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name="scheduling_constraints",
        limit_choices_to={"resource_type": "PERSON"},
        help_text="Staff member this constraint applies to",
    )
    constraint_type = models.CharField(
        max_length=30,
        choices=CONSTRAINT_CHOICES,
        help_text="Type of scheduling constraint",
    )
    value = models.JSONField(
        default=dict,
        blank=True,
        help_text='Configuration value, e.g. {"max_hours": 36} or {"shift_types": ["DAY", "MORNING"]}',
    )
    reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for this constraint (e.g. medical, personal request)",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether this constraint is currently enforced",
    )
    effective_from = models.DateField(
        null=True,
        blank=True,
        help_text="Date from which this constraint is effective",
    )
    effective_until = models.DateField(
        null=True,
        blank=True,
        help_text="Date until which this constraint is effective (null = indefinite)",
    )

    class Meta(TimeStampedModel.Meta):
        verbose_name = "Staff Constraint"
        verbose_name_plural = "Staff Constraints"
        ordering = ["staff_resource__name", "constraint_type"]

    def __str__(self) -> str:
        return f"{self.staff_resource.name} — {self.get_constraint_type_display()}"


# =============================================================================
# Phase 4: Shift Swap Requests
# =============================================================================


class ShiftSwapRequest(FacilityScopedModel, TimeStampedModel):
    """
    A request by a staff member to swap one of their shifts with another.

    Supports both **directed swaps** (targeting a specific shift/staff member)
    and **open swaps** (any eligible colleague can accept). Partial swaps are
    allowed: the requester may offer only a portion of their shift.

    Status Flow:
        PENDING  → ACCEPTED → APPROVED → COMPLETED
           │          │          │
           ▼          ▼          ▼
        CANCELLED  REJECTED   REJECTED
           │
           ▼
        EXPIRED

    When ``require_swap_approval`` is False on SchedulingSettings, the APPROVED
    step is skipped and an accepted swap moves straight to COMPLETED.
    """

    class SwapStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        APPROVED = "APPROVED", "Approved"
        COMPLETED = "COMPLETED", "Completed"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"

    VALID_TRANSITIONS = {
        "PENDING": ["ACCEPTED", "CANCELLED", "EXPIRED", "REJECTED"],
        "ACCEPTED": ["APPROVED", "COMPLETED", "REJECTED"],
        "APPROVED": ["COMPLETED", "REJECTED"],
        "COMPLETED": [],
        "REJECTED": [],
        "CANCELLED": [],
        "EXPIRED": [],
    }

    # --- Core relationships ---------------------------------------------------

    requesting_shift = models.ForeignKey(
        Shift,
        on_delete=models.PROTECT,
        related_name="swap_requests_as_requester",
        help_text="The shift the requester wants to give up (or partially give up)",
    )
    target_shift = models.ForeignKey(
        Shift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="swap_requests_as_target",
        help_text="Specific shift to swap with (null = open request)",
    )
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="shift_swap_requests_created",
        help_text="Staff member initiating the swap",
    )
    target_staff = models.ForeignKey(
        Resource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shift_swap_requests_targeted",
        limit_choices_to={"resource_type": "PERSON"},
        help_text="Specific staff member targeted (null = open to anyone)",
    )

    # --- Partial swap fields --------------------------------------------------

    is_partial = models.BooleanField(
        default=False,
        help_text="True if swapping only a portion of the shift",
    )
    partial_start_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Start time of the partial segment being swapped",
    )
    partial_end_time = models.TimeField(
        null=True,
        blank=True,
        help_text="End time of the partial segment being swapped",
    )

    # --- Status & lifecycle ---------------------------------------------------

    status = models.CharField(
        max_length=20,
        choices=SwapStatus.choices,
        default=SwapStatus.PENDING,
        db_index=True,
    )
    reason = models.TextField(
        blank=True,
        default="",
        help_text="Why the swap is needed",
    )
    rejection_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for rejection (by peer or manager)",
    )

    # --- Acceptance -----------------------------------------------------------

    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shift_swap_requests_accepted",
        help_text="User who accepted the swap (target peer)",
    )
    accepted_shift = models.ForeignKey(
        Shift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="swap_accepted_as_offer",
        help_text="The shift offered by the acceptor in exchange (for open swaps)",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)

    # --- Manager review -------------------------------------------------------

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shift_swap_requests_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # --- Expiry ---------------------------------------------------------------

    expires_at = models.DateTimeField(
        help_text="Auto-expire if no response by this time",
    )

    class Meta(TimeStampedModel.Meta):
        verbose_name = "Shift Swap Request"
        verbose_name_plural = "Shift Swap Requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "expires_at"]),
            models.Index(fields=["requesting_shift", "status"]),
        ]
        permissions = [
            ("approve_swap", "Can approve shift swap requests"),
        ]

    def __str__(self) -> str:
        target = self.target_staff.name if self.target_staff else "open"
        return (
            f"Swap #{self.pk}: {self.requesting_shift.staff_resource.name} "
            f"({self.requesting_shift.shift_date}) → {target} [{self.status}]"
        )

    # --- State machine --------------------------------------------------------

    def _transition_to(self, new_status: str) -> None:
        valid_next = self.VALID_TRANSITIONS.get(self.status, [])
        if new_status not in valid_next:
            raise ValueError(
                f"Cannot transition from {self.status} to {new_status}. "
                f"Valid transitions: {valid_next}"
            )
        self.status = new_status

    def accept(self, user, offered_shift=None) -> None:
        """Peer accepts the swap request.

        If the facility's ``require_swap_approval`` is False, the swap
        is completed immediately.
        """
        self._transition_to(self.SwapStatus.ACCEPTED)
        self.accepted_by = user
        self.accepted_at = timezone.now()
        if offered_shift:
            self.accepted_shift = offered_shift

        # Check if auto-approval is enabled
        settings_obj = SchedulingSettings.objects.filter(facility=self.facility).first()
        if settings_obj and not settings_obj.require_swap_approval:
            self.status = self.SwapStatus.COMPLETED
            self.reviewed_at = timezone.now()
            self._execute_swap()

        self.save()

    def approve(self, user, _notes: str = "") -> None:
        """Manager approves the swap."""
        self._transition_to(self.SwapStatus.APPROVED)
        self.reviewed_by = user
        self.reviewed_at = timezone.now()
        self.save()
        # Execute the actual swap
        self._execute_swap()
        self._transition_to(self.SwapStatus.COMPLETED)
        self.save()

    def reject(self, user, reason: str = "") -> None:
        """Peer or manager rejects the swap."""
        self._transition_to(self.SwapStatus.REJECTED)
        self.rejection_reason = reason
        self.reviewed_by = user
        self.reviewed_at = timezone.now()
        self.save()

    def cancel(self) -> None:
        """Requester cancels their own swap request."""
        self._transition_to(self.SwapStatus.CANCELLED)
        self.save()

    def expire(self) -> None:
        """System expires an unanswered request."""
        self._transition_to(self.SwapStatus.EXPIRED)
        self.save()

    # --- Swap execution -------------------------------------------------------

    def _execute_swap(self) -> None:
        """Physically swap the staff assignments on the underlying Shift records.

        For partial swaps, the original shift is split: a new Shift is created
        for the swapped segment and reassigned to the acceptor's resource.
        """
        requester_shift = self.requesting_shift
        acceptor_shift = self.accepted_shift or self.target_shift

        if self.is_partial:
            self._execute_partial_swap(requester_shift, acceptor_shift)
        else:
            self._execute_full_swap(requester_shift, acceptor_shift)

    def _execute_full_swap(self, shift_a, shift_b) -> None:
        """Swap staff_resource between two shifts."""
        if shift_b:
            # Two-way swap: exchange staff assignments
            shift_a.staff_resource, shift_b.staff_resource = (
                shift_b.staff_resource,
                shift_a.staff_resource,
            )
            shift_b.save(update_fields=["staff_resource", "updated_at"])
        else:
            # One-way (open swap accepted): reassign to acceptor's resource
            acceptor_resource = self._resolve_acceptor_resource()
            if acceptor_resource:
                shift_a.staff_resource = acceptor_resource
        shift_a.save(update_fields=["staff_resource", "updated_at"])

    def _execute_partial_swap(self, requester_shift, acceptor_shift) -> None:
        """Split the requester's shift and reassign the partial segment.

        Creates a new Shift for the swapped portion and adjusts the original
        shift's times to cover the remaining portion.
        """
        acceptor_resource = (
            acceptor_shift.staff_resource if acceptor_shift else self._resolve_acceptor_resource()
        )
        if not acceptor_resource:
            return

        original_start = requester_shift.start_time
        original_end = requester_shift.end_time

        # Create the swapped segment as a new shift assigned to acceptor
        Shift.objects.create(
            staff_resource=acceptor_resource,
            shift_date=requester_shift.shift_date,
            start_time=self.partial_start_time,
            end_time=self.partial_end_time,
            shift_type=requester_shift.shift_type,
            status="SCHEDULED",
            department=requester_shift.department,
            facility=requester_shift.facility,
            organization=requester_shift.organization,
            notes=f"Partial swap from {requester_shift.staff_resource.name} (swap #{self.pk})",
        )

        # Adjust the original shift to cover the remaining portion(s)
        if self.partial_start_time == original_start:
            # Swapped the beginning → shift now starts at partial_end_time
            requester_shift.start_time = self.partial_end_time
            requester_shift.save(update_fields=["start_time", "updated_at"])
        elif self.partial_end_time == original_end:
            # Swapped the end → shift now ends at partial_start_time
            requester_shift.end_time = self.partial_start_time
            requester_shift.save(update_fields=["end_time", "updated_at"])
        else:
            # Swapped the middle → split into two remaining segments
            requester_shift.end_time = self.partial_start_time
            requester_shift.save(update_fields=["end_time", "updated_at"])
            Shift.objects.create(
                staff_resource=requester_shift.staff_resource,
                shift_date=requester_shift.shift_date,
                start_time=self.partial_end_time,
                end_time=original_end,
                shift_type=requester_shift.shift_type,
                status="SCHEDULED",
                department=requester_shift.department,
                facility=requester_shift.facility,
                organization=requester_shift.organization,
                notes=f"Remainder after partial swap #{self.pk}",
            )

    def _resolve_acceptor_resource(self):
        """Resolve the PERSON resource for the user who accepted."""
        if not self.accepted_by:
            return None
        staff_profile = getattr(self.accepted_by, "staff_profile", None)
        if not staff_profile:
            return None
        return Resource.objects.filter(
            staff_profile=staff_profile,
            resource_type="PERSON",
            facility=self.facility,
        ).first()

    # --- Validation helpers ---------------------------------------------------

    def check_constraints(self) -> list[str]:
        """Check if the swap violates any scheduling constraints for either party.

        Returns a list of warning messages (empty = no violations).
        """
        warnings: list[str] = []
        settings_obj = SchedulingSettings.objects.filter(facility=self.facility).first()
        if not settings_obj or not settings_obj.enforce_constraints:
            return warnings

        acceptor_shift = self.accepted_shift or self.target_shift
        if not acceptor_shift:
            return warnings

        # Check requester taking acceptor's shift
        warnings.extend(
            self._check_staff_constraints(
                self.requesting_shift.staff_resource,
                acceptor_shift,
                settings_obj,
            )
        )
        # Check acceptor taking requester's shift
        warnings.extend(
            self._check_staff_constraints(
                acceptor_shift.staff_resource,
                self.requesting_shift,
                settings_obj,
            )
        )
        return warnings

    @staticmethod
    def _check_staff_constraints(staff_resource, target_shift, _settings_obj) -> list[str]:
        """Check individual staff constraints against a target shift."""
        warnings: list[str] = []
        constraints = staff_resource.scheduling_constraints.filter(is_active=True)
        for c in constraints:
            if c.constraint_type == "NO_NIGHTS" and target_shift.shift_type == "NIGHT":
                warnings.append(
                    f"{staff_resource.name} has a NO_NIGHTS constraint but would be assigned a night shift."
                )
            elif c.constraint_type == "NO_WEEKENDS" and target_shift.shift_date.weekday() >= 5:
                warnings.append(
                    f"{staff_resource.name} has a NO_WEEKENDS constraint but the shift is on a weekend."
                )
            elif c.constraint_type == "NO_OVERTIME" and target_shift.shift_type == "OVERTIME":
                warnings.append(f"{staff_resource.name} has a NO_OVERTIME constraint.")
            elif c.constraint_type == "LIGHT_DUTY" and target_shift.shift_type not in (
                "DAY",
                "MORNING",
            ):
                warnings.append(
                    f"{staff_resource.name} is on LIGHT_DUTY and should only work day/morning shifts."
                )
        return warnings
