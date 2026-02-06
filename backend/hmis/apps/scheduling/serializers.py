"""
Scheduling serializers for Vitora HMIS.

Phase 1: Core Scheduling Foundation

This module contains serializers for:
- Resource CRUD
- Schedule CRUD
- Appointment CRUD
- Availability queries
"""

from rest_framework import serializers

from hmis.apps.scheduling.models import (
    Appointment,
    Resource,
    Schedule,
    ScheduleBreak,
)

# =============================================================================
# Resource Serializers
# =============================================================================


class ResourceSerializer(serializers.ModelSerializer):
    """Serializer for Resource model."""

    staff_profile_name = serializers.SerializerMethodField()

    class Meta:
        """Meta options for ResourceSerializer."""

        model = Resource
        fields = [
            "id",
            "name",
            "resource_type",
            "code",
            "is_active",
            "capacity",
            "staff_profile",
            "staff_profile_name",
            "metadata",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "staff_profile_name"]

    def get_staff_profile_name(self, obj) -> str | None:
        """Get staff profile display name if linked."""
        if obj.staff_profile:
            return f"{obj.staff_profile.user.first_name} {obj.staff_profile.user.last_name}"
        return None

    def validate_code(self, value: str) -> str:
        """Validate unique code."""
        instance = self.instance
        if Resource.objects.filter(code=value).exclude(pk=instance.pk if instance else None).exists():
            raise serializers.ValidationError("Resource with this code already exists.")
        return value


class ResourceListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for resource listings."""

    class Meta:
        """Meta options for ResourceListSerializer."""

        model = Resource
        fields = ["id", "name", "resource_type", "code", "is_active"]


# =============================================================================
# Schedule Serializers
# =============================================================================


class ScheduleBreakSerializer(serializers.ModelSerializer):
    """Serializer for ScheduleBreak model."""

    class Meta:
        """Meta options for ScheduleBreakSerializer."""

        model = ScheduleBreak
        fields = ["id", "start_time", "end_time", "reason", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        """Validate break times."""
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError(
                {"end_time": "End time must be after start time"}
            )
        return attrs


class ScheduleSerializer(serializers.ModelSerializer):
    """Serializer for Schedule model."""

    resource_name = serializers.CharField(source="resource.name", read_only=True)
    breaks = ScheduleBreakSerializer(many=True, read_only=True)
    day_of_week_display = serializers.CharField(
        source="get_day_of_week_display", read_only=True
    )

    class Meta:
        """Meta options for ScheduleSerializer."""

        model = Schedule
        fields = [
            "id",
            "resource",
            "resource_name",
            "schedule_type",
            "day_of_week",
            "day_of_week_display",
            "specific_date",
            "start_time",
            "end_time",
            "slot_duration_minutes",
            "buffer_minutes",
            "max_appointments",
            "effective_from",
            "effective_until",
            "is_active",
            "notes",
            "breaks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "resource_name", "day_of_week_display", "breaks", "created_at", "updated_at"]

    def validate(self, attrs):
        """Validate schedule data."""
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        schedule_type = attrs.get("schedule_type")
        day_of_week = attrs.get("day_of_week")
        specific_date = attrs.get("specific_date")

        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError(
                {"end_time": "End time must be after start time"}
            )

        if schedule_type == "RECURRING" and day_of_week is None:
            raise serializers.ValidationError(
                {"day_of_week": "Day of week is required for recurring schedules"}
            )

        if schedule_type == "ONE_TIME" and specific_date is None:
            raise serializers.ValidationError(
                {"specific_date": "Specific date is required for one-time schedules"}
            )

        return attrs


class ScheduleCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating schedules."""

    class Meta:
        """Meta options for ScheduleCreateSerializer."""

        model = Schedule
        fields = [
            "resource",
            "schedule_type",
            "day_of_week",
            "specific_date",
            "start_time",
            "end_time",
            "slot_duration_minutes",
            "buffer_minutes",
            "max_appointments",
            "effective_from",
            "effective_until",
            "is_active",
            "notes",
        ]

    def validate(self, attrs):
        """Validate schedule creation data."""
        return ScheduleSerializer().validate(attrs)


# =============================================================================
# Appointment Serializers
# =============================================================================


class AppointmentSerializer(serializers.ModelSerializer):
    """Serializer for Appointment model."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    resource_name = serializers.CharField(source="resource.name", read_only=True)
    resource_code = serializers.CharField(source="resource.code", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    appointment_type_display = serializers.CharField(
        source="get_appointment_type_display", read_only=True
    )
    duration_minutes = serializers.IntegerField(read_only=True)
    is_upcoming = serializers.BooleanField(read_only=True)
    created_by_name = serializers.SerializerMethodField()
    confirmed_by_name = serializers.SerializerMethodField()
    cancelled_by_name = serializers.SerializerMethodField()

    class Meta:
        """Meta options for AppointmentSerializer."""

        model = Appointment
        fields = [
            "id",
            "appointment_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "resource",
            "resource_name",
            "resource_code",
            "appointment_type",
            "appointment_type_display",
            "scheduled_start",
            "scheduled_end",
            "actual_start",
            "actual_end",
            "status",
            "status_display",
            "confirmed_at",
            "confirmed_by",
            "confirmed_by_name",
            "checked_in_at",
            "checked_in_by",
            "cancelled_at",
            "cancelled_by",
            "cancelled_by_name",
            "cancellation_reason",
            "reason",
            "notes",
            "completion_notes",
            "priority",
            "duration_minutes",
            "is_upcoming",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "appointment_number",
            "patient_name",
            "patient_mrn",
            "resource_name",
            "resource_code",
            "status_display",
            "appointment_type_display",
            "actual_start",
            "actual_end",
            "confirmed_at",
            "confirmed_by",
            "confirmed_by_name",
            "checked_in_at",
            "checked_in_by",
            "cancelled_at",
            "cancelled_by",
            "cancelled_by_name",
            "cancellation_reason",
            "completion_notes",
            "duration_minutes",
            "is_upcoming",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_created_by_name(self, obj) -> str | None:
        """Get creator name."""
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}"
        return None

    def get_confirmed_by_name(self, obj) -> str | None:
        """Get confirmer name."""
        if obj.confirmed_by:
            return f"{obj.confirmed_by.first_name} {obj.confirmed_by.last_name}"
        return None

    def get_cancelled_by_name(self, obj) -> str | None:
        """Get canceller name."""
        if obj.cancelled_by:
            return f"{obj.cancelled_by.first_name} {obj.cancelled_by.last_name}"
        return None


class AppointmentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating appointments."""

    class Meta:
        """Meta options for AppointmentCreateSerializer."""

        model = Appointment
        fields = [
            "patient",
            "resource",
            "appointment_type",
            "scheduled_start",
            "scheduled_end",
            "reason",
            "notes",
            "priority",
        ]

    def validate(self, attrs):
        """Validate appointment creation."""
        from django.utils import timezone

        scheduled_start = attrs.get("scheduled_start")
        scheduled_end = attrs.get("scheduled_end")

        if scheduled_end <= scheduled_start:
            raise serializers.ValidationError(
                {"scheduled_end": "End time must be after start time"}
            )

        if scheduled_start < timezone.now():
            raise serializers.ValidationError(
                {"scheduled_start": "Cannot schedule appointments in the past"}
            )

        # Check for conflicts
        resource = attrs.get("resource")
        conflicts = Appointment.objects.filter(
            resource=resource,
            status__in=["CREATED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"],
            scheduled_start__lt=scheduled_end,
            scheduled_end__gt=scheduled_start,
        )

        if conflicts.exists():
            raise serializers.ValidationError(
                {"scheduled_start": "Scheduling conflict: Resource already has an appointment at this time"}
            )

        return attrs

    def create(self, validated_data):
        """Create appointment with created_by set."""
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class AppointmentListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for appointment listings."""

    patient_name = serializers.SerializerMethodField()
    resource_name = serializers.CharField(source="resource.name", read_only=True)

    class Meta:
        """Meta options for AppointmentListSerializer."""

        model = Appointment
        fields = [
            "id",
            "appointment_number",
            "patient",
            "patient_name",
            "resource",
            "resource_name",
            "appointment_type",
            "scheduled_start",
            "scheduled_end",
            "status",
            "priority",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"


# =============================================================================
# Action Serializers
# =============================================================================


class AppointmentConfirmSerializer(serializers.Serializer):
    """Serializer for confirming appointments."""

    pass  # No additional data needed


class AppointmentCheckInSerializer(serializers.Serializer):
    """Serializer for checking in appointments."""

    pass  # No additional data needed


class AppointmentStartSerializer(serializers.Serializer):
    """Serializer for starting appointments."""

    pass  # No additional data needed


class AppointmentCompleteSerializer(serializers.Serializer):
    """Serializer for completing appointments."""

    notes = serializers.CharField(required=False, allow_blank=True)


class AppointmentCancelSerializer(serializers.Serializer):
    """Serializer for cancelling appointments."""

    reason = serializers.CharField(required=False, allow_blank=True)


class AppointmentNoShowSerializer(serializers.Serializer):
    """Serializer for marking appointments as no-show."""

    pass  # No additional data needed


# =============================================================================
# Availability Serializers
# =============================================================================


class AvailabilitySlotSerializer(serializers.Serializer):
    """Serializer for availability slots."""

    date = serializers.DateField()
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()


class AvailabilityQuerySerializer(serializers.Serializer):
    """Serializer for availability query parameters."""

    date = serializers.DateField(required=True)
    appointment_type = serializers.CharField(required=False)


class WeeklyAvailabilityQuerySerializer(serializers.Serializer):
    """Serializer for weekly availability query parameters."""

    start_date = serializers.DateField(required=True)
    weeks = serializers.IntegerField(required=False, default=1, min_value=1, max_value=4)


class SlotCheckQuerySerializer(serializers.Serializer):
    """Serializer for slot availability check."""

    date = serializers.DateField(required=True)
    start_time = serializers.TimeField(required=True)
    duration_minutes = serializers.IntegerField(required=True, min_value=5, max_value=480)


class SlotCheckResponseSerializer(serializers.Serializer):
    """Serializer for slot availability check response."""

    available = serializers.BooleanField()
    reason = serializers.CharField(allow_null=True)
    conflicting_appointment = serializers.CharField(required=False, allow_null=True)
