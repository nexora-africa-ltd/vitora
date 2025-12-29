"""
Django admin configuration for patients app.
"""

from django.contrib import admin

from .models import EmergencyContact, Patient


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
            "Emergency Contact (Direct)",
            {
                "fields": (
                    "emergency_contact_name",
                    "emergency_contact_phone",
                    "emergency_contact_relationship",
                ),
                "classes": ("collapse",),
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
    search_fields = ["patient__mrn", "patient__first_name", "patient__last_name", "full_name", "phone_number"]
    ordering = ["-created_at"]
    autocomplete_fields = ["patient"]
