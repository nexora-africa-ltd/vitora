"""Admin configuration for Critical Value Management."""

from django.contrib import admin
from django.utils.html import format_html

from .models import CriticalValueNotification, CriticalValueRange


@admin.register(CriticalValueRange)
class CriticalValueRangeAdmin(admin.ModelAdmin):
    list_display = [
        "test",
        "critical_low",
        "critical_high",
        "panic_low",
        "panic_high",
        "notification_deadline_minutes",
        "is_active",
        "facility",
    ]
    list_filter = ["is_active", "facility"]
    search_fields = ["test__name", "test__code"]
    raw_id_fields = ["test", "facility"]


@admin.register(CriticalValueNotification)
class CriticalValueNotificationAdmin(admin.ModelAdmin):
    list_display = [
        "pk",
        "status_badge",
        "severity_badge",
        "test_name",
        "critical_value",
        "patient_name",
        "notification_method",
        "notified_to_name",
        "read_back_verified",
        "detected_at",
        "notified_at",
        "facility",
    ]
    list_filter = ["status", "severity", "notification_method", "read_back_verified", "facility"]
    search_fields = ["test_name", "patient_name", "critical_value"]
    raw_id_fields = [
        "result",
        "critical_range",
        "notified_to",
        "notified_by",
        "escalated_to",
        "facility",
    ]
    readonly_fields = ["detected_at", "notified_at", "read_back_at", "acknowledged_at"]

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "PENDING": "#f59e0b",
            "NOTIFIED": "#3b82f6",
            "READ_BACK": "#8b5cf6",
            "ACKNOWLEDGED": "#22c55e",
            "ESCALATED": "#ef4444",
            "FAILED": "#dc2626",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    @admin.display(description="Severity")
    def severity_badge(self, obj):
        colors = {
            "CRITICAL": "#ef4444",
            "PANIC": "#dc2626",
        }
        color = colors.get(obj.severity, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            color,
            obj.get_severity_display(),
        )
