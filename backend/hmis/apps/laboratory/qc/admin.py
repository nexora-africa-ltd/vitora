"""
Django admin configuration for QC models.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    EQASample,
    EQASubmission,
    EQASurvey,
    QCLot,
    QCMaterial,
    QCResult,
    QCRule,
    QCRuleViolation,
    QCTarget,
)


@admin.register(QCMaterial)
class QCMaterialAdmin(admin.ModelAdmin):
    list_display = ("name", "manufacturer", "catalog_number", "is_active", "facility")
    list_filter = ("is_active", "manufacturer", "facility")
    search_fields = ("name", "manufacturer", "catalog_number")
    raw_id_fields = ("facility", "organization")


@admin.register(QCLot)
class QCLotAdmin(admin.ModelAdmin):
    list_display = (
        "lot_number",
        "material",
        "status_badge",
        "expiry_date",
        "days_until_expiry",
        "facility",
    )
    list_filter = ("status", "material", "facility")
    search_fields = ("lot_number", "material__name")
    raw_id_fields = ("material", "facility", "organization")
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "ACTIVE": "#28a745",
            "EXPIRED": "#dc3545",
            "EXHAUSTED": "#6c757d",
            "CLOSED": "#ffc107",
        }
        color = colors.get(obj.status, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )


@admin.register(QCTarget)
class QCTargetAdmin(admin.ModelAdmin):
    list_display = ("lot", "test", "instrument", "mean", "sd", "cv_percent", "unit")
    list_filter = ("test__category", "facility")
    search_fields = ("lot__lot_number", "test__name")
    raw_id_fields = ("lot", "test", "instrument", "facility", "organization")


@admin.register(QCResult)
class QCResultAdmin(admin.ModelAdmin):
    list_display = ("test", "value", "run_date", "accepted_badge", "operator", "lot", "facility")
    list_filter = ("accepted", "test", "lot", "facility")
    search_fields = ("lot__lot_number", "test__name")
    raw_id_fields = (
        "lot",
        "test",
        "instrument",
        "operator",
        "reviewed_by",
        "facility",
        "organization",
    )
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "run_date"

    @admin.display(description="Accepted", boolean=True)
    def accepted_badge(self, obj):
        return obj.accepted


@admin.register(QCRule)
class QCRuleAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "rule_type",
        "severity_badge",
        "is_active",
        "applies_to_test",
        "facility",
    )
    list_filter = ("rule_type", "severity", "is_active", "facility")
    search_fields = ("name",)
    raw_id_fields = ("applies_to_test", "facility", "organization")

    @admin.display(description="Severity")
    def severity_badge(self, obj):
        colors = {"WARNING": "#ffc107", "REJECT": "#dc3545"}
        color = colors.get(obj.severity, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_severity_display(),
        )


@admin.register(QCRuleViolation)
class QCRuleViolationAdmin(admin.ModelAdmin):
    list_display = (
        "rule",
        "qc_result",
        "severity",
        "acknowledged",
        "acknowledged_by",
        "created_at",
    )
    list_filter = ("severity", "acknowledged", "rule__rule_type")
    raw_id_fields = ("qc_result", "rule", "acknowledged_by", "facility", "organization")
    readonly_fields = ("created_at", "updated_at")


@admin.register(EQASurvey)
class EQASurveyAdmin(admin.ModelAdmin):
    list_display = ("provider", "name", "survey_id", "status_badge", "due_date", "facility")
    list_filter = ("status", "provider", "facility")
    search_fields = ("provider", "survey_id", "name")
    raw_id_fields = ("facility", "organization")
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "PENDING": "#ffc107",
            "IN_PROGRESS": "#17a2b8",
            "SUBMITTED": "#28a745",
            "RESULTS_RECEIVED": "#6f42c1",
            "CLOSED": "#6c757d",
        }
        color = colors.get(obj.status, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )


@admin.register(EQASample)
class EQASampleAdmin(admin.ModelAdmin):
    list_display = ("sample_id", "survey", "test", "expected_value")
    list_filter = ("survey__provider", "test")
    search_fields = ("sample_id", "survey__name")
    raw_id_fields = ("survey", "test", "facility", "organization")


@admin.register(EQASubmission)
class EQASubmissionAdmin(admin.ModelAdmin):
    list_display = ("sample", "submitted_value", "z_score", "performance_badge", "submitted_by")
    list_filter = ("performance", "sample__survey__provider")
    raw_id_fields = ("sample", "instrument", "submitted_by", "facility", "organization")
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Performance")
    def performance_badge(self, obj):
        colors = {
            "ACCEPTABLE": "#28a745",
            "WARNING": "#ffc107",
            "UNACCEPTABLE": "#dc3545",
            "PENDING": "#6c757d",
        }
        color = colors.get(obj.performance, "#6c757d")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_performance_display(),
        )
