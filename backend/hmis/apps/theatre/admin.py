from django.contrib import admin
from django.utils.html import format_html

from .models import (
    AnesthesiaRecord,
    CaseEquipmentRequirement,
    OperatingTheatre,
    OperativeNote,
    PACURecord,
    SurgeryCase,
    SurgicalTeamMember,
    TheatreConsumable,
    TheatreEquipmentType,
    WHOSafetyChecklist,
)


# ---------------------------------------------------------------------------
# Inlines
# ---------------------------------------------------------------------------
class SurgicalTeamInline(admin.TabularInline):
    model = SurgicalTeamMember
    extra = 0
    raw_id_fields = ("staff_member",)


class CaseEquipmentInline(admin.TabularInline):
    model = CaseEquipmentRequirement
    extra = 0
    raw_id_fields = ("resource", "equipment_type", "added_by")
    readonly_fields = ("created_at",)


# ---------------------------------------------------------------------------
# OperatingTheatre
# ---------------------------------------------------------------------------
@admin.register(OperatingTheatre)
class OperatingTheatreAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "theatre_type_badge", "is_active", "facility"]
    list_filter = ["theatre_type", "is_active", "facility"]
    search_fields = ["code", "name"]
    raw_id_fields = ("facility", "organization")

    @admin.display(description="Type")
    def theatre_type_badge(self, obj):
        colors = {
            "GENERAL": "#3b82f6",
            "EMERGENCY": "#ef4444",
            "CARDIAC": "#dc2626",
            "NEURO": "#8b5cf6",
            "ORTHO": "#06b6d4",
            "OBSTETRIC": "#ec4899",
            "PEDIATRIC": "#f59e0b",
            "EYE": "#10b981",
            "ENT": "#6366f1",
            "MINOR": "#6b7280",
        }
        bg = colors.get(obj.theatre_type, "#6b7280")
        return format_html(
            '<span style="background:{}; color:#fff; padding:2px 8px; '
            'border-radius:4px;">{}</span>',
            bg,
            obj.get_theatre_type_display(),
        )


# ---------------------------------------------------------------------------
# SurgeryCase
# ---------------------------------------------------------------------------
@admin.register(SurgeryCase)
class SurgeryCaseAdmin(admin.ModelAdmin):
    list_display = [
        "case_number",
        "patient",
        "status_badge",
        "priority_badge",
        "scheduled_date",
        "theatre",
        "facility",
    ]
    list_filter = ["status", "priority", "scheduled_date", "facility"]
    search_fields = ["case_number", "patient__first_name", "patient__last_name"]
    raw_id_fields = (
        "patient",
        "encounter",
        "admission",
        "primary_procedure",
        "theatre",
        "requesting_doctor",
        "status_changed_by",
        "facility",
        "organization",
    )
    readonly_fields = ("case_number", "requested_at", "status_changed_at")
    inlines = [SurgicalTeamInline, CaseEquipmentInline]
    date_hierarchy = "scheduled_date"

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "REQUESTED": "#f59e0b",
            "SCHEDULED": "#3b82f6",
            "PRE_OP": "#8b5cf6",
            "IN_THEATRE": "#06b6d4",
            "IN_SURGERY": "#ef4444",
            "IN_PACU": "#f97316",
            "DISCHARGED": "#22c55e",
            "POSTPONED": "#6b7280",
            "CANCELLED": "#374151",
        }
        bg = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{}; color:#fff; padding:2px 8px; '
            'border-radius:4px;">{}</span>',
            bg,
            obj.get_status_display(),
        )

    @admin.display(description="Priority")
    def priority_badge(self, obj):
        colors = {
            "ELECTIVE": "#22c55e",
            "URGENT": "#f59e0b",
            "EMERGENCY": "#ef4444",
        }
        bg = colors.get(obj.priority, "#6b7280")
        return format_html(
            '<span style="background:{}; color:#fff; padding:2px 8px; '
            'border-radius:4px;">{}</span>',
            bg,
            obj.get_priority_display(),
        )


# ---------------------------------------------------------------------------
# WHO Checklist
# ---------------------------------------------------------------------------
@admin.register(WHOSafetyChecklist)
class WHOSafetyChecklistAdmin(admin.ModelAdmin):
    list_display = [
        "surgery_case",
        "sign_in_complete",
        "time_out_complete",
        "sign_out_complete",
    ]
    raw_id_fields = (
        "surgery_case",
        "sign_in_completed_by",
        "time_out_completed_by",
        "sign_out_completed_by",
    )


# ---------------------------------------------------------------------------
# Anesthesia
# ---------------------------------------------------------------------------
@admin.register(AnesthesiaRecord)
class AnesthesiaRecordAdmin(admin.ModelAdmin):
    list_display = ["surgery_case", "anesthesiologist", "pre_op_assessment_at"]
    raw_id_fields = ("surgery_case", "anesthesiologist")


# ---------------------------------------------------------------------------
# OperativeNote
# ---------------------------------------------------------------------------
@admin.register(OperativeNote)
class OperativeNoteAdmin(admin.ModelAdmin):
    list_display = ["surgery_case", "dictated_by", "signed_at"]
    raw_id_fields = ("surgery_case", "dictated_by", "signed_by")


# ---------------------------------------------------------------------------
# Consumables
# ---------------------------------------------------------------------------
@admin.register(TheatreConsumable)
class TheatreConsumableAdmin(admin.ModelAdmin):
    list_display = ["surgery_case", "item", "quantity_used", "is_implant", "facility"]
    list_filter = ["is_implant", "facility"]
    raw_id_fields = ("surgery_case", "item", "added_by", "facility", "organization")


# ---------------------------------------------------------------------------
# PACU
# ---------------------------------------------------------------------------
@admin.register(PACURecord)
class PACURecordAdmin(admin.ModelAdmin):
    list_display = [
        "surgery_case",
        "arrival_time",
        "initial_aldrete_score",
        "discharge_time",
        "discharge_destination",
    ]
    raw_id_fields = ("surgery_case", "arriving_nurse", "discharged_by")


# ---------------------------------------------------------------------------
# Team (standalone view)
# ---------------------------------------------------------------------------
@admin.register(SurgicalTeamMember)
class SurgicalTeamMemberAdmin(admin.ModelAdmin):
    list_display = ["surgery_case", "staff_member", "role"]
    list_filter = ["role"]
    raw_id_fields = ("surgery_case", "staff_member")


# ---------------------------------------------------------------------------
# Theatre Equipment Type
# ---------------------------------------------------------------------------
@admin.register(TheatreEquipmentType)
class TheatreEquipmentTypeAdmin(admin.ModelAdmin):
    list_display = [
        "code",
        "name",
        "parent",
        "category_badge",
        "is_portable",
        "is_active",
        "facility",
    ]
    list_filter = ["category", "is_portable", "is_active", "facility", "parent"]
    search_fields = ["name", "code", "parent__name"]
    raw_id_fields = ("facility", "organization", "parent")

    @admin.display(description="Category")
    def category_badge(self, obj):
        colors = {
            "IMAGING": "#3b82f6",
            "MONITORING": "#06b6d4",
            "SURGICAL_INSTRUMENT": "#8b5cf6",
            "LIFE_SUPPORT": "#ef4444",
            "STERILIZATION": "#22c55e",
            "OTHER": "#6b7280",
        }
        bg = colors.get(obj.category, "#6b7280")
        return format_html(
            '<span style="background:{}; color:#fff; padding:2px 8px; '
            'border-radius:4px;">{}</span>',
            bg,
            obj.get_category_display(),
        )


# ---------------------------------------------------------------------------
# Case Equipment Requirement
# ---------------------------------------------------------------------------
@admin.register(CaseEquipmentRequirement)
class CaseEquipmentRequirementAdmin(admin.ModelAdmin):
    list_display = [
        "surgery_case",
        "resource",
        "equipment_type",
        "is_confirmed",
        "reserved_from",
        "reserved_until",
    ]
    list_filter = ["is_confirmed", "equipment_type__category"]
    raw_id_fields = ("surgery_case", "resource", "equipment_type", "added_by")
