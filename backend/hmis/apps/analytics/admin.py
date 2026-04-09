"""Analytics admin configuration."""

from django.contrib import admin

from hmis.apps.analytics.models import (
    DepartmentMonthlySummary,
    DiagnosisTrend,
    FacilityDailySummary,
    PatientDemographicSnapshot,
)


@admin.register(FacilityDailySummary)
class FacilityDailySummaryAdmin(admin.ModelAdmin):
    list_display = [
        "facility",
        "date",
        "encounters_total",
        "new_patients",
        "revenue_total",
        "bed_occupancy_rate",
    ]
    list_filter = ["facility", "date"]
    raw_id_fields = ["facility", "organization"]
    date_hierarchy = "date"
    readonly_fields = [
        "created_at",
        "updated_at",
    ]


@admin.register(DepartmentMonthlySummary)
class DepartmentMonthlySummaryAdmin(admin.ModelAdmin):
    list_display = ["facility", "year", "month", "department", "visit_count", "revenue"]
    list_filter = ["facility", "department", "year"]
    raw_id_fields = ["facility", "organization"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(DiagnosisTrend)
class DiagnosisTrendAdmin(admin.ModelAdmin):
    list_display = [
        "icd10_code",
        "icd10_name",
        "granularity",
        "period_start",
        "case_count",
        "facility",
    ]
    list_filter = ["granularity", "facility"]
    search_fields = ["icd10_code", "icd10_name"]
    raw_id_fields = ["facility", "organization"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(PatientDemographicSnapshot)
class PatientDemographicSnapshotAdmin(admin.ModelAdmin):
    list_display = ["facility", "snapshot_date", "total_patients"]
    list_filter = ["facility"]
    raw_id_fields = ["facility", "organization"]
    date_hierarchy = "snapshot_date"
    readonly_fields = ["created_at", "updated_at"]
