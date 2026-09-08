# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Scheduling serializers for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the scheduling module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from rest_framework import serializers

from hmis.apps.scheduling.models import Appointment, Resource, Schedule, ScheduleBreak

# =============================================================================
# Resource Serializers
# =============================================================================


class ResourceSerializer(serializers.ModelSerializer):
    """Serializer for Resource model."""

    staff_profile_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    equipment_type_name = serializers.CharField(
        source="equipment_type.name", read_only=True, default=None
    )

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
            "department",
            "department_name",
            "equipment_type",
            "equipment_type_name",
            "metadata",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "staff_profile_name",
            "department_name",
        ]

    def get_staff_profile_name(self, obj) -> str | None:
        """Get staff profile display name if linked."""
        if obj.staff_profile:
            return f"{obj.staff_profile.user.first_name} {obj.staff_profile.user.last_name}"
        return None

    def get_department_name(self, obj) -> str | None:
        """Get department name — from direct FK first, then staff profile fallback."""
        if obj.department:
            return obj.department.name
        if obj.staff_profile and obj.staff_profile.primary_department:
            return obj.staff_profile.primary_department.name
        return None

    def validate_code(self, value: str) -> str:
        """Validate unique code."""
        instance = self.instance
        if (
            Resource.objects.filter(code=value)
            .exclude(pk=instance.pk if instance else None)
            .exists()
        ):
            raise serializers.ValidationError("Resource with this code already exists.")
        return value


class ResourceListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for resource listings."""

    department = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()

    class Meta:
        """Meta options for ResourceListSerializer."""

        model = Resource
        fields = [
            "id",
            "name",
            "resource_type",
            "code",
            "is_active",
            "department",
            "department_name",
            "metadata",
        ]

    def get_department_name(self, obj) -> str | None:
        """Get department name — from direct FK first, then staff profile fallback."""
        if obj.department:
            return obj.department.name
        if obj.staff_profile and obj.staff_profile.primary_department:
            return obj.staff_profile.primary_department.name
        return None

    def get_department(self, obj) -> int | None:
        """Return the direct or staff-profile department ID used by roster filters."""
        if obj.department_id:
            return obj.department_id
        if obj.staff_profile and obj.staff_profile.primary_department_id:
            return obj.staff_profile.primary_department_id
        return None


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
            raise serializers.ValidationError({"end_time": "End time must be after start time"})
        return attrs


class ScheduleSerializer(serializers.ModelSerializer):
    """Serializer for Schedule model."""

    resource_name = serializers.CharField(source="resource.name", read_only=True)
    breaks = ScheduleBreakSerializer(many=True, read_only=True)
    day_of_week_display = serializers.CharField(source="get_day_of_week_display", read_only=True)

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
        read_only_fields = [
            "id",
            "resource_name",
            "day_of_week_display",
            "breaks",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        """Validate schedule data."""
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        schedule_type = attrs.get("schedule_type")
        day_of_week = attrs.get("day_of_week")
        specific_date = attrs.get("specific_date")

        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "End time must be after start time"})

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
                {
                    "scheduled_start": "Scheduling conflict: Resource already has an appointment at this time"
                }
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


# =============================================================================
# Phase 2: Assignment Engine Serializers
# =============================================================================


class AssignmentRuleSerializer(serializers.ModelSerializer):
    """Serializer for AssignmentRule model."""

    created_by_name = serializers.SerializerMethodField()

    class Meta:
        """Meta options for AssignmentRuleSerializer."""

        from hmis.apps.scheduling.models import AssignmentRule

        model = AssignmentRule
        fields = [
            "id",
            "name",
            "rule_code",
            "applies_to",
            "rule_definition",
            "version",
            "priority",
            "is_active",
            "effective_from",
            "effective_until",
            "description",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_by_name", "created_at", "updated_at"]

    def get_created_by_name(self, obj) -> str | None:
        """Get creator's display name."""
        if obj.created_by:
            return (
                f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
                or obj.created_by.username
            )
        return None

    def validate_rule_code(self, value: str) -> str:
        """Validate unique rule code."""
        from hmis.apps.scheduling.models import AssignmentRule

        instance = self.instance
        if (
            AssignmentRule.objects.filter(rule_code=value)
            .exclude(pk=instance.pk if instance else None)
            .exists()
        ):
            raise serializers.ValidationError("Rule with this code already exists.")
        return value

    def create(self, validated_data):
        """Create rule with current user as creator."""
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class AssignmentRuleListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for rule listings."""

    class Meta:
        """Meta options for AssignmentRuleListSerializer."""

        from hmis.apps.scheduling.models import AssignmentRule

        model = AssignmentRule
        fields = ["id", "name", "rule_code", "applies_to", "priority", "is_active", "version"]


class AssignmentDecisionSerializer(serializers.ModelSerializer):
    """Serializer for AssignmentDecision model (read-only)."""

    rule_applied_name = serializers.SerializerMethodField()
    assigned_resource_name = serializers.SerializerMethodField()
    triggered_by_name = serializers.SerializerMethodField()

    class Meta:
        """Meta options for AssignmentDecisionSerializer."""

        from hmis.apps.scheduling.models import AssignmentDecision

        model = AssignmentDecision
        fields = [
            "id",
            "assignment_type",
            "target_id",
            "target_type",
            "rule_applied",
            "rule_applied_name",
            "assigned_resource",
            "assigned_resource_name",
            "decision_outcome",
            "decision_reason",
            "candidates_evaluated",
            "scoring_details",
            "evaluation_inputs",
            "evaluation_time_ms",
            "triggered_by",
            "triggered_by_name",
            "created_at",
        ]
        read_only_fields = fields  # All fields are read-only

    def get_rule_applied_name(self, obj) -> str | None:
        """Get rule name."""
        return obj.rule_applied.name if obj.rule_applied else None

    def get_assigned_resource_name(self, obj) -> str | None:
        """Get assigned resource name."""
        return obj.assigned_resource.name if obj.assigned_resource else None

    def get_triggered_by_name(self, obj) -> str | None:
        """Get triggering user's name."""
        if obj.triggered_by:
            return (
                f"{obj.triggered_by.first_name} {obj.triggered_by.last_name}".strip()
                or obj.triggered_by.username
            )
        return None


class AssignmentOverrideSerializer(serializers.ModelSerializer):
    """Serializer for AssignmentOverride model."""

    original_resource_name = serializers.SerializerMethodField()
    new_resource_name = serializers.SerializerMethodField()
    overridden_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        """Meta options for AssignmentOverrideSerializer."""

        from hmis.apps.scheduling.models import AssignmentOverride

        model = AssignmentOverride
        fields = [
            "id",
            "target_type",
            "target_id",
            "original_resource",
            "original_resource_name",
            "new_resource",
            "new_resource_name",
            "override_reason",
            "justification",
            "overridden_by",
            "overridden_by_name",
            "requires_approval",
            "approval_status",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "approval_notes",
            "rejected_by",
            "rejected_at",
            "rejection_reason",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "overridden_by",
            "overridden_by_name",
            "original_resource_name",
            "new_resource_name",
            "approval_status",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "approval_notes",
            "rejected_by",
            "rejected_at",
            "rejection_reason",
            "created_at",
        ]

    def get_original_resource_name(self, obj) -> str | None:
        """Get original resource name."""
        return obj.original_resource.name if obj.original_resource else None

    def get_new_resource_name(self, obj) -> str | None:
        """Get new resource name."""
        return obj.new_resource.name if obj.new_resource else None

    def get_overridden_by_name(self, obj) -> str | None:
        """Get overriding user's name."""
        if obj.overridden_by:
            return (
                f"{obj.overridden_by.first_name} {obj.overridden_by.last_name}".strip()
                or obj.overridden_by.username
            )
        return None

    def get_approved_by_name(self, obj) -> str | None:
        """Get approving user's name."""
        if obj.approved_by:
            return (
                f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip()
                or obj.approved_by.username
            )
        return None

    def validate_justification(self, value: str) -> str:
        """Require non-empty justification."""
        if not value or not value.strip():
            raise serializers.ValidationError("Justification is required for all overrides.")
        return value

    def create(self, validated_data):
        """Create override with current user."""
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["overridden_by"] = request.user
        return super().create(validated_data)


class OverrideApprovalSerializer(serializers.Serializer):
    """Serializer for override approval action."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")


class OverrideRejectionSerializer(serializers.Serializer):
    """Serializer for override rejection action."""

    reason = serializers.CharField(required=True, min_length=1)


class AutoAssignRequestSerializer(serializers.Serializer):
    """Serializer for auto-assignment request."""

    assignment_type = serializers.ChoiceField(
        choices=["APPOINTMENT", "SHIFT", "BED_ASSIGNMENT", "LAB_BATCH", "THEATRE_SLOT"]
    )
    patient_id = serializers.IntegerField(required=False)
    scheduled_start = serializers.DateTimeField(required=False)
    scheduled_end = serializers.DateTimeField(required=False)
    reason = serializers.CharField(required=False, default="Auto-assigned")
    appointment_type = serializers.CharField(required=False, default="CONSULTATION")
    candidate_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list,
    )


class AutoAssignResponseSerializer(serializers.Serializer):
    """Serializer for auto-assignment response."""

    success = serializers.BooleanField()
    assigned_resource = ResourceListSerializer(allow_null=True)
    decision = AssignmentDecisionSerializer(allow_null=True)
    target_id = serializers.IntegerField(allow_null=True)
    error = serializers.CharField(allow_null=True, required=False)


class ManualOverrideRequestSerializer(serializers.Serializer):
    """Serializer for manual override request."""

    target_type = serializers.CharField()
    target_id = serializers.IntegerField()
    new_resource_id = serializers.IntegerField()
    override_reason = serializers.ChoiceField(
        choices=[
            "PATIENT_REQUEST",
            "STAFF_UNAVAILABLE",
            "EMERGENCY",
            "SPECIALIZATION_NEEDED",
            "LOAD_BALANCING",
            "ADMINISTRATIVE",
            "OTHER",
        ]
    )
    justification = serializers.CharField(min_length=1)
    requires_approval = serializers.BooleanField(required=False, default=False)


class ManualOverrideResponseSerializer(serializers.Serializer):
    """Serializer for manual override response."""

    success = serializers.BooleanField()
    override = AssignmentOverrideSerializer(allow_null=True)
    error = serializers.CharField(allow_null=True, required=False)


# =============================================================================
# Phase 3: Shift / Duty Roster Serializers
# =============================================================================


class ShiftSerializer(serializers.ModelSerializer):
    """Serializer for Shift model."""

    staff_resource_name = serializers.CharField(source="staff_resource.name", read_only=True)
    staff_resource_code = serializers.CharField(source="staff_resource.code", read_only=True)
    shift_type_display = serializers.CharField(source="get_shift_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    duration_hours = serializers.FloatField(read_only=True)
    actual_hours = serializers.FloatField(read_only=True)
    late_minutes = serializers.IntegerField(read_only=True)
    overtime_minutes = serializers.IntegerField(read_only=True)
    is_early_departure = serializers.BooleanField(read_only=True)
    department_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    cancelled_by_name = serializers.SerializerMethodField()
    room_name = serializers.SerializerMethodField()
    clinic_name = serializers.SerializerMethodField()

    class Meta:
        """Meta options for ShiftSerializer."""

        from hmis.apps.scheduling.models import Shift

        model = Shift
        fields = [
            "id",
            "staff_resource",
            "staff_resource_name",
            "staff_resource_code",
            "shift_date",
            "start_time",
            "end_time",
            "shift_type",
            "shift_type_display",
            "status",
            "status_display",
            "department",
            "department_name",
            "notes",
            "duration_hours",
            "actual_hours",
            "late_minutes",
            "overtime_minutes",
            "is_early_departure",
            "room",
            "room_name",
            "clinic",
            "clinic_name",
            "started_at",
            "completed_at",
            "break_started_at",
            "total_break_minutes",
            "clock_in_method",
            "auto_clocked_out",
            "is_emergency",
            "emergency_reason",
            "created_by",
            "created_by_name",
            "cancelled_by",
            "cancelled_by_name",
            "cancellation_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "staff_resource_name",
            "staff_resource_code",
            "shift_type_display",
            "status_display",
            "duration_hours",
            "actual_hours",
            "late_minutes",
            "overtime_minutes",
            "is_early_departure",
            "room",
            "room_name",
            "clinic",
            "clinic_name",
            "department_name",
            "started_at",
            "completed_at",
            "break_started_at",
            "total_break_minutes",
            "clock_in_method",
            "auto_clocked_out",
            "is_emergency",
            "emergency_reason",
            "created_by",
            "created_by_name",
            "cancelled_by",
            "cancelled_by_name",
            "cancellation_reason",
            "created_at",
            "updated_at",
        ]

    def get_created_by_name(self, obj) -> str | None:
        """Get creator name."""
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}"
        return None

    def get_cancelled_by_name(self, obj) -> str | None:
        """Get canceller name."""
        if obj.cancelled_by:
            return f"{obj.cancelled_by.first_name} {obj.cancelled_by.last_name}"
        return None

    def get_room_name(self, obj) -> str | None:
        """Get room name."""
        if obj.room:
            return obj.room.name
        return None

    def get_clinic_name(self, obj) -> str | None:
        """Get clinic name."""
        if obj.clinic:
            return obj.clinic.name
        return None

    def get_department_name(self, obj) -> str:
        """Return department name, falling back through resource/staff profile."""
        if obj.department:
            return obj.department.name
        if obj.department_legacy:
            return obj.department_legacy
        resource = obj.staff_resource
        if resource and resource.department:
            return resource.department.name
        if resource and resource.staff_profile and resource.staff_profile.primary_department:
            return resource.staff_profile.primary_department.name
        return ""


class ShiftCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating shifts.

    start_time and end_time are optional — when omitted, they are
    auto-populated from the facility's ShiftTypeConfig for the given shift_type.
    """

    start_time = serializers.TimeField(required=False, allow_null=True)
    end_time = serializers.TimeField(required=False, allow_null=True)

    class Meta:
        """Meta options for ShiftCreateSerializer."""

        from hmis.apps.scheduling.models import Shift

        model = Shift
        fields = [
            "staff_resource",
            "shift_date",
            "start_time",
            "end_time",
            "shift_type",
            "department",
            "notes",
        ]

    # Shift types where end_time < start_time is valid (crosses midnight)
    OVERNIGHT_TYPES = {"NIGHT", "NIGHT_OFF"}

    def validate(self, attrs):
        """Validate shift data, auto-filling times from facility config if not provided."""
        from datetime import date as date_type

        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        shift_type = attrs.get("shift_type", "")
        shift_date = attrs.get("shift_date")

        # Prevent creating shifts in the past
        if shift_date and shift_date < date_type.today():
            raise serializers.ValidationError(
                {"shift_date": "Cannot create shifts for past dates."}
            )

        # Prefer a department override, retaining the facility config as fallback.
        if (not start_time or not end_time) and shift_type:
            from hmis.apps.scheduling.models import DepartmentShiftConfig, ShiftTypeConfig

            request = self.context.get("request")
            facility = getattr(request, "facility", None) if request else None
            if facility:
                department = attrs.get("department")
                config = None
                if department:
                    config = DepartmentShiftConfig.objects.filter(
                        facility=facility,
                        department=department,
                        shift_type=shift_type,
                        is_active=True,
                    ).first()
                if not config:
                    config = ShiftTypeConfig.objects.filter(
                        facility=facility, shift_type=shift_type, is_active=True
                    ).first()
                if config:
                    if not start_time:
                        attrs["start_time"] = config.start_time
                        start_time = config.start_time
                    if not end_time:
                        attrs["end_time"] = config.end_time
                        end_time = config.end_time

        # After auto-fill, times are still required
        if not attrs.get("start_time"):
            raise serializers.ValidationError(
                {"start_time": "This field is required (no facility default configured)."}
            )
        if not attrs.get("end_time"):
            raise serializers.ValidationError(
                {"end_time": "This field is required (no facility default configured)."}
            )

        if start_time and end_time and end_time <= start_time:
            # Allow overnight shifts where end_time is next-day
            if shift_type not in self.OVERNIGHT_TYPES:
                raise serializers.ValidationError({"end_time": "End time must be after start time"})

        staff_resource = attrs.get("staff_resource")
        if staff_resource and staff_resource.resource_type != "PERSON":
            raise serializers.ValidationError(
                {"staff_resource": "Only PERSON-type resources can be assigned shifts"}
            )
        return attrs

    def create(self, validated_data):
        """Create shift with created_by set."""
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class ShiftListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for shift listings."""

    staff_resource_name = serializers.CharField(source="staff_resource.name", read_only=True)
    shift_type_display = serializers.CharField(source="get_shift_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    duration_hours = serializers.FloatField(read_only=True)
    department = serializers.SerializerMethodField()
    room_name = serializers.SerializerMethodField()
    clinic_name = serializers.SerializerMethodField()
    comments_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        """Meta options for ShiftListSerializer."""

        from hmis.apps.scheduling.models import Shift

        model = Shift
        fields = [
            "id",
            "staff_resource",
            "staff_resource_name",
            "shift_date",
            "start_time",
            "end_time",
            "shift_type",
            "shift_type_display",
            "status",
            "status_display",
            "department",
            "duration_hours",
            "room",
            "room_name",
            "clinic",
            "clinic_name",
            "comments_count",
        ]

    def get_department(self, obj) -> str:
        """Return shift department name, falling back to resource's staff profile department."""
        if obj.department:
            return obj.department.name
        if obj.department_legacy:
            return obj.department_legacy
        resource = obj.staff_resource
        if resource and resource.department:
            return resource.department.name
        if resource and resource.staff_profile and resource.staff_profile.primary_department:
            return resource.staff_profile.primary_department.name
        return ""

    def get_room_name(self, obj) -> str | None:
        """Get room name."""
        if obj.room:
            return obj.room.name
        return None

    def get_clinic_name(self, obj) -> str | None:
        """Get clinic name."""
        if obj.clinic:
            return obj.clinic.name
        return None


class ShiftCancelSerializer(serializers.Serializer):
    """Serializer for cancelling a shift."""

    reason = serializers.CharField(required=False, allow_blank=True)


class ShiftVacancySerializer(serializers.ModelSerializer):
    """Serializer for explicit shift vacancies."""

    shift_type_display = serializers.CharField(source="get_shift_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    created_by_name = serializers.SerializerMethodField()
    filled_by_name = serializers.SerializerMethodField()

    class Meta:
        """Meta options for ShiftVacancySerializer."""

        from hmis.apps.scheduling.models import ShiftVacancy

        model = ShiftVacancy
        fields = [
            "id",
            "shift_date",
            "start_time",
            "end_time",
            "shift_type",
            "shift_type_display",
            "status",
            "status_display",
            "department",
            "department_name",
            "notes",
            "created_by",
            "created_by_name",
            "filled_by",
            "filled_by_name",
            "filled_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "shift_type_display",
            "status_display",
            "department_name",
            "created_by",
            "created_by_name",
            "filled_by",
            "filled_by_name",
            "filled_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        """Ensure times and the optional department match the request facility."""
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "End time must be after start time."})

        department = attrs.get("department")
        request = self.context.get("request")
        facility = getattr(request, "facility", None) if request else None
        if department and facility and department.facility_id != facility.id:
            raise serializers.ValidationError(
                {"department": "Department must belong to the current facility."}
            )
        return attrs

    def get_created_by_name(self, obj) -> str | None:
        """Return the creator's display name when available."""
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_filled_by_name(self, obj) -> str | None:
        """Return the filling user's display name when available."""
        if obj.filled_by:
            return obj.filled_by.get_full_name() or obj.filled_by.username
        return None


class ShiftStartSerializer(serializers.Serializer):
    """Serializer for clock-in (start shift) with optional room, clinic, and method."""

    room_id = serializers.IntegerField(required=False, allow_null=True)
    clinic_id = serializers.IntegerField(required=False, allow_null=True)
    method = serializers.ChoiceField(
        choices=["MANUAL", "QR_CODE"],
        required=False,
        default="MANUAL",
    )

    def validate_room_id(self, value):
        """Validate room is a PLACE resource in the same facility."""
        if value is None:
            return value
        try:
            resource = Resource.objects.get(pk=value)
        except Resource.DoesNotExist:
            raise serializers.ValidationError("Room not found.")
        if resource.resource_type != "PLACE":
            raise serializers.ValidationError("Resource must be of type PLACE.")
        shift = self.context.get("shift")
        if shift and resource.facility_id != shift.facility_id:
            raise serializers.ValidationError("Room must belong to the same facility.")
        return value

    def validate_clinic_id(self, value):
        """Validate clinic is active and in the same facility."""
        if value is None:
            return value
        from hmis.apps.clinics.models import Clinic

        try:
            clinic = Clinic.objects.get(pk=value)
        except Clinic.DoesNotExist:
            raise serializers.ValidationError("Clinic not found.")
        if clinic.status != "ACTIVE":
            raise serializers.ValidationError("Clinic is not active.")
        shift = self.context.get("shift")
        if shift and clinic.facility_id != shift.facility_id:
            raise serializers.ValidationError("Clinic must belong to the same facility.")
        return value


class EmergencyClockInSerializer(serializers.Serializer):
    """Serializer for emergency clock-in (creates ad-hoc shift + immediately clocks in)."""

    reason = serializers.CharField(
        max_length=500,
        help_text="Reason for emergency clock-in (mandatory).",
    )
    shift_type = serializers.ChoiceField(
        choices=[
            ("DAY", "Day Shift"),
            ("NIGHT", "Night Shift"),
            ("MORNING", "Morning Shift"),
            ("AFTERNOON", "Afternoon Shift"),
            ("ON_CALL", "On-Call"),
            ("OVERTIME", "Overtime"),
        ],
        default="DAY",
        required=False,
    )
    duration_hours = serializers.FloatField(
        default=8.0,
        min_value=1.0,
        max_value=24.0,
        required=False,
        help_text="Planned shift duration in hours (default 8).",
    )
    room_id = serializers.IntegerField(required=False, allow_null=True)
    clinic_id = serializers.IntegerField(required=False, allow_null=True)
    method = serializers.ChoiceField(
        choices=["MANUAL", "QR_CODE"],
        required=False,
        default="MANUAL",
    )

    def validate_room_id(self, value):
        """Validate room is a PLACE resource in the same facility."""
        if value is None:
            return value
        try:
            resource = Resource.objects.get(pk=value)
        except Resource.DoesNotExist:
            raise serializers.ValidationError("Room not found.")
        if resource.resource_type != "PLACE":
            raise serializers.ValidationError("Resource must be of type PLACE.")
        facility = self.context.get("facility")
        if facility and resource.facility_id != facility.id:
            raise serializers.ValidationError("Room must belong to the same facility.")
        return value

    def validate_clinic_id(self, value):
        """Validate clinic is active and in the same facility."""
        if value is None:
            return value
        from hmis.apps.clinics.models import Clinic

        try:
            clinic = Clinic.objects.get(pk=value)
        except Clinic.DoesNotExist:
            raise serializers.ValidationError("Clinic not found.")
        if clinic.status != "ACTIVE":
            raise serializers.ValidationError("Clinic is not active.")
        facility = self.context.get("facility")
        if facility and clinic.facility_id != facility.id:
            raise serializers.ValidationError("Clinic must belong to the same facility.")
        return value


class StaffWorkloadSerializer(serializers.Serializer):
    """Serializer for staff workload summary."""

    resource_id = serializers.IntegerField()
    resource_name = serializers.CharField()
    resource_code = serializers.CharField()
    shift_count = serializers.IntegerField()
    total_hours = serializers.FloatField()
    appointment_count = serializers.IntegerField()
    active_shifts = serializers.IntegerField()
    completed_shifts = serializers.IntegerField()


# =============================================================================
# Scheduling Settings & Staff Constraints
# =============================================================================


class SchedulingSettingsSerializer(serializers.ModelSerializer):
    """Serializer for facility scheduling settings."""

    class Meta:
        from hmis.apps.scheduling.models import SchedulingSettings

        model = SchedulingSettings
        fields = [
            "id",
            "max_hours_per_week",
            "max_consecutive_days",
            "min_rest_hours",
            "max_night_shifts_per_week",
            "max_day_hours",
            "max_night_hours",
            "default_shift_pattern",
            "active_shift_types",
            "overtime_threshold_hours",
            "require_swap_approval",
            "enforce_constraints",
            "enforce_punctuality",
            "late_cutoff_minutes",
            "autofill_mode",
            "autofill_target_days_per_staff",
            "autofill_min_staff_per_shift",
            "autofill_group_minimums",
            "autofill_group_maximums",
            "autofill_weights",
            "autofill_run_history",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "autofill_run_history"]

    def validate(self, attrs):
        """Require canonical current-facility department IDs in department rules."""
        request = self.context.get("request")
        facility = getattr(request, "facility", None) if request else None
        for field, count_field in (
            ("autofill_group_minimums", "min_staff"),
            ("autofill_group_maximums", "max_staff"),
        ):
            rules = attrs.get(field)
            if rules is None:
                continue
            if not isinstance(rules, list):
                raise serializers.ValidationError({field: "Must be a list of rules."})
            for index, rule in enumerate(rules):
                if not isinstance(rule, dict):
                    raise serializers.ValidationError({field: f"Rule {index} must be an object."})
                if rule.get("scope") != "DEPARTMENT":
                    continue
                department_id = rule.get("department_id")
                if not isinstance(department_id, int) or isinstance(department_id, bool):
                    raise serializers.ValidationError(
                        {field: f"Rule {index} requires an integer department_id."}
                    )
                if "value" in rule:
                    raise serializers.ValidationError(
                        {field: f"Rule {index} must use department_id, not value."}
                    )
                if not isinstance(rule.get(count_field), int) or isinstance(
                    rule.get(count_field), bool
                ):
                    raise serializers.ValidationError(
                        {field: f"Rule {index} requires an integer {count_field}."}
                    )
                from hmis.apps.core.models import Department

                if (
                    facility
                    and not Department.objects.filter(pk=department_id, facility=facility).exists()
                ):
                    raise serializers.ValidationError(
                        {field: f"Rule {index} department_id must belong to the current facility."}
                    )
        return attrs


class ShiftTypeConfigSerializer(serializers.ModelSerializer):
    """Serializer for per-facility shift type time configuration."""

    shift_type_display = serializers.CharField(source="get_shift_type_display", read_only=True)
    display_label = serializers.CharField(read_only=True)

    class Meta:
        from hmis.apps.scheduling.models import ShiftTypeConfig

        model = ShiftTypeConfig
        fields = [
            "id",
            "shift_type",
            "shift_type_display",
            "label",
            "display_label",
            "start_time",
            "end_time",
            "color",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    # Shift types where end_time < start_time is valid (crosses midnight)
    OVERNIGHT_TYPES = {"NIGHT", "NIGHT_OFF"}

    def validate(self, attrs):
        """Validate that non-overnight shift types have end_time > start_time."""
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        shift_type = attrs.get("shift_type", "")

        # On partial update, fill from instance
        if self.instance:
            start_time = start_time or self.instance.start_time
            end_time = end_time or self.instance.end_time
            shift_type = shift_type or self.instance.shift_type

        if start_time and end_time and end_time <= start_time:
            if shift_type not in self.OVERNIGHT_TYPES:
                raise serializers.ValidationError(
                    {"end_time": "End time must be after start time for non-overnight shift types."}
                )

        # Check uniqueness on create
        if not self.instance and shift_type:
            from hmis.apps.scheduling.models import ShiftTypeConfig

            request = self.context.get("request")
            facility = getattr(request, "facility", None) if request else None
            if (
                facility
                and ShiftTypeConfig.objects.filter(
                    facility=facility, shift_type=shift_type
                ).exists()
            ):
                raise serializers.ValidationError(
                    {
                        "shift_type": f"A configuration for '{shift_type}' already exists at this facility."
                    }
                )
        return attrs


class DepartmentShiftConfigSerializer(serializers.ModelSerializer):
    """Serializer for a facility department's shift type override."""

    department_name = serializers.CharField(source="department.name", read_only=True)
    shift_type_display = serializers.CharField(source="get_shift_type_display", read_only=True)
    display_label = serializers.CharField(read_only=True)

    class Meta:
        from hmis.apps.scheduling.models import DepartmentShiftConfig

        model = DepartmentShiftConfig
        fields = [
            "id",
            "department",
            "department_name",
            "shift_type",
            "shift_type_display",
            "is_active",
            "label",
            "display_label",
            "start_time",
            "end_time",
            "color",
            "min_staff",
            "max_staff",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "department_name",
            "shift_type_display",
            "display_label",
            "created_at",
            "updated_at",
        ]

    OVERNIGHT_TYPES = {"NIGHT", "NIGHT_OFF"}

    def validate(self, attrs):
        """Keep configuration local to the request facility and internally consistent."""
        from hmis.apps.scheduling.models import DepartmentShiftConfig

        department = attrs.get("department", getattr(self.instance, "department", None))
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        shift_type = attrs.get("shift_type", getattr(self.instance, "shift_type", ""))
        min_staff = attrs.get("min_staff", getattr(self.instance, "min_staff", 1))
        max_staff = attrs.get("max_staff", getattr(self.instance, "max_staff", None))
        request = self.context.get("request")
        facility = getattr(request, "facility", None) if request else None
        if department and facility and department.facility_id != facility.id:
            raise serializers.ValidationError(
                {"department": "Department must belong to the current facility."}
            )
        if (
            not self.instance
            and facility
            and DepartmentShiftConfig.objects.filter(
                facility=facility,
                department=department,
                shift_type=shift_type,
            ).exists()
        ):
            raise serializers.ValidationError(
                {"shift_type": "A configuration for this department and shift type already exists."}
            )
        if max_staff is not None and max_staff < min_staff:
            raise serializers.ValidationError(
                {"max_staff": "Must be greater than or equal to min_staff."}
            )
        if (
            start_time
            and end_time
            and end_time <= start_time
            and shift_type not in self.OVERNIGHT_TYPES
        ):
            raise serializers.ValidationError(
                {"end_time": "End time must be after start time for non-overnight shift types."}
            )
        return attrs


class DepartmentRosterSettingsSerializer(serializers.ModelSerializer):
    """Serializer for a department's canonical repeating rota."""

    NON_WORKING_ROTA_TYPES = {
        "DAY_OFF",
        "NIGHT_OFF",
        "OFF",
        "AFTERNOON_OFF",
        "LEAVE",
        "SICK_LEAVE",
        "REST",
    }

    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        from hmis.apps.scheduling.models import DepartmentRosterSettings

        model = DepartmentRosterSettings
        fields = [
            "id",
            "department",
            "department_name",
            "repeating_shift_pattern",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "department_name", "created_at", "updated_at"]

    def validate(self, attrs):
        """Require a local department and active configuration for every rota type."""
        from hmis.apps.scheduling.models import DepartmentShiftConfig, ShiftTypeConfig

        request = self.context.get("request")
        facility = getattr(request, "facility", None) if request else None
        department = attrs.get("department", getattr(self.instance, "department", None))
        pattern = attrs.get(
            "repeating_shift_pattern", getattr(self.instance, "repeating_shift_pattern", [])
        )
        if department and facility and department.facility_id != facility.id:
            raise serializers.ValidationError(
                {"department": "Department must belong to the current facility."}
            )
        if not isinstance(pattern, list) or not all(isinstance(item, str) for item in pattern):
            raise serializers.ValidationError(
                {"repeating_shift_pattern": "Must be a list of shift type strings."}
            )
        if facility and department:
            active_facility_types = set(
                ShiftTypeConfig.objects.filter(facility=facility, is_active=True).values_list(
                    "shift_type", flat=True
                )
            )
            active_department_types = set(
                DepartmentShiftConfig.objects.filter(
                    facility=facility, department=department, is_active=True
                ).values_list("shift_type", flat=True)
            )
            invalid_types = (
                set(pattern)
                - active_facility_types
                - active_department_types
                - self.NON_WORKING_ROTA_TYPES
            )
            if invalid_types:
                raise serializers.ValidationError(
                    {
                        "repeating_shift_pattern": (
                            "Each shift type must have an active facility configuration or "
                            "active department override: " + ", ".join(sorted(invalid_types))
                        )
                    }
                )
        return attrs


class AutofillPlanSerializer(serializers.Serializer):
    """Validate a date range for a read-only server-side autofill plan."""

    start_date = serializers.DateField()
    end_date = serializers.DateField()

    def validate(self, attrs):
        """Keep plans bounded and chronological."""
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError({"end_date": "Must be on or after start_date."})
        if (attrs["end_date"] - attrs["start_date"]).days > 31:
            raise serializers.ValidationError({"end_date": "Planning range cannot exceed 31 days."})
        return attrs


class StaffConstraintSerializer(serializers.ModelSerializer):
    """Serializer for staff scheduling constraints."""

    staff_resource_name = serializers.CharField(source="staff_resource.name", read_only=True)
    constraint_type_display = serializers.CharField(
        source="get_constraint_type_display", read_only=True
    )

    class Meta:
        from hmis.apps.scheduling.models import StaffConstraint

        model = StaffConstraint
        fields = [
            "id",
            "staff_resource",
            "staff_resource_name",
            "constraint_type",
            "constraint_type_display",
            "value",
            "reason",
            "is_active",
            "effective_from",
            "effective_until",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# =============================================================================
# Shift Swap Request Serializers
# =============================================================================


class ShiftSwapRequestSerializer(serializers.ModelSerializer):
    """Read serializer for shift swap requests (detail view)."""

    requester_name = serializers.SerializerMethodField()
    requesting_shift_summary = serializers.SerializerMethodField()
    target_shift_summary = serializers.SerializerMethodField()
    target_staff_name = serializers.CharField(
        source="target_staff.name", read_only=True, default=None
    )
    accepted_by_name = serializers.SerializerMethodField()
    accepted_shift_summary = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    constraint_warnings = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        from hmis.apps.scheduling.models import ShiftSwapRequest

        model = ShiftSwapRequest
        fields = [
            "id",
            "requesting_shift",
            "requesting_shift_summary",
            "target_shift",
            "target_shift_summary",
            "requester",
            "requester_name",
            "target_staff",
            "target_staff_name",
            "is_partial",
            "partial_start_time",
            "partial_end_time",
            "status",
            "status_display",
            "reason",
            "rejection_reason",
            "accepted_by",
            "accepted_by_name",
            "accepted_shift",
            "accepted_shift_summary",
            "accepted_at",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "expires_at",
            "constraint_warnings",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "requester",
            "status",
            "accepted_by",
            "accepted_at",
            "reviewed_by",
            "reviewed_at",
            "expires_at",
            "created_at",
            "updated_at",
        ]

    def _shift_summary(self, shift) -> dict[str, str | int | None] | None:
        if not shift:
            return None
        return {
            "id": shift.id,
            "staff_name": shift.staff_resource.name if shift.staff_resource else None,
            "shift_date": str(shift.shift_date),
            "start_time": str(shift.start_time),
            "end_time": str(shift.end_time),
            "shift_type": shift.shift_type,
            "status": shift.status,
        }

    def get_requester_name(self, obj) -> str | None:
        u = obj.requester
        return f"{u.first_name} {u.last_name}".strip() or u.username if u else None

    def get_requesting_shift_summary(self, obj) -> dict[str, str | int | None] | None:
        return self._shift_summary(obj.requesting_shift)

    def get_target_shift_summary(self, obj) -> dict[str, str | int | None] | None:
        return self._shift_summary(obj.target_shift)

    def get_accepted_by_name(self, obj) -> str | None:
        u = obj.accepted_by
        return f"{u.first_name} {u.last_name}".strip() or u.username if u else None

    def get_accepted_shift_summary(self, obj) -> dict[str, str | int | None] | None:
        return self._shift_summary(obj.accepted_shift)

    def get_reviewed_by_name(self, obj) -> str | None:
        u = obj.reviewed_by
        return f"{u.first_name} {u.last_name}".strip() or u.username if u else None

    def get_constraint_warnings(self, obj) -> list[dict[str, str | int | bool | None]]:
        if obj.status in ("PENDING", "ACCEPTED"):
            return obj.check_constraints()
        return []


class ShiftSwapRequestListSerializer(serializers.ModelSerializer):
    """Lightweight list serializer for swap requests."""

    requester_name = serializers.SerializerMethodField()
    requesting_shift_date = serializers.DateField(
        source="requesting_shift.shift_date", read_only=True
    )
    requesting_shift_type = serializers.CharField(
        source="requesting_shift.shift_type", read_only=True
    )
    requesting_staff_name = serializers.CharField(
        source="requesting_shift.staff_resource.name", read_only=True
    )
    target_staff_name = serializers.CharField(
        source="target_staff.name", read_only=True, default=None
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        from hmis.apps.scheduling.models import ShiftSwapRequest

        model = ShiftSwapRequest
        fields = [
            "id",
            "requesting_shift",
            "requesting_shift_date",
            "requesting_shift_type",
            "requesting_staff_name",
            "target_shift",
            "target_staff_name",
            "requester",
            "requester_name",
            "is_partial",
            "status",
            "status_display",
            "reason",
            "expires_at",
            "created_at",
        ]

    def get_requester_name(self, obj):
        u = obj.requester
        return f"{u.first_name} {u.last_name}".strip() or u.username if u else None


class ShiftSwapCreateSerializer(serializers.ModelSerializer):
    """Write serializer for creating a swap request."""

    class Meta:
        from hmis.apps.scheduling.models import ShiftSwapRequest

        model = ShiftSwapRequest
        fields = [
            "requesting_shift",
            "target_shift",
            "target_staff",
            "is_partial",
            "partial_start_time",
            "partial_end_time",
            "reason",
        ]

    def validate_requesting_shift(self, value):
        if value.status != "SCHEDULED":
            raise serializers.ValidationError("Can only swap shifts with SCHEDULED status.")
        return value

    def validate_target_shift(self, value):
        if value and value.status != "SCHEDULED":
            raise serializers.ValidationError("Target shift must have SCHEDULED status.")
        return value

    def validate(self, attrs):
        requesting = attrs.get("requesting_shift")
        target = attrs.get("target_shift")
        is_partial = attrs.get("is_partial", False)

        if target and requesting and target.pk == requesting.pk:
            raise serializers.ValidationError("Cannot swap a shift with itself.")

        if is_partial:
            ps = attrs.get("partial_start_time")
            pe = attrs.get("partial_end_time")
            if not ps or not pe:
                raise serializers.ValidationError(
                    "partial_start_time and partial_end_time are required for partial swaps."
                )
            if pe <= ps:
                raise serializers.ValidationError(
                    "partial_end_time must be after partial_start_time."
                )
            if ps < requesting.start_time or pe > requesting.end_time:
                raise serializers.ValidationError(
                    "Partial swap times must be within the requesting shift's time range."
                )

        return attrs


class ShiftSwapAcceptSerializer(serializers.Serializer):
    """Serializer for accepting a swap request."""

    offered_shift = serializers.PrimaryKeyRelatedField(
        queryset=serializers.empty,
        required=False,
        allow_null=True,
        help_text="Shift offered in exchange (required for open swaps without target_shift)",
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from hmis.apps.scheduling.models import Shift

        self.fields["offered_shift"].queryset = Shift.objects.filter(status="SCHEDULED")


class ShiftSwapRejectSerializer(serializers.Serializer):
    """Serializer for rejecting a swap request."""

    reason = serializers.CharField(required=False, default="", allow_blank=True)


class ShiftSwapApproveSerializer(serializers.Serializer):
    """Serializer for manager approval of a swap request."""

    notes = serializers.CharField(required=False, default="", allow_blank=True)
