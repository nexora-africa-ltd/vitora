"""Admin configuration for standalone Imaging models."""

from django.contrib import admin

from .models import ExternalImagingOrderRequest, WalkInImagingPatient


@admin.register(WalkInImagingPatient)
class WalkInImagingPatientAdmin(admin.ModelAdmin):
    list_display = [
        "registration_number",
        "first_name",
        "last_name",
        "referring_facility",
        "facility",
        "created_at",
    ]
    list_filter = ["facility", "gender", "created_at"]
    search_fields = ["first_name", "last_name", "registration_number"]
    raw_id_fields = ["linked_patient", "registered_by", "facility", "organization"]
    readonly_fields = ["registration_number", "created_at", "updated_at"]


@admin.register(ExternalImagingOrderRequest)
class ExternalImagingOrderRequestAdmin(admin.ModelAdmin):
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
    raw_id_fields = [
        "walkin_patient",
        "imaging_order",
        "processed_by",
        "facility",
        "organization",
    ]
    readonly_fields = ["created_at", "updated_at"]
