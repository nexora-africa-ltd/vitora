"""Admin configuration for the referrals module."""

from django.contrib import admin

from hmis.apps.referrals.models import ClinicalReferral


@admin.register(ClinicalReferral)
class ClinicalReferralAdmin(admin.ModelAdmin):
    """Admin interface for ClinicalReferral."""

    list_display = [
        "referral_number",
        "referral_type",
        "target_service",
        "patient",
        "priority",
        "status",
        "referred_by",
        "created_at",
    ]
    list_filter = [
        "referral_type",
        "target_service",
        "status",
        "priority",
        "is_sensitive",
        "created_at",
    ]
    search_fields = [
        "referral_number",
        "reason",
        "clinical_notes",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
    ]
    ordering = ["-created_at"]
    readonly_fields = [
        "referral_number",
        "referral_type",
        "relevant_diagnoses",
        "relevant_vitals",
        "accepted_at",
        "declined_at",
        "completed_at",
        "linked_module",
        "linked_model",
        "linked_object_id",
        "created_at",
        "updated_at",
    ]
    raw_id_fields = [
        "patient",
        "encounter",
        "referred_by",
        "accepted_by",
        "declined_by",
        "clinic_visit",
    ]
    fieldsets = [
        (
            "Referral Identity",
            {
                "fields": (
                    "referral_number",
                    "referral_type",
                    "target_service",
                    "status",
                    "priority",
                ),
            },
        ),
        (
            "Patient & Encounter",
            {
                "fields": (
                    "patient",
                    "encounter",
                ),
            },
        ),
        (
            "Clinician Input",
            {
                "fields": (
                    "reason",
                    "clinical_notes",
                ),
            },
        ),
        (
            "Clinical Context (Auto-captured)",
            {
                "classes": ("collapse",),
                "fields": (
                    "relevant_diagnoses",
                    "relevant_vitals",
                ),
            },
        ),
        (
            "Admission Details",
            {
                "classes": ("collapse",),
                "fields": (
                    "provisional_diagnosis",
                    "provisional_diagnosis_text",
                    "preferred_ward_type",
                ),
            },
        ),
        (
            "External Referral Details",
            {
                "classes": ("collapse",),
                "fields": (
                    "external_facility_name",
                    "external_facility_code",
                    "referral_letter",
                ),
            },
        ),
        (
            "Tracking",
            {
                "fields": (
                    "referred_by",
                    "accepted_by",
                    "accepted_at",
                    "declined_by",
                    "declined_at",
                    "decline_reason",
                    "completed_at",
                    "expires_at",
                ),
            },
        ),
        (
            "Linked Records",
            {
                "classes": ("collapse",),
                "fields": (
                    "linked_module",
                    "linked_model",
                    "linked_object_id",
                    "clinic_visit",
                ),
            },
        ),
        (
            "Other",
            {
                "fields": (
                    "is_sensitive",
                    "created_at",
                    "updated_at",
                ),
            },
        ),
    ]
