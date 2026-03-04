"""
Admin configuration for Triage app.

Registers ERBed model for the ER Bed Board (Phase 3).
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import ERBed


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
