"""
CDS Admin — Rule and Alert management with colored badges.
"""

from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    CDSAlert,
    CDSAlertStatus,
    CDSRule,
    CDSRuleCategory,
    CDSRulePriority,
    CDSRuleStatus,
)


@admin.register(CDSRule)
class CDSRuleAdmin(admin.ModelAdmin):
    list_display = [
        "code",
        "name",
        "category_badge",
        "priority_badge",
        "status_badge",
        "evidence_level",
        "trigger_count",
        "created_at",
    ]
    list_filter = ["category", "priority", "status", "evidence_level"]
    search_fields = ["code", "name", "description"]
    ordering = ["-created_at"]
    raw_id_fields = ["created_by", "approved_by"]
    readonly_fields = [
        "is_active",
        "trigger_count",
        "override_rate",
        "created_at",
        "updated_at",
    ]

    fieldsets = (
        (
            None,
            {
                "fields": ("code", "name", "description"),
            },
        ),
        (
            "Classification",
            {
                "fields": ("category", "priority", "evidence_level", "status"),
            },
        ),
        (
            "Rule Logic",
            {
                "fields": ("condition", "action_type", "action_message", "suggestion"),
            },
        ),
        (
            "Evidence & References",
            {
                "fields": ("references", "metadata"),
                "classes": ("collapse",),
            },
        ),
        (
            "Audit",
            {
                "fields": (
                    "created_by",
                    "approved_by",
                    "approved_at",
                    "created_at",
                    "updated_at",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Statistics",
            {
                "fields": ("is_active", "trigger_count", "override_rate"),
                "classes": ("collapse",),
            },
        ),
    )

    def category_badge(self, obj: CDSRule) -> str:
        colors = {
            CDSRuleCategory.DRUG_ALLERGY: "#e74c3c",
            CDSRuleCategory.DRUG_DRUG: "#e67e22",
            CDSRuleCategory.CRITICAL_LAB: "#9b59b6",
            CDSRuleCategory.VITAL_SIGN: "#3498db",
            CDSRuleCategory.GUIDELINE: "#2ecc71",
            CDSRuleCategory.PREVENTIVE: "#1abc9c",
            CDSRuleCategory.DOSAGE: "#f39c12",
        }
        color = colors.get(obj.category, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_category_display(),
        )

    category_badge.short_description = "Category"  # type: ignore[attr-defined]

    def priority_badge(self, obj: CDSRule) -> str:
        colors = {
            CDSRulePriority.CRITICAL: "#c0392b",
            CDSRulePriority.HIGH: "#e74c3c",
            CDSRulePriority.MEDIUM: "#f39c12",
            CDSRulePriority.LOW: "#3498db",
            CDSRulePriority.INFO: "#95a5a6",
        }
        color = colors.get(obj.priority, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_priority_display(),
        )

    priority_badge.short_description = "Priority"  # type: ignore[attr-defined]

    def status_badge(self, obj: CDSRule) -> str:
        colors = {
            CDSRuleStatus.DRAFT: "#95a5a6",
            CDSRuleStatus.ACTIVE: "#2ecc71",
            CDSRuleStatus.INACTIVE: "#f39c12",
            CDSRuleStatus.RETIRED: "#7f8c8d",
        }
        color = colors.get(obj.status, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "Status"  # type: ignore[attr-defined]


@admin.register(CDSAlert)
class CDSAlertAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "rule_code_display",
        "patient_display",
        "priority_badge",
        "status_badge",
        "message_truncated",
        "created_at",
    ]
    list_filter = ["status", "priority", "rule__category"]
    search_fields = [
        "message",
        "rule__code",
        "rule__name",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
    ]
    ordering = ["-created_at"]
    raw_id_fields = ["rule", "patient", "encounter", "resolved_by", "triggered_by"]
    readonly_fields = [
        "is_pending",
        "is_resolved",
        "is_critical",
        "age_hours",
        "created_at",
        "updated_at",
    ]

    fieldsets = (
        (
            None,
            {
                "fields": ("rule", "patient", "encounter"),
            },
        ),
        (
            "Alert Content",
            {
                "fields": ("priority", "status", "message", "suggestion", "details"),
            },
        ),
        (
            "Resolution",
            {
                "fields": ("override_reason", "resolved_by", "resolved_at"),
            },
        ),
        (
            "Properties",
            {
                "fields": ("is_pending", "is_resolved", "is_critical", "age_hours"),
                "classes": ("collapse",),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("triggered_by", "created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    def rule_code_display(self, obj: CDSAlert) -> str:
        return obj.rule.code

    rule_code_display.short_description = "Rule"  # type: ignore[attr-defined]

    def patient_display(self, obj: CDSAlert) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name} ({obj.patient.mrn})"

    patient_display.short_description = "Patient"  # type: ignore[attr-defined]

    def message_truncated(self, obj: CDSAlert) -> str:
        if len(obj.message) > 80:
            return obj.message[:80] + "…"
        return obj.message

    message_truncated.short_description = "Message"  # type: ignore[attr-defined]

    def priority_badge(self, obj: CDSAlert) -> str:
        colors = {
            CDSRulePriority.CRITICAL: "#c0392b",
            CDSRulePriority.HIGH: "#e74c3c",
            CDSRulePriority.MEDIUM: "#f39c12",
            CDSRulePriority.LOW: "#3498db",
            CDSRulePriority.INFO: "#95a5a6",
        }
        color = colors.get(obj.priority, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_priority_display(),
        )

    priority_badge.short_description = "Priority"  # type: ignore[attr-defined]

    def status_badge(self, obj: CDSAlert) -> str:
        colors = {
            CDSAlertStatus.PENDING: "#f39c12",
            CDSAlertStatus.ACKNOWLEDGED: "#3498db",
            CDSAlertStatus.ACCEPTED: "#2ecc71",
            CDSAlertStatus.OVERRIDDEN: "#e67e22",
            CDSAlertStatus.DISMISSED: "#95a5a6",
            CDSAlertStatus.AUTO_RESOLVED: "#1abc9c",
        }
        color = colors.get(obj.status, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "Status"  # type: ignore[attr-defined]
