# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core models reference pricing for Vitora HMIS.

What this file is for:
- Implement models reference pricing logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from hmis.apps.core.models_audit_sync import TimeStampedModel


class SubscriptionPlan(TimeStampedModel):
    """
    Defines a subscription tier with pricing, limits, and feature flags.

    Each Organization references a tier code (general HMIS tiers and standalone
    tiers), and this model stores the configurable details for that tier.
    """

    class TierCode(models.TextChoices):
        """Tier code choices — must stay in sync with Organization.SubscriptionTier."""

        FREE = "FREE", "Free"
        BASIC = "BASIC", "Basic"
        PROFESSIONAL = "PROFESSIONAL", "Professional"
        ENTERPRISE = "ENTERPRISE", "Enterprise"
        LIS_STANDALONE = "LIS_STANDALONE", "Standalone Laboratory"
        PHARMACY_STANDALONE = "PHARMACY_STANDALONE", "Standalone Pharmacy"
        IMAGING_STANDALONE = "IMAGING_STANDALONE", "Standalone Imaging"
        DIAGNOSTIC_STANDALONE = "DIAGNOSTIC_STANDALONE", "Standalone Diagnostic Centre"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    code = models.CharField(
        max_length=32,
        choices=TierCode.choices,
        unique=True,
        help_text="Unique tier code (matches Organization.subscription_tier).",
    )
    name = models.CharField(
        max_length=100,
        help_text="Display name shown to customers (e.g. 'Professional Plan').",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Marketing description of this plan.",
    )

    # ------------------------------------------------------------------
    # Pricing (KES)
    # ------------------------------------------------------------------

    monthly_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Monthly price in KES.",
    )
    annual_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Annual price in KES (typically discounted).",
    )

    # ------------------------------------------------------------------
    # Limits
    # ------------------------------------------------------------------

    max_facilities = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of facilities (null = unlimited).",
    )
    max_users = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of staff users (null = unlimited).",
    )
    max_patients = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of patient records (null = unlimited).",
    )

    # ------------------------------------------------------------------
    # Features
    # ------------------------------------------------------------------

    features = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Feature flags for this plan. Example: "
            '{"pharmacy": true, "laboratory": true, "ai_assistant": false}'
        ),
    )

    # Canonical registry of subscription feature keys.
    # Used by the admin widget to render toggleable checkboxes.
    FEATURE_REGISTRY: list[tuple[str, str]] = [
        # Module features (mirror Facility has_* flags)
        ("outpatient", "Outpatient (OPD)"),
        ("inpatient", "Inpatient (IPD)"),
        ("emergency", "Emergency / Casualty"),
        ("pharmacy", "Pharmacy"),
        ("laboratory", "Laboratory"),
        ("imaging", "Imaging / Radiology"),
        ("theatre", "Surgical Theatre"),
        ("dialysis", "Renal Dialysis"),
        ("icu", "ICU"),
        ("hdu", "HDU"),
        ("nbu", "NBU"),
        ("maternity", "Maternity / Obstetrics"),
        ("mortuary", "Mortuary"),
        ("blood_bank", "Blood Bank"),
        ("inventory", "Inventory / Supply Chain"),
        ("billing", "Billing & Invoicing"),
        ("scheduling", "Staff Rostering & Scheduling"),
        ("triage", "Triage / Acuity Scoring"),
        ("surveillance", "Disease Surveillance / IDSR"),
        ("immunizations", "Immunizations / Vaccination"),
        ("allied_health", "Allied Health (Physio, Nutrition, etc.)"),
        ("quality", "Quality Improvement & Clinical Audit"),
        ("private_insurance", "Private Insurance Claims"),
        ("moh_reporting", "MOH 705/711/717 Aggregate Reporting"),
        # Standalone module variants (sold as dedicated SaaS plans)
        ("lis_standalone", "Standalone Laboratory (LIS)"),
        ("pharmacy_standalone", "Standalone Pharmacy / Retail"),
        ("imaging_standalone", "Standalone Imaging / RIS"),
        # Platform features
        ("ai_assistant", "AI Assistant (TibaBot)"),
        ("sha_claims", "SHA Claims Integration"),
        ("dhis2_reporting", "DHIS2 / KHIS Reporting"),
        ("analytics", "Analytics & BI Dashboards"),
        ("api_access", "API Access"),
        ("custom_reports", "Custom Reports"),
        ("offline_sync", "Offline Sync"),
        ("sms_notifications", "SMS & WhatsApp Notifications"),
    ]

    # ------------------------------------------------------------------
    # Display & Status
    # ------------------------------------------------------------------

    is_active = models.BooleanField(
        default=True,
        help_text="Whether this plan is currently available for selection.",
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        help_text="Display order (lower = first).",
    )
    trial_period_days = models.PositiveIntegerField(
        default=0,
        help_text="Trial period in days (0 = no trial).",
    )
    monthly_ai_tokens = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Monthly AI token quota (null = unlimited). Resets on billing cycle.",
    )

    # ------------------------------------------------------------------
    # Meta & Methods
    # ------------------------------------------------------------------

    class Meta:
        verbose_name = "Subscription Plan"
        verbose_name_plural = "Subscription Plans"
        ordering = ["sort_order", "monthly_price"]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_code_display()})"

    def save(self, *args, **kwargs):
        """Prevent live commercial edits from rewriting active customer terms."""
        if self.pk:
            previous = type(self).objects.get(pk=self.pk)
            protected = (
                "monthly_price",
                "annual_price",
                "max_facilities",
                "max_users",
                "max_patients",
                "monthly_ai_tokens",
            )
            if self.organizations.exists() and any(
                getattr(previous, field) != getattr(self, field) for field in protected
            ):
                raise ValidationError(
                    "Create a new subscription plan version instead of changing active customer terms."
                )
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Retain plans referenced by subscription billing history."""
        if self.subscription_periods.exists():
            raise ValidationError(
                "Plans with subscription billing history cannot be deleted. Deactivate them."
            )
        return super().delete(*args, **kwargs)

    @property
    def annual_savings(self) -> Decimal:
        """Return annual savings compared to monthly billing."""
        monthly_annual = self.monthly_price * Decimal("12")
        return max(monthly_annual - self.annual_price, Decimal("0"))

    @property
    def has_trial(self) -> bool:
        """Whether this plan offers a trial period."""
        return self.trial_period_days > 0


class SubscriptionPeriod(TimeStampedModel):
    """Immutable commercial period that grants a plan after verified payment."""

    class BillingInterval(models.TextChoices):
        MONTHLY = "MONTHLY", "Monthly"
        ANNUAL = "ANNUAL", "Annual"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending payment"
        PAID = "PAID", "Paid"
        VOID = "VOID", "Void"

    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="subscription_periods"
    )
    plan = models.ForeignKey(
        SubscriptionPlan, on_delete=models.PROTECT, related_name="subscription_periods"
    )
    billing_interval = models.CharField(max_length=10, choices=BillingInterval.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="KES")
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    payment_reference = models.CharField(max_length=100, blank=True, unique=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.PROTECT)

    class Meta:
        ordering = ["-period_end"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(period_end__gt=models.F("period_start")),
                name="subscription_period_end_after_start",
            )
        ]

    def confirm_payment(self, payment_reference: str, confirmed_by=None) -> None:
        """Idempotently activate the purchased plan after payment verification."""
        if not payment_reference:
            raise ValidationError("A verified payment reference is required.")
        with transaction.atomic():
            period = type(self).objects.select_for_update().get(pk=self.pk)
            if period.status == self.Status.PAID:
                if period.payment_reference != payment_reference:
                    raise ValidationError(
                        "Subscription period is already paid with another reference."
                    )
                self.refresh_from_db()
                return
            period.status = self.Status.PAID
            period.payment_reference = payment_reference
            period.confirmed_at = timezone.now()
            period.confirmed_by = confirmed_by
            period.save(
                update_fields=[
                    "status",
                    "payment_reference",
                    "confirmed_at",
                    "confirmed_by",
                    "updated_at",
                ]
            )
            org = period.organization
            org.subscription_plan = period.plan
            org.subscription_status = "ACTIVE"
            org.subscription_valid_until = period.period_end
            org.ai_tokens_used = 0
            org.ai_tokens_reset_at = period.confirmed_at
            org.save(
                update_fields=[
                    "subscription_plan",
                    "subscription_status",
                    "subscription_valid_until",
                    "ai_tokens_used",
                    "ai_tokens_reset_at",
                ]
            )
        self.refresh_from_db()


class PriceBook(TimeStampedModel):
    """Versioned catalog of sellable SKUs for cart-based pricing."""

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    currency = models.CharField(max_length=3, default="KES")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "code"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class SKU(TimeStampedModel):
    """Sellable stock-keeping unit used in pricing cart calculations."""

    class SKUType(models.TextChoices):
        BASE = "BASE", "Base"
        MODULE = "MODULE", "Module"
        PLATFORM = "PLATFORM", "Platform"
        STANDALONE = "STANDALONE", "Standalone"

    price_book = models.ForeignKey("core.PriceBook", on_delete=models.CASCADE, related_name="skus")
    code = models.CharField(max_length=64)
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True, default="")
    sku_type = models.CharField(max_length=20, choices=SKUType.choices, default=SKUType.MODULE)

    # One SKU can enable one or many feature keys in SubscriptionPlan.features.
    enabled_feature_keys = models.JSONField(default=list, blank=True)

    monthly_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    annual_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Included usage quantities contributed by this SKU.
    included_ai_tokens = models.PositiveIntegerField(default=0)
    included_sms_messages = models.PositiveIntegerField(default=0)
    included_api_calls = models.PositiveIntegerField(default=0)

    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "code"]
        constraints = [
            models.UniqueConstraint(fields=["price_book", "code"], name="uniq_pricebook_sku_code")
        ]

    def __str__(self) -> str:
        return f"{self.code} ({self.price_book.code})"


class SKUDependency(TimeStampedModel):
    """Dependency rule for a SKU based on resolved feature keys."""

    class RuleType(models.TextChoices):
        FEATURE_ALL = "FEATURE_ALL", "Feature All"
        FEATURE_ANY = "FEATURE_ANY", "Feature Any"

    sku = models.ForeignKey("core.SKU", on_delete=models.CASCADE, related_name="dependencies")
    rule_type = models.CharField(
        max_length=20, choices=RuleType.choices, default=RuleType.FEATURE_ALL
    )
    required_feature_keys = models.JSONField(default=list, blank=True)
    error_message = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sku__code", "id"]

    def __str__(self) -> str:
        return f"{self.sku.code} dependency ({self.rule_type})"


class Bundle(TimeStampedModel):
    """Automatic discount bundle resolved from selected SKU sets."""

    class DiscountType(models.TextChoices):
        PERCENT = "PERCENT", "Percent"
        FIXED = "FIXED", "Fixed"
        NEGOTIATED = "NEGOTIATED", "Negotiated"

    price_book = models.ForeignKey(
        "core.PriceBook", on_delete=models.CASCADE, related_name="bundles"
    )
    code = models.CharField(max_length=64)
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True, default="")
    included_sku_codes = models.JSONField(default=list, blank=True)
    discount_type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        default=DiscountType.PERCENT,
    )
    discount_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "code"]
        constraints = [
            models.UniqueConstraint(
                fields=["price_book", "code"],
                name="uniq_pricebook_bundle_code",
            )
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class PricingQuoteSnapshot(TimeStampedModel):
    """Persisted pricing quote snapshot for lead forms and sales follow-up."""

    class ResolvedPlan(models.TextChoices):
        BASIC = "BASIC", "Basic"
        PROFESSIONAL = "PROFESSIONAL", "Professional"
        ENTERPRISE = "ENTERPRISE", "Enterprise"
        LIS_STANDALONE = "LIS_STANDALONE", "Standalone Laboratory"
        PHARMACY_STANDALONE = "PHARMACY_STANDALONE", "Standalone Pharmacy"
        IMAGING_STANDALONE = "IMAGING_STANDALONE", "Standalone Imaging"
        DIAGNOSTIC_STANDALONE = "DIAGNOSTIC_STANDALONE", "Standalone Diagnostic Centre"
        CUSTOM = "CUSTOM", "Custom"

    quote_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    source = models.CharField(max_length=64, default="marketing_pricing_cart")
    catalog_version = models.CharField(max_length=64, blank=True, default="")
    resolved_plan = models.CharField(
        max_length=32,
        choices=ResolvedPlan.choices,
        default=ResolvedPlan.CUSTOM,
    )
    request_payload = models.JSONField(default=dict, blank=True)
    quote_payload = models.JSONField(default=dict, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Quote {self.quote_id} ({self.resolved_plan})"
