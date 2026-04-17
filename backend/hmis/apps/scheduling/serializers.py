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

from hmis.apps.scheduling.models import Appointment, Resource, Schedule, ScheduleBreak

# =============================================================================
# Resource Serializers
# =============================================================================


class ResourceSerializer(serializers.ModelSerializer):
    """Serializer for Resource model."""

    staff_profile_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()

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
        ]

    def get_department_name(self, obj) -> str | None:
        """Get department name — from direct FK first, then staff profile fallback."""
        if obj.department:
            return obj.department.name
        if obj.staff_profile and obj.staff_profile.primary_department:
            return obj.staff_profile.primary_department.name
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
    """Serializer for creating shifts."""

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
        """Validate shift data."""
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        shift_type = attrs.get("shift_type", "")

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
            "enforce_constraints",
            "enforce_punctuality",
            "late_cutoff_minutes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


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
