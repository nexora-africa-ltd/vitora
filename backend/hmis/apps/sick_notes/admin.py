from django.contrib import admin

from hmis.apps.sick_notes.models import SickNote


@admin.register(SickNote)
class SickNoteAdmin(admin.ModelAdmin):
    list_display = [
        "note_number",
        "patient",
        "status",
        "diagnosis_text",
        "leave_start_date",
        "leave_end_date",
        "issued_by",
        "facility",
        "created_at",
    ]
    list_filter = ["status", "facility", "leave_start_date"]
    search_fields = [
        "note_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "diagnosis_text",
    ]
    ordering = ["-created_at"]
    readonly_fields = [
        "note_number",
        "issued_at",
        "revoked_at",
        "cancelled_at",
        "created_at",
        "updated_at",
    ]
    raw_id_fields = [
        "patient",
        "encounter",
        "issued_by",
        "revoked_by",
        "cancelled_by",
        "facility",
        "organization",
    ]
    fieldsets = [
        (
            "Identity",
            {"fields": ("note_number", "status", "patient", "encounter")},
        ),
        (
            "Leave Details",
            {
                "fields": (
                    "leave_start_date",
                    "leave_end_date",
                    "diagnosis_text",
                    "diagnosis_code",
                )
            },
        ),
        (
            "Employer",
            {"fields": ("employer_name", "employer_contact")},
        ),
        (
            "Clinical",
            {"fields": ("recommendations", "notes")},
        ),
        (
            "Workflow",
            {
                "fields": (
                    "issued_by",
                    "issued_at",
                    "revoked_by",
                    "revoked_at",
                    "revoke_reason",
                    "cancelled_by",
                    "cancelled_at",
                )
            },
        ),
        (
            "Tenant",
            {"fields": ("facility", "organization")},
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at")},
        ),
    ]
