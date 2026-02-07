"""
Django admin configuration for imaging models.
"""

from django.contrib import admin

from .models import (
    DICOMInstance,
    DICOMSeries,
    DICOMStudy,
    ImagingOrder,
    ImagingOrderItem,
    ImagingProcedure,
)


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


# ============================================================================
# DICOM Admin
# ============================================================================


class DICOMSeriesInline(admin.TabularInline):
    """Inline admin for DICOM series within a study."""

    model = DICOMSeries
    extra = 0
    readonly_fields = (
        "series_instance_uid",
        "series_number",
        "series_description",
        "modality",
        "body_part_examined",
        "number_of_instances",
        "total_file_size",
    )
    show_change_link = True


class DICOMInstanceInline(admin.TabularInline):
    """Inline admin for DICOM instances within a series."""

    model = DICOMInstance
    extra = 0
    readonly_fields = (
        "sop_instance_uid",
        "instance_number",
        "file_path",
        "file_size",
        "rows",
        "columns",
    )


@admin.register(DICOMStudy)
class DICOMStudyAdmin(admin.ModelAdmin):
    """Admin interface for DICOM Studies."""

    list_display = (
        "study_instance_uid",
        "patient",
        "modality",
        "study_date",
        "study_description",
        "number_of_series",
        "number_of_instances",
        "uploaded_by",
    )
    list_filter = ("modality", "study_date")
    search_fields = (
        "study_instance_uid",
        "accession_number",
        "study_description",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
    )
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "study_date"
    inlines = [DICOMSeriesInline]
    fieldsets = (
        (None, {
            "fields": (
                "study_instance_uid",
                "patient",
                "imaging_order",
                "modality",
            ),
        }),
        ("Study Details", {
            "fields": (
                "study_date",
                "study_time",
                "study_description",
                "accession_number",
                "referring_physician_name",
                "institution_name",
            ),
        }),
        ("Statistics", {
            "fields": (
                "number_of_series",
                "number_of_instances",
                "total_file_size",
                "thumbnail_path",
            ),
        }),
        ("Metadata", {
            "fields": ("uploaded_by", "created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )


@admin.register(DICOMSeries)
class DICOMSeriesAdmin(admin.ModelAdmin):
    """Admin interface for DICOM Series."""

    list_display = (
        "series_instance_uid",
        "study",
        "series_number",
        "modality",
        "body_part_examined",
        "number_of_instances",
    )
    list_filter = ("modality",)
    search_fields = ("series_instance_uid", "series_description")
    inlines = [DICOMInstanceInline]


@admin.register(DICOMInstance)
class DICOMInstanceAdmin(admin.ModelAdmin):
    """Admin interface for DICOM Instances."""

    list_display = (
        "sop_instance_uid",
        "series",
        "instance_number",
        "file_size",
        "rows",
        "columns",
    )
    search_fields = ("sop_instance_uid",)
    readonly_fields = ("created_at",)
