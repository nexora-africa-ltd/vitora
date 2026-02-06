"""
Django admin configuration for imaging models.
"""

from django.contrib import admin

from .models import ImagingOrder, ImagingOrderItem, ImagingProcedure


class ImagingOrderItemInline(admin.TabularInline):
    """Inline admin for order items."""

    model = ImagingOrderItem
    extra = 1
    readonly_fields = ("completed_at",)


@admin.register(ImagingProcedure)
class ImagingProcedureAdmin(admin.ModelAdmin):
    """Admin interface for Imaging Procedure Catalog."""

    list_display = (
        "code",
        "name",
        "modality",
        "body_region",
        "cost",
        "sha_claimable",
        "is_active",
    )
    list_filter = (
        "modality",
        "body_region",
        "is_active",
        "available_in_house",
        "requires_contrast",
        "sha_claimable",
    )
    search_fields = ("code", "name", "radlex_code", "loinc_code", "sha_intervention_code")
    ordering = ("modality", "name")
    fieldsets = (
        (None, {
            "fields": ("code", "name", "modality", "body_region")
        }),
        ("Interoperability", {
            "fields": ("radlex_code", "loinc_code"),
            "classes": ("collapse",),
        }),
        ("Requirements", {
            "fields": (
                "requires_contrast",
                "requires_sedation",
                "special_preparation",
                "turnaround_hours",
            ),
        }),
        ("Pricing & SHA", {
            "fields": ("cost", "sha_claimable", "sha_intervention_code"),
        }),
        ("Availability", {
            "fields": ("is_active", "available_in_house"),
        }),
    )


@admin.register(ImagingOrder)
class ImagingOrderAdmin(admin.ModelAdmin):
    """Admin interface for Imaging Orders."""

    list_display = (
        "order_number",
        "patient",
        "status",
        "priority",
        "total_cost",
        "is_paid",
        "ordered_at",
    )
    list_filter = ("status", "priority", "is_paid", "ordered_at")
    search_fields = (
        "order_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "accession_number",
    )
    readonly_fields = (
        "order_number",
        "ordered_at",
        "status_changed_at",
        "completed_at",
    )
    date_hierarchy = "ordered_at"
    inlines = [ImagingOrderItemInline]
    fieldsets = (
        (None, {
            "fields": (
                "order_number",
                "patient",
                "encounter",
                "ordered_by",
            )
        }),
        ("Order Details", {
            "fields": (
                "priority",
                "clinical_indication",
                "relevant_clinical_history",
                "status",
            ),
        }),
        ("Scheduling", {
            "fields": ("scheduled_datetime", "scheduled_room"),
            "classes": ("collapse",),
        }),
        ("DICOM/PACS", {
            "fields": ("accession_number", "study_instance_uid"),
            "classes": ("collapse",),
        }),
        ("Billing", {
            "fields": ("total_cost", "is_paid"),
        }),
        ("Timestamps", {
            "fields": ("ordered_at", "status_changed_at", "completed_at"),
            "classes": ("collapse",),
        }),
    )


@admin.register(ImagingOrderItem)
class ImagingOrderItemAdmin(admin.ModelAdmin):
    """Admin interface for Imaging Order Items."""

    list_display = (
        "order",
        "procedure",
        "laterality",
        "is_completed",
        "unit_cost",
    )
    list_filter = ("laterality", "is_completed")
    search_fields = (
        "order__order_number",
        "procedure__name",
        "procedure__code",
    )
    readonly_fields = ("completed_at",)
