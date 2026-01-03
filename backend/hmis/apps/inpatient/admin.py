"""
Admin configuration for Inpatient module.

Sprint 1.5-1.6 Track D: Inpatient Foundation
"""

from django.contrib import admin

from .models import Ward, Bed, AdmissionRecommendation


@admin.register(Ward)
class WardAdmin(admin.ModelAdmin):
    """Admin interface for Ward model."""

    list_display = [
        "code",
        "name",
        "ward_type",
        "capacity",
        "daily_rate",
        "is_active",
        "created_at",
    ]
    list_filter = ["ward_type", "is_active", "created_at"]
    search_fields = ["name", "code", "ward_type"]
    readonly_fields = ["created_at", "updated_at"]
    ordering = ["name"]


@admin.register(Bed)
class BedAdmin(admin.ModelAdmin):
    """Admin interface for Bed model."""

    list_display = [
        "bed_number",
        "ward",
        "status",
        "bed_type",
        "status_changed_at",
        "status_changed_by",
    ]
    list_filter = ["status", "ward", "status_changed_at"]
    search_fields = ["bed_number", "ward__name", "ward__code"]
    readonly_fields = ["status_changed_at", "created_at", "updated_at"]
    ordering = ["ward", "bed_number"]


@admin.register(AdmissionRecommendation)
class AdmissionRecommendationAdmin(admin.ModelAdmin):
    """Admin interface for AdmissionRecommendation model."""

    list_display = [
        "encounter",
        "recommended_by",
        "status",
        "urgency",
        "preferred_ward_type",
        "expires_at",
        "created_at",
    ]
    list_filter = ["status", "urgency", "created_at", "expires_at"]
    search_fields = [
        "encounter__patient__first_name",
        "encounter__patient__last_name",
        "encounter__patient__mrn",
        "provisional_diagnosis",
        "reason",
    ]
    readonly_fields = [
        "encounter",
        "recommended_by",
        "resolved_by",
        "resolved_at",
        "created_at",
        "updated_at",
    ]
    ordering = ["-created_at"]
    
    fieldsets = (
        (
            "Recommendation Details",
            {
                "fields": (
                    "encounter",
                    "recommended_by",
                    "reason",
                    "provisional_diagnosis",
                    "provisional_diagnosis_text",
                )
            },
        ),
        (
            "Urgency & Preferences",
            {
                "fields": (
                    "urgency",
                    "preferred_ward_type",
                    "expires_at",
                )
            },
        ),
        (
            "Status & Resolution",
            {
                "fields": (
                    "status",
                    "resolved_by",
                    "resolved_at",
                    "decline_reason",
                )
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
