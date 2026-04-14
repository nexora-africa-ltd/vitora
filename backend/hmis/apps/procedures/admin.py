from django.contrib import admin
from django.utils.html import format_html

from .models import (
    ProcedureCatalog,
    ProcedureConsent,
    ProcedureConsumable,
    ProcedureKit,
    ProcedureKitItem,
    ProcedureLog,
    ProcedureOrder,
    ProcedureOutcome,
)


class ProcedureKitItemInline(admin.TabularInline):
    model = ProcedureKitItem
    extra = 1


@admin.register(ProcedureCatalog)
class ProcedureCatalogAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "category_badge", "risk_badge", "base_fee", "is_active"]
    list_filter = ["category", "risk_level", "body_system", "is_active", "facility"]
    search_fields = ["code", "name", "ichi_code", "cpt_code"]
    filter_horizontal = ("default_clinics",)
    fieldsets = (
        (
            "Identification",
            {"fields": ("code", "name", "description", "category", "body_system", "risk_level")},
        ),
        ("Standard Coding", {"fields": ("ichi_code", "cpt_code", "icd10_pcs_code")}),
        (
            "Consent",
            {
                "fields": (
                    "consent_required",
                    "consent_template",
                    "guardian_consent_required",
                    "witness_required",
                )
            },
        ),
        (
            "Clinical",
            {
                "fields": (
                    "requires_anesthesia",
                    "anesthesia_type",
                    "typical_duration_minutes",
                    "requires_fasting",
                    "pre_procedure_instructions",
                    "post_procedure_instructions",
                    "required_qualifications",
                    "minimum_staff_count",
                )
            },
        ),
        (
            "Follow-up",
            {"fields": ("requires_follow_up", "default_follow_up_days", "follow_up_clinic")},
        ),
        (
            "Procedure Clinics",
            {
                "fields": ("default_clinics",),
                "description": "Clinics where this procedure can be performed. When set, scheduling auto-lists available slots.",
            },
        ),
        ("Billing & SHA", {"fields": ("base_fee", "sha_tariff_code", "sha_package_code")}),
        ("Tenant", {"fields": ("organization", "facility")}),
    )

    @admin.display(description="Category")
    def category_badge(self, obj):
        colors = {
            "MINOR": "#3b82f6",
            "EMERGENCY": "#ef4444",
            "DIAGNOSTIC": "#8b5cf6",
            "THERAPEUTIC": "#06b6d4",
            "WOUND_CARE": "#f97316",
            "INJECTION": "#10b981",
        }
        bg = colors.get(obj.category, "#6b7280")
        return format_html(
            '<span style="background:{}; color:#fff; padding:2px 8px; border-radius:4px;">{}</span>',
            bg,
            obj.get_category_display(),
        )

    @admin.display(description="Risk")
    def risk_badge(self, obj):
        colors = {"LOW": "#22c55e", "MEDIUM": "#f59e0b", "HIGH": "#ef4444"}
        bg = colors.get(obj.risk_level, "#6b7280")
        return format_html(
            '<span style="background:{}; color:#fff; padding:2px 8px; border-radius:4px;">{}</span>',
            bg,
            obj.get_risk_level_display(),
        )


@admin.register(ProcedureKit)
class ProcedureKitAdmin(admin.ModelAdmin):
    list_display = ["name", "procedure", "is_default", "is_active"]
    list_filter = ["is_default", "is_active"]
    inlines = [ProcedureKitItemInline]


@admin.register(ProcedureOrder)
class ProcedureOrderAdmin(admin.ModelAdmin):
    list_display = [
        "order_number",
        "procedure",
        "patient",
        "status_badge",
        "priority",
        "scheduled_date",
        "ordered_at",
    ]
    list_filter = ["status", "priority", "facility"]
    search_fields = ["order_number", "patient__first_name", "patient__last_name"]
    raw_id_fields = [
        "patient",
        "encounter",
        "clinic_visit",
        "admission",
        "ordered_by",
        "assigned_performer",
        "scheduled_clinic",
    ]
    readonly_fields = ["order_number", "ordered_at"]

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "ORDERED": "#3b82f6",
            "CONSENT_PENDING": "#f59e0b",
            "SCHEDULED": "#8b5cf6",
            "READY": "#06b6d4",
            "IN_PROGRESS": "#f97316",
            "COMPLETED": "#22c55e",
            "CANCELLED": "#ef4444",
        }
        bg = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{}; color:#fff; padding:2px 8px; border-radius:4px;">{}</span>',
            bg,
            obj.get_status_display(),
        )


@admin.register(ProcedureConsent)
class ProcedureConsentAdmin(admin.ModelAdmin):
    list_display = ["order", "status", "consent_type", "obtained_by", "obtained_at"]
    list_filter = ["status", "consent_type"]
    raw_id_fields = ["order", "obtained_by", "witnessed_by"]


@admin.register(ProcedureLog)
class ProcedureLogAdmin(admin.ModelAdmin):
    list_display = [
        "order",
        "performed_by",
        "status",
        "started_at",
        "ended_at",
        "actual_duration_minutes",
    ]
    list_filter = ["status", "facility"]
    raw_id_fields = ["order", "performed_by", "assistant"]


@admin.register(ProcedureConsumable)
class ProcedureConsumableAdmin(admin.ModelAdmin):
    list_display = ["log", "drug", "quantity", "unit_cost", "total_cost"]
    raw_id_fields = ["log", "drug", "batch", "recorded_by"]


@admin.register(ProcedureOutcome)
class ProcedureOutcomeAdmin(admin.ModelAdmin):
    list_display = ["log", "assessment_date", "outcome", "assessed_by", "next_follow_up"]
    list_filter = ["outcome"]
    raw_id_fields = ["log", "assessed_by"]
