# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Django admin configuration for encounters app.
"""

from django.contrib import admin

from hmis.apps.core.mixins import TenantScopedAdminMixin

from .models import (
    ChronicCondition,
    Diagnosis,
    Encounter,
    ICD10Code,
    Medication,
    TreatmentPlan,
    TreatmentPlanTemplate,
    VitalFlagSuggestion,
    VitalFlagSuggestionAction,
)


class DiagnosisInline(admin.TabularInline):
    """Inline diagnosis on Encounter admin."""

    model = Diagnosis
    extra = 1
    autocomplete_fields = ["icd10_code"]
    readonly_fields = ["diagnosed_by", "diagnosed_at"]


class TreatmentPlanInline(admin.StackedInline):
    """Inline treatment plan on Encounter admin. ✅ IMPLEMENTED"""

    model = TreatmentPlan
    extra = 0
    max_num = 1
    readonly_fields = ["created_by", "created_at", "updated_at"]


@admin.register(ICD10Code)
class ICD10CodeAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = (
        "id",
        "code",
        "short_description",
        "description",
        "long_description",
        "category",
        "chapter",
        "is_billable",
        "is_active",
    )
    list_filter = ("is_billable", "is_active")
    search_fields = ["code", "short_description", "long_description"]
    ordering = ["code"]
    readonly_fields = ["code"]


@admin.register(Encounter)
class EncounterAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "patient",
        "encounter_type",
        "encounter_date",
        "chief_complaint",
        "temperature",
        "pulse",
        "blood_pressure",
        "respiratory_rate",
        "weight",
        "height",
        "spo2",
        "allergies",
        "chronic_conditions",
        "current_medications",
        "past_surgeries",
        "family_history",
        "social_history",
        "notes",
        "status",
        "finalized_by",
        "finalized_at",
        "cancellation_reason",
        "created_at",
        "updated_at",
    )
    list_filter = (
        "patient",
        "encounter_date",
        "finalized_by",
        "finalized_at",
        "created_at",
        "updated_at",
    )
    search_fields = (
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "chief_complaint",
        "notes",
    )
    date_hierarchy = "created_at"
    inlines = [DiagnosisInline, TreatmentPlanInline]
    raw_id_fields = (
        "patient",
        "clinic_visit",
        "vitals_recorded_by",
        "clinical_template",
        "finalized_by",
        "created_by",
        "facility",
        "organization",
    )
    list_select_related = ("patient", "finalized_by", "created_by", "facility", "organization")


@admin.register(Diagnosis)
class DiagnosisAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "encounter",
        "icd10_code",
        "diagnosis_type",
        "free_text_diagnosis",
        "notes",
        "is_confirmed",
        "certainty",
        "diagnosed_by",
        "diagnosed_at",
        "created_at",
        "updated_at",
    )
    list_filter = (
        "encounter",
        "icd10_code",
        "is_confirmed",
        "diagnosed_by",
        "diagnosed_at",
        "created_at",
        "updated_at",
    )
    date_hierarchy = "created_at"


@admin.register(TreatmentPlan)
class TreatmentPlanAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "encounter",
        "template",
        "medications_json",
        "procedures_json",
        "clinical_notes",
        "follow_up_instructions",
        "follow_up_date",
        "diet_recommendations",
        "activity_restrictions",
        "referral_needed",
        "referral_specialty",
        "referral_notes",
        "status",
        "created_by",
        "approved_by",
        "created_at",
        "updated_at",
    )
    list_filter = (
        "encounter",
        "template",
        "follow_up_date",
        "referral_needed",
        "created_by",
        "approved_by",
        "created_at",
        "updated_at",
    )
    date_hierarchy = "created_at"


@admin.register(TreatmentPlanTemplate)
class TreatmentPlanTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "description",
        "default_medications",
        "default_procedures",
        "default_instructions",
        "follow_up_days",
        "department",
        "is_active",
        "created_by",
        "created_at",
        "updated_at",
    )
    list_filter = ("is_active", "created_by", "created_at", "updated_at")
    raw_id_fields = ("diagnosis_codes",)
    search_fields = ("name",)
    date_hierarchy = "created_at"


@admin.register(Medication)
class MedicationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "treatment_plan",
        "name",
        "dosage",
        "frequency",
        "duration",
        "route",
        "quantity",
        "instructions",
        "start_date",
        "end_date",
        "created_at",
        "updated_at",
    )
    list_filter = (
        "treatment_plan",
        "start_date",
        "end_date",
        "created_at",
        "updated_at",
    )
    search_fields = ("name",)
    date_hierarchy = "created_at"


@admin.register(VitalFlagSuggestion)
class VitalFlagSuggestionAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin for clinician-reviewable vitals flag suggestions."""

    list_display = (
        "id",
        "flag_key",
        "severity",
        "status",
        "patient",
        "encounter",
        "facility",
        "mapping_status",
        "detected_at",
        "resolved_at",
    )
    list_filter = (
        "severity",
        "status",
        "source_type",
        "mapping_status",
        "facility",
        "organization",
    )
    search_fields = (
        "flag_key",
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
        "encounter__id",
    )
    readonly_fields = ("detected_at", "acknowledged_at", "resolved_at", "created_at", "updated_at")
    raw_id_fields = (
        "patient",
        "encounter",
        "triage_assessment",
        "suggested_icd10",
        "selected_icd10",
        "resolved_by",
        "linked_diagnosis",
        "linked_chronic_condition",
        "facility",
        "organization",
    )
    date_hierarchy = "detected_at"


@admin.register(VitalFlagSuggestionAction)
class VitalFlagSuggestionActionAdmin(admin.ModelAdmin):
    """Admin for immutable VitalFlagSuggestion action log."""

    list_display = (
        "id",
        "suggestion",
        "action_type",
        "from_status",
        "to_status",
        "actor",
        "created_at",
    )
    list_filter = ("action_type", "to_status", "created_at")
    search_fields = (
        "suggestion__flag_key",
        "suggestion__patient__mrn",
        "suggestion__patient__first_name",
        "suggestion__patient__last_name",
        "actor__username",
    )
    raw_id_fields = ("suggestion", "actor")
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"


@admin.register(ChronicCondition)
class ChronicConditionStructuredAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin for structured chronic condition records."""

    list_display = (
        "id",
        "condition_name",
        "status",
        "patient",
        "encounter",
        "facility",
        "created_at",
    )
    list_filter = ("status", "facility", "organization")
    search_fields = (
        "condition_name",
        "icd10_code",
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
    )
    raw_id_fields = ("patient", "encounter", "recorded_by", "facility", "organization")
    date_hierarchy = "created_at"
