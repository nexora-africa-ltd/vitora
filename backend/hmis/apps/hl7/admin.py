"""HL7 Endpoint and Message admin configuration."""

from django.contrib import admin
from django.utils.html import format_html

from .models import HL7Endpoint, HL7Message, HL7MessageStatus


@admin.register(HL7Endpoint)
class HL7EndpointAdmin(admin.ModelAdmin):
    """Admin for HL7 endpoint configuration."""

    list_display = [
        "name",
        "endpoint_type",
        "address_display",
        "receiving_facility",
        "active_badge",
        "facility",
        "created_at",
    ]
    list_filter = ["endpoint_type", "is_active", "facility"]
    search_fields = ["name", "mllp_host", "receiving_facility"]
    raw_id_fields = ["facility", "organization"]
    readonly_fields = ["created_at", "updated_at"]
    ordering = ["name"]

    fieldsets = [
        (
            "Endpoint",
            {
                "fields": [
                    "name",
                    "endpoint_type",
                    "is_active",
                    "notes",
                ]
            },
        ),
        (
            "Connection",
            {
                "fields": [
                    "mllp_host",
                    "mllp_port",
                    "use_ssl",
                    "timeout",
                    "max_retries",
                ]
            },
        ),
        (
            "HL7 Header Fields",
            {
                "fields": [
                    "sending_application",
                    "sending_facility",
                    "receiving_application",
                    "receiving_facility",
                    "lis_code_system",
                ]
            },
        ),
        (
            "Scope",
            {
                "fields": ["facility", "organization"],
            },
        ),
        (
            "Timestamps",
            {
                "fields": ["created_at", "updated_at"],
            },
        ),
    ]

    def address_display(self, obj):
        return obj.address

    address_display.short_description = "Address"

    def active_badge(self, obj):
        if obj.is_active:
            return format_html(
                '<span style="color: white; background: #059669; padding: 2px 8px; '
                'border-radius: 4px; font-size: 11px;">Active</span>'
            )
        return format_html(
            '<span style="color: white; background: #6b7280; padding: 2px 8px; '
            'border-radius: 4px; font-size: 11px;">Inactive</span>'
        )

    active_badge.short_description = "Status"


@admin.register(HL7Message)
class HL7MessageAdmin(admin.ModelAdmin):
    """Admin for HL7 message log."""

    list_display = [
        "message_control_id",
        "message_type",
        "direction",
        "status_badge",
        "resource_type",
        "resource_id",
        "retry_count",
        "created_at",
    ]
    list_filter = ["direction", "status", "message_type", "created_at"]
    search_fields = ["message_control_id", "resource_type", "raw_message"]
    readonly_fields = [
        "message_control_id",
        "raw_message",
        "ack_code",
        "sent_at",
        "acknowledged_at",
        "created_at",
        "updated_at",
    ]
    ordering = ["-created_at"]
    date_hierarchy = "created_at"
    actions = ["retry_failed"]

    fieldsets = [
        (
            "Message",
            {
                "fields": [
                    "message_type",
                    "direction",
                    "message_control_id",
                    "raw_message",
                ]
            },
        ),
        (
            "Status",
            {
                "fields": [
                    "status",
                    "ack_code",
                    "retry_count",
                    "max_retries",
                    "last_error",
                    "next_retry_at",
                ]
            },
        ),
        (
            "Source",
            {
                "fields": ["resource_type", "resource_id"],
            },
        ),
        (
            "Destination",
            {
                "fields": ["destination_host", "destination_port"],
            },
        ),
        (
            "Timestamps",
            {
                "fields": ["sent_at", "acknowledged_at", "created_at", "updated_at"],
            },
        ),
    ]

    def status_badge(self, obj):
        """Display status with colored badge."""
        colors = {
            HL7MessageStatus.PENDING: "#6b7280",
            HL7MessageStatus.SENDING: "#3b82f6",
            HL7MessageStatus.SENT: "#10b981",
            HL7MessageStatus.ACKNOWLEDGED: "#059669",
            HL7MessageStatus.FAILED: "#ef4444",
            HL7MessageStatus.DEAD_LETTER: "#991b1b",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="color: white; background: {}; padding: 2px 8px; '
            'border-radius: 4px; font-size: 11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "Status"

    @admin.action(description="Retry failed messages")
    def retry_failed(self, request, queryset):
        """Reset failed messages for retry."""
        from django.utils import timezone

        count = queryset.filter(
            status=HL7MessageStatus.FAILED,
        ).update(
            status=HL7MessageStatus.PENDING,
            next_retry_at=timezone.now(),
        )
        self.message_user(request, f"{count} message(s) queued for retry.")
