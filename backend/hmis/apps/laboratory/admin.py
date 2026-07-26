# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Django admin configuration for laboratory models.
"""

from django.contrib import admin

from hmis.apps.core.mixins import TenantScopedAdminMixin

from .models import LabOrder, LabOrderItem, LabResult, LOINCCode, Specimen, TestCatalog


@admin.register(TestCatalog)
class TestCatalogAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin interface for Test Catalog."""

    list_display = ("code", "name", "category", "specimen_type", "cost", "facility", "is_active")
    list_filter = ("category", "specimen_type", "is_active", "available_in_house", "facility")
    search_fields = ("code", "name", "short_name", "loinc_code")
    raw_id_fields = ("facility", "organization")
    ordering = ("category", "name")


@admin.register(LOINCCode)
class LOINCCodeAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin interface for LOINC codes."""

    list_display = ("code", "short_name", "component", "system")
    search_fields = ("code", "short_name", "long_common_name", "component")


@admin.register(LabOrder)
class LabOrderAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin interface for Lab Orders."""

    list_display = ("order_number", "patient", "status", "priority", "ordered_at")
    list_filter = ("status", "priority", "order_type", "ordered_at")
    search_fields = ("order_number", "patient__first_name", "patient__last_name", "patient__mrn")
    readonly_fields = ("order_number", "ordered_at", "created_at", "updated_at")
    date_hierarchy = "ordered_at"


@admin.register(LabOrderItem)
class LabOrderItemAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin interface for Lab Order Items."""

    list_display = ("lab_order", "test", "status", "unit_cost")
    list_filter = ("status",)
    search_fields = ("lab_order__order_number", "test__name", "test__code")


@admin.register(LabResult)
class LabResultAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin interface for Lab Results."""

    list_display = (
        "order_item",
        "order_number",
        "patient_name",
        "patient_mrn",
        "facility_name",
        "result_flag",
        "verification_status",
        "entered_at",
    )
    list_filter = (
        "result_flag",
        "verification_status",
        "is_external_result",
        "order_item__lab_order__facility",
    )
    search_fields = (
        "order_item__test__name",
        "order_item__lab_order__order_number",
        "order_item__lab_order__patient__mrn",
        "order_item__lab_order__patient__first_name",
        "order_item__lab_order__patient__last_name",
    )
    readonly_fields = (
        "order_number",
        "patient_name",
        "patient_mrn",
        "facility_name",
        "entered_at",
        "created_at",
        "updated_at",
    )
    list_select_related = (
        "order_item__lab_order__patient",
        "order_item__lab_order__facility",
        "order_item__test",
        "entered_by",
        "verified_by",
    )

    @admin.display(description="Order #", ordering="order_item__lab_order__order_number")
    def order_number(self, obj):
        return obj.order_item.lab_order.order_number

    @admin.display(description="Patient", ordering="order_item__lab_order__patient__last_name")
    def patient_name(self, obj):
        patient = getattr(obj.order_item.lab_order, "patient", None)
        if not patient:
            return "-"
        return patient.full_name

    @admin.display(description="MRN", ordering="order_item__lab_order__patient__mrn")
    def patient_mrn(self, obj):
        patient = getattr(obj.order_item.lab_order, "patient", None)
        if not patient:
            return "-"
        return patient.mrn

    @admin.display(description="Facility", ordering="order_item__lab_order__facility__name")
    def facility_name(self, obj):
        facility = getattr(obj.order_item.lab_order, "facility", None)
        if not facility:
            return "-"
        return facility.name


@admin.register(Specimen)
class SpecimenAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin interface for Specimens."""

    list_display = ("barcode", "specimen_type", "status", "lab_order", "collected_at")
    list_filter = ("specimen_type", "status")
    search_fields = ("barcode", "lab_order__order_number")
