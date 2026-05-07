"""Admin configuration for Worksheets & Label Generation."""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    LabelPrintJob,
    LabelPrintJobItem,
    LabelTemplate,
    Worksheet,
    WorksheetItem,
    WorksheetTemplate,
)


@admin.register(WorksheetTemplate)
class WorksheetTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "group_by", "section_filter", "instrument", "is_active", "facility"]
    list_filter = ["is_active", "group_by", "facility"]
    search_fields = ["name"]
    raw_id_fields = ["instrument", "facility"]


class WorksheetItemInline(admin.TabularInline):
    model = WorksheetItem
    extra = 0
    raw_id_fields = ["order_item", "specimen", "facility"]
    readonly_fields = ["position"]


@admin.register(Worksheet)
class WorksheetAdmin(admin.ModelAdmin):
    list_display = [
        "worksheet_number",
        "title",
        "status_badge",
        "specimen_count",
        "export_format",
        "generated_by",
        "generated_at",
        "facility",
    ]
    list_filter = ["status", "export_format", "facility"]
    search_fields = ["worksheet_number", "title"]
    raw_id_fields = ["template", "generated_by", "facility"]
    readonly_fields = ["worksheet_number", "generated_at"]
    inlines = [WorksheetItemInline]

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "DRAFT": "#6b7280",
            "PRINTED": "#3b82f6",
            "IN_PROGRESS": "#f59e0b",
            "COMPLETED": "#22c55e",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            color,
            obj.get_status_display(),
        )


@admin.register(LabelTemplate)
class LabelTemplateAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "label_type",
        "label_format",
        "width_mm",
        "height_mm",
        "is_default",
        "is_active",
        "facility",
    ]
    list_filter = ["label_type", "label_format", "is_active", "facility"]
    search_fields = ["name"]
    raw_id_fields = ["facility"]


class LabelPrintJobItemInline(admin.TabularInline):
    model = LabelPrintJobItem
    extra = 0
    raw_id_fields = ["specimen", "order_item", "facility"]


@admin.register(LabelPrintJob)
class LabelPrintJobAdmin(admin.ModelAdmin):
    list_display = [
        "pk",
        "status_badge",
        "template",
        "label_count",
        "generated_by",
        "generated_at",
        "printed_at",
        "facility",
    ]
    list_filter = ["status", "facility"]
    raw_id_fields = ["template", "generated_by", "facility"]
    readonly_fields = ["generated_at", "printed_at"]
    inlines = [LabelPrintJobItemInline]

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "PENDING": "#6b7280",
            "GENERATED": "#3b82f6",
            "PRINTED": "#22c55e",
            "FAILED": "#ef4444",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            color,
            obj.get_status_display(),
        )
