"""
Django admin configuration for encounters app.
"""

from django.contrib import admin

from .models import Encounter


@admin.register(Encounter)
class EncounterAdmin(admin.ModelAdmin):
    """Admin configuration for Encounter model."""

    list_display = [
        "patient",
        "encounter_type",
        "encounter_date",
        "chief_complaint_short",
        "temperature",
        "pulse",
        "spo2",
        "has_critical_vitals",
        "created_at",
    ]
    list_filter = ["encounter_type", "encounter_date", "created_at"]
    search_fields = [
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
        "chief_complaint",
    ]
    readonly_fields = ["created_at", "updated_at"]
    ordering = ["-encounter_date", "-created_at"]
    autocomplete_fields = ["patient"]

    fieldsets = (
        (
            "Encounter Information",
            {"fields": ("patient", "encounter_type", "encounter_date", "chief_complaint")},
        ),
        (
            "Vital Signs",
            {
                "fields": (
                    "temperature",
                    "pulse",
                    "blood_pressure",
                    "respiratory_rate",
                    "spo2",
                    "weight",
                    "height",
                )
            },
        ),
        (
            "Medical History",
            {
                "fields": (
                    "allergies",
                    "chronic_conditions",
                    "current_medications",
                    "past_surgeries",
                    "family_history",
                    "social_history",
                ),
                "classes": ("collapse",),
            },
        ),
        ("Clinical Notes", {"fields": ("notes",)}),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    @admin.display(description="Chief Complaint", ordering="chief_complaint")
    def chief_complaint_short(self, obj):
        """Return truncated chief complaint."""
        return obj.chief_complaint[:50] + "..." if len(obj.chief_complaint) > 50 else obj.chief_complaint

    @admin.display(description="Critical", boolean=True)
    def has_critical_vitals(self, obj):
        """Return whether encounter has critical vitals."""
        return obj.has_critical_vitals()
