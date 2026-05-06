"""Admin configuration for Phase L3: Analyzer Interfacing."""

from django.contrib import admin
from django.utils.html import format_html

from .models import AnalyzerDriverTemplate, AnalyzerMessage, InstrumentChannel


@admin.register(InstrumentChannel)
class InstrumentChannelAdmin(admin.ModelAdmin):
    list_display = [
        "instrument",
        "name",
        "protocol",
        "host",
        "port",
        "is_active",
        "connection_status_badge",
        "last_activity_at",
        "facility",
    ]
    list_filter = ["protocol", "is_active", "connection_status", "facility"]
    search_fields = ["name", "instrument__code", "instrument__name", "host"]
    raw_id_fields = ["instrument", "facility", "organization"]
    readonly_fields = [
        "connection_status",
        "last_activity_at",
        "last_error",
        "created_at",
        "updated_at",
    ]

    fieldsets = (
        (
            "Channel Identity",
            {
                "fields": ("instrument", "name", "is_active"),
            },
        ),
        (
            "Protocol Configuration",
            {
                "fields": (
                    "protocol",
                    "direction",
                    "host",
                    "port",
                    "encoding",
                    "config",
                    "field_mapping",
                ),
            },
        ),
        (
            "Status (Read-only)",
            {
                "fields": ("connection_status", "last_activity_at", "last_error"),
            },
        ),
        (
            "Tenant",
            {
                "fields": ("facility", "organization"),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    def connection_status_badge(self, obj):
        colors = {
            "CONNECTED": "#28a745",
            "DISCONNECTED": "#6c757d",
            "ERROR": "#dc3545",
            "IDLE": "#ffc107",
        }
        color = colors.get(obj.connection_status, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_connection_status_display(),
        )

    connection_status_badge.short_description = "Status"


@admin.register(AnalyzerMessage)
class AnalyzerMessageAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "channel",
        "direction",
        "message_type",
        "status_badge",
        "sample_id",
        "test_code",
        "result_value",
        "timestamp",
    ]
    list_filter = ["direction", "message_type", "status", "channel__instrument"]
    search_fields = ["sample_id", "test_code", "raw_data"]
    raw_id_fields = ["channel", "specimen", "lab_order_item", "facility", "organization"]
    readonly_fields = ["created_at", "processed_at"]
    date_hierarchy = "timestamp"

    def status_badge(self, obj):
        colors = {
            "PENDING": "#ffc107",
            "SENT": "#17a2b8",
            "RECEIVED": "#17a2b8",
            "PARSED": "#007bff",
            "APPLIED": "#28a745",
            "FAILED": "#dc3545",
            "REJECTED": "#dc3545",
            "TIMEOUT": "#fd7e14",
        }
        color = colors.get(obj.status, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "Status"


@admin.register(AnalyzerDriverTemplate)
class AnalyzerDriverTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "manufacturer", "model_pattern", "category", "protocol", "is_active"]
    list_filter = ["category", "protocol", "manufacturer", "is_active"]
    search_fields = ["name", "manufacturer", "model_pattern"]
