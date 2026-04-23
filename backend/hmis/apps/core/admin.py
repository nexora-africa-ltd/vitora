"""
Admin configuration for core app.
"""

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.core.exceptions import ValidationError

from .emergency_access.admin import EmergencyAccessAdmin  # noqa: F401
from .models import (
    ActivityFeed,
    AuditLog,
    CertificateAuthority,
    CertificateRevocation,
    CodeSystem,
    County,
    Department,
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
    Role,
    SNOMEDConcept,
    StaffInvitation,
    StaffProfile,
    SubCounty,
    SyncConflict,
    SyncMetrics,
    SyncQueue,
    UserCertificate,
    Ward,
)

# ---------------------------------------------------------------------------
# Custom UserAdmin — enforce unique email in the admin interface
# ---------------------------------------------------------------------------
User = get_user_model()

admin.site.unregister(User)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Extend the default UserAdmin to enforce unique email addresses."""

    def _validate_unique_email(self, email, exclude_pk=None):
        if not email:
            return
        qs = User.objects.filter(email__iexact=email)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if qs.exists():
            raise ValidationError({"email": "A user with this email already exists."})

    def save_model(self, request, obj, form, change):
        self._validate_unique_email(obj.email, exclude_pk=obj.pk if change else None)
        super().save_model(request, obj, form, change)


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
        "sequence_number",
        "entry_hash",
        "previous_hash",
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
    raw_id_fields = ["organization", "role", "department"]


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
    readonly_fields = ["created_at", "updated_at", "organization", "is_license_valid_display"]
    filter_horizontal = [
        "secondary_roles",
        "secondary_departments",
        "secondary_facilities",
        "secondary_organizations",
    ]

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
# Organization Admin (Multitenancy – Phase 1)
# ============================================================================


class FacilityInline(admin.TabularInline):
    """Inline for facilities within an organization."""

    model = Facility
    extra = 0
    fields = ["mfl_code", "name", "level", "is_headquarters", "branch_code", "is_active"]
    readonly_fields = ["mfl_code", "name"]
    show_change_link = True


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


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    """Admin configuration for the Organization model."""

    list_display = [
        "name",
        "slug",
        "subscription_tier",
        "is_verified",
        "is_active",
        "onboarding_completed_at",
        "facility_count",
        "created_at",
    ]
    list_filter = ["subscription_tier", "is_active", "is_verified", "onboarding_completed_at"]
    search_fields = ["name", "slug", "contact_email"]
    prepopulated_fields = {"slug": ("name",)}
    ordering = ["name"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [FacilityInline, OrgStaffInline]

    fieldsets = (
        (
            "Identity",
            {
                "fields": (
                    "name",
                    "slug",
                    "logo",
                )
            },
        ),
        (
            "Contact",
            {
                "fields": (
                    "contact_email",
                    "contact_phone",
                    "address",
                )
            },
        ),
        (
            "Location (HQ)",
            {
                "fields": (
                    "county",
                    "sub_county",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Subscription & Limits",
            {
                "fields": (
                    "subscription_tier",
                    "max_facilities",
                    "max_users",
                )
            },
        ),
        (
            "Compliance",
            {
                "fields": ("data_retention_years",),
                "classes": ("collapse",),
            },
        ),
        (
            "Configuration",
            {
                "fields": ("settings",),
                "classes": ("collapse",),
            },
        ),
        (
            "Status",
            {
                "fields": ("is_verified", "is_active", "onboarding_completed_at"),
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


# ============================================================================
# Facility Admin (RBAC Capability Plan – Phase 1)
# ============================================================================


class FacilityStaffInline(admin.TabularInline):
    """Read-only inline showing staff assigned to this facility."""

    model = StaffProfile
    fk_name = "primary_facility"
    extra = 0
    fields = [
        "employee_id",
        "user",
        "primary_role",
        "primary_department",
        "employment_status",
    ]
    readonly_fields = fields
    show_change_link = True
    verbose_name = "Staff member"
    verbose_name_plural = "Staff members"
    classes = ["collapse"]

    def has_add_permission(self, request, obj=None):
        """Prevent adding staff from the facility page — use StaffProfile admin instead."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent removing staff from the facility page."""
        return False


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
        "organization",
        "level_badge",
        "ownership",
        "county",
        "is_headquarters",
        "sha_contracted",
        "is_active",
    ]
    list_filter = [
        "organization",
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
    raw_id_fields = ["organization"]
    inlines = [FacilityStaffInline]

    fieldsets = (
        (
            "Organization",
            {
                "fields": (
                    "organization",
                    "is_headquarters",
                    "branch_code",
                )
            },
        ),
        (
            "Identity",
            {
                "fields": (
                    "mfl_code",
                    "name",
                    "logo",
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
                    "has_inventory",
                ),
                "description": "Toggle the clinical service modules available "
                "at this facility. These flags drive the sidebar navigation in "
                "the web frontend.",
            },
        ),
        (
            "Status",
            {"fields": ("is_active",)},
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


# =============================================================================
# PKI & Digital Signature Admin (DHA Gap #32 — Sprint 3.C)
# =============================================================================


@admin.register(CertificateAuthority)
class CertificateAuthorityAdmin(admin.ModelAdmin):
    """Admin for Certificate Authority with intermediate CA creation support."""

    list_display = [
        "name",
        "ca_type_badge",
        "serial_number",
        "parent_ca",
        "is_active",
        "valid_from",
        "valid_to",
        "key_size",
    ]
    list_filter = ["is_active", "is_root"]
    readonly_fields = [
        "serial_number",
        "subject_dn",
        "public_key_pem",
        "certificate_pem",
        "private_key_pem_encrypted",
        "valid_from",
        "valid_to",
        "is_root",
        "parent_ca",
        "key_size",
        "created_at",
        "updated_at",
    ]
    search_fields = ["name", "serial_number", "subject_dn"]
    fieldsets = (
        (
            None,
            {
                "fields": ("name", "serial_number", "subject_dn"),
            },
        ),
        (
            "Hierarchy",
            {
                "fields": ("is_root", "parent_ca"),
            },
        ),
        (
            "Validity",
            {
                "fields": ("valid_from", "valid_to", "is_active", "key_size"),
            },
        ),
        (
            "Keys & Certificate (read-only)",
            {
                "classes": ("collapse",),
                "fields": ("public_key_pem", "certificate_pem", "private_key_pem_encrypted"),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
            },
        ),
    )
    actions = ["create_intermediate_ca_action"]

    @admin.display(description="Type", ordering="is_root")
    def ca_type_badge(self, obj):
        from django.utils.html import format_html

        if obj.is_root:
            return format_html(
                '<span style="background:#dcfce7;color:#166534;padding:2px 8px;'
                'border-radius:4px;font-size:11px;font-weight:600;">Root</span>'
            )
        return format_html(
            '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;'
            'border-radius:4px;font-size:11px;font-weight:600;">Intermediate</span>'
        )

    @admin.action(description="Create intermediate CA from selected root CA")
    def create_intermediate_ca_action(self, request, queryset):
        """Create an intermediate CA signed by the selected root CA."""
        from .services.pki_service import PKIService

        root_cas = queryset.filter(is_root=True, is_active=True)
        if root_cas.count() != 1:
            self.message_user(
                request,
                "Select exactly one active root CA to create an intermediate CA.",
                level="error",
            )
            return

        parent_ca = root_cas.first()
        service = PKIService()
        try:
            ca = service.create_intermediate_ca(
                parent_ca=parent_ca,
                name="Facility Intermediate CA",
                org="Health Facility",
            )
            self.message_user(
                request,
                f"Intermediate CA '{ca.name}' created (signed by '{parent_ca.name}').",
            )
        except ValueError as e:
            self.message_user(request, f"Failed: {e}", level="error")

    def has_add_permission(self, request):
        """Prevent manual CA creation — use init_pki_ca or create_intermediate_ca_action."""
        return False


@admin.register(UserCertificate)
class UserCertificateAdmin(admin.ModelAdmin):
    """Admin for User Certificates."""

    list_display = ["serial_number", "user", "is_revoked", "valid_from", "valid_to", "created_at"]
    list_filter = ["is_revoked"]
    readonly_fields = [
        "serial_number",
        "subject_dn",
        "public_key_pem",
        "certificate_pem",
        "valid_from",
        "valid_to",
        "created_at",
        "updated_at",
    ]
    search_fields = ["serial_number", "user__username", "subject_dn"]
    raw_id_fields = ["user", "certificate_authority"]
    actions = ["revoke_certificates"]

    @admin.action(description="Revoke selected certificates")
    def revoke_certificates(self, request, queryset):
        from .services.pki_service import PKIService

        service = PKIService()
        count = 0
        for cert in queryset.filter(is_revoked=False):
            service.revoke_certificate(cert, reason="PRIVILEGE_WITHDRAWN", user=request.user)
            count += 1
        self.message_user(request, f"{count} certificate(s) revoked.")


@admin.register(CertificateRevocation)
class CertificateRevocationAdmin(admin.ModelAdmin):
    """Admin for Certificate Revocation entries (read-only log)."""

    list_display = ["certificate", "reason", "revoked_at", "revoked_by"]
    list_filter = ["reason"]
    readonly_fields = ["certificate", "revoked_at", "reason", "revoked_by", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(DocumentSignature)
class DocumentSignatureAdmin(admin.ModelAdmin):
    """Admin for Document Signatures (read-only log)."""

    list_display = ["document_type", "document_id", "signer", "signed_at", "is_valid"]
    list_filter = ["document_type", "is_valid"]
    readonly_fields = [
        "document_type",
        "document_id",
        "signer",
        "certificate",
        "content_hash",
        "signature",
        "hash_algorithm",
        "signed_at",
        "is_valid",
        "verification_note",
        "created_at",
    ]
    search_fields = ["document_type", "signer__username"]
    raw_id_fields = ["signer", "certificate"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


# ============================================================================
# Onboarding & Lifecycle Admin
# ============================================================================


@admin.register(StaffInvitation)
class StaffInvitationAdmin(admin.ModelAdmin):
    """Admin for Staff Invitations."""

    list_display = [
        "email",
        "organization",
        "facility",
        "role",
        "status",
        "invited_by",
        "expires_at",
        "created_at",
    ]
    list_filter = ["status", "organization"]
    search_fields = ["email", "organization__name", "token"]
    readonly_fields = ["token", "accepted_at", "accepted_user", "created_at", "updated_at"]
    raw_id_fields = [
        "invited_by",
        "accepted_user",
        "organization",
        "facility",
        "role",
        "department",
    ]
    ordering = ["-created_at"]


@admin.register(EmailVerificationToken)
class EmailVerificationTokenAdmin(admin.ModelAdmin):
    """Admin for Email Verification Tokens."""

    list_display = ["user", "organization", "token", "used", "expires_at", "created_at"]
    list_filter = ["used"]
    search_fields = ["user__username", "user__email", "organization__name"]
    readonly_fields = ["token", "used_at", "created_at"]
    raw_id_fields = ["user", "organization"]
    ordering = ["-created_at"]

    def has_add_permission(self, request):
        return False


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    """Admin for Password Reset Tokens."""

    list_display = ["user", "token", "used", "expires_at", "created_at"]
    list_filter = ["used"]
    search_fields = ["user__username", "user__email"]
    readonly_fields = ["token", "used_at", "created_at"]
    raw_id_fields = ["user"]
    ordering = ["-created_at"]

    def has_add_permission(self, request):
        return False


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    """Admin for Notifications."""

    list_display = ["user", "notification_type", "priority", "title", "is_read", "created_at"]
    list_filter = ["notification_type", "priority", "is_read"]
    search_fields = ["user__username", "title", "message"]
    readonly_fields = ["created_at", "read_at"]
    raw_id_fields = ["user"]
    ordering = ["-created_at"]


@admin.register(ActivityFeed)
class ActivityFeedAdmin(admin.ModelAdmin):
    """Admin for Activity Feed entries."""

    list_display = ["activity_type", "action", "title", "user", "timestamp"]
    list_filter = ["activity_type"]
    search_fields = ["title", "description", "user__username"]
    readonly_fields = ["timestamp"]
    raw_id_fields = ["user"]
    ordering = ["-timestamp"]

    def has_add_permission(self, request):
        return False


@admin.register(FrontendEvent)
class FrontendEventAdmin(admin.ModelAdmin):
    """Admin for Frontend Event tracking (read-only)."""

    list_display = ["event_type", "user", "resource_type", "resource_id", "server_timestamp"]
    list_filter = ["event_type", "device_type", "was_offline"]
    search_fields = ["user__username", "resource_type", "session_id"]
    readonly_fields = [
        "user",
        "event_type",
        "resource_type",
        "resource_id",
        "client_timestamp",
        "server_timestamp",
        "session_id",
        "device_type",
        "details",
        "was_offline",
    ]
    ordering = ["-server_timestamp"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(SNOMEDConcept)
class SNOMEDConceptAdmin(admin.ModelAdmin):
    """Admin for cached SNOMED CT Concepts."""

    list_display = ["concept_id", "display", "semantic_tag", "is_active"]
    list_filter = ["semantic_tag", "is_active"]
    search_fields = ["concept_id", "display"]
    ordering = ["display"]


@admin.register(IdempotencyKey)
class IdempotencyKeyAdmin(admin.ModelAdmin):
    """Admin for Idempotency Keys (troubleshooting)."""

    list_display = ["key", "user", "resource_type", "resource_id", "response_status", "created_at"]
    list_filter = ["resource_type", "response_status"]
    search_fields = ["key", "user__username", "resource_type"]
    readonly_fields = [
        "key",
        "user",
        "resource_type",
        "resource_id",
        "response_status",
        "response_data",
        "created_at",
    ]
    raw_id_fields = ["user"]
    ordering = ["-created_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(OrgMembership)
class OrgMembershipAdmin(admin.ModelAdmin):
    """Admin configuration for OrgMembership model."""

    list_display = [
        "staff_profile",
        "organization",
        "role",
        "department",
        "is_primary",
        "status",
        "joined_at",
    ]
    list_filter = ["organization", "role", "status", "is_primary"]
    search_fields = [
        "staff_profile__user__username",
        "staff_profile__user__first_name",
        "staff_profile__user__last_name",
        "staff_profile__employee_id",
        "organization__name",
    ]
    raw_id_fields = ["staff_profile", "organization", "role", "department", "invited_by"]
    filter_horizontal = ["facilities"]
    readonly_fields = ["joined_at", "created_at", "updated_at"]
    ordering = ["-joined_at"]
