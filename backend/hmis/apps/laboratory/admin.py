"""
Django admin configuration for laboratory models.
"""

from django.contrib import admin

from .models import LabOrder, LabOrderItem, LabResult, LOINCCode, TestCatalog


@admin.register(TestCatalog)
class TestCatalogAdmin(admin.ModelAdmin):
    """Admin interface for Test Catalog."""

    list_display = ("code", "name", "category", "specimen_type", "cost", "is_active")
    list_filter = ("category", "specimen_type", "is_active", "available_in_house")
    search_fields = ("code", "name", "short_name", "loinc_code")
    ordering = ("category", "name")


@admin.register(LOINCCode)
class LOINCCodeAdmin(admin.ModelAdmin):
    """Admin interface for LOINC codes."""

    list_display = ("code", "short_name", "component", "system")
    search_fields = ("code", "short_name", "long_common_name", "component")


@admin.register(LabOrder)
class LabOrderAdmin(admin.ModelAdmin):
    """Admin interface for Lab Orders."""

    list_display = ("order_number", "patient", "status", "priority", "ordered_at")
    list_filter = ("status", "priority", "order_type", "ordered_at")
    search_fields = ("order_number", "patient__first_name", "patient__last_name", "patient__mrn")
    readonly_fields = ("order_number", "ordered_at", "created_at", "updated_at")
    date_hierarchy = "ordered_at"


@admin.register(LabOrderItem)
class LabOrderItemAdmin(admin.ModelAdmin):
    """Admin interface for Lab Order Items."""

    list_display = ("lab_order", "test", "status", "unit_cost")
    list_filter = ("status",)
    search_fields = ("lab_order__order_number", "test__name", "test__code")


@admin.register(LabResult)
class LabResultAdmin(admin.ModelAdmin):
    """Admin interface for Lab Results."""

    list_display = ("order_item", "result_flag", "verification_status", "entered_at")
    list_filter = ("result_flag", "verification_status", "is_external_result")
    search_fields = ("order_item__test__name", "order_item__lab_order__order_number")
    readonly_fields = ("entered_at", "created_at", "updated_at")
