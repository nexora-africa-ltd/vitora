"""Admin configuration for standalone LIS models."""

from django.contrib import admin

from .models import ExternalOrderRequest, WalkInPatient


@admin.register(WalkInPatient)
class WalkInPatientAdmin(admin.ModelAdmin):
    list_display = [
        "registration_number",
        "first_name",
        "last_name",
        "national_id",
        "phone_number",
        "referring_facility",
        "facility",
        "created_at",
    ]
    list_filter = ["facility", "gender", "created_at"]
    search_fields = [
        "first_name",
        "last_name",
        "national_id",
        "phone_number",
        "registration_number",
    ]
    raw_id_fields = ["linked_patient", "registered_by", "facility", "organization"]
    readonly_fields = ["registration_number", "created_at", "updated_at"]


@admin.register(ExternalOrderRequest)
class ExternalOrderRequestAdmin(admin.ModelAdmin):
    list_display = [
        "placer_order_number",
        "sending_facility",
        "patient_name",
        "status",
        "facility",
        "created_at",
    ]
    list_filter = ["status", "sending_facility", "facility", "created_at"]
    search_fields = ["placer_order_number", "patient_name", "message_control_id"]
    raw_id_fields = ["walkin_patient", "lab_order", "processed_by", "facility", "organization"]
    readonly_fields = ["created_at", "updated_at"]
