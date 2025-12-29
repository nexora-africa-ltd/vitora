"""
Admin configuration for core app.
"""

from django.contrib import admin

from .models import (
    AuditLog,
    County,
    NetworkStatus,
    SubCounty,
    SyncConflict,
    SyncMetrics,
    SyncQueue,
    Ward,
)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Admin configuration for AuditLog model."""

    list_display = [
        "timestamp",
        "user",
        "action",
        "resource_type",
        "resource_id",
        "ip_address",
    ]
    list_filter = ["action", "resource_type", "timestamp"]
    search_fields = ["user__username", "action", "resource_type", "ip_address"]
    readonly_fields = [
        "user",
        "action",
        "resource_type",
        "resource_id",
        "timestamp",
        "ip_address",
        "user_agent",
        "details",
        "patient_id",
    ]
    date_hierarchy = "timestamp"
    ordering = ["-timestamp"]

    def has_add_permission(self, request):
        """Prevent manual creation of audit logs."""
        return False

    def has_change_permission(self, request, obj=None):
        """Prevent modification of audit logs."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of audit logs."""
        return False


@admin.register(County)
class CountyAdmin(admin.ModelAdmin):
    """Admin configuration for County model."""

    list_display = ["code", "name"]
    search_fields = ["name", "code"]
    ordering = ["code"]


@admin.register(SubCounty)
class SubCountyAdmin(admin.ModelAdmin):
    """Admin configuration for SubCounty model."""

    list_display = ["name", "county"]
    list_filter = ["county"]
    search_fields = ["name", "county__name"]
    ordering = ["county", "name"]


@admin.register(Ward)
class WardAdmin(admin.ModelAdmin):
    """Admin configuration for Ward model."""

    list_display = ["name", "sub_county", "get_county"]
    list_filter = ["sub_county__county", "sub_county"]
    search_fields = ["name", "sub_county__name", "sub_county__county__name"]
    ordering = ["sub_county__county", "sub_county", "name"]

    @admin.display(description="County")
    def get_county(self, obj):
        """Return county name."""
        return obj.sub_county.county.name


@admin.register(SyncQueue)
class SyncQueueAdmin(admin.ModelAdmin):
    """Admin configuration for SyncQueue model."""

    list_display = [
        "id",
        "operation",
        "model_name",
        "record_id",
        "status",
        "created_at",
        "retry_count",
    ]
    list_filter = ["operation", "model_name", "status", "created_at"]
    search_fields = ["model_name", "record_id"]
    readonly_fields = ["created_at", "last_attempted_at"]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]


@admin.register(SyncConflict)
class SyncConflictAdmin(admin.ModelAdmin):
    """Admin configuration for SyncConflict model."""

    list_display = [
        "id",
        "model_name",
        "record_id",
        "conflict_type",
        "resolved",
        "detected_at",
    ]
    list_filter = ["model_name", "conflict_type", "resolved", "detected_at"]
    search_fields = ["model_name", "record_id"]
    readonly_fields = ["detected_at", "resolved_at"]
    date_hierarchy = "detected_at"
    ordering = ["-detected_at"]


@admin.register(NetworkStatus)
class NetworkStatusAdmin(admin.ModelAdmin):
    """Admin configuration for NetworkStatus model."""

    list_display = ["id", "is_online", "last_checked", "last_online"]
    readonly_fields = ["last_checked", "last_online"]

    def has_add_permission(self, request):
        """Only allow one NetworkStatus record."""
        return not NetworkStatus.objects.exists()


@admin.register(SyncMetrics)
class SyncMetricsAdmin(admin.ModelAdmin):
    """Admin configuration for SyncMetrics model."""

    list_display = [
        "id",
        "sync_started_at",
        "sync_completed_at",
        "records_pushed",
        "records_pulled",
        "conflicts_detected",
        "success",
    ]
    list_filter = ["success", "sync_started_at"]
    readonly_fields = [
        "sync_started_at",
        "sync_completed_at",
        "records_pushed",
        "records_pulled",
        "conflicts_detected",
        "conflicts_resolved",
        "error_message",
    ]
    date_hierarchy = "sync_started_at"
    ordering = ["-sync_started_at"]
