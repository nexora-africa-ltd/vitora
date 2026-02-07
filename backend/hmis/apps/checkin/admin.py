"""
Admin configuration for the check-in app.
"""

from django.contrib import admin

from .models import CheckIn, CheckInStateHistory


class CheckInStateHistoryInline(admin.TabularInline):
    """Inline for check-in state history."""

    model = CheckInStateHistory
    extra = 0
    readonly_fields = ["from_status", "to_status", "changed_at", "changed_by", "reason"]
    can_delete = False


@admin.register(CheckIn)
class CheckInAdmin(admin.ModelAdmin):
    """Admin for CheckIn model."""

    list_display = [
        "id",
        "patient",
        "destination_type",
        "destination_clinic",
        "visit_type",
        "status",
        "checked_in_at",
        "checked_in_by",
    ]
    list_filter = [
        "destination_type",
        "visit_type",
        "status",
        "checked_in_at",
    ]
    search_fields = [
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
    ]
    readonly_fields = [
        "checked_in_at",
        "created_at",
        "updated_at",
    ]
    raw_id_fields = [
        "patient",
        "encounter",
        "linked_encounter",
        "destination_clinic",
        "checked_in_by",
        "waiting_queue_entry",
        "clinic_visit",
    ]
    inlines = [CheckInStateHistoryInline]
    date_hierarchy = "checked_in_at"

    fieldsets = (
        (
            "Patient & Encounter",
            {
                "fields": (
                    "patient",
                    "encounter",
                    "linked_encounter",
                )
            },
        ),
        (
            "Destination",
            {
                "fields": (
                    "destination_type",
                    "destination_clinic",
                    "skip_triage",
                )
            },
        ),
        (
            "Visit Classification",
            {
                "fields": (
                    "visit_type",
                    "visit_reason",
                )
            },
        ),
        (
            "Status & Timing",
            {
                "fields": (
                    "status",
                    "checked_in_at",
                    "checked_in_by",
                    "identity_method",
                )
            },
        ),
        (
            "Queue Links",
            {
                "fields": (
                    "waiting_queue_entry",
                    "clinic_visit",
                )
            },
        ),
        (
            "Notes",
            {
                "fields": (
                    "chief_complaint",
                    "notes",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(CheckInStateHistory)
class CheckInStateHistoryAdmin(admin.ModelAdmin):
    """Admin for CheckInStateHistory model."""

    list_display = [
        "id",
        "checkin",
        "from_status",
        "to_status",
        "changed_at",
        "changed_by",
    ]
    list_filter = [
        "from_status",
        "to_status",
        "changed_at",
    ]
    search_fields = [
        "checkin__patient__mrn",
        "checkin__patient__first_name",
        "checkin__patient__last_name",
    ]
    readonly_fields = [
        "checkin",
        "from_status",
        "to_status",
        "changed_at",
        "changed_by",
        "reason",
    ]
    date_hierarchy = "changed_at"
