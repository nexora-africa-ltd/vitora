"""
Django admin configuration for patients app.
"""

from django.contrib import admin

from .models import Patient


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    """Admin configuration for Patient model."""

    list_display = ["mrn", "first_name", "last_name", "date_of_birth", "gender", "created_at"]
    list_filter = ["gender", "created_at"]
    search_fields = ["mrn", "first_name", "last_name", "national_id", "phone_number"]
    readonly_fields = ["mrn", "created_at", "updated_at"]
    ordering = ["-created_at"]

    fieldsets = (
        ("Personal Information", {
            "fields": ("first_name", "middle_name", "last_name", "date_of_birth", "gender")
        }),
        ("Contact Information", {
            "fields": ("phone_number", "email", "address")
        }),
        ("Identification", {
            "fields": ("mrn", "national_id")
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )
