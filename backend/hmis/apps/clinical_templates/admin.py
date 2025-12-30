"""
Admin configuration for Clinical Templates.
"""

from django.contrib import admin

from .models import ClinicalTemplate, TemplateSection


class TemplateSectionInline(admin.TabularInline):
    """Inline admin for TemplateSection."""

    model = TemplateSection
    extra = 1
    ordering = ["order"]
    fields = ["name", "order", "is_required", "fields"]


@admin.register(ClinicalTemplate)
class ClinicalTemplateAdmin(admin.ModelAdmin):
    """Admin for ClinicalTemplate model."""

    list_display = [
        "name",
        "template_type",
        "specialty",
        "is_system",
        "is_active",
        "usage_count",
        "created_by",
        "created_at",
    ]
    list_filter = ["template_type", "specialty", "is_system", "is_active"]
    search_fields = ["name", "description"]
    readonly_fields = ["usage_count", "created_by", "created_at", "updated_at"]
    inlines = [TemplateSectionInline]
    ordering = ["name"]

    fieldsets = (
        (None, {
            "fields": ("name", "template_type", "specialty", "description")
        }),
        ("Content", {
            "fields": ("content",),
            "classes": ("collapse",),
        }),
        ("Status", {
            "fields": ("is_system", "is_active", "usage_count")
        }),
        ("Metadata", {
            "fields": ("created_by", "created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )

    def save_model(self, request, obj, form, change):
        """Auto-set created_by on creation."""
        if not change:  # New object
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of system templates."""
        if obj and obj.is_system:
            return False
        return super().has_delete_permission(request, obj)
