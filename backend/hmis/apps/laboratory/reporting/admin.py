"""Admin configuration for L5 reporting models."""

from django.contrib import admin

from .models import TATSLATarget, TATSnapshot, WorkloadSnapshot


@admin.register(TATSLATarget)
class TATSLATargetAdmin(admin.ModelAdmin):
    list_display = [
        "test",
        "priority",
        "target_total_minutes",
        "is_active",
        "facility",
    ]
    list_filter = ["priority", "is_active", "facility"]
    search_fields = ["test__code", "test__name"]
    raw_id_fields = ["test", "facility", "organization"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(TATSnapshot)
class TATSnapshotAdmin(admin.ModelAdmin):
    list_display = [
        "lab_order",
        "test",
        "priority",
        "tat_total",
        "is_breach",
        "ordered_at",
        "facility",
    ]
    list_filter = ["priority", "is_breach", "facility"]
    search_fields = ["lab_order__order_number", "test__code"]
    raw_id_fields = [
        "lab_order",
        "test",
        "sla_target",
        "resulted_by",
        "verified_by",
        "facility",
        "organization",
    ]
    readonly_fields = ["snapshot_created_at"]
    date_hierarchy = "ordered_at"


@admin.register(WorkloadSnapshot)
class WorkloadSnapshotAdmin(admin.ModelAdmin):
    list_display = [
        "technician",
        "date",
        "tests_entered",
        "tests_verified",
        "specimens_rejected",
        "facility",
    ]
    list_filter = ["facility", "date"]
    search_fields = ["technician__username", "technician__first_name", "technician__last_name"]
    raw_id_fields = ["technician", "facility", "organization"]
    date_hierarchy = "date"
