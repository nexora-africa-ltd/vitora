# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, E402, F401, F811
"""Core admin user audit for Vitora HMIS.

What this file is for:
- Implement admin user audit logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

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

# ---------------------------------------------------------------------------
# Custom UserAdmin — enforce unique email in the admin interface
# ---------------------------------------------------------------------------
User = get_user_model()

admin.site.unregister(User)


class MFAUserChangeForm(forms.ModelForm):
    """Custom User change form with an MFA disabled toggle."""

    mfa_disabled_toggle = forms.BooleanField(
        required=False,
        label="MFA disabled",
        help_text=(
            "Tick to administratively disable MFA for this user. "
            "Existing devices are preserved and become active if unticked."
        ),
    )

    class Meta:
        model = User
        fields = "__all__"  # noqa: DJ007


class UserAdmin(BaseUserAdmin):
    """Extend the default UserAdmin to enforce unique email addresses
    and provide MFA management actions."""

    form = MFAUserChangeForm
    actions = None  # None means "use parent's" — we'll add our own below

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions["disable_mfa_for_users"] = (
            UserAdmin.disable_mfa_for_users,
            "disable_mfa_for_users",
            "Disable MFA for selected users",
        )
        actions["enable_mfa_for_users"] = (
            UserAdmin.enable_mfa_for_users,
            "enable_mfa_for_users",
            "Enable MFA for selected users",
        )
        return actions

    def get_list_display(self, request):
        return super().get_list_display(request) + ("mfa_status",)

    def get_form(self, request, obj=None, change=False, **kwargs):
        kwargs["form"] = MFAUserChangeForm
        form = super().get_form(request, obj=obj, change=change, **kwargs)
        if obj is not None:
            profile = getattr(obj, "staff_profile", None)
            if profile:
                form.base_fields["mfa_disabled_toggle"].initial = profile.mfa_disabled
        return form

    def get_fieldsets(self, request, obj=None):
        fieldsets = super().get_fieldsets(request, obj)
        extra = ("MFA", {"fields": ("mfa_info", "mfa_disabled_toggle")})
        return fieldsets[:-1] + (extra,) + fieldsets[-1:]

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        readonly.append("mfa_info")
        return readonly

    @admin.display(description="MFA", boolean=False)
    def mfa_status(self, obj):
        """Show whether the user has MFA enabled."""
        from hmis.apps.core.mfa.utils import is_mfa_enabled

        profile = getattr(obj, "staff_profile", None)
        if profile and profile.mfa_disabled:
            return "Disabled"
        if is_mfa_enabled(obj):
            return "Yes"
        has_gd = profile and profile.mfa_grace_deadline
        if has_gd:
            return "Grace period"
        return "No"

    @admin.display(description="MFA details")
    def mfa_info(self, obj):
        """Read-only summary of MFA state for the change form."""
        from hmis.apps.core.mfa.utils import is_mfa_enabled, is_mfa_required

        lines = []
        profile = getattr(obj, "staff_profile", None)
        if profile and profile.mfa_disabled:
            lines.append("MFA is <strong>administratively disabled</strong>.")
        elif is_mfa_enabled(obj):
            lines.append("MFA is <strong>enabled</strong>.")
        else:
            lines.append("MFA is <strong>not configured</strong>.")

        if is_mfa_required(obj):
            lines.append("MFA is <strong>required</strong> for this user's role.")
        else:
            lines.append("MFA is <strong>not required</strong> for this user's role.")

        if profile and profile.mfa_grace_deadline:
            lines.append(
                f"Grace deadline: {profile.mfa_grace_deadline.strftime('%Y-%m-%d %H:%M UTC')}"
            )

        return format_html("<br>".join(lines))

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
        if "mfa_disabled_toggle" in form.cleaned_data:
            profile = getattr(obj, "staff_profile", None)
            if profile is not None:
                profile.mfa_disabled = bool(form.cleaned_data["mfa_disabled_toggle"])
                profile.save(update_fields=["mfa_disabled"])

    def disable_mfa_for_users(self, request, queryset):
        """Set mfa_disabled=True and clear grace deadline for selected users."""
        updated = 0
        for user in queryset:
            profile = getattr(user, "staff_profile", None)
            if profile:
                profile.mfa_disabled = True
                profile.mfa_grace_deadline = None
                profile.save(update_fields=["mfa_disabled", "mfa_grace_deadline"])
                updated += 1

        self.message_user(
            request,
            f"MFA administratively disabled for {updated} user(s). "
            f"Existing devices are preserved and will become active if re-enabled.",
        )

    disable_mfa_for_users.short_description = "Disable MFA for selected users"

    def enable_mfa_for_users(self, request, queryset):
        """Clear mfa_disabled flag and set grace deadline for selected users."""
        from datetime import timedelta

        from django.utils import timezone

        updated = 0
        for user in queryset:
            profile = getattr(user, "staff_profile", None)
            if profile:
                profile.mfa_disabled = False
                profile.mfa_grace_deadline = timezone.now() + timedelta(hours=72)
                profile.save(update_fields=["mfa_disabled", "mfa_grace_deadline"])
                updated += 1

        self.message_user(
            request,
            f"MFA re-enabled for {updated} user(s). "
            f"Users have 72 hours to set up MFA before access is restricted.",
        )

    enable_mfa_for_users.short_description = "Enable MFA for selected users"


admin.site.register(User, UserAdmin)


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
