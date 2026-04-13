"""
Admin configuration for Triage app.

Registers ERBed, WaitTimeBreach, Escalation models for the admin panel.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import ERBed, Escalation, TriageSettings, WaitTimeBreach


@admin.register(TriageSettings)
class TriageSettingsAdmin(admin.ModelAdmin):
    """Admin for per-facility triage configuration."""

    list_display = ["facility", "auto_route_to_room", "triage_department", "updated_at"]
    list_filter = ["auto_route_to_room"]
    list_select_related = ["facility", "triage_department"]
    raw_id_fields = ["facility", "triage_department"]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = (
        ("Facility", {"fields": ("facility",)}),
        ("Routing", {"fields": ("auto_route_to_room", "triage_department")}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(ERBed)
class ERBedAdmin(admin.ModelAdmin):
    """Admin for ER Beds with colored status badges."""

    list_display = [
        "bed_number",
        "zone",
        "colored_status",
        "current_patient",
        "status_changed_at",
    ]
    list_filter = ["zone", "status"]
    search_fields = ["bed_number", "current_patient__first_name", "current_patient__last_name"]
    raw_id_fields = ["current_patient", "current_triage_assessment", "status_changed_by"]
    readonly_fields = ["status_changed_at", "created_at"]

    fieldsets = (
        (
            "Bed Information",
            {"fields": ("zone", "bed_number", "status", "notes")},
        ),
        (
            "Current Occupant",
            {"fields": ("current_patient", "current_triage_assessment")},
        ),
        (
            "Audit",
            {"fields": ("status_changed_at", "status_changed_by", "created_at")},
        ),
    )

    @admin.display(description="Status")
    def colored_status(self, obj):
        """Display colored status badge."""
        colors = {
            "AVAILABLE": "#22c55e",      # green
            "OCCUPIED": "#ef4444",       # red
            "CLEANING": "#f59e0b",       # amber
            "OUT_OF_SERVICE": "#6b7280", # gray
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 4px; font-size: 11px; font-weight: 600;">{}</span>',
            color,
            obj.get_status_display(),
        )


@admin.register(WaitTimeBreach)
class WaitTimeBreachAdmin(admin.ModelAdmin):
    """Admin for Wait Time Breach alerts with colored severity badges."""

    list_display = [
        "id",
        "colored_severity",
        "triage_category",
        "patient",
        "actual_wait_minutes",
        "target_wait_minutes",
        "colored_breach_status",
        "assigned_area",
        "created_at",
    ]
    list_filter = ["severity", "status", "triage_category", "assigned_area"]
    search_fields = ["patient__first_name", "patient__last_name", "patient__mrn"]
    raw_id_fields = ["queue_entry", "triage_assessment", "patient", "acknowledged_by"]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = (
        (
            "Breach Details",
            {
                "fields": (
                    "queue_entry", "triage_assessment", "patient",
                    "triage_category", "severity",
                    "target_wait_minutes", "actual_wait_minutes",
                    "assigned_area",
                )
            },
        ),
        (
            "Status",
            {"fields": ("status", "acknowledged_by", "acknowledged_at", "notes")},
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at")},
        ),
    )

    @admin.display(description="Severity")
    def colored_severity(self, obj):
        colors = {
            "CRITICAL": "#ef4444",  # red
            "URGENT": "#f97316",    # orange
            "WARNING": "#eab308",   # yellow
            "INFO": "#6b7280",      # gray
        }
        color = colors.get(obj.severity, "#6b7280")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 4px; font-size: 11px; font-weight: 600;">{}</span>',
            color,
            obj.severity,
        )

    @admin.display(description="Status")
    def colored_breach_status(self, obj):
        colors = {
            "ACTIVE": "#ef4444",        # red
            "ACKNOWLEDGED": "#f59e0b",  # amber
            "ESCALATED": "#f97316",     # orange
            "RESOLVED": "#22c55e",      # green
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 4px; font-size: 11px; font-weight: 600;">{}</span>',
            color,
            obj.status,
        )


@admin.register(Escalation)
class EscalationAdmin(admin.ModelAdmin):
    """Admin for Escalation records with colored status badges."""

    list_display = [
        "id",
        "escalation_type",
        "patient",
        "triage_category",
        "colored_escalation_status",
        "escalated_by",
        "assigned_area",
        "created_at",
    ]
    list_filter = ["escalation_type", "status", "triage_category", "assigned_area"]
    search_fields = ["patient__first_name", "patient__last_name", "patient__mrn", "reason"]
    raw_id_fields = [
        "queue_entry", "triage_assessment", "patient",
        "escalated_by", "resolved_by",
    ]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = (
        (
            "Escalation Details",
            {
                "fields": (
                    "queue_entry", "triage_assessment", "patient",
                    "escalation_type", "reason",
                    "triage_category", "assigned_area",
                    "wait_time_at_escalation",
                )
            },
        ),
        (
            "Status",
            {
                "fields": (
                    "status", "escalated_by",
                    "resolved_by", "resolved_at", "resolution_notes",
                )
            },
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at")},
        ),
    )

    @admin.display(description="Status")
    def colored_escalation_status(self, obj):
        colors = {
            "PENDING": "#ef4444",       # red
            "IN_PROGRESS": "#f59e0b",   # amber
            "RESOLVED": "#22c55e",      # green
            "DISMISSED": "#6b7280",     # gray
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 4px; font-size: 11px; font-weight: 600;">{}</span>',
            color,
            obj.get_status_display(),
        )
