"""
Django admin configuration for patients app.
"""

from django.contrib import admin

from .models import Allergy, EmergencyContact, Patient


class EmergencyContactInline(admin.TabularInline):
    """Inline admin for EmergencyContact on Patient page."""

    model = EmergencyContact
    extra = 0
    max_num = 3
    fields = ["full_name", "phone_number", "relationship", "alternative_phone"]


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    """Admin configuration for Patient model."""

    list_display = [
        "mrn",
        "first_name",
        "last_name",
        "date_of_birth",
        "gender",
        "county",
        "referral_source",
        "created_at",
    ]
    list_filter = ["gender", "referral_source", "county", "is_sensitive", "created_at"]
    search_fields = ["mrn", "first_name", "last_name", "national_id", "phone_number"]
    readonly_fields = ["mrn", "registered_by", "created_at", "updated_at"]
    ordering = ["-created_at"]
    inlines = [EmergencyContactInline]
    autocomplete_fields = ["county", "sub_county", "ward"]

    fieldsets = (
        (
            "Personal Information",
            {"fields": ("first_name", "middle_name", "last_name", "date_of_birth", "gender")},
        ),
        ("Contact Information", {"fields": ("phone_number", "email", "address")}),
        (
            "Location",
            {"fields": ("county", "sub_county", "ward", "village")},
        ),
        ("Identification", {"fields": ("mrn", "national_id")}),
        (
            "Referral & Registration",
            {"fields": ("referral_source", "referred_from_facility", "registered_by")},
        ),
        (
            "Privacy & Consent",
            {
                "fields": ("is_sensitive", "consent_given", "consent_date"),
                "classes": ("collapse",),
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


@admin.register(EmergencyContact)
class EmergencyContactAdmin(admin.ModelAdmin):
    """Admin configuration for EmergencyContact model."""

    list_display = ["patient", "full_name", "phone_number", "relationship"]
    list_filter = ["relationship"]
    search_fields = [
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
        "full_name",
        "phone_number",
    ]
    ordering = ["-created_at"]
    autocomplete_fields = ["patient"]


class AllergyInline(admin.TabularInline):
    """Inline admin for Allergy on Patient page."""

    model = Allergy
    extra = 0
    fields = [
        "substance",
        "substance_type",
        "reaction_type",
        "severity",
        "status",
        "onset_date",
    ]
    readonly_fields = ["recorded_by", "created_at"]


@admin.register(Allergy)
class AllergyAdmin(admin.ModelAdmin):
    """Admin configuration for Allergy model."""

    list_display = [
        "patient",
        "substance",
        "substance_type",
        "reaction_type",
        "severity",
        "status",
        "verification_status",
        "created_at",
    ]
    list_filter = [
        "substance_type",
        "severity",
        "status",
        "verification_status",
        "reaction_type",
    ]
    search_fields = [
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
        "substance",
        "substance_code",
    ]
    readonly_fields = ["recorded_by", "created_at", "updated_at"]
    ordering = ["-created_at"]
    autocomplete_fields = ["patient", "drug", "source_encounter"]

    fieldsets = (
        (
            "Patient & Substance",
            {
                "fields": (
                    "patient",
                    "substance",
                    "substance_type",
                    "drug",
                    "substance_code",
                    "substance_code_system",
                )
            },
        ),
        (
            "Reaction Details",
            {
                "fields": (
                    "reaction_type",
                    "reaction_description",
                    "severity",
                    "criticality",
                )
            },
        ),
        (
            "Status & Dates",
            {
                "fields": (
                    "status",
                    "verification_status",
                    "onset_date",
                    "last_occurrence",
                )
            },
        ),
        (
            "Source & Notes",
            {
                "fields": (
                    "source_encounter",
                    "recorded_by",
                    "notes",
                ),
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
