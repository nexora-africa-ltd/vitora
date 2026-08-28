# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: RBAC and code-system admin classes/registrations.
How to use: imported by `hmis.apps.core.admin` compatibility shim.
Supported inputs/args: Django admin classes for departments, roles, staff profiles, and code mappings.
"""

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Admin configuration for core app.
"""

import json
from decimal import Decimal, InvalidOperation

from django import forms
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.html import format_html

from .emergency_access.admin import EmergencyAccessAdmin  # noqa: F401
from .mixins import TenantScopedAdminMixin, resolve_request_tenant
from .models import (
    SKU,
    ActivityFeed,
    AuditLog,
    Bundle,
    CertificateAuthority,
    CertificateRevocation,
    CodeSystem,
    County,
    Department,
    DHAOutboundCall,
    DHIS2Config,
    DocumentSignature,
    EmailVerificationToken,
    ExternalCodeMapping,
    Facility,
    FeatureFlag,
    FrontendEvent,
    IdempotencyKey,
    NetworkStatus,
    Notification,
    Organization,
    OrgMembership,
    PasswordResetToken,
    PriceBook,
    PricingQuoteSnapshot,
    Role,
    SKUDependency,
    SNOMEDConcept,
    StaffInvitation,
    StaffProfile,
    SubCounty,
    SubscriptionPlan,
    SyncConflict,
    SyncMetrics,
    SyncQueue,
    UserCertificate,
    Ward,
)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    """Admin configuration for Department model."""

    list_display = [
        "code",
        "name",
        "department_type",
        "facility",
        "organization",
        "parent",
        "get_staff_count",
        "is_active",
    ]
    list_filter = ["department_type", "is_active", "facility", "organization", "parent"]
    search_fields = ["name", "code"]
    ordering = ["name"]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["facility", "organization", "parent", "head"]

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
            "Tenant",
            {
                "fields": (
                    "facility",
                    "organization",
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

    def save_model(self, request, obj, form, change):
        """Save role and sync permissions to linked Django Group."""
        super().save_model(request, obj, form, change)
        from hmis.apps.core.role_permissions_sync import sync_role_group_permissions

        sync_role_group_permissions(obj)


class OrgMembershipInline(admin.TabularInline):
    """Inline for OrgMembership on StaffProfileAdmin."""

    model = OrgMembership
    extra = 0
    fields = ["organization", "role", "department", "is_primary", "status", "joined_at"]
    readonly_fields = ["joined_at"]
    autocomplete_fields = ["organization", "role", "department"]


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    """Admin configuration for StaffProfile model."""

    inlines = [OrgMembershipInline]

    list_display = [
        "employee_id",
        "get_user_full_name",
        "organization",
        "primary_role",
        "primary_department",
        "primary_facility",
        "employment_status",
        "employment_type",
        "is_license_valid_display",
        "mfa_disabled",
        "mfa_grace_deadline",
    ]
    list_filter = [
        "organization",
        "primary_role",
        "primary_department",
        "primary_facility",
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
    readonly_fields = [
        "created_at",
        "updated_at",
        "organization",
        "hwr_national_id_display",
        "is_license_valid_display",
    ]
    filter_horizontal = [
        "secondary_roles",
        "secondary_departments",
        "secondary_facilities",
        "secondary_organizations",
    ]

    actions = ["activate_staff", "deactivate_staff", "suspend_staff", "export_to_csv"]

    class Media:
        js = ("admin/js/staffprofile_generate_id.js",)

    fieldsets = (
        (
            "User & Identity",
            {
                "fields": (
                    "user",
                    "employee_id",
                    "title",
                    "middle_name",
                    "hwr_salutation",
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
            "Facility Assignment",
            {
                "fields": (
                    "organization",
                    "primary_facility",
                    "secondary_facilities",
                    "secondary_organizations",
                )
            },
        ),
        (
            "Professional Details (HWR Registry)",
            {
                "fields": (
                    "hwr_id",
                    "hwr_status",
                    "hwr_national_id_display",
                    "identification_type",
                    "licensing_body",
                    "license_number",
                    "license_expiry",
                    "license_verified",
                    "hwr_last_verified_at",
                    "is_license_valid_display",
                    "specialization",
                    "practice_type",
                    "subspecialty",
                    "discipline_name",
                    "educational_qualifications",
                    "postal_address",
                )
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
                    "mfa_disabled",
                    "mfa_grace_deadline",
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
        if obj is None or not getattr(obj, "primary_role_id", None):
            return None
        if not obj.primary_role.requires_license:
            return None  # N/A
        return obj.is_license_valid()

    @admin.display(description="HWR National ID")
    def hwr_national_id_display(self, obj):
        """Display HWR national ID from encrypted property."""
        return obj.hwr_national_id or ""

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
# Organization Admin (Multitenancy – Phase 1)
# ============================================================================


class FacilityInline(admin.TabularInline):
    """Inline for facilities within an organization."""

    model = Facility
    extra = 0
    fields = [
        "mfl_code",
        "name",
        "level",
        "level_subtype",
        "is_headquarters",
        "branch_code",
        "is_active",
    ]
    readonly_fields = ["mfl_code", "name"]
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        """Prevent adding facilities inline — required fields (county, sub_county, ownership) are not shown."""
        return False


class OrgStaffInline(admin.TabularInline):
    """Read-only inline showing staff assigned to this organization."""

    model = StaffProfile
    fk_name = "organization"
    extra = 0
    fields = [
        "employee_id",
        "user",
        "primary_role",
        "primary_department",
        "primary_facility",
        "employment_status",
    ]
    readonly_fields = fields
    show_change_link = True
    verbose_name = "Staff member"
    verbose_name_plural = "Staff members"
    classes = ["collapse"]

    def has_add_permission(self, request, obj=None):
        """Prevent adding staff from the org page — use StaffProfile admin instead."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent removing staff from the org page."""
        return False
