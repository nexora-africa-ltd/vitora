"""
Admin configuration for Inpatient module.

Sprint 1.5-1.6 Track D: Inpatient Foundation
"""

from django.contrib import admin

from .models import (
    Ward, 
    Bed, 
    AdmissionRecommendation, 
    Admission, 
    Discharge, 
    Transfer, 
    WardRound,
    NursingKardex,
    KardexShiftNote,
    KardexHandoverNote,
)


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


@admin.register(Admission)
class AdmissionAdmin(admin.ModelAdmin):
    """Admin interface for Admission model."""

    list_display = [
        "admission_number",
        "patient",
        "ward",
        "bed",
        "status",
        "admission_date",
        "attending_doctor",
        "payer_type",
    ]
    list_filter = ["status", "payer_type", "ward", "admission_date"]
    search_fields = [
        "admission_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "admitting_diagnosis",
    ]
    readonly_fields = [
        "admission_number",
        "created_at",
        "updated_at",
    ]
    ordering = ["-admission_date"]
    autocomplete_fields = ["patient", "ward", "bed", "admitting_officer", "attending_doctor"]
    
    fieldsets = (
        (
            "Patient & Encounters",
            {
                "fields": (
                    "patient",
                    "opd_encounter",
                    "ipd_encounter",
                    "recommendation",
                )
            },
        ),
        (
            "Admission Details",
            {
                "fields": (
                    "admission_number",
                    "admission_date",
                    "admitting_diagnosis",
                    "admitting_diagnosis_text",
                    "admitting_officer",
                    "attending_doctor",
                )
            },
        ),
        (
            "Location",
            {
                "fields": (
                    "ward",
                    "bed",
                )
            },
        ),
        (
            "Status & Payment",
            {
                "fields": (
                    "status",
                    "payer_type",
                    "insurance_details",
                    "discharge_date",
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



@admin.register(Discharge)
class DischargeAdmin(admin.ModelAdmin):
    """Admin interface for Discharge model."""

    list_display = [
        "admission",
        "discharge_type",
        "discharge_date",
        "discharged_by",
        "pharmacy_cleared",
        "billing_cleared",
        "length_of_stay_days",
    ]
    list_filter = ["discharge_type", "discharge_date", "pharmacy_cleared", "billing_cleared"]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
        "final_diagnosis",
    ]
    readonly_fields = ["created_at", "updated_at", "length_of_stay_days"]
    ordering = ["-discharge_date"]
    
    fieldsets = (
        (
            "Admission & Discharge",
            {
                "fields": (
                    "admission",
                    "discharge_type",
                    "discharge_date",
                    "discharged_by",
                )
            },
        ),
        (
            "Clinical Summary",
            {
                "fields": (
                    "admission_diagnosis",
                    "final_diagnosis",
                    "final_diagnosis_text",
                    "procedures_performed",
                    "treatment_summary",
                )
            },
        ),
        (
            "Medications & Follow-up",
            {
                "fields": (
                    "discharge_medications",
                    "follow_up_date",
                    "follow_up_instructions",
                )
            },
        ),
        (
            "Referral (if applicable)",
            {
                "fields": (
                    "referral_facility",
                    "referral_reason",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Patient Instructions & Clearances",
            {
                "fields": (
                    "patient_instructions",
                    "pharmacy_cleared",
                    "billing_cleared",
                    "lab_results_acknowledged",
                )
            },
        ),
        (
            "Timestamps & Metrics",
            {
                "fields": ("length_of_stay_days", "created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )
    
    def length_of_stay_days(self, obj):
        """Display length of stay."""
        return f"{obj.length_of_stay} days"
    length_of_stay_days.short_description = "Length of Stay"


@admin.register(Transfer)
class TransferAdmin(admin.ModelAdmin):
    """Admin interface for Transfer model."""

    list_display = [
        "admission",
        "source_ward",
        "destination_ward",
        "reason",
        "transfer_date",
        "transferred_by",
    ]
    list_filter = ["reason", "transfer_date", "source_ward", "destination_ward"]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
        "source_ward__name",
        "destination_ward__name",
    ]
    readonly_fields = ["created_at", "updated_at"]
    ordering = ["-transfer_date"]
    
    fieldsets = (
        (
            "Transfer Details",
            {
                "fields": (
                    "admission",
                    "transfer_date",
                    "transferred_by",
                    "reason",
                    "reason_details",
                )
            },
        ),
        (
            "Source Location",
            {
                "fields": (
                    "source_ward",
                    "source_bed",
                )
            },
        ),
        (
            "Destination Location",
            {
                "fields": (
                    "destination_ward",
                    "destination_bed",
                )
            },
        ),
        (
            "Clinical Handover",
            {
                "fields": ("clinical_handover_notes",)
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


@admin.register(WardRound)
class WardRoundAdmin(admin.ModelAdmin):
    """Admin interface for WardRound model."""

    list_display = [
        "admission",
        "round_date",
        "round_time",
        "conducted_by",
        "condition_status",
        "requires_consultant_review",
    ]
    list_filter = [
        "condition_status",
        "requires_consultant_review",
        "round_date",
    ]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
        "conducted_by__username",
        "subjective",
        "assessment",
    ]
    readonly_fields = ["created_at", "updated_at"]
    ordering = ["-round_date", "-round_time"]

    fieldsets = (
        (
            "Round Details",
            {
                "fields": (
                    "admission",
                    "round_date",
                    "round_time",
                    "conducted_by",
                )
            },
        ),
        (
            "SOAP Notes",
            {
                "fields": (
                    "subjective",
                    "objective",
                    "assessment",
                    "plan",
                )
            },
        ),
        (
            "Patient Status",
            {
                "fields": (
                    "condition_status",
                    "requires_consultant_review",
                    "consultant_specialty",
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


@admin.register(NursingKardex)
class NursingKardexAdmin(admin.ModelAdmin):
    """Admin interface for NursingKardex model."""

    list_display = [
        "admission",
        "fall_risk",
        "pressure_sore_risk",
        "created_at",
        "updated_at",
    ]
    list_filter = ["fall_risk", "pressure_sore_risk", "created_at"]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
        "nursing_problems",
    ]
    readonly_fields = ["admission", "created_at", "updated_at"]
    ordering = ["-created_at"]

    fieldsets = (
        (
            "Admission",
            {
                "fields": ("admission",)
            },
        ),
        (
            "Nursing Care Plan",
            {
                "fields": (
                    "nursing_problems",
                    "interventions",
                    "monitoring_requirements",
                    "care_task_frequency",
                )
            },
        ),
        (
            "Risk Assessments",
            {
                "fields": (
                    "fall_risk",
                    "pressure_sore_risk",
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


class KardexShiftNoteInline(admin.TabularInline):
    """Inline admin for shift notes in Kardex."""
    
    model = KardexShiftNote
    extra = 0
    readonly_fields = ["nurse", "shift", "content", "timestamp"]
    can_delete = False  # Append-only design


class KardexHandoverNoteInline(admin.TabularInline):
    """Inline admin for handover notes in Kardex."""
    
    model = KardexHandoverNote
    extra = 0
    readonly_fields = ["outgoing_nurse", "incoming_nurse", "shift_ending", "pending_tasks", "escalations", "acknowledged_at", "created_at"]
    can_delete = False


@admin.register(KardexShiftNote)
class KardexShiftNoteAdmin(admin.ModelAdmin):
    """Admin interface for KardexShiftNote model."""

    list_display = [
        "kardex",
        "shift",
        "nurse",
        "timestamp",
    ]
    list_filter = ["shift", "timestamp"]
    search_fields = [
        "kardex__admission__admission_number",
        "kardex__admission__patient__first_name",
        "kardex__admission__patient__last_name",
        "nurse__username",
        "content",
    ]
    readonly_fields = ["kardex", "shift", "nurse", "content", "timestamp"]
    ordering = ["-timestamp"]

    def has_add_permission(self, request):
        """Shift notes should be added via Kardex interface."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Shift notes are append-only and cannot be deleted."""
        return False


@admin.register(KardexHandoverNote)
class KardexHandoverNoteAdmin(admin.ModelAdmin):
    """Admin interface for KardexHandoverNote model."""

    list_display = [
        "kardex",
        "outgoing_nurse",
        "incoming_nurse",
        "shift_ending",
        "acknowledged_at",
        "created_at",
    ]
    list_filter = ["shift_ending", "acknowledged_at", "created_at"]
    search_fields = [
        "kardex__admission__admission_number",
        "kardex__admission__patient__first_name",
        "kardex__admission__patient__last_name",
        "outgoing_nurse__username",
        "incoming_nurse__username",
        "pending_tasks",
        "escalations",
    ]
    readonly_fields = ["kardex", "outgoing_nurse", "incoming_nurse", "shift_ending", "pending_tasks", "escalations", "created_at"]
    ordering = ["-created_at"]

    def has_add_permission(self, request):
        """Handover notes should be added via Kardex interface."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Handover notes should not be deleted for audit purposes."""
        return False
