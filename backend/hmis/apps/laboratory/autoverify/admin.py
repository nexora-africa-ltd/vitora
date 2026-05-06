"""Admin configuration for Delta Checks & Auto-Verification."""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    AutoVerifyConfig,
    AutoVerifyLog,
    AutoVerifyRule,
    DeltaCheckResult,
    DeltaCheckRule,
)


@admin.register(DeltaCheckRule)
class DeltaCheckRuleAdmin(admin.ModelAdmin):
    list_display = [
        "test",
        "check_type",
        "threshold_percent",
        "threshold_absolute",
        "lookback_hours",
        "action_badge",
        "is_active",
        "facility",
    ]
    list_filter = ["is_active", "check_type", "action", "facility"]
    search_fields = ["test__name", "test__code"]
    raw_id_fields = ["test", "facility"]

    @admin.display(description="Action")
    def action_badge(self, obj):
        colors = {
            "FLAG_FOR_REVIEW": "#f59e0b",
            "BLOCK_RELEASE": "#ef4444",
            "ALERT_ONLY": "#3b82f6",
        }
        color = colors.get(obj.action, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            color,
            obj.get_action_display(),
        )


@admin.register(DeltaCheckResult)
class DeltaCheckResultAdmin(admin.ModelAdmin):
    list_display = [
        "result",
        "outcome_badge",
        "current_value",
        "previous_value",
        "delta_percent",
        "action_taken",
        "evaluated_at",
    ]
    list_filter = ["outcome", "action_taken"]
    raw_id_fields = ["result", "rule", "previous_result", "facility"]
    readonly_fields = ["evaluated_at"]

    @admin.display(description="Outcome")
    def outcome_badge(self, obj):
        colors = {
            "PASS": "#22c55e",
            "FAIL": "#ef4444",
            "NO_PRIOR": "#6b7280",
            "SKIPPED": "#a3a3a3",
        }
        color = colors.get(obj.outcome, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            color,
            obj.get_outcome_display(),
        )


@admin.register(AutoVerifyRule)
class AutoVerifyRuleAdmin(admin.ModelAdmin):
    list_display = ["test", "condition_type", "is_active", "facility"]
    list_filter = ["is_active", "condition_type", "facility"]
    search_fields = ["test__name", "test__code"]
    raw_id_fields = ["test", "facility"]


@admin.register(AutoVerifyConfig)
class AutoVerifyConfigAdmin(admin.ModelAdmin):
    list_display = [
        "facility",
        "is_enabled",
        "max_auto_verify_percent",
        "require_qc_pass",
        "max_specimen_age_hours",
    ]
    list_filter = ["is_enabled"]
    raw_id_fields = ["facility"]


@admin.register(AutoVerifyLog)
class AutoVerifyLogAdmin(admin.ModelAdmin):
    list_display = [
        "result",
        "outcome_badge",
        "blocking_rule",
        "auto_verified_by_system",
        "evaluated_at",
    ]
    list_filter = ["outcome", "auto_verified_by_system"]
    raw_id_fields = ["result", "blocking_rule", "facility"]
    readonly_fields = ["evaluated_at", "rules_evaluated"]

    @admin.display(description="Outcome")
    def outcome_badge(self, obj):
        colors = {
            "AUTO_VERIFIED": "#22c55e",
            "BLOCKED": "#ef4444",
            "SKIPPED": "#a3a3a3",
            "CAP_EXCEEDED": "#f59e0b",
        }
        color = colors.get(obj.outcome, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            color,
            obj.get_outcome_display(),
        )
