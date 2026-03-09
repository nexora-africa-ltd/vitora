"""
Admin configuration for core app.
"""

from django.contrib import admin

from .emergency_access.admin import EmergencyAccessAdmin  # noqa: F401
from .models import (
    AuditLog,
    CodeSystem,
    County,
    Department,
    ExternalCodeMapping,
    Facility,
    FeatureFlag,
    NetworkStatus,
    Role,
    StaffProfile,
    SubCounty,
    SyncConflict,
    SyncMetrics,
    SyncQueue,
    Ward,
)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Admin configuration for AuditLog model."""

    list_display = [
        "timestamp",
        "user",
        "action",
        "resource_type",
        "resource_id",
        "ip_address",
    ]
    list_filter = ["action", "resource_type", "timestamp"]
    search_fields = ["user__username", "action", "resource_type", "ip_address"]
    readonly_fields = [
        "user",
        "action",
        "resource_type",
        "resource_id",
        "timestamp",
        "ip_address",
        "user_agent",
        "details",
        "patient_id",
    ]
    date_hierarchy = "timestamp"
    ordering = ["-timestamp"]

    def has_add_permission(self, request):
        """Prevent manual creation of audit logs."""
        return False

    def has_change_permission(self, request, obj=None):
        """Prevent modification of audit logs."""
        return False


@admin.register(FeatureFlag)
class FeatureFlagAdmin(admin.ModelAdmin):
    """Admin configuration for FeatureFlag model."""

    list_display = ["name", "is_enabled", "description", "updated_at"]
    list_filter = ["is_enabled"]
    search_fields = ["name", "description"]
    list_editable = ["is_enabled"]
    readonly_fields = ["created_at", "updated_at"]

    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of audit logs."""
        return False


@admin.register(County)
class CountyAdmin(admin.ModelAdmin):
    """Admin configuration for County model."""

    list_display = ["code", "name"]
    search_fields = ["name", "code"]
    ordering = ["code"]


@admin.register(SubCounty)
class SubCountyAdmin(admin.ModelAdmin):
    """Admin configuration for SubCounty model."""

    list_display = ["name", "county"]
    list_filter = ["county"]
    search_fields = ["name", "county__name"]
    ordering = ["county", "name"]


@admin.register(Ward)
class WardAdmin(admin.ModelAdmin):
    """Admin configuration for Ward model."""

    list_display = ["name", "sub_county", "get_county"]
    list_filter = ["sub_county__county", "sub_county"]
    search_fields = ["name", "sub_county__name", "sub_county__county__name"]
    ordering = ["sub_county__county", "sub_county", "name"]

    @admin.display(description="County")
    def get_county(self, obj):
        """Return county name."""
        return obj.sub_county.county.name


@admin.register(SyncQueue)
class SyncQueueAdmin(admin.ModelAdmin):
    """Admin configuration for SyncQueue model."""

    list_display = [
        "id",
        "operation",
        "model_name",
        "record_id",
        "status",
        "created_at",
        "retry_count",
    ]
    list_filter = ["operation", "model_name", "status", "created_at"]
    search_fields = ["model_name", "record_id"]
    readonly_fields = ["created_at", "synced_at"]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]


@admin.register(SyncConflict)
class SyncConflictAdmin(admin.ModelAdmin):
    """Admin configuration for SyncConflict model."""

    list_display = [
        "id",
        "model_name",
        "record_id",
        "resolution_strategy",
        "status",
        "detected_at",
    ]
    list_filter = ["model_name", "resolution_strategy", "status", "detected_at"]
    search_fields = ["model_name", "record_id"]
    readonly_fields = ["detected_at", "resolved_at"]
    date_hierarchy = "detected_at"
    ordering = ["-detected_at"]


@admin.register(NetworkStatus)
class NetworkStatusAdmin(admin.ModelAdmin):
    """Admin configuration for NetworkStatus model."""

    list_display = ["id", "is_online", "last_check", "latency_ms"]
    list_filter = ["is_online"]
    readonly_fields = ["last_check"]

    def has_add_permission(self, request):
        """Only allow one NetworkStatus record."""
        return not NetworkStatus.objects.exists()


@admin.register(SyncMetrics)
class SyncMetricsAdmin(admin.ModelAdmin):
    """Admin configuration for SyncMetrics model."""

    list_display = [
        "id",
        "task_name",
        "started_at",
        "completed_at",
        "entries_processed",
        "entries_succeeded",
        "status",
    ]
    list_filter = ["status", "started_at"]
    readonly_fields = [
        "task_id",
        "task_name",
        "started_at",
        "completed_at",
        "duration_ms",
        "entries_processed",
        "entries_succeeded",
        "entries_failed",
        "entries_conflicts",
        "status",
        "error_message",
    ]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]


# ============================================================================
# RBAC Admin (Sprint 1.1-1.2 Track C - Phase 4)
# ============================================================================


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    """Admin configuration for Department model."""

    list_display = [
        "code",
        "name",
        "department_type",
        "parent",
        "get_staff_count",
        "is_active",
    ]
    list_filter = ["department_type", "is_active", "parent"]
    search_fields = ["name", "code"]
    ordering = ["name"]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "code",
                    "name",
                    "department_type",
                    "is_active",
                )
            },
        ),
        (
            "Hierarchy",
            {
                "fields": (
                    "parent",
                    "head",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    @admin.display(description="Staff Count")
    def get_staff_count(self, obj):
        """Display number of active staff in department."""
        return obj.get_staff_count()


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    """Admin configuration for Role model."""

    list_display = [
        "code",
        "name",
        "category",
        "hierarchy_level",
        "requires_license",
        "license_body",
        "is_active",
    ]
    list_filter = ["category", "requires_license", "is_active", "hierarchy_level"]
    search_fields = ["name", "code", "license_body"]
    ordering = ["hierarchy_level", "name"]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "code",
                    "name",
                    "category",
                    "description",
                    "is_active",
                )
            },
        ),
        (
            "Hierarchy",
            {
                "fields": (
                    "hierarchy_level",
                    "parent_role",
                )
            },
        ),
        (
            "Permissions",
            {
                "fields": (
                    "permissions_matrix",
                    "django_group",
                )
            },
        ),
        (
            "License Requirements (Kenya)",
            {
                "fields": (
                    "requires_license",
                    "license_body",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    """Admin configuration for StaffProfile model."""

    list_display = [
        "employee_id",
        "get_user_full_name",
        "primary_role",
        "primary_department",
        "employment_status",
        "employment_type",
        "is_license_valid_display",
    ]
    list_filter = [
        "primary_role",
        "primary_department",
        "employment_status",
        "employment_type",
        "primary_role__requires_license",
        "license_verified",
    ]
    search_fields = [
        "employee_id",
        "user__username",
        "user__first_name",
        "user__last_name",
        "user__email",
        "license_number",
    ]
    ordering = ["user__last_name", "user__first_name"]
    readonly_fields = ["created_at", "updated_at", "is_license_valid_display"]
    filter_horizontal = ["secondary_roles", "secondary_departments"]

    actions = ["activate_staff", "deactivate_staff", "suspend_staff", "export_to_csv"]

    fieldsets = (
        (
            "User & Identity",
            {
                "fields": (
                    "user",
                    "employee_id",
                    "title",
                )
            },
        ),
        (
            "Role & Department",
            {
                "fields": (
                    "primary_role",
                    "secondary_roles",
                    "primary_department",
                    "secondary_departments",
                )
            },
        ),
        (
            "Professional Details (Kenya)",
            {
                "fields": (
                    "license_number",
                    "license_expiry",
                    "license_verified",
                    "is_license_valid_display",
                    "specialization",
                )
            },
        ),
        (
            "Contact Information",
            {
                "fields": (
                    "phone_number",
                    "emergency_contact_name",
                    "emergency_contact_phone",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Employment",
            {
                "fields": (
                    "employment_status",
                    "employment_type",
                    "date_joined",
                    "date_left",
                    "supervisor",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    @admin.display(description="Full Name")
    def get_user_full_name(self, obj):
        """Display user's full name with title."""
        return obj.get_full_name()

    @admin.display(description="License Valid", boolean=True)
    def is_license_valid_display(self, obj):
        """Display license validity status."""
        if not obj.primary_role.requires_license:
            return None  # N/A
        return obj.is_license_valid()

    @admin.action(description="Activate selected staff")
    def activate_staff(self, request, queryset):
        """Bulk action to activate staff."""
        updated = queryset.update(employment_status="ACTIVE")
        self.message_user(
            request,
            f"{updated} staff member(s) activated successfully.",
        )

    @admin.action(description="Deactivate selected staff")
    def deactivate_staff(self, request, queryset):
        """Bulk action to deactivate staff."""
        from datetime import date

        updated = 0
        for staff in queryset:
            staff.employment_status = "TERMINATED"
            if not staff.date_left:
                staff.date_left = date.today()
            staff.save()
            updated += 1

        self.message_user(
            request,
            f"{updated} staff member(s) deactivated successfully.",
        )

    @admin.action(description="Suspend selected staff")
    def suspend_staff(self, request, queryset):
        """Bulk action to suspend staff."""
        updated = queryset.update(employment_status="SUSPENDED")
        self.message_user(
            request,
            f"{updated} staff member(s) suspended successfully.",
        )

    @admin.action(description="Export selected staff to CSV")
    def export_to_csv(self, request, queryset):
        """
        Export selected staff profiles to CSV file.

        Includes key fields: employee ID, name, role, department, status, etc.
        """
        import csv
        from datetime import datetime

        from django.http import HttpResponse

        # Create the HttpResponse object with CSV header
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"staff_export_{timestamp}.csv"
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        writer = csv.writer(response)

        # Write header row
        writer.writerow(
            [
                "Employee ID",
                "Full Name",
                "Title",
                "Username",
                "Email",
                "Primary Role",
                "Primary Department",
                "Employment Status",
                "Employment Type",
                "License Number",
                "License Expiry",
                "License Verified",
                "License Valid",
                "Date Joined",
                "Supervisor",
                "Phone Number",
            ]
        )

        # Write data rows
        for staff in queryset.select_related(
            "user", "primary_role", "primary_department", "supervisor"
        ):
            writer.writerow(
                [
                    staff.employee_id,
                    staff.get_full_name(),
                    staff.title or "",
                    staff.user.username,
                    staff.user.email or "",
                    staff.primary_role.name,
                    staff.primary_department.name,
                    staff.get_employment_status_display(),
                    staff.get_employment_type_display(),
                    staff.license_number or "",
                    staff.license_expiry.isoformat() if staff.license_expiry else "",
                    "Yes" if staff.license_verified else "No",
                    "Yes" if staff.is_license_valid() else "No",
                    staff.date_joined.isoformat() if staff.date_joined else "",
                    staff.supervisor.get_full_name() if staff.supervisor else "",
                    staff.phone_number or "",
                ]
            )

        return response


@admin.register(CodeSystem)
class CodeSystemAdmin(admin.ModelAdmin):
    """Admin configuration for CodeSystem model."""

    list_display = [
        "slug",
        "name",
        "uri",
        "version",
        "publisher",
        "is_internal",
        "is_active",
        "updated_at",
    ]
    list_filter = [
        "is_internal",
        "is_active",
        "publisher",
    ]
    search_fields = [
        "slug",
        "name",
        "uri",
        "publisher",
        "description",
    ]
    readonly_fields = ["created_at", "updated_at"]
    ordering = ["slug"]
    prepopulated_fields = {"slug": ("name",)}

    fieldsets = (
        (
            "Identity",
            {
                "fields": (
                    "slug",
                    "name",
                    "uri",
                )
            },
        ),
        (
            "Details",
            {
                "fields": (
                    "version",
                    "publisher",
                    "description",
                )
            },
        ),
        (
            "Status",
            {
                "fields": (
                    "is_internal",
                    "is_active",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
                "classes": ["collapse"],
            },
        ),
    )


@admin.register(ExternalCodeMapping)
class ExternalCodeMappingAdmin(admin.ModelAdmin):
    """Admin configuration for ExternalCodeMapping model."""

    list_display = [
        "code_system",
        "code_system_ref",
        "external_code",
        "external_display",
        "content_type",
        "object_id",
        "relationship",
        "is_active",
        "updated_at",
    ]
    list_filter = [
        "code_system",
        "code_system_ref",
        "content_type",
        "relationship",
        "is_active",
    ]
    search_fields = [
        "external_code",
        "external_display",
        "code_system",
        "notes",
    ]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["content_type"]
    autocomplete_fields = ["code_system_ref"]
    ordering = ["code_system", "external_code"]

    fieldsets = (
        (
            "External System",
            {
                "fields": (
                    "code_system",
                    "code_system_ref",
                    "external_code",
                    "external_display",
                )
            },
        ),
        (
            "Internal Entity",
            {
                "fields": (
                    "content_type",
                    "object_id",
                )
            },
        ),
        (
            "Mapping Metadata",
            {
                "fields": (
                    "relationship",
                    "is_active",
                    "notes",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
                "classes": ["collapse"],
            },
        ),
    )


# ============================================================================
# Facility Admin (RBAC Capability Plan – Phase 1)
# ============================================================================


@admin.register(Facility)
class FacilityAdmin(admin.ModelAdmin):
    """
    Admin configuration for the Facility model.

    Provides a rich admin interface for managing healthcare facilities,
    including:
    * Searchable list with key identification fields.
    * Colour-coded KEPH level badges.
    * Fieldset grouping for identity, location, SHA, modules and status.
    * Read-only timestamp fields.
    """

    list_display = [
        "mfl_code",
        "name",
        "level_badge",
        "ownership",
        "county",
        "sha_contracted",
        "is_active",
    ]
    list_filter = [
        "level",
        "ownership",
        "county",
        "sha_contracted",
        "is_active",
        "has_inpatient",
        "has_emergency",
        "has_laboratory",
        "has_pharmacy",
    ]
    search_fields = ["name", "mfl_code", "sha_facility_code"]
    ordering = ["name"]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = (
        (
            "Identity",
            {
                "fields": (
                    "mfl_code",
                    "name",
                    "level",
                    "ownership",
                )
            },
        ),
        (
            "Location (Kenya Administrative Hierarchy)",
            {
                "fields": (
                    "county",
                    "sub_county",
                    "ward",
                )
            },
        ),
        (
            "SHA Registration",
            {
                "fields": (
                    "sha_contracted",
                    "sha_contract_expiry",
                    "sha_facility_code",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Enabled Service Modules",
            {
                "fields": (
                    "has_outpatient",
                    "has_inpatient",
                    "has_emergency",
                    "has_pharmacy",
                    "has_laboratory",
                    "has_imaging",
                    "has_theatre",
                    "has_dialysis",
                    "has_icu",
                    "has_maternity",
                    "has_mortuary",
                    "has_blood_bank",
                ),
                "description": "Toggle the clinical service modules available "
                "at this facility. These flags drive the sidebar navigation in "
                "the web frontend.",
            },
        ),
        (
            "Status",
            {
                "fields": (
                    "is_active",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    @admin.display(description="Level")
    def level_badge(self, obj):
        """
        Display KEPH level as a colour-coded badge in the admin list.

        Colour coding:
        * Level 1-2 (Community/Dispensary): green
        * Level 3 (Health Centre): blue
        * Level 4 (Sub-County Hospital): orange
        * Level 5-6 (Referral Hospitals): red
        """
        from django.utils.html import format_html

        colours = {
            "1": "#28a745",
            "2": "#28a745",
            "3": "#007bff",
            "4": "#fd7e14",
            "5": "#dc3545",
            "6": "#dc3545",
        }
        colour = colours.get(obj.level, "#6c757d")
        label = obj.get_level_display()
        return format_html(
            '<span style="background:{}; color:#fff; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            colour,
            label,
        )
