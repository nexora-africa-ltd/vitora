# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Admin configuration for standalone LIS models."""

from django.contrib import admin

from .models import (
    ExternalOrderRequest,
    ExternalPatientIdentifierCrosswalk,
    InboundIngestionEvent,
    ResultDeliveryLog,
    WalkInPatient,
)


@admin.register(WalkInPatient)
class WalkInPatientAdmin(admin.ModelAdmin):
    list_display = [
        "registration_number",
        "first_name",
        "last_name",
        "referring_facility",
        "facility",
        "created_at",
    ]
    list_filter = ["facility", "gender", "created_at"]
    search_fields = [
        "first_name",
        "last_name",
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


@admin.register(ExternalPatientIdentifierCrosswalk)
class ExternalPatientIdentifierCrosswalkAdmin(admin.ModelAdmin):
    list_display = [
        "source_system",
        "external_patient_id",
        "patient_name_snapshot",
        "walkin_patient",
        "patient",
        "facility",
        "updated_at",
    ]
    list_filter = ["source_system", "facility", "created_at"]
    search_fields = ["source_system", "external_patient_id", "external_member_id"]
    raw_id_fields = ["walkin_patient", "patient", "facility", "organization"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(InboundIngestionEvent)
class InboundIngestionEventAdmin(admin.ModelAdmin):
    list_display = [
        "trace_id",
        "source_system",
        "channel",
        "status",
        "external_order",
        "replay_count",
        "facility",
        "created_at",
    ]
    list_filter = ["status", "channel", "source_system", "facility", "created_at"]
    search_fields = ["trace_id", "idempotency_key", "source_system"]
    raw_id_fields = ["external_order", "facility", "organization"]
    readonly_fields = ["trace_id", "created_at", "updated_at"]


@admin.register(ResultDeliveryLog)
class ResultDeliveryLogAdmin(admin.ModelAdmin):
    list_display = [
        "trace_id",
        "channel",
        "status",
        "destination",
        "lab_order",
        "external_order",
        "facility",
        "created_at",
    ]
    list_filter = ["status", "channel", "facility", "created_at"]
    search_fields = ["trace_id", "destination", "lab_order__order_number"]
    raw_id_fields = ["external_order", "lab_order", "requested_by", "facility", "organization"]
    readonly_fields = ["trace_id", "created_at", "updated_at"]
