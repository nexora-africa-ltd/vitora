# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, E402, F401, F811
"""Core admin facility security for Vitora HMIS.

What this file is for:
- Implement admin facility security logic for the core domain.

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


class FacilityAdminForm(forms.ModelForm):
    """Custom admin form that handles the encrypted biometrics_agent_national_id property.

    The model field ``biometrics_agent_national_id`` was converted to a Python property
    (via ``encrypted_pii_property``) in migration 0062.  Django admin cannot auto-generate
    a form field for a property, so we define it explicitly here and bridge to the
    property getter/setter.
    """

    biometrics_agent_national_id = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={"size": "40"}),
    )

    class Meta:
        model = Facility
        exclude = ()  # noqa: DJ006

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            # Populate the form field from the decrypted property
            self.fields[
                "biometrics_agent_national_id"
            ].initial = self.instance.biometrics_agent_national_id

    def save(self, commit: bool = True):
        instance = super().save(commit=False)
        instance.biometrics_agent_national_id = self.cleaned_data.get(
            "biometrics_agent_national_id", ""
        )
        if commit:
            instance.save()
        return instance


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
        "operating_mode",
        "ownership",
        "county",
        "is_headquarters",
        "sha_contracted",
        "is_active",
    ]
    list_filter = [
        "organization",
        "level",
        "level_subtype",
        "operating_mode",
        "ownership",
        "county",
        "sha_contracted",
        "is_active",
        "has_inpatient",
        "has_emergency",
        "has_laboratory",
        "has_pharmacy",
    ]
    form = FacilityAdminForm
    search_fields = ["name", "mfl_code", "sha_facility_code"]
    ordering = ["name"]
    readonly_fields = ["created_at", "updated_at", "facility_ai_token_usage"]
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
                    "level_subtype",
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
            "SHA Biometrics",
            {
                "fields": (
                    "biometrics_enforced",
                    "workstation_id",
                    "biometrics_agent_national_id",
                ),
                "classes": ("collapse",),
                "description": "Biometric consent configuration for DHA HIE integration.",
            },
        ),
        (
            "DHIS2 / KHIS Integration",
            {
                "fields": ("dhis2_org_unit",),
                "classes": ("collapse",),
                "description": "DHIS2 Organisation Unit UID for reporting. "
                "Connection credentials are managed in DHIS2 Configurations.",
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
                    "has_hdu",
                    "has_nbu",
                    "has_maternity",
                    "has_mortuary",
                    "has_blood_bank",
                    "has_inventory",
                    "has_triage",
                    "has_scheduling",
                    "has_surveillance",
                    "has_immunizations",
                    "has_allied_health",
                    "has_quality",
                    "has_billing",
                    "has_private_insurance",
                    "has_moh_reporting",
                    "has_ai_assistant",
                    "has_cds",
                    "has_procedures",
                    "has_analytics",
                ),
                "description": "Toggle the clinical service modules available "
                "at this facility. These flags drive the sidebar navigation in "
                "the web frontend.",
            },
        ),
        (
            "Status",
            {
                "fields": ("is_active", "operating_mode"),
                "description": "Selecting a standalone operating mode will cascade module flags off/on on save.",
            },
        ),
        (
            "AI Token Usage",
            {
                "fields": ("facility_ai_token_usage",),
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
        label = obj.keph_level_display
        return format_html(
            '<span style="background:{}; color:#fff; padding:2px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            colour,
            label,
        )

    @admin.display(description="AI token usage (this facility)")
    def facility_ai_token_usage(self, obj) -> str:
        """Aggregate total tokens consumed by AI results at this facility."""
        from django.db.models import Sum

        from hmis.apps.ai.models import (
            AICarePlanResult,
            AICDSResult,
            AIDischargeResult,
            AIICURiskResult,
            AIInvestigationSuggestResult,
            AILabInterpretResult,
            AISurgicalChecklistSessionResult,
            AISurgicalPostOpCarePlanResult,
            AISurgicalPreOpAssessResult,
        )

        total = 0
        for model_cls in (
            AICarePlanResult,
            AICDSResult,
            AILabInterpretResult,
            AIDischargeResult,
            AIICURiskResult,
            AIInvestigationSuggestResult,
            AISurgicalPreOpAssessResult,
            AISurgicalChecklistSessionResult,
            AISurgicalPostOpCarePlanResult,
        ):
            agg = model_cls.objects.filter(facility=obj).aggregate(t=Sum("total_tokens"))
            total += agg["t"] or 0
        if total == 0:
            return "No AI usage recorded"
        return f"{total:,} tokens"


# =============================================================================
# PKI & Digital Signature Admin (DHA Gap #32 — Sprint 3.C)
# =============================================================================
# PKI & Digital Signature Admin (DHA Gap #32 — Sprint 3.C)
# =============================================================================


@admin.register(DHIS2Config)
class DHIS2ConfigAdmin(admin.ModelAdmin):
    """Admin for DHIS2/KHIS connection configurations."""

    list_display = [
        "name",
        "organization",
        "base_url",
        "username",
        "environment",
        "is_active",
        "created_at",
    ]
    list_filter = ["organization", "environment", "is_active"]
    search_fields = ["name", "base_url"]
    ordering = ["organization", "name"]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["organization"]
    fieldsets = (
        (None, {"fields": ("organization", "name", "environment", "is_active")}),
        ("Connection", {"fields": ("base_url", "username")}),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


@admin.register(CertificateAuthority)
class CertificateAuthorityAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin for Certificate Authority with intermediate CA creation support."""

    list_display = [
        "name",
        "ca_type_badge",
        "organization",
        "serial_number",
        "parent_ca",
        "is_active",
        "valid_from",
        "valid_to",
        "key_size",
    ]
    list_filter = ["is_active", "is_root", "organization"]
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
                "fields": ("is_root", "parent_ca", "organization"),
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

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs

        resolve_request_tenant(request)
        org = getattr(request, "organization", None)
        if not org:
            return qs.none()

        return qs.filter(
            models.Q(is_root=True, organization__isnull=True) | models.Q(organization=org)
        )

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
class UserCertificateAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Admin for User Certificates."""

    list_display = [
        "serial_number",
        "user",
        "organization",
        "is_revoked",
        "valid_from",
        "valid_to",
        "created_at",
    ]
    list_filter = ["is_revoked", "organization"]
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
        resolve_request_tenant(request)

        if not request.user.is_superuser:
            org = getattr(request, "organization", None)
            queryset = queryset.none() if org is None else queryset.filter(organization=org)

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
        "display_email",
        "organization",
        "facility",
        "role",
        "status",
        "invited_by",
        "expires_at",
        "created_at",
    ]
    list_filter = ["status", "organization"]
    search_fields = ["organization__name", "token"]
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

    @admin.display(description="Email")
    def display_email(self, obj):
        return obj.email or "—"


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
    autocomplete_fields = ["staff_profile", "organization", "role", "department", "invited_by"]
    filter_horizontal = ["facilities"]
    readonly_fields = ["joined_at", "created_at", "updated_at"]
    ordering = ["-joined_at"]


@admin.register(DHAOutboundCall)
class DHAOutboundCallAdmin(admin.ModelAdmin):
    """Read-only audit view for outbound DHA HIE Middleware calls."""

    list_display = (
        "created_at",
        "method",
        "path",
        "status",
        "status_code",
        "duration_ms",
        "attempt",
        "facility",
        "user",
    )
    list_filter = ("status", "method", "facility", "auth_mode")
    search_fields = ("path", "correlation_id", "consent_token", "error_code", "user__username")
    raw_id_fields = ("organization", "facility", "user")
    readonly_fields = (
        "created_at",
        "updated_at",
        "method",
        "path",
        "base_url",
        "auth_mode",
        "status",
        "status_code",
        "duration_ms",
        "attempt",
        "consent_token",
        "request_id",
        "correlation_id",
        "error_code",
        "request_payload",
        "response_excerpt",
        "error_message",
        "organization",
        "facility",
        "user",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    def has_add_permission(self, request) -> bool:  # noqa: D401
        return False

    def has_change_permission(self, request, obj=None) -> bool:  # noqa: D401
        return False
