"""
Django admin configuration for encounters app.
"""

from django.contrib import admin

from .models import (
    Diagnosis,
    Encounter,
    ICD10Code,
    TreatmentPlan,
    TreatmentPlanTemplate,
)


class DiagnosisInline(admin.TabularInline):
    """Inline admin for diagnoses in encounter."""

    model = Diagnosis
    extra = 0
    fields = [
        "icd10_code",
        "diagnosis_type",
        "certainty",
        "is_confirmed",
        "diagnosed_by",
        "notes",
    ]
    autocomplete_fields = ["icd10_code", "diagnosed_by"]
    readonly_fields = ["created_at"]


class TreatmentPlanInline(admin.StackedInline):
    """Inline admin for treatment plan in encounter."""

    model = TreatmentPlan
    extra = 0
    fields = [
        "template",
        "clinical_notes",
        "follow_up_instructions",
        "follow_up_date",
        "lifestyle_recommendations",
        "referral_notes",
        "patient_education",
    ]
    autocomplete_fields = ["template"]


@admin.register(ICD10Code)
class ICD10CodeAdmin(admin.ModelAdmin):
    """Admin configuration for ICD10Code model."""

    list_display = [
        "code",
        "short_description",
        "category",
        "chapter",
        "is_billable",
        "is_active",
    ]
    list_filter = ["chapter", "category", "is_billable", "is_active"]
    search_fields = ["code", "description", "short_description", "category"]
    ordering = ["code"]

    fieldsets = (
        (
            "Code Information",
            {"fields": ("code", "short_description", "description", "long_description")},
        ),
        (
            "Classification",
            {"fields": ("category", "chapter", "is_billable", "is_active")},
        ),
    )


@admin.register(TreatmentPlanTemplate)
class TreatmentPlanTemplateAdmin(admin.ModelAdmin):
    """Admin configuration for TreatmentPlanTemplate model."""

    list_display = [
        "name",
        "department",
        "follow_up_days",
        "is_active",
        "created_by",
        "created_at",
    ]
    list_filter = ["department", "is_active", "created_at"]
    search_fields = ["name", "description", "department"]
    filter_horizontal = ["diagnosis_codes"]
    ordering = ["name"]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = (
        (
            "Template Information",
            {"fields": ("name", "description", "department", "is_active")},
        ),
        (
            "Associated Diagnoses",
            {"fields": ("diagnosis_codes",)},
        ),
        (
            "Default Values",
            {
                "fields": (
                    "default_medications",
                    "default_procedures",
                    "default_instructions",
                    "follow_up_days",
                )
            },
        ),
        (
            "Metadata",
            {
                "fields": ("created_by", "created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )


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
    inlines = [DiagnosisInline, TreatmentPlanInline]

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
        return (
            obj.chief_complaint[:50] + "..."
            if len(obj.chief_complaint) > 50
            else obj.chief_complaint
        )

    @admin.display(description="Critical", boolean=True)
    def has_critical_vitals(self, obj):
        """Return whether encounter has critical vitals."""
        return obj.has_critical_vitals()
