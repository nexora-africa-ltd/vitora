"""MOH Reporting admin."""

from django.contrib import admin

from .models import (
    MOH705DiseaseRow,
    MOH705Report,
    MOH711Report,
    MOH717Report,
    MOHDataElementMapping,
)


class MOH705DiseaseRowInline(admin.TabularInline):
    model = MOH705DiseaseRow
    extra = 0
    readonly_fields = [
        "icd10_chapter",
        "category_name",
        "cases_under_5",
        "cases_5_and_above",
        "total_cases",
    ]


@admin.register(MOH705Report)
class MOH705ReportAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "facility",
        "period_start",
        "status",
        "total_visits",
        "generated_at",
    ]
    list_filter = ["status", "facility", "period_start"]
    date_hierarchy = "period_start"
    raw_id_fields = ["facility", "generated_by", "approved_by"]
    readonly_fields = [
        "dhis2_submitted_at",
        "dhis2_response",
        "dhis2_import_summary",
    ]
    inlines = [MOH705DiseaseRowInline]


@admin.register(MOH711Report)
class MOH711ReportAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "facility",
        "period_start",
        "status",
        "deliveries_total",
        "generated_at",
    ]
    list_filter = ["status", "facility", "period_start"]
    date_hierarchy = "period_start"
    raw_id_fields = ["facility", "generated_by", "approved_by"]
    readonly_fields = [
        "dhis2_submitted_at",
        "dhis2_response",
        "dhis2_import_summary",
    ]


@admin.register(MOH717Report)
class MOH717ReportAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "facility",
        "period_start",
        "status",
        "opd_total",
        "admissions_total",
        "generated_at",
    ]
    list_filter = ["status", "facility", "period_start"]
    date_hierarchy = "period_start"
    raw_id_fields = ["facility", "generated_by", "approved_by"]
    readonly_fields = [
        "dhis2_submitted_at",
        "dhis2_response",
        "dhis2_import_summary",
    ]


@admin.register(MOHDataElementMapping)
class MOHDataElementMappingAdmin(admin.ModelAdmin):
    list_display = [
        "report_type",
        "indicator_code",
        "environment",
        "data_element_uid",
        "is_active",
    ]
    list_filter = ["report_type", "environment", "is_active"]
    search_fields = ["indicator_code", "data_element_uid", "short_name"]
