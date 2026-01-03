"""
Django admin configuration for encounters app.
"""

from django.contrib import admin

from .models import (
    Diagnosis,
    Encounter,
    ICD10Code,
    Medication,
    TreatmentPlan,
    TreatmentPlanTemplate,
)


class DiagnosisInline(admin.TabularInline):
    """Inline diagnosis on Encounter admin."""
    model = Diagnosis
    extra = 1
    autocomplete_fields = ['icd10_code']
    readonly_fields = ['diagnosed_by', 'diagnosed_at']


class TreatmentPlanInline(admin.StackedInline):
    """Inline treatment plan on Encounter admin. ✅ IMPLEMENTED"""
    model = TreatmentPlan
    extra = 0
    max_num = 1
    readonly_fields = ['created_by', 'created_at', 'updated_at']

@admin.register(ICD10Code)
class ICD10CodeAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'code',
        'short_description',
        'description',
        'long_description',
        'category',
        'chapter',
        'is_billable',
        'is_active',
    )
    list_filter = ('is_billable', 'is_active')
    search_fields = ['code', 'short_description', 'long_description']
    ordering = ['code']
    readonly_fields = ['code']


@admin.register(Encounter)
class EncounterAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'patient',
        'encounter_type',
        'encounter_date',
        'chief_complaint',
        'temperature',
        'pulse',
        'blood_pressure',
        'respiratory_rate',
        'weight',
        'height',
        'spo2',
        'allergies',
        'chronic_conditions',
        'current_medications',
        'past_surgeries',
        'family_history',
        'social_history',
        'notes',
        'status',
        'finalized_by',
        'finalized_at',
        'cancellation_reason',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'patient',
        'encounter_date',
        'finalized_by',
        'finalized_at',
        'created_at',
        'updated_at',
    )
    date_hierarchy = 'created_at'
    inlines = [DiagnosisInline, TreatmentPlanInline]


@admin.register(Diagnosis)
class DiagnosisAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'encounter',
        'icd10_code',
        'diagnosis_type',
        'free_text_diagnosis',
        'notes',
        'is_confirmed',
        'certainty',
        'diagnosed_by',
        'diagnosed_at',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'encounter',
        'icd10_code',
        'is_confirmed',
        'diagnosed_by',
        'diagnosed_at',
        'created_at',
        'updated_at',
    )
    date_hierarchy = 'created_at'


@admin.register(TreatmentPlan)
class TreatmentPlanAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'encounter',
        'template',
        'medications_json',
        'procedures_json',
        'clinical_notes',
        'follow_up_instructions',
        'follow_up_date',
        'diet_recommendations',
        'activity_restrictions',
        'referral_needed',
        'referral_specialty',
        'referral_notes',
        'status',
        'created_by',
        'approved_by',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'encounter',
        'template',
        'follow_up_date',
        'referral_needed',
        'created_by',
        'approved_by',
        'created_at',
        'updated_at',
    )
    date_hierarchy = 'created_at'


@admin.register(TreatmentPlanTemplate)
class TreatmentPlanTemplateAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'name',
        'description',
        'default_medications',
        'default_procedures',
        'default_instructions',
        'follow_up_days',
        'department',
        'is_active',
        'created_by',
        'created_at',
        'updated_at',
    )
    list_filter = ('is_active', 'created_by', 'created_at', 'updated_at')
    raw_id_fields = ('diagnosis_codes',)
    search_fields = ('name',)
    date_hierarchy = 'created_at'


@admin.register(Medication)
class MedicationAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'treatment_plan',
        'name',
        'dosage',
        'frequency',
        'duration',
        'route',
        'quantity',
        'instructions',
        'start_date',
        'end_date',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'treatment_plan',
        'start_date',
        'end_date',
        'created_at',
        'updated_at',
    )
    search_fields = ('name',)
    date_hierarchy = 'created_at'
