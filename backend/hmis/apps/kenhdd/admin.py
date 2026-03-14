"""
KENHDD Admin — Data Element and Validation Run management.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    KENHDDDataElement,
    KENHDDFailedRecord,
    KENHDDRequirementLevel,
    KENHDDResourceType,
    KENHDDValidationRun,
)


@admin.register(KENHDDDataElement)
class KENHDDDataElementAdmin(admin.ModelAdmin):
    list_display = [
        "element_id",
        "name",
        "resource_type_badge",
        "requirement_badge",
        "data_type",
        "is_active",
    ]
    list_filter = ["resource_type", "requirement_level", "data_type", "is_active"]
    search_fields = ["element_id", "name", "description", "model_field"]
    ordering = ["resource_type", "element_id"]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = (
        (None, {
            "fields": ("element_id", "name", "description"),
        }),
        ("Classification", {
            "fields": (
                "resource_type",
                "model_field",
                "requirement_level",
                "data_type",
                "coding_system",
            ),
        }),
        ("Validation Rules", {
            "fields": ("max_length", "format_pattern", "condition_expression"),
            "classes": ("collapse",),
        }),
        ("Status", {
            "fields": ("is_active", "created_at", "updated_at"),
        }),
    )

    def resource_type_badge(self, obj: KENHDDDataElement) -> str:
        colors: dict[str, str] = {
            KENHDDResourceType.PATIENT: "#3498db",
            KENHDDResourceType.ENCOUNTER: "#2ecc71",
            KENHDDResourceType.DIAGNOSIS: "#9b59b6",
            KENHDDResourceType.FACILITY: "#e67e22",
            KENHDDResourceType.LAB_RESULT: "#1abc9c",
            KENHDDResourceType.PRESCRIPTION: "#e74c3c",
            KENHDDResourceType.MCH_VISIT: "#f39c12",
        }
        color = colors.get(obj.resource_type, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_resource_type_display(),
        )

    resource_type_badge.short_description = "Resource Type"  # type: ignore[attr-defined]

    def requirement_badge(self, obj: KENHDDDataElement) -> str:
        colors: dict[str, str] = {
            KENHDDRequirementLevel.MANDATORY: "#c0392b",
            KENHDDRequirementLevel.CONDITIONAL: "#f39c12",
            KENHDDRequirementLevel.OPTIONAL: "#27ae60",
        }
        color = colors.get(obj.requirement_level, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_requirement_level_display(),
        )

    requirement_badge.short_description = "Requirement"  # type: ignore[attr-defined]


class KENHDDFailedRecordInline(admin.TabularInline):
    """Inline admin for failed records within a validation run."""

    model = KENHDDFailedRecord
    extra = 0
    readonly_fields = [
        "record_id",
        "is_compliant",
        "pass_count",
        "fail_count",
        "warning_count",
        "violation_details",
    ]
    can_delete = False


@admin.register(KENHDDValidationRun)
class KENHDDValidationRunAdmin(admin.ModelAdmin):
    list_display = [
        "resource_type",
        "compliance_score",
        "mandatory_pass_rate",
        "records_checked",
        "records_compliant",
        "run_by",
        "run_at",
    ]
    list_filter = ["resource_type"]
    ordering = ["-run_at"]
    readonly_fields = [
        "resource_type",
        "records_checked",
        "records_compliant",
        "compliance_score",
        "mandatory_pass_rate",
        "violations",
        "run_by",
        "run_at",
    ]
    inlines = [KENHDDFailedRecordInline]
