"""
Django Admin configuration for Scheduling app.

Phase 1: Core Scheduling Foundation
Phase 2: Assignment Engine (Rules, Decisions, Overrides)
"""

from django.contrib import admin
from django.utils.html import format_html

from hmis.apps.scheduling.models import (
    Appointment,
    AssignmentDecision,
    AssignmentOverride,
    AssignmentRule,
    Resource,
    Schedule,
    ScheduleBreak,
    SchedulingSettings,
    Shift,
    StaffConstraint,
    TimeSlot,
)


class ScheduleBreakInline(admin.TabularInline):
    """Inline admin for schedule breaks."""

    model = ScheduleBreak
    extra = 0


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    """Admin for Resource model."""

    list_display = ["code", "name", "resource_type", "is_active", "capacity", "facility"]
    list_filter = ["resource_type", "is_active", "facility"]
    search_fields = ["name", "code"]
    ordering = ["resource_type", "name"]
    raw_id_fields = ["facility", "organization"]


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    """Admin for Schedule model."""

    list_display = [
        "resource",
        "schedule_type",
        "day_of_week",
        "start_time",
        "end_time",
        "is_active",
    ]
    list_filter = ["schedule_type", "day_of_week", "is_active"]
    search_fields = ["resource__name", "resource__code"]
    inlines = [ScheduleBreakInline]


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    """Admin for Appointment model."""

    list_display = [
        "appointment_number",
        "patient",
        "resource",
        "scheduled_start",
        "status",
        "priority",
        "facility",
    ]
    list_filter = ["status", "appointment_type", "priority", "facility"]
    search_fields = [
        "appointment_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "resource__name",
    ]
    date_hierarchy = "scheduled_start"
    readonly_fields = ["appointment_number", "created_at", "updated_at"]
    raw_id_fields = ["facility", "organization"]


@admin.register(TimeSlot)
class TimeSlotAdmin(admin.ModelAdmin):
    """Admin for TimeSlot model."""

    list_display = ["start_time", "end_time", "timezone", "duration_minutes"]
    list_filter = ["timezone"]


# =============================================================================
# Phase 2: Assignment Engine Admin
# =============================================================================


@admin.register(AssignmentRule)
class AssignmentRuleAdmin(admin.ModelAdmin):
    """Admin for AssignmentRule model — manage bed assignment and scheduling rules."""

    list_display = [
        "rule_code",
        "name",
        "applies_to",
        "priority",
        "version",
        "active_badge",
        "effective_from",
        "effective_until",
    ]
    list_filter = ["applies_to", "is_active", "effective_from"]
    search_fields = ["name", "rule_code", "description"]
    ordering = ["-priority", "name"]
    readonly_fields = ["created_at", "updated_at"]
    fieldsets = (
        (None, {"fields": ("name", "rule_code", "applies_to", "description")}),
        ("Rule Configuration", {"fields": ("rule_definition", "version", "priority")}),
        ("Activation", {"fields": ("is_active", "effective_from", "effective_until")}),
        ("Tracking", {"fields": ("created_by", "created_at", "updated_at")}),
    )

    @admin.display(description="Active", boolean=True)
    def active_badge(self, obj):
        return obj.is_active


@admin.register(AssignmentDecision)
class AssignmentDecisionAdmin(admin.ModelAdmin):
    """Admin for AssignmentDecision model — read-only audit log of assignment decisions."""

    list_display = [
        "id",
        "assignment_type",
        "target_type",
        "target_id",
        "outcome_badge",
        "rule_applied",
        "evaluation_time_ms",
        "triggered_by",
        "created_at",
    ]
    list_filter = ["assignment_type", "decision_outcome", "created_at"]
    search_fields = ["target_type", "decision_reason"]
    ordering = ["-created_at"]
    readonly_fields = [
        "assignment_type",
        "target_id",
        "target_type",
        "rule_applied",
        "assigned_resource",
        "decision_outcome",
        "decision_reason",
        "candidates_evaluated",
        "scoring_details",
        "evaluation_inputs",
        "evaluation_time_ms",
        "triggered_by",
        "created_at",
        "updated_at",
    ]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Outcome")
    def outcome_badge(self, obj):
        colors = {
            "ASSIGNED": "#28a745",
            "UNASSIGNED": "#dc3545",
            "SKIPPED": "#6c757d",
            "ERROR": "#fd7e14",
        }
        color = colors.get(obj.decision_outcome, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.decision_outcome,
        )


@admin.register(AssignmentOverride)
class AssignmentOverrideAdmin(admin.ModelAdmin):
    """Admin for AssignmentOverride model — manual override tracking."""

    list_display = [
        "id",
        "target_type",
        "target_id",
        "override_reason",
        "approval_badge",
        "overridden_by",
        "created_at",
    ]
    list_filter = ["override_reason", "approval_status", "requires_approval"]
    search_fields = ["target_type", "justification"]
    ordering = ["-created_at"]
    readonly_fields = [
        "created_at",
        "updated_at",
        "approved_at",
        "rejected_at",
    ]
    fieldsets = (
        (None, {"fields": ("target_type", "target_id", "original_resource", "new_resource")}),
        ("Reason", {"fields": ("override_reason", "justification")}),
        ("Approval", {"fields": (
            "requires_approval",
            "approval_status",
            "approved_by",
            "approved_at",
            "approval_notes",
            "rejected_by",
            "rejected_at",
            "rejection_reason",
        )}),
        ("Tracking", {"fields": ("overridden_by", "created_at", "updated_at")}),
    )

    @admin.display(description="Approval")
    def approval_badge(self, obj):
        colors = {
            "APPROVED": "#28a745",
            "REJECTED": "#dc3545",
            "PENDING": "#ffc107",
            "NOT_REQUIRED": "#6c757d",
        }
        color = colors.get(obj.approval_status, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.approval_status,
        )


# =============================================================================
# Phase 3: Shift / Duty Roster Admin
# =============================================================================


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    """Admin for Shift model — staff shift / duty roster management."""

    list_display = [
        "staff_resource",
        "shift_date",
        "start_time",
        "end_time",
        "shift_type",
        "status_badge",
        "department",
        "facility",
    ]
    list_filter = ["shift_type", "status", "department", "facility"]
    search_fields = [
        "staff_resource__name",
        "staff_resource__code",
        "department",
    ]
    date_hierarchy = "shift_date"
    readonly_fields = ["started_at", "completed_at", "created_at", "updated_at"]
    raw_id_fields = ["facility", "organization", "staff_resource"]

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "SCHEDULED": "#007bff",
            "ACTIVE": "#28a745",
            "COMPLETED": "#6c757d",
            "CANCELLED": "#dc3545",
        }
        color = colors.get(obj.status, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )


@admin.register(SchedulingSettings)
class SchedulingSettingsAdmin(admin.ModelAdmin):
    """Admin for per-facility scheduling settings."""

    list_display = [
        "facility",
        "max_hours_per_week",
        "max_consecutive_days",
        "min_rest_hours",
        "max_night_shifts_per_week",
        "enforce_constraints",
    ]
    list_filter = ["enforce_constraints", "facility"]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["facility", "organization"]


@admin.register(StaffConstraint)
class StaffConstraintAdmin(admin.ModelAdmin):
    """Admin for staff scheduling constraints."""

    list_display = [
        "staff_resource",
        "constraint_type",
        "is_active",
        "effective_from",
        "effective_until",
        "facility",
    ]
    list_filter = ["constraint_type", "is_active", "facility"]
    search_fields = ["staff_resource__name", "reason"]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["facility", "organization", "staff_resource"]
