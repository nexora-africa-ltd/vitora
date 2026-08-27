# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
What this file is for: organization tenant model and org-level business settings.
How to use: imported by `hmis.apps.core.models_org_facility` for model registration and compatibility.
Supported inputs/args: Django model fields/methods for organization identity, subscription, and policy settings.
"""

from django.db import models
from django.utils import timezone

from hmis.apps.core.models_audit_sync import TimeStampedModel
from hmis.apps.core.pii import encrypted_pii_property
from hmis.apps.core.upload_validators import validate_image_upload as _validate_image_upload


class Organization(TimeStampedModel):
    """
    Top-level tenant in the Vitora HMIS multi-tenancy hierarchy.

    An Organization represents a legal entity that operates one or more
    healthcare Facilities (branches). All clinical data is scoped to an
    Organization — patients are shared within an org, while encounters
    and operational records are further scoped to individual Facilities.

    Hierarchy::

        Organization (tenant)
        └── Facility (branch)  ← one-to-many

    The Organization model supports:

    * **Identity** – name, slug (for URLs / subdomains), contact details.
    * **Subscription** – tier, user/facility limits (for SaaS licensing).
    * **Compliance** – data retention period (Kenya DPA 2019).
    * **Location** – optional HQ county/sub-county.
    * **Configuration** – JSON settings for org-level defaults.
    """

    class SubscriptionTier(models.TextChoices):
        """Subscription tiers for SaaS licensing."""

        FREE = "FREE", "Free"
        BASIC = "BASIC", "Basic"
        PROFESSIONAL = "PROFESSIONAL", "Professional"
        ENTERPRISE = "ENTERPRISE", "Enterprise"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    name = models.CharField(
        max_length=200,
        unique=True,
        help_text="Official organization name.",
    )
    slug = models.SlugField(
        max_length=100,
        unique=True,
        help_text="URL-safe identifier (used in subdomains and API routing).",
    )
    logo = models.ImageField(
        upload_to="organizations/logos/",
        null=True,
        blank=True,
        validators=[_validate_image_upload],
        help_text="Organization logo for branding.",
    )

    # ------------------------------------------------------------------
    # Contact
    # ------------------------------------------------------------------

    contact_email_encrypted = models.TextField(default="", blank=True)
    contact_email = encrypted_pii_property("contact_email")
    contact_phone_encrypted = models.TextField(default="", blank=True)
    contact_phone = encrypted_pii_property("contact_phone")
    address_encrypted = models.TextField(default="", blank=True)
    address = encrypted_pii_property("address")

    # ------------------------------------------------------------------
    # Location (optional HQ)
    # ------------------------------------------------------------------

    county = models.ForeignKey(
        "core.County",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organizations",
        help_text="HQ county.",
    )
    sub_county = models.ForeignKey(
        "core.SubCounty",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organizations",
        help_text="HQ sub-county.",
    )

    # ------------------------------------------------------------------
    # Subscription & Limits
    # ------------------------------------------------------------------

    subscription_plan = models.ForeignKey(
        "core.SubscriptionPlan",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organizations",
        help_text="Linked subscription plan (source of truth for limits/features).",
    )
    subscription_tier = models.CharField(
        max_length=20,
        choices=SubscriptionTier.choices,
        default=SubscriptionTier.FREE,
        editable=False,
        help_text="Derived from subscription_plan.code — do not set directly.",
    )
    max_facilities = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of facilities allowed (synced from plan, null = unlimited).",
    )
    max_users = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of staff users allowed (synced from plan, null = unlimited).",
    )
    max_patients = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of patient records (synced from plan, null = unlimited).",
    )

    # ------------------------------------------------------------------
    # Subscription Validity
    # ------------------------------------------------------------------

    class SubscriptionStatus(models.TextChoices):
        """Subscription lifecycle states."""

        ACTIVE = "ACTIVE", "Active"
        TRIAL = "TRIAL", "Trial"
        EXPIRED = "EXPIRED", "Expired"
        SUSPENDED = "SUSPENDED", "Suspended"

    subscription_status = models.CharField(
        max_length=20,
        choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.ACTIVE,
        help_text="Current subscription lifecycle state.",
    )
    subscription_valid_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the current subscription period expires (null = no expiry).",
    )

    # ------------------------------------------------------------------
    # AI Token Usage (per billing cycle)
    # ------------------------------------------------------------------

    monthly_ai_tokens = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Monthly AI token quota (synced from plan, null = unlimited).",
    )
    ai_tokens_used = models.PositiveIntegerField(
        default=0,
        help_text="AI tokens consumed in the current billing cycle.",
    )
    ai_tokens_reset_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the AI token counter was last reset.",
    )

    # ------------------------------------------------------------------
    # Compliance (Kenya DPA 2019)
    # ------------------------------------------------------------------

    data_retention_years = models.PositiveIntegerField(
        default=7,
        help_text="Minimum data retention period in years (Kenya DPA default: 7).",
    )

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    settings = models.JSONField(
        default=dict,
        blank=True,
        help_text="Org-level configuration (branding, defaults, retention policy).",
    )

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    is_active = models.BooleanField(
        default=True,
        help_text="Whether this organization is currently active.",
    )

    is_verified = models.BooleanField(
        default=False,
        help_text="Whether the admin email has been verified (self-service signup).",
    )

    # ------------------------------------------------------------------
    # Onboarding
    # ------------------------------------------------------------------

    onboarding_completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "When initial onboarding was completed. NULL means the org admin "
            "has not finished setting up the organization (facility modules, "
            "first clinic, inviting staff, etc.)."
        ),
    )

    # ------------------------------------------------------------------
    # Meta & Methods
    # ------------------------------------------------------------------

    class Meta:
        """Meta options for Organization."""

        verbose_name = "Organization"
        verbose_name_plural = "Organizations"
        ordering = ["name"]

    def __str__(self) -> str:
        """Return the organization name."""
        return self.name

    def save(self, *args, **kwargs):
        """Auto-sync tier and limits from the linked plan on every save."""
        update_fields = kwargs.get("update_fields")
        # Only sync when subscription_plan is being saved (or full save)
        if update_fields is None or "subscription_plan" in update_fields:
            if self.subscription_plan is not None:
                self.subscription_tier = self.subscription_plan.code
                self.max_facilities = self.subscription_plan.max_facilities
                self.max_users = self.subscription_plan.max_users
                self.max_patients = self.subscription_plan.max_patients
                self.monthly_ai_tokens = self.subscription_plan.monthly_ai_tokens
            else:
                self.subscription_tier = self.SubscriptionTier.FREE
                self.monthly_ai_tokens = 0
            if update_fields is not None:
                extra = {
                    "subscription_tier",
                    "max_facilities",
                    "max_users",
                    "max_patients",
                    "monthly_ai_tokens",
                }
                kwargs["update_fields"] = list(set(update_fields) | extra)
        super().save(*args, **kwargs)

    @property
    def facility_count(self) -> int:
        """Return the number of facilities under this organization."""
        return self.facilities.count()

    @property
    def staff_count(self) -> int:
        """Return the number of staff members in this organization."""
        return self.staff_profiles.count()

    @property
    def patient_count(self) -> int:
        """Return the number of patients under this organization."""
        from hmis.apps.patients.models import Patient

        return Patient.objects.filter(organization=self).count()

    def can_add_facility(self) -> bool:
        """Check if the organization can add another facility."""
        if self.max_facilities is None:
            return True
        return self.facility_count < self.max_facilities

    def can_add_user(self) -> bool:
        """Check if the organization can add another user."""
        if self.max_users is None:
            return True
        return self.staff_count < self.max_users

    def can_add_patient(self) -> bool:
        """Check if the organization can add another patient."""
        if self.max_patients is None:
            return True
        return self.patient_count < self.max_patients

    # Baseline features for orgs without a subscription plan.
    # Only core clinical features are enabled — everything else requires a plan.
    PLAN_FALLBACK_FEATURES: dict[str, bool] = {
        "outpatient": True,
        "pharmacy": True,
        "billing": True,
    }

    def has_feature(self, feature_key: str) -> bool:
        """Check if a feature is enabled for this org's subscription plan.

        Orgs without a plan get only the baseline features defined in
        ``PLAN_FALLBACK_FEATURES`` (outpatient, pharmacy, billing).
        """
        if self.subscription_plan is None:
            return self.PLAN_FALLBACK_FEATURES.get(feature_key, False)
        return bool(self.subscription_plan.features.get(feature_key, False))

    @property
    def is_subscription_expired(self) -> bool:
        """Whether the subscription has passed its validity date."""
        if self.subscription_valid_until is None:
            return False
        return timezone.now() > self.subscription_valid_until

    @property
    def ai_tokens_remaining(self) -> int | None:
        """Return remaining AI tokens, or None if unlimited."""
        if self.monthly_ai_tokens is None:
            return None
        return max(0, self.monthly_ai_tokens - self.ai_tokens_used)

    def can_use_ai_tokens(self, tokens_needed: int = 0) -> bool:
        """Check if the organization has enough AI tokens."""
        if self.monthly_ai_tokens is None:
            return True
        return self.ai_tokens_used + tokens_needed <= self.monthly_ai_tokens

    def record_ai_token_usage(self, tokens: int) -> None:
        """Atomically increment the AI token counter."""
        from django.db.models import F

        Organization.objects.filter(pk=self.pk).update(ai_tokens_used=F("ai_tokens_used") + tokens)
        self.ai_tokens_used += tokens  # Keep instance in sync

    def reset_ai_tokens(self) -> None:
        """Reset the AI token counter (called at billing cycle start)."""
        self.ai_tokens_used = 0
        self.ai_tokens_reset_at = timezone.now()
        self.save(update_fields=["ai_tokens_used", "ai_tokens_reset_at"])

    def sync_from_plan(self, save: bool = True) -> None:
        """Sync tier, limits from the linked SubscriptionPlan.

        .. note:: The ``save()`` override already auto-syncs on every
           save, so this method is only needed for explicit in-memory
           sync without a full save, or for legacy callers.
        """
        plan = self.subscription_plan
        if plan is None:
            self.subscription_tier = self.SubscriptionTier.FREE
            self.monthly_ai_tokens = 0
        else:
            self.subscription_tier = plan.code
            self.max_facilities = plan.max_facilities
            self.max_users = plan.max_users
            self.max_patients = plan.max_patients
            self.monthly_ai_tokens = plan.monthly_ai_tokens
        if save:
            self.save(
                update_fields=[
                    "subscription_plan",
                    "subscription_tier",
                    "max_facilities",
                    "max_users",
                    "max_patients",
                    "monthly_ai_tokens",
                ]
            )

    @property
    def onboarding_complete(self) -> bool:
        """Whether the organization has completed initial onboarding."""
        return self.onboarding_completed_at is not None

    def get_onboarding_checklist(self) -> list[dict]:
        """
        Return the onboarding checklist with completion status for each step.

        Steps:
        1. Facility modules configured (at least 1 non-default module enabled)
        2. First clinic created
        3. At least 1 staff invited or created (beyond the initial admin)
        """
        from hmis.apps.clinics.models import Clinic

        # Check facility modules - at least one facility has modules beyond defaults
        facilities = self.facilities.filter(is_active=True)
        has_configured_modules = facilities.exists() and any(
            sum(1 for v in fac.modules.values() if v) > 1 for fac in facilities
        )

        # Check if at least one clinic exists
        has_clinic = Clinic.objects.filter(
            facility__organization=self,
            facility__is_active=True,
        ).exists()

        # Check if there's more than 1 staff member (the initial admin)
        has_invited_staff = self.staff_count > 1

        steps = [
            {
                "key": "facility_modules",
                "label": "Configure facility modules",
                "description": "Enable the clinical modules your facility offers (e.g. pharmacy, laboratory, inpatient).",
                "done": has_configured_modules,
                "required": True,
            },
            {
                "key": "first_clinic",
                "label": "Create your first clinic",
                "description": "Set up an outpatient clinic for patient consultations.",
                "done": has_clinic,
                "required": True,
            },
            {
                "key": "invite_staff",
                "label": "Invite team members",
                "description": "Add doctors, nurses, and other staff to the system.",
                "done": has_invited_staff,
                "required": False,
            },
        ]

        return steps
