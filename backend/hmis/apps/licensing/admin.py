# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Django admin configuration for the licensing module.

Provides admin views for managing installations, release manifests,
and check-in logs.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import CheckInLog, Installation, ReleaseManifest


@admin.register(Installation)
class InstallationAdmin(admin.ModelAdmin):
    """Admin for hub installations."""

    list_display = [
        "name_or_id",
        "organization",
        "status_badge",
        "app_version",
        "last_check_in",
        "tamper_badge",
        "check_in_count",
    ]
    list_filter = ["status", "organization"]
    search_fields = ["installation_id", "name", "hostname", "organization__name"]
    readonly_fields = [
        "installation_id",
        "status",
        "activated_at",
        "activated_by",
        "last_check_in",
        "check_in_ip",
        "check_in_count",
        "hardware_fingerprint",
        "binary_manifest_id",
        "tamper_flagged_at",
        "tamper_resolved_at",
        "last_reported_hashes",
        "license_jwt",
        "revocation_epoch",
        "created_at",
        "updated_at",
    ]
    raw_id_fields = ["organization", "facility", "activated_by"]
    fieldsets = (
        (
            "Identity",
            {
                "fields": (
                    "installation_id",
                    "name",
                    "organization",
                    "facility",
                    "status",
                    "activation_code",
                )
            },
        ),
        (
            "Check-in Status",
            {
                "fields": (
                    "last_check_in",
                    "check_in_ip",
                    "check_in_count",
                    "app_version",
                    "os_info",
                    "hostname",
                )
            },
        ),
        (
            "Integrity & Security",
            {
                "fields": (
                    "hardware_fingerprint",
                    "binary_manifest_id",
                    "tamper_flagged_at",
                    "tamper_resolved_at",
                    "revocation_epoch",
                    "last_reported_hashes",
                )
            },
        ),
        (
            "Revocation",
            {
                "fields": ("revoked_at", "revoked_reason"),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("activated_at", "activated_by", "created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )
    actions = ["revoke_installations", "clear_tamper_flag"]

    @admin.display(description="Installation")
    def name_or_id(self, obj):
        return obj.name or obj.installation_id[:20] or "(pending)"

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "ACTIVE": "#28a745",
            "PENDING": "#ffc107",
            "SUSPENDED": "#fd7e14",
            "REVOKED": "#dc3545",
        }
        color = colors.get(obj.status, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )

    @admin.display(description="Integrity")
    def tamper_badge(self, obj):
        if obj.tamper_flagged_at and not obj.tamper_resolved_at:
            return format_html('<span style="color: #dc3545; font-weight: bold;">⚠ TAMPERED</span>')
        return format_html('<span style="color: #28a745;">✓ OK</span>')

    @admin.action(description="Revoke selected installations")
    def revoke_installations(self, request, queryset):
        for installation in queryset.exclude(status=Installation.Status.REVOKED):
            installation.revoke(reason=f"Bulk revoke by {request.user.username}")
        self.message_user(request, f"Revoked {queryset.count()} installations.")

    @admin.action(description="Clear tamper flag")
    def clear_tamper_flag(self, request, queryset):
        count = 0
        for installation in queryset.filter(tamper_flagged_at__isnull=False):
            installation.clear_tamper()
            count += 1
        self.message_user(request, f"Cleared tamper flag on {count} installations.")


@admin.register(ReleaseManifest)
class ReleaseManifestAdmin(admin.ModelAdmin):
    """Admin for release integrity manifests."""

    list_display = ["manifest_id", "version", "file_count", "published_at", "signed_by"]
    search_fields = ["version", "manifest_id"]
    readonly_fields = ["created_at", "updated_at"]

    @admin.display(description="Files")
    def file_count(self, obj):
        return len(obj.file_hashes) if obj.file_hashes else 0


@admin.register(CheckInLog)
class CheckInLogAdmin(admin.ModelAdmin):
    """Admin for check-in audit logs."""

    list_display = [
        "installation",
        "app_version",
        "hostname",
        "ip_address",
        "integrity_badge",
        "created_at",
    ]
    list_filter = ["integrity_match", "token_issued"]
    search_fields = ["installation__installation_id", "installation__name", "hostname"]
    readonly_fields = [
        "installation",
        "ip_address",
        "hostname",
        "app_version",
        "os_info",
        "uptime_seconds",
        "user_count_24h",
        "encounter_count_24h",
        "hardware_fingerprint",
        "binary_hashes",
        "integrity_match",
        "token_issued",
        "notes",
        "created_at",
    ]
    date_hierarchy = "created_at"

    @admin.display(description="Integrity")
    def integrity_badge(self, obj):
        if obj.integrity_match is None:
            return format_html('<span style="color: #6c757d;">—</span>')
        if obj.integrity_match:
            return format_html('<span style="color: #28a745;">✓</span>')
        return format_html('<span style="color: #dc3545;">✗ MISMATCH</span>')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
