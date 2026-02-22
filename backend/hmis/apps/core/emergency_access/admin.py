"""
Django Admin configuration for Emergency Access module.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import EmergencyAccess, EmergencyAccessStatus


@admin.register(EmergencyAccess)
class EmergencyAccessAdmin(admin.ModelAdmin):
    """Admin configuration for EmergencyAccess model."""

    list_display = [
        "id",
        "user",
        "patient_mrn",
        "reason",
        "status_badge",
        "requested_at",
        "expires_at",
        "approver",
    ]
    list_filter = [
        "status",
        "reason",
        "requested_at",
        "escalation_sent",
    ]
    search_fields = [
        "user__username",
        "user__first_name",
        "user__last_name",
        "patient__mrn",
        "reason_details",
    ]
    readonly_fields = [
        "user",
        "patient",
        "reason",
        "reason_details",
        "requested_at",
        "expires_at",
        "duration_minutes",
        "ip_address",
        "user_agent",
        "escalation_sent",
        "escalation_sent_at",
    ]
    date_hierarchy = "requested_at"
    ordering = ["-requested_at"]

    fieldsets = [
        (
            "Request Details",
            {
                "fields": [
                    "user",
                    "patient",
                    "reason",
                    "reason_details",
                    "requested_at",
                    "duration_minutes",
                    "expires_at",
                ]
            },
        ),
        (
            "Status",
            {
                "fields": [
                    "status",
                ]
            },
        ),
        (
            "Review/Approval",
            {
                "fields": [
                    "approver",
                    "approved_at",
                    "approval_notes",
                ]
            },
        ),
        (
            "Revocation",
            {
                "fields": [
                    "revoked_by",
                    "revoked_at",
                    "revocation_reason",
                ],
                "classes": ["collapse"],
            },
        ),
        (
            "Technical Details",
            {
                "fields": [
                    "ip_address",
                    "user_agent",
                    "escalation_sent",
                    "escalation_sent_at",
                ],
                "classes": ["collapse"],
            },
        ),
    ]

    def patient_mrn(self, obj: EmergencyAccess) -> str:
        """Display patient MRN."""
        return obj.patient.mrn if obj.patient else "-"

    patient_mrn.short_description = "Patient MRN"

    def status_badge(self, obj: EmergencyAccess) -> str:
        """Display status with color badge."""
        colors = {
            EmergencyAccessStatus.ACTIVE: "#28a745",  # Green
            EmergencyAccessStatus.EXPIRED: "#ffc107",  # Yellow
            EmergencyAccessStatus.REVOKED: "#dc3545",  # Red
            EmergencyAccessStatus.REVIEWED: "#17a2b8",  # Blue
        }
        color = colors.get(obj.status, "#6c757d")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; '
            'border-radius: 4px; font-size: 11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "Status"

    def has_add_permission(self, request):
        """Prevent adding emergency access via admin."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent deleting emergency access records."""
        return False
