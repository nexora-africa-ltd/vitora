"""Admin configuration for Quality Measures & Reporting."""

from django.contrib import admin

from .models import AnnualReport, QualityMeasure, QualityMeasureResult, QuarterlyReport


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
