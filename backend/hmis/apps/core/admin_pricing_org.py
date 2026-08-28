# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, E402, F401, F811
"""Core admin pricing org for Vitora HMIS.

What this file is for:
- Implement admin pricing org logic for the core domain.

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

from .admin_rbac_codes import FacilityInline, OrgStaffInline
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


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    """Admin configuration for the SubscriptionPlan model."""

    class FeaturesWidget(forms.Widget):
        """Renders SubscriptionPlan.features as toggleable checkboxes."""

        def __init__(self, feature_choices, attrs=None):
            super().__init__(attrs)
            self.feature_choices = feature_choices

        def render(self, name, value, attrs=None, renderer=None):
            from django.utils.html import format_html, format_html_join

            if isinstance(value, str):
                try:
                    value = json.loads(value)
                except (json.JSONDecodeError, TypeError):
                    value = {}
            if not isinstance(value, dict):
                value = {}
            items = []
            for key, label in self.feature_choices:
                checked = " checked" if value.get(key, False) else ""
                items.append(
                    format_html(
                        '<label style="display:inline-flex;align-items:center;gap:6px;'
                        'cursor:pointer;padding:2px 0;">'
                        '<input type="checkbox" name="{}"{}>{}</label>',
                        f"{name}_{key}",
                        checked,
                        label,
                    )
                )
            inner = format_html_join("\n", "{}", ((item,) for item in items))
            return format_html(
                '<div style="display:grid;grid-template-columns:repeat(3,1fr);'
                'gap:6px 24px;">{}</div>',
                inner,
            )

        def value_from_datadict(self, data, files, name):
            result = {}
            for key, _label in self.feature_choices:
                result[key] = f"{name}_{key}" in data
            return json.dumps(result)

    class SubscriptionPlanForm(forms.ModelForm):
        class Meta:
            model = SubscriptionPlan
            exclude = ()  # noqa: DJ006

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.fields["features"].widget = SubscriptionPlanAdmin.FeaturesWidget(
                feature_choices=SubscriptionPlan.FEATURE_REGISTRY
            )

    form = SubscriptionPlanForm

    list_display = [
        "name",
        "code",
        "monthly_price",
        "annual_price",
        "max_facilities",
        "max_users",
        "is_active",
        "sort_order",
    ]
    list_filter = ["is_active", "code"]
    search_fields = ["name", "code"]
    ordering = ["sort_order", "monthly_price"]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = (
        (
            "Identity",
            {"fields": ("code", "name", "description")},
        ),
        (
            "Pricing (KES)",
            {"fields": ("monthly_price", "annual_price")},
        ),
        (
            "Limits",
            {"fields": ("max_facilities", "max_users", "max_patients", "monthly_ai_tokens")},
        ),
        (
            "Features",
            {"fields": ("features",)},
        ),
        (
            "Display & Status",
            {"fields": ("is_active", "sort_order", "trial_period_days")},
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )


class SKUDependencyInline(admin.TabularInline):
    model = SKUDependency
    extra = 0
    fields = ["rule_type", "required_feature_keys", "error_message", "is_active", "created_at"]
    readonly_fields = ["created_at"]


@admin.register(PriceBook)
class PriceBookAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "currency", "is_active", "sort_order", "updated_at"]
    list_filter = ["is_active", "currency"]
    search_fields = ["name", "code"]
    ordering = ["sort_order", "code"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(SKU)
class SKUAdmin(admin.ModelAdmin):
    list_display = [
        "code",
        "name",
        "price_book",
        "sku_type",
        "monthly_price",
        "annual_price",
        "is_active",
        "sort_order",
    ]
    list_filter = ["price_book", "sku_type", "is_active"]
    search_fields = ["code", "name", "price_book__code", "price_book__name"]
    ordering = ["price_book", "sort_order", "code"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [SKUDependencyInline]
    fieldsets = (
        (
            "Identity",
            {"fields": ("price_book", "code", "name", "description", "sku_type")},
        ),
        (
            "Feature Mapping",
            {"fields": ("enabled_feature_keys",)},
        ),
        (
            "Pricing",
            {"fields": ("monthly_price", "annual_price")},
        ),
        (
            "Included Usage",
            {"fields": ("included_ai_tokens", "included_sms_messages", "included_api_calls")},
        ),
        (
            "Display & Status",
            {"fields": ("is_active", "sort_order")},
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )


@admin.register(SKUDependency)
class SKUDependencyAdmin(admin.ModelAdmin):
    list_display = ["sku", "rule_type", "is_active", "updated_at"]
    list_filter = ["rule_type", "is_active", "sku__price_book"]
    search_fields = ["sku__code", "sku__name", "sku__price_book__code"]
    ordering = ["sku__price_book", "sku__code", "id"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Bundle)
class BundleAdmin(admin.ModelAdmin):
    list_display = [
        "code",
        "name",
        "price_book",
        "discount_type",
        "discount_value",
        "is_active",
        "sort_order",
    ]
    list_filter = ["price_book", "discount_type", "is_active"]
    search_fields = ["code", "name", "price_book__code", "price_book__name"]
    ordering = ["price_book", "sort_order", "code"]
    readonly_fields = ["created_at", "updated_at"]
    fieldsets = (
        (
            "Identity",
            {"fields": ("price_book", "code", "name", "description")},
        ),
        (
            "Bundle Rules",
            {"fields": ("included_sku_codes", "discount_type", "discount_value")},
        ),
        (
            "Display & Status",
            {"fields": ("is_active", "sort_order")},
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )


@admin.register(PricingQuoteSnapshot)
class PricingQuoteSnapshotAdmin(admin.ModelAdmin):
    class SnapshotExpiryFilter(admin.SimpleListFilter):
        title = "expiry"
        parameter_name = "snapshot_expiry"

        def lookups(self, request, model_admin):
            return [
                ("active", "Active"),
                ("expired", "Expired"),
                ("no_expiry", "No expiry set"),
            ]

        def queryset(self, request, queryset):
            value = self.value()
            now = timezone.now()
            if value == "active":
                return queryset.filter(expires_at__gt=now)
            if value == "expired":
                return queryset.filter(expires_at__isnull=False, expires_at__lte=now)
            if value == "no_expiry":
                return queryset.filter(expires_at__isnull=True)
            return queryset

    class SnapshotValueBandFilter(admin.SimpleListFilter):
        title = "quoted total"
        parameter_name = "quote_value_band"

        def lookups(self, request, model_admin):
            return [
                ("lt_10000", "< 10,000"),
                ("10k_50k", "10,000 - 49,999"),
                ("50k_100k", "50,000 - 99,999"),
                ("gte_100k", ">= 100,000"),
            ]

        @staticmethod
        def _total_for_snapshot(snapshot):
            raw = (snapshot.quote_payload or {}).get("total")
            try:
                return Decimal(str(raw))
            except (TypeError, ValueError, InvalidOperation):
                return None

        def queryset(self, request, queryset):
            value = self.value()
            if value is None:
                return queryset

            ids = []
            for snapshot in queryset.only("id", "quote_payload"):
                total = self._total_for_snapshot(snapshot)
                if total is None:
                    continue
                if (
                    value == "lt_10000"
                    and total < Decimal("10000")
                    or value == "10k_50k"
                    and Decimal("10000") <= total < Decimal("50000")
                    or value == "50k_100k"
                    and Decimal("50000") <= total < Decimal("100000")
                    or value == "gte_100k"
                    and total >= Decimal("100000")
                ):
                    ids.append(snapshot.id)
            return queryset.filter(id__in=ids)

    list_display = [
        "quote_id",
        "resolved_plan",
        "quoted_total",
        "is_snapshot_active",
        "catalog_version",
        "source",
        "created_at",
        "expires_at",
    ]
    list_filter = [
        "resolved_plan",
        "catalog_version",
        "source",
        SnapshotExpiryFilter,
        SnapshotValueBandFilter,
        "created_at",
    ]
    date_hierarchy = "created_at"
    list_per_page = 50
    search_fields = ["quote_id", "catalog_version", "source"]
    ordering = ["-created_at"]
    readonly_fields = [
        "quote_id",
        "source",
        "catalog_version",
        "resolved_plan",
        "request_payload",
        "quote_payload",
        "created_at",
        "updated_at",
        "expires_at",
    ]

    def has_add_permission(self, request):
        return False

    @admin.display(description="Quoted Total")
    def quoted_total(self, obj):
        payload = obj.quote_payload or {}
        total = payload.get("total")
        currency = payload.get("currency", "KES")
        if total in (None, ""):
            return "-"
        return f"{currency} {total}"

    @admin.display(boolean=True, description="Active")
    def is_snapshot_active(self, obj):
        return obj.expires_at is None or obj.expires_at > timezone.now()


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    """Admin configuration for the Organization model."""

    list_display = [
        "name",
        "slug",
        "subscription_tier",
        "subscription_status",
        "is_verified",
        "is_active",
        "onboarding_completed_at",
        "facility_count",
        "ai_token_usage_display",
        "tibabot_keys_count",
        "created_at",
    ]
    list_filter = [
        "subscription_tier",
        "subscription_status",
        "is_active",
        "is_verified",
        "onboarding_completed_at",
    ]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}
    ordering = ["name"]
    readonly_fields = [
        "created_at",
        "updated_at",
        "subscription_tier",
        "max_facilities",
        "max_users",
        "max_patients",
        "monthly_ai_tokens",
        "ai_tokens_used",
        "ai_tokens_reset_at",
        "ai_tokens_remaining_display",
        "tibabot_keys_summary",
        "display_contact_email",
        "display_contact_phone",
        "display_address",
    ]
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
                    "display_contact_email",
                    "display_contact_phone",
                    "display_address",
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
                    "subscription_plan",
                    "subscription_tier",
                    "subscription_status",
                    "subscription_valid_until",
                    "max_facilities",
                    "max_users",
                    "max_patients",
                )
            },
        ),
        (
            "AI Token Usage",
            {
                "fields": (
                    "monthly_ai_tokens",
                    "ai_tokens_used",
                    "ai_tokens_remaining_display",
                    "ai_tokens_reset_at",
                ),
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
            "TibaBot AI Integration",
            {
                "fields": ("tibabot_keys_summary",),
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

    @admin.display(description="Contact Email")
    def display_contact_email(self, obj: Organization) -> str:
        """Display decrypted contact email."""
        return obj.contact_email or "—"

    @admin.display(description="Contact Phone")
    def display_contact_phone(self, obj: Organization) -> str:
        """Display decrypted contact phone."""
        return obj.contact_phone or "—"

    @admin.display(description="Address")
    def display_address(self, obj: Organization) -> str:
        """Display decrypted address."""
        return obj.address or "—"

    @admin.display(description="AI Keys")
    def tibabot_keys_count(self, obj: Organization) -> str:
        """Show active/total TibaBot key count in list view."""
        from hmis.apps.ai.models import TibaBotFacilityKey

        qs = TibaBotFacilityKey.objects.filter(facility__organization=obj)
        total = qs.count()
        if total == 0:
            return "—"
        active = qs.filter(is_active=True).count()
        return f"{active}/{total}"

    @admin.display(description="AI Tokens (used / quota)")
    def ai_token_usage_display(self, obj: Organization) -> str:
        """Show token usage vs quota in list view."""
        used = obj.ai_tokens_used or 0
        quota = obj.monthly_ai_tokens
        if quota is None:
            return f"{used:,} / ∞"
        if quota == 0:
            return "No AI access"
        return f"{used:,} / {quota:,}"

    @admin.display(description="Tokens remaining")
    def ai_tokens_remaining_display(self, obj: Organization) -> str:
        """Read-only computed field showing remaining AI tokens."""
        remaining = obj.ai_tokens_remaining
        if remaining is None:
            return "Unlimited"
        return f"{remaining:,}"

    @admin.display(description="TibaBot Facility Keys")
    def tibabot_keys_summary(self, obj: Organization) -> str:
        """
        Read-only detail field showing which facilities have TibaBot keys.

        Displays a compact HTML table with facility name, MFL code, masked key,
        and status for every key under this organization's facilities.
        """
        from django.utils.html import format_html, format_html_join

        from hmis.apps.ai.models import TibaBotFacilityKey

        keys = (
            TibaBotFacilityKey.objects.filter(facility__organization=obj)
            .select_related("facility")
            .order_by("facility__name")
        )
        if not keys.exists():
            return "No TibaBot API keys provisioned for this organization's facilities."

        rows = format_html_join(
            "\n",
            "<tr><td style='padding:4px 8px'>{}</td>"
            "<td style='padding:4px 8px'>{}</td>"
            "<td style='padding:4px 8px'><code>{}</code></td>"
            "<td style='padding:4px 8px'>{}</td></tr>",
            (
                (
                    fk.facility.name,
                    fk.facility.mfl_code,
                    fk.masked_key,
                    "✅ Active" if fk.is_active else "❌ Revoked",
                )
                for fk in keys
            ),
        )

        return format_html(
            "<table style='border-collapse:collapse'>"
            "<thead><tr>"
            "<th style='padding:4px 8px;text-align:left'>Facility</th>"
            "<th style='padding:4px 8px;text-align:left'>MFL Code</th>"
            "<th style='padding:4px 8px;text-align:left'>Key</th>"
            "<th style='padding:4px 8px;text-align:left'>Status</th>"
            "</tr></thead>"
            "<tbody>{}</tbody></table>",
            rows,
        )


# ============================================================================
# Facility Admin (RBAC Capability Plan – Phase 1)
# ============================================================================
