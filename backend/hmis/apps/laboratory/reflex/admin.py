"""Admin configuration for Reflexive Testing."""

from django.contrib import admin
from django.utils.html import format_html

from .models import ReflexExecution, ReflexRule


@admin.register(ReflexRule)
class ReflexRuleAdmin(admin.ModelAdmin):
    list_display = [
        "trigger_test",
        "operator",
        "threshold_value",
        "reflex_test",
        "action_badge",
        "is_active",
        "facility",
    ]
    list_filter = ["is_active", "action", "operator", "facility"]
    search_fields = ["trigger_test__name", "reflex_test__name", "description"]
    raw_id_fields = ["trigger_test", "reflex_test", "facility"]

    @admin.display(description="Action")
    def action_badge(self, obj):
        colors = {
            "AUTO_ORDER": "#22c55e",
            "SUGGEST": "#3b82f6",
        }
        color = colors.get(obj.action, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            color,
            obj.get_action_display(),
        )


@admin.register(ReflexExecution)
class ReflexExecutionAdmin(admin.ModelAdmin):
    list_display = [
        "pk",
        "status_badge",
        "trigger_test_name",
        "reflex_test_name",
        "trigger_value",
        "executed_at",
        "approved_by",
        "facility",
    ]
    list_filter = ["status", "facility"]
    raw_id_fields = ["rule", "trigger_result", "reflex_order", "approved_by", "facility"]
    readonly_fields = ["executed_at"]

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "TRIGGERED": "#6b7280",
            "ORDERED": "#22c55e",
            "SUGGESTED": "#3b82f6",
            "APPROVED": "#22c55e",
            "REJECTED": "#ef4444",
            "CANCELLED": "#a3a3a3",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    @admin.display(description="Trigger Test")
    def trigger_test_name(self, obj):
        return obj.rule.trigger_test.name if obj.rule else "-"

    @admin.display(description="Reflex Test")
    def reflex_test_name(self, obj):
        return obj.rule.reflex_test.name if obj.rule else "-"
