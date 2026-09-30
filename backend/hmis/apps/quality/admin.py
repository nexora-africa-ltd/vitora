# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Admin configuration for Quality Measures & Reporting."""

from django.contrib import admin

from .models import (
    AnnualReport,
    FacilitySDMXConfiguration,
    QualityMeasure,
    QualityMeasureResult,
    QuarterlyReport,
    SDMXCodeMapping,
    SDMXContract,
    SDMXSubmission,
)


@admin.register(QuarterlyReport)
class QuarterlyReportAdmin(admin.ModelAdmin):
    list_display = ["clinic", "year", "quarter", "total_visits", "dhis2_submitted", "created_at"]
    list_filter = ["year", "quarter", "dhis2_submitted"]
    search_fields = ["clinic__name"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(AnnualReport)
class AnnualReportAdmin(admin.ModelAdmin):
    list_display = ["clinic", "year", "total_visits", "dhis2_submitted", "created_at"]
    list_filter = ["year", "dhis2_submitted"]
    search_fields = ["clinic__name"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(QualityMeasure)
class QualityMeasureAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "domain", "status", "reporting_period", "target_percentage"]
    list_filter = ["domain", "status", "reporting_period"]
    search_fields = ["code", "name", "description"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(QualityMeasureResult)
class QualityMeasureResultAdmin(admin.ModelAdmin):
    list_display = [
        "measure",
        "clinic",
        "year",
        "period",
        "period_type",
        "numerator",
        "denominator",
        "percentage",
        "meets_target",
    ]
    list_filter = ["year", "period_type", "meets_target"]
    search_fields = ["measure__code", "measure__name", "clinic__name"]
    readonly_fields = ["created_at", "updated_at", "calculated_at"]


@admin.register(SDMXContract)
class SDMXContractAdmin(admin.ModelAdmin):
    """Platform audit view for versioned DHA/KHIS SDMX contracts."""

    list_display = ["partner", "dataflow_id", "version", "environment", "is_active", "updated_at"]
    list_filter = ["partner", "environment", "is_active"]
    search_fields = ["agency_id", "dataflow_id", "dsd_id", "version"]
    readonly_fields = ["created_at", "updated_at", "created_by"]


@admin.register(SDMXCodeMapping)
class SDMXCodeMappingAdmin(admin.ModelAdmin):
    """Platform audit view for SDMX codelist mappings."""

    list_display = ["contract", "dimension", "source_code", "target_code", "is_active"]
    list_filter = ["dimension", "is_active"]
    search_fields = ["source_code", "target_code", "target_name"]
    raw_id_fields = ["contract"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(SDMXSubmission)
class SDMXSubmissionAdmin(admin.ModelAdmin):
    """Read-only operational journal for SDMX delivery attempts."""

    list_display = [
        "contract",
        "facility",
        "report_type",
        "reporting_period",
        "status",
        "created_at",
    ]
    list_filter = ["status", "report_type"]
    search_fields = ["idempotency_key", "payload_sha256", "remote_reference"]
    raw_id_fields = ["contract", "facility", "created_by"]
    readonly_fields = [field.name for field in SDMXSubmission._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(FacilitySDMXConfiguration)
class FacilitySDMXConfigurationAdmin(admin.ModelAdmin):
    """Platform audit view for per-facility SDMX enablement."""

    list_display = ["facility", "contract", "is_enabled", "facility_code", "updated_at"]
    list_filter = ["is_enabled", "contract"]
    search_fields = ["facility__name", "facility__mfl_code", "facility_code"]
    raw_id_fields = ["facility", "contract", "enabled_by"]
    readonly_fields = [
        "organization",
        "last_validated_at",
        "last_successful_submission_at",
        "created_at",
        "updated_at",
    ]
