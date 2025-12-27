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
        "chief_complaint",
        "temperature",
        "pulse",
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
                    "weight",
                    "height",
                )
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
