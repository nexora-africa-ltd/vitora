"""
Scheduling models for Vitora HMIS.

Phase 1: Core Scheduling Foundation
- Resource: Schedulable resources (Person, Place, Asset)
- TimeSlot: Timezone-safe time slot abstraction
- Schedule: Provider availability definitions
- ScheduleBreak: Breaks within schedules
- Appointment: Booking lifecycle management

Phase 2: Automatic Assignment Engine
- AssignmentRule: Rule definitions for automatic assignment (DSL)
- AssignmentDecision: Decision logging for auditability
- AssignmentOverride: Manual override tracking with justification

Implements the scheduling roadmap Phase 1 and Phase 2 requirements.
"""

from datetime import date, datetime, timedelta
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.models import TimeStampedModel

# =============================================================================
# Resource Model - Schedulable Resources
# =============================================================================


class Resource(TimeStampedModel):
    """
    Represents a schedulable resource in the HMIS.

    Resources can be:
    - PERSON: Doctors, nurses, lab technicians, etc.
    - PLACE: Rooms, clinics, wards, theatres
    - ASSET: Beds, machines, equipment

    Attributes:
        name: Display name of the resource
        resource_type: Type of resource (PERSON, PLACE, ASSET)
        code: Unique resource code
        is_active: Whether resource is available for scheduling
        capacity: Capacity (for places/assets)
        staff_profile: Link to StaffProfile for person resources
        metadata: Additional resource-specific data (JSON)
    """

    RESOURCE_TYPE_CHOICES = [
        ("PERSON", "Person"),
        ("PLACE", "Place"),
        ("ASSET", "Asset"),
    ]

    name = models.CharField(
        max_length=200,
        help_text="Display name of the resource",
    )
    resource_type = models.CharField(
        max_length=20,
        choices=RESOURCE_TYPE_CHOICES,
        db_index=True,
        help_text="Type of resource (PERSON, PLACE, ASSET)",
    )
    code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique resource code (e.g., DOC-001, ROOM-001)",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether resource is available for scheduling",
    )
    capacity = models.PositiveIntegerField(
        default=1,
        help_text="Capacity (for places/assets, e.g., room capacity)",
    )
    staff_profile = models.OneToOneField(
        "core.StaffProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scheduling_resource",
        help_text="Link to StaffProfile for person resources",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional resource-specific data",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Description of the resource",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Resource model."""

        ordering = ["resource_type", "name"]
        verbose_name = "Scheduling Resource"
        verbose_name_plural = "Scheduling Resources"

    def __str__(self) -> str:
        """Return string representation."""
        return f"{self.code}: {self.name} ({self.resource_type})"

    def clean(self) -> None:
        """Validate resource data."""
        super().clean()
        valid_types = [choice[0] for choice in self.RESOURCE_TYPE_CHOICES]
        if self.resource_type not in valid_types:
            raise ValidationError(
                {"resource_type": f"Invalid resource type. Must be one of: {valid_types}"}
            )

    def get_schedules(self, include_inactive: bool = False):
        """
        Get schedules for this resource.

        Args:
            include_inactive: Include inactive schedules

        Returns:
            QuerySet of Schedule objects
        """
        qs = self.schedules.all()
        if not include_inactive:
            qs = qs.filter(is_active=True)
        return qs

    def get_appointments(self, from_date: date = None, to_date: date = None):
        """
        Get appointments for this resource.

        Args:
            from_date: Start date filter
            to_date: End date filter

        Returns:
            QuerySet of Appointment objects
        """
        qs = self.appointments.all()
        if from_date:
            qs = qs.filter(scheduled_start__date__gte=from_date)
        if to_date:
            qs = qs.filter(scheduled_start__date__lte=to_date)
        return qs


# =============================================================================
# TimeSlot Model - Timezone-Safe Time Slots
# =============================================================================


class TimeSlot(TimeStampedModel):
    """
    Represents a timezone-safe time slot.

    Used for defining specific time periods with proper timezone handling.
    Defaults to Africa/Nairobi timezone for Kenya operations.

    Attributes:
        start_time: Start datetime (timezone-aware)
        end_time: End datetime (timezone-aware)
        timezone: IANA timezone name
    """

    DEFAULT_TIMEZONE = "Africa/Nairobi"

    start_time = models.DateTimeField(
        db_index=True,
        help_text="Start datetime (timezone-aware)",
    )
    end_time = models.DateTimeField(
        db_index=True,
        help_text="End datetime (timezone-aware)",
    )
    timezone = models.CharField(
        max_length=50,
        default=DEFAULT_TIMEZONE,
        help_text="IANA timezone name (e.g., Africa/Nairobi)",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for TimeSlot model."""

        ordering = ["start_time"]
        verbose_name = "Time Slot"
        verbose_name_plural = "Time Slots"

    def __str__(self) -> str:
        """Return string representation."""
        return f"{self.start_time} - {self.end_time} ({self.timezone})"

    def clean(self) -> None:
        """Validate time slot data."""
        super().clean()
        if self.end_time and self.start_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": "End time must be after start time"})

    @property
    def duration_minutes(self) -> int:
        """
        Calculate duration in minutes.

        Returns:
            int: Duration in minutes
        """
        if not self.start_time or not self.end_time:
            return 0
        delta = self.end_time - self.start_time
        return int(delta.total_seconds() / 60)

    def overlaps_with(self, other_start: datetime, other_end: datetime) -> bool:
        """
        Check if this slot overlaps with another time range.

        Args:
            other_start: Start of other time range
            other_end: End of other time range

        Returns:
            bool: True if overlapping
        """
        # Two ranges overlap if one starts before the other ends
        # and the other starts before the first ends
        return self.start_time < other_end and other_start < self.end_time

    def contains(self, dt: datetime) -> bool:
        """
        Check if a datetime falls within this slot.

        Args:
            dt: Datetime to check

        Returns:
            bool: True if datetime is within slot
        """
        return self.start_time <= dt < self.end_time


# =============================================================================
# Schedule Model - Provider Availability Definitions
# =============================================================================


class Schedule(TimeStampedModel):
    """
    Defines when a resource is available for scheduling.

    Supports both recurring schedules (weekly) and one-time schedules.

    Attributes:
        resource: The resource this schedule applies to
        schedule_type: RECURRING or ONE_TIME
        day_of_week: Day of week for recurring (0=Monday, 6=Sunday)
        specific_date: Date for one-time schedules
        start_time: Daily start time
        end_time: Daily end time
        slot_duration_minutes: Duration of each bookable slot
        buffer_minutes: Buffer time between appointments
        effective_from: When schedule becomes effective
        effective_until: When schedule ends (null = indefinite)
        is_active: Whether schedule is currently active
    """

    SCHEDULE_TYPE_CHOICES = [
        ("RECURRING", "Recurring Weekly"),
        ("ONE_TIME", "One-Time"),
        ("BLOCK", "Blocked Time"),
    ]

    DAY_OF_WEEK_CHOICES = [
        (0, "Monday"),
        (1, "Tuesday"),
        (2, "Wednesday"),
        (3, "Thursday"),
        (4, "Friday"),
        (5, "Saturday"),
        (6, "Sunday"),
    ]

    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name="schedules",
        help_text="Resource this schedule applies to",
    )
    schedule_type = models.CharField(
        max_length=20,
        choices=SCHEDULE_TYPE_CHOICES,
        default="RECURRING",
        db_index=True,
        help_text="Type of schedule",
    )
    day_of_week = models.IntegerField(
        choices=DAY_OF_WEEK_CHOICES,
        null=True,
        blank=True,
        db_index=True,
        help_text="Day of week for recurring schedules (0=Monday)",
    )
    specific_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Specific date for one-time schedules",
    )
    start_time = models.TimeField(
        help_text="Daily start time",
    )
    end_time = models.TimeField(
        help_text="Daily end time",
    )
    slot_duration_minutes = models.PositiveIntegerField(
        default=30,
        help_text="Duration of each bookable slot in minutes",
    )
    buffer_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Buffer time between appointments in minutes",
    )
    max_appointments = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum appointments per day (null = unlimited)",
    )
    effective_from = models.DateField(
        default=date.today,
        db_index=True,
        help_text="When this schedule becomes effective",
    )
    effective_until = models.DateField(
        null=True,
        blank=True,
        help_text="When this schedule ends (null = indefinite)",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether this schedule is currently active",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes about this schedule",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Schedule model."""

        ordering = ["resource", "day_of_week", "start_time"]
        verbose_name = "Schedule"
        verbose_name_plural = "Schedules"

    def __str__(self) -> str:
        """Return string representation."""
        if self.schedule_type == "RECURRING":
            day_name = dict(self.DAY_OF_WEEK_CHOICES).get(self.day_of_week, "Unknown")
            return f"{self.resource.name} - {day_name} {self.start_time}-{self.end_time}"
        return f"{self.resource.name} - {self.specific_date} {self.start_time}-{self.end_time}"

    def clean(self) -> None:
        """Validate schedule data."""
        super().clean()
        errors = {}

        if self.end_time <= self.start_time:
            errors["end_time"] = "End time must be after start time"

        if self.schedule_type == "RECURRING" and self.day_of_week is None:
            errors["day_of_week"] = "Day of week is required for recurring schedules"

        if self.schedule_type == "ONE_TIME" and self.specific_date is None:
            errors["specific_date"] = "Specific date is required for one-time schedules"

        if errors:
            raise ValidationError(errors)

    def is_effective_on(self, check_date: date) -> bool:
        """
        Check if schedule is effective on a given date.

        Args:
            check_date: Date to check

        Returns:
            bool: True if schedule is effective
        """
        if not self.is_active:
            return False
        if check_date < self.effective_from:
            return False
        if self.effective_until and check_date > self.effective_until:
            return False
        return True

    def applies_to_date(self, check_date: date) -> bool:
        """
        Check if schedule applies to a specific date.

        Args:
            check_date: Date to check

        Returns:
            bool: True if schedule applies
        """
        if not self.is_effective_on(check_date):
            return False

        if self.schedule_type == "RECURRING":
            return check_date.weekday() == self.day_of_week
        elif self.schedule_type == "ONE_TIME":
            return check_date == self.specific_date

        return False

    def get_available_slots(self, for_date: date) -> list[dict[str, Any]]:
        """
        Generate available time slots for a specific date.

        Args:
            for_date: Date to generate slots for

        Returns:
            List of slot dictionaries with start_time and end_time
        """
        if not self.applies_to_date(for_date):
            return []

        slots = []
        slot_duration = timedelta(minutes=self.slot_duration_minutes)
        buffer = timedelta(minutes=self.buffer_minutes)
        total_slot_time = slot_duration + buffer

        # Get breaks for this schedule
        breaks = list(self.breaks.all())

        current_start = datetime.combine(for_date, self.start_time)
        end_datetime = datetime.combine(for_date, self.end_time)

        while current_start + slot_duration <= end_datetime:
            slot_end = current_start + slot_duration

            # Check if slot overlaps with any break
            slot_in_break = False
            for brk in breaks:
                break_start = datetime.combine(for_date, brk.start_time)
                break_end = datetime.combine(for_date, brk.end_time)
                if current_start < break_end and slot_end > break_start:
                    slot_in_break = True
                    # Jump to after the break
                    current_start = break_end
                    break

            if not slot_in_break:
                slots.append(
                    {
                        "start_time": current_start.time(),
                        "end_time": slot_end.time(),
                        "date": for_date,
                    }
                )
                current_start = current_start + total_slot_time

        return slots


class ScheduleBreak(TimeStampedModel):
    """
    Represents a break within a schedule (e.g., lunch break).

    Breaks are excluded from available slots.

    Attributes:
        schedule: Parent schedule
        start_time: Break start time
        end_time: Break end time
        reason: Reason for break
    """

    schedule = models.ForeignKey(
        Schedule,
        on_delete=models.CASCADE,
        related_name="breaks",
        help_text="Parent schedule",
    )
    start_time = models.TimeField(
        help_text="Break start time",
    )
    end_time = models.TimeField(
        help_text="Break end time",
    )
    reason = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Reason for break (e.g., Lunch)",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for ScheduleBreak model."""

        ordering = ["schedule", "start_time"]
        verbose_name = "Schedule Break"
        verbose_name_plural = "Schedule Breaks"

    def __str__(self) -> str:
        """Return string representation."""
        return f"{self.schedule} - Break {self.start_time}-{self.end_time}"

    def clean(self) -> None:
        """Validate break data."""
        super().clean()
        if self.end_time <= self.start_time:
            raise ValidationError({"end_time": "End time must be after start time"})


# =============================================================================
# Appointment Model - Booking Lifecycle
# =============================================================================


class Appointment(TimeStampedModel):
    """
    Represents a scheduled appointment/booking.

    Manages the complete lifecycle from creation to completion.

    Status Flow:
        CREATED -> CONFIRMED -> CHECKED_IN -> IN_PROGRESS -> COMPLETED
                    |            |
                    v            v
                CANCELLED     NO_SHOW

    Attributes:
        appointment_number: Auto-generated unique identifier
        patient: Patient for the appointment
        resource: Scheduled resource
        appointment_type: Type of appointment
        scheduled_start: Scheduled start datetime
        scheduled_end: Scheduled end datetime
        status: Current status in lifecycle
        reason: Reason for appointment
        notes: Additional notes
    """

    STATUS_CHOICES = [
        ("CREATED", "Created"),
        ("CONFIRMED", "Confirmed"),
        ("CHECKED_IN", "Checked In"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("NO_SHOW", "No Show"),
    ]

    APPOINTMENT_TYPE_CHOICES = [
        ("CONSULTATION", "Consultation"),
        ("FOLLOW_UP", "Follow-up"),
        ("PROCEDURE", "Procedure"),
        ("LAB_TEST", "Laboratory Test"),
        ("IMAGING", "Imaging/Radiology"),
        ("VACCINATION", "Vaccination"),
        ("THERAPY", "Therapy Session"),
        ("OTHER", "Other"),
    ]

    # Valid status transitions
    VALID_TRANSITIONS = {
        "CREATED": ["CONFIRMED", "CANCELLED"],
        "CONFIRMED": ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
        "CHECKED_IN": ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
        "IN_PROGRESS": ["COMPLETED"],
        "COMPLETED": [],
        "CANCELLED": [],
        "NO_SHOW": [],
    }

    # Core fields
    appointment_number = models.CharField(
        max_length=50,
        unique=True,
        editable=False,
        db_index=True,
        help_text="Auto-generated appointment number",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="scheduling_appointments",
        help_text="Patient for this appointment",
    )
    resource = models.ForeignKey(
        Resource,
        on_delete=models.PROTECT,
        related_name="appointments",
        help_text="Scheduled resource",
    )
    appointment_type = models.CharField(
        max_length=20,
        choices=APPOINTMENT_TYPE_CHOICES,
        default="CONSULTATION",
        db_index=True,
        help_text="Type of appointment",
    )

    # Scheduling
    scheduled_start = models.DateTimeField(
        db_index=True,
        help_text="Scheduled start datetime",
    )
    scheduled_end = models.DateTimeField(
        db_index=True,
        help_text="Scheduled end datetime",
    )
    actual_start = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Actual start datetime",
    )
    actual_end = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Actual end datetime",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="CREATED",
        db_index=True,
        help_text="Current appointment status",
    )
    confirmed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When appointment was confirmed",
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_appointments",
        help_text="User who confirmed the appointment",
    )
    checked_in_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When patient checked in",
    )
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkedin_appointments",
        help_text="User who checked in the patient",
    )

    # Started tracking
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="started_appointments",
        help_text="User who started the appointment",
    )

    # Completion tracking
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="completed_appointments",
        help_text="User who completed the appointment",
    )

    # No-show tracking
    no_show_marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="noshow_marked_appointments",
        help_text="User who marked the appointment as no-show",
    )
    no_show_marked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When appointment was marked as no-show",
    )

    # Cancellation
    cancelled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When appointment was cancelled",
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_appointments",
        help_text="User who cancelled the appointment",
    )
    cancellation_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for cancellation",
    )

    # Notes
    reason = models.TextField(
        help_text="Reason for appointment",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes",
    )
    completion_notes = models.TextField(
        blank=True,
        default="",
        help_text="Notes upon completion",
    )

    # Priority
    priority = models.CharField(
        max_length=20,
        choices=[
            ("ROUTINE", "Routine"),
            ("URGENT", "Urgent"),
            ("EMERGENCY", "Emergency"),
        ],
        default="ROUTINE",
        db_index=True,
        help_text="Appointment priority",
    )

    # Created by tracking
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_appointments",
        help_text="User who created the appointment",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Appointment model."""

        ordering = ["-scheduled_start"]
        verbose_name = "Appointment"
        verbose_name_plural = "Appointments"
        indexes = [
            models.Index(fields=["scheduled_start", "status"]),
            models.Index(fields=["resource", "scheduled_start"]),
            models.Index(fields=["patient", "scheduled_start"]),
        ]

    def __str__(self) -> str:
        """Return string representation."""
        return f"{self.appointment_number} - {self.patient} with {self.resource}"

    def save(self, *args, **kwargs):
        """Save appointment with auto-generated number."""
        if not self.appointment_number:
            self.appointment_number = self._generate_appointment_number()
        super().save(*args, **kwargs)

    def _generate_appointment_number(self) -> str:
        """
        Generate unique appointment number.

        Format: APT-YYYYMMDD-XXXX

        Returns:
            str: Unique appointment number
        """
        today = timezone.now().strftime("%Y%m%d")
        prefix = f"APT-{today}-"

        # Get count of appointments created today
        count = Appointment.objects.filter(appointment_number__startswith=prefix).count() + 1

        return f"{prefix}{count:04d}"

    def clean(self) -> None:
        """Validate appointment data."""
        super().clean()
        errors = {}

        # Validate time range
        if self.scheduled_end <= self.scheduled_start:
            errors["scheduled_end"] = "End time must be after start time"

        # Validate not in past for new appointments
        if not self.pk and self.scheduled_start < timezone.now():
            errors["scheduled_start"] = "Cannot schedule appointments in the past"

        # Check for conflicts (only for active statuses)
        if self.status not in ["CANCELLED", "NO_SHOW", "COMPLETED"]:
            conflicts = self._check_conflicts()
            if conflicts:
                errors["scheduled_start"] = (
                    f"Scheduling conflict: Resource {self.resource} already has "
                    f"an appointment at this time"
                )

        if errors:
            raise ValidationError(errors)

    def _check_conflicts(self) -> bool:
        """
        Check for scheduling conflicts.

        Returns:
            bool: True if conflict exists
        """
        conflicting = Appointment.objects.filter(
            resource=self.resource,
            status__in=["CREATED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"],
            scheduled_start__lt=self.scheduled_end,
            scheduled_end__gt=self.scheduled_start,
        )

        if self.pk:
            conflicting = conflicting.exclude(pk=self.pk)

        return conflicting.exists()

    def _transition_to(self, new_status: str) -> None:
        """
        Validate and perform status transition.

        Args:
            new_status: Target status

        Raises:
            ValueError: If transition is not allowed
        """
        valid_next = self.VALID_TRANSITIONS.get(self.status, [])
        if new_status not in valid_next:
            raise ValueError(
                f"Cannot transition from {self.status} to {new_status}. "
                f"Valid transitions: {valid_next}"
            )
        self.status = new_status

    def confirm(self, user) -> None:
        """
        Confirm the appointment.

        Args:
            user: User confirming the appointment
        """
        self._transition_to("CONFIRMED")
        self.confirmed_at = timezone.now()
        self.confirmed_by = user
        self.save()

    def check_in(self, user) -> None:
        """
        Check in the patient.

        Args:
            user: User checking in the patient
        """
        self._transition_to("CHECKED_IN")
        self.checked_in_at = timezone.now()
        self.checked_in_by = user
        self.save()

    def start(self, user) -> None:
        """
        Start the appointment.

        Args:
            user: User starting the appointment
        """
        self._transition_to("IN_PROGRESS")
        self.actual_start = timezone.now()
        self.started_by = user
        self.save()

    def complete(self, user, notes: str = "") -> None:
        """
        Complete the appointment.

        Args:
            user: User completing the appointment
            notes: Completion notes
        """
        self._transition_to("COMPLETED")
        self.actual_end = timezone.now()
        self.completed_by = user
        self.completion_notes = notes
        self.save()

    def cancel(self, user, reason: str = "") -> None:
        """
        Cancel the appointment.

        Args:
            user: User cancelling the appointment
            reason: Cancellation reason
        """
        self._transition_to("CANCELLED")
        self.cancelled_at = timezone.now()
        self.cancelled_by = user
        self.cancellation_reason = reason
        self.save()

    def mark_no_show(self, user) -> None:
        """
        Mark appointment as no-show.

        Args:
            user: User marking the no-show
        """
        self._transition_to("NO_SHOW")
        self.no_show_marked_by = user
        self.no_show_marked_at = timezone.now()
        self.save()

    @property
    def duration_minutes(self) -> int:
        """
        Calculate scheduled duration in minutes.

        Returns:
            int: Duration in minutes
        """
        delta = self.scheduled_end - self.scheduled_start
        return int(delta.total_seconds() / 60)

    @property
    def is_upcoming(self) -> bool:
        """
        Check if appointment is upcoming.

        Returns:
            bool: True if scheduled in the future
        """
        return self.scheduled_start > timezone.now() and self.status in [
            "CREATED",
            "CONFIRMED",
        ]

    @property
    def is_active(self) -> bool:
        """
        Check if appointment is currently active.

        Returns:
            bool: True if in progress
        """
        return self.status == "IN_PROGRESS"


# =============================================================================
# Phase 2: Automatic Assignment Engine Models
# =============================================================================


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


class AssignmentRule(TimeStampedModel):
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
        unique=True,
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
