# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: E402, F401
"""Core serializers org facility for Vitora HMIS.

What this file is for:
- Implement serializers org facility logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

"""
Serializers for core app.
"""

import uuid

from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (
    AuditLog,
    CertificateAuthority,
    CertificateRevocation,
    CodeSystem,
    County,
    Department,
    DHIS2Config,
    DocumentShare,
    DocumentSignature,
    Facility,
    FeatureFlag,
    FrontendEvent,
    Notification,
    Organization,
    OrgMembership,
    PushSubscription,
    Role,
    StaffInvitation,
    StaffProfile,
    SubCounty,
    SubscriptionPeriod,
    SubscriptionPlan,
    UserCertificate,
    Ward,
)


class SubscriptionPlanListSerializer(serializers.ModelSerializer):
    """Compact serializer for subscription plan list views."""

    code_display = serializers.CharField(source="get_code_display", read_only=True)
    has_trial = serializers.BooleanField(read_only=True)

    class Meta:
        model = SubscriptionPlan
        fields = [
            "id",
            "code",
            "code_display",
            "name",
            "monthly_price",
            "annual_price",
            "max_facilities",
            "max_users",
            "monthly_ai_tokens",
            "is_active",
            "sort_order",
            "has_trial",
        ]
        read_only_fields = ["id"]


class SubscriptionPlanDetailSerializer(serializers.ModelSerializer):
    """Full serializer for subscription plan detail / update views."""

    code_display = serializers.CharField(source="get_code_display", read_only=True)
    annual_savings = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    has_trial = serializers.BooleanField(read_only=True)

    class Meta:
        model = SubscriptionPlan
        fields = [
            "id",
            "code",
            "code_display",
            "name",
            "description",
            # Pricing
            "monthly_price",
            "annual_price",
            "annual_savings",
            # Limits
            "max_facilities",
            "max_users",
            "max_patients",
            "monthly_ai_tokens",
            # Features
            "features",
            # Display & Status
            "is_active",
            "sort_order",
            "trial_period_days",
            "has_trial",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "annual_savings",
            "has_trial",
            "created_at",
            "updated_at",
        ]


class SubscriptionPlanCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new subscription plan."""

    class Meta:
        model = SubscriptionPlan
        fields = [
            "code",
            "name",
            "description",
            "monthly_price",
            "annual_price",
            "max_facilities",
            "max_users",
            "max_patients",
            "monthly_ai_tokens",
            "features",
            "is_active",
            "sort_order",
            "trial_period_days",
        ]

    def validate_code(self, value):
        if SubscriptionPlan.objects.filter(code=value).exists():
            raise serializers.ValidationError(f"A plan with code '{value}' already exists.")
        return value


class SubscriptionPeriodSerializer(serializers.ModelSerializer):
    """Platform-only serializer for auditable subscription periods."""

    class Meta:
        model = SubscriptionPeriod
        fields = [
            "id",
            "organization",
            "plan",
            "billing_interval",
            "amount",
            "currency",
            "period_start",
            "period_end",
            "status",
            "payment_reference",
            "confirmed_at",
            "confirmed_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "status",
            "payment_reference",
            "confirmed_at",
            "confirmed_by",
            "created_at",
            "updated_at",
        ]


class BillingContactSerializer(serializers.ModelSerializer):
    """Tenant-safe organization billing contact projection."""

    contact_name = serializers.CharField(
        source="billing_contact_name", required=False, allow_blank=True
    )
    billing_email = serializers.EmailField(source="contact_email", required=False, allow_blank=True)
    phone = serializers.CharField(source="contact_phone", required=False, allow_blank=True)
    billing_address = serializers.CharField(source="address", required=False, allow_blank=True)
    kra_pin = serializers.CharField(
        source="billing_kra_pin", required=False, allow_blank=True, max_length=30
    )

    class Meta:
        model = Organization
        fields = ["contact_name", "billing_email", "phone", "billing_address", "kra_pin"]


# ============================================================================
# Organization Serializers (Multitenancy – Phase 1)
# ============================================================================


class OrganizationListSerializer(serializers.ModelSerializer):
    """Compact serializer for organization list views."""

    facility_count = serializers.IntegerField(read_only=True, default=0)
    staff_count = serializers.IntegerField(read_only=True, default=0)
    county_name = serializers.CharField(source="county.name", read_only=True, default=None)
    plan_name = serializers.CharField(source="subscription_plan.name", read_only=True, default=None)

    class Meta:
        """Meta options for OrganizationListSerializer."""

        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "subscription_tier",
            "subscription_plan",
            "plan_name",
            "is_active",
            "county_name",
            "facility_count",
            "staff_count",
        ]
        read_only_fields = ["id", "subscription_tier", "facility_count", "staff_count", "plan_name"]


class OrganizationDetailSerializer(serializers.ModelSerializer):
    """Full serializer for organization detail / create / update views."""

    # PII property fields (encrypted at rest)
    contact_email = serializers.CharField(required=False, allow_blank=True, default="")
    contact_phone = serializers.CharField(required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")

    facility_count = serializers.IntegerField(read_only=True, default=0)
    staff_count = serializers.IntegerField(read_only=True, default=0)
    county_name = serializers.CharField(source="county.name", read_only=True, default=None)
    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True, default=None)
    plan_name = serializers.CharField(source="subscription_plan.name", read_only=True, default=None)
    plan_features = serializers.JSONField(
        source="subscription_plan.features", read_only=True, default=dict
    )
    can_add_facility = serializers.BooleanField(read_only=True)
    can_add_user = serializers.BooleanField(read_only=True)
    can_add_patient = serializers.BooleanField(read_only=True)
    is_subscription_expired = serializers.BooleanField(read_only=True)
    ai_tokens_remaining = serializers.IntegerField(read_only=True)

    class Meta:
        """Meta options for OrganizationDetailSerializer."""

        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "logo",
            # Contact
            "contact_email",
            "contact_phone",
            "address",
            # Location
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            # Subscription
            "subscription_plan",
            "plan_name",
            "plan_features",
            "subscription_tier",
            "max_facilities",
            "max_users",
            "max_patients",
            # Limit checks
            "can_add_facility",
            "can_add_user",
            "can_add_patient",
            # Subscription validity
            "subscription_status",
            "subscription_valid_until",
            "is_subscription_expired",
            # AI token usage
            "monthly_ai_tokens",
            "ai_tokens_used",
            "ai_tokens_remaining",
            "ai_tokens_reset_at",
            # Compliance
            "data_retention_years",
            # Config
            "settings",
            # Status
            "is_active",
            # Computed
            "facility_count",
            "staff_count",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "subscription_tier",
            "max_facilities",
            "max_users",
            "max_patients",
            "monthly_ai_tokens",
            "facility_count",
            "staff_count",
            "plan_name",
            "plan_features",
            "can_add_facility",
            "can_add_user",
            "can_add_patient",
            "is_subscription_expired",
            "ai_tokens_remaining",
            "created_at",
            "updated_at",
        ]


# ============================================================================
# Facility Serializers (RBAC Capability Plan – Phase 1)
# ============================================================================


def _plan_allowed_module_flags(instance, request) -> set[str] | None:
    """Return the set of ``has_*`` flags an org's subscription plan allows,
    or ``None`` if no filtering should be applied (enforcement off, no org,
    or caller is a superuser).
    """
    from django.conf import settings as dj_settings

    if not getattr(dj_settings, "SUBSCRIPTION_FEATURE_ENFORCEMENT", False):
        return None
    user = getattr(request, "user", None) if request else None
    if user is not None and getattr(user, "is_superuser", False):
        return None
    org = getattr(instance, "organization", None)
    if org is None:
        return None
    allowed: set[str] = set()
    for flag, feature_key in Facility.MODULE_FLAG_TO_FEATURE.items():
        if org.has_feature(feature_key):
            allowed.add(flag)
    return allowed


def _validate_facility_tier(serializer, attrs: dict, instance=None) -> None:
    """Reject ``has_*`` flag flips and ``operating_mode`` changes that the
    org's subscription plan does not cover.

    Bypassed for superusers and when ``SUBSCRIPTION_FEATURE_ENFORCEMENT``
    is off (matches the URL-prefix middleware policy in dev/test).
    """
    from django.conf import settings as dj_settings

    if not getattr(dj_settings, "SUBSCRIPTION_FEATURE_ENFORCEMENT", False):
        return

    request = serializer.context.get("request")
    if request is None:
        return
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return
    if getattr(user, "is_superuser", False):
        return

    profile = getattr(user, "staff_profile", None)
    org = getattr(profile, "organization", None) if profile else None
    if org is None:
        # Caller resolves org via validated_data["organization"] (admin create).
        org = attrs.get("organization") if isinstance(attrs, dict) else None
    if org is None:
        return

    errors: dict[str, list[str]] = {}

    # 1) Validate has_* flag transitions to True.
    for flag, feature_key in Facility.MODULE_FLAG_TO_FEATURE.items():
        if flag not in attrs:
            continue
        new_value = bool(attrs[flag])
        current_value = bool(getattr(instance, flag, False)) if instance else False
        if new_value and not current_value and not org.has_feature(feature_key):
            errors[flag] = [
                f"The '{feature_key}' module is not included in your "
                f"current subscription plan. Please upgrade to enable it."
            ]

    # 2) Validate operating_mode transitions.
    new_mode = attrs.get("operating_mode")
    if new_mode:
        current_mode = getattr(instance, "operating_mode", None) if instance else None
        if str(new_mode) != str(current_mode or ""):
            required = Facility.OPERATING_MODE_REQUIRED_FEATURES.get(str(new_mode), ())
            missing = [k for k in required if not org.has_feature(k)]
            if missing:
                errors["operating_mode"] = [
                    f"Switching to '{new_mode}' requires features not "
                    f"enabled on your plan: {', '.join(missing)}. "
                    f"Please upgrade."
                ]

    if errors:
        raise serializers.ValidationError(errors)


def _validate_facility_level_subtype(attrs: dict, instance=None) -> None:
    """Ensure level subtype is only used for supported KEPH levels."""
    level = attrs.get("level")
    if level is None and instance is not None:
        level = getattr(instance, "level", "")

    subtype = attrs.get("level_subtype")
    if subtype is None and instance is not None:
        subtype = getattr(instance, "level_subtype", "")

    subtype_value = str(subtype or "").strip().upper()
    if not subtype_value:
        return

    if subtype_value not in {"A", "B", "C"}:
        raise serializers.ValidationError(
            {"level_subtype": "Level subtype must be one of A, B, or C."}
        )

    level_value = str(level or "").strip()
    if level_value in {"1", "2"}:
        raise serializers.ValidationError(
            {"level_subtype": "Level subtype is only applicable to KEPH levels 3 and above."}
        )


class FacilityListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for facility list views.

    Returns essential identification and location data without the full
    module capability matrix, keeping list payloads compact.  The
    ``county_name`` and ``sub_county_name`` source fields are included so
    the frontend can display human-readable location text without an
    extra lookup.
    """

    county_name = serializers.CharField(source="county.name", read_only=True)
    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
    )
    deployment_profile = serializers.SerializerMethodField()

    class Meta:
        """Meta options for FacilityListSerializer."""

        model = Facility
        fields = [
            "id",
            "organization",
            "organization_name",
            "mfl_code",
            "facility_registry_code",
            "country_code",
            "name",
            "level",
            "level_subtype",
            "ownership",
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            "region_state",
            "district",
            "locality",
            "is_headquarters",
            "branch_code",
            "sha_contracted",
            "operating_mode",
            "deployment_profile",
            "is_active",
        ]
        read_only_fields = ["id"]

    def get_deployment_profile(self, obj) -> str:
        """Return deployment profile used by frontend standalone guards."""
        if obj.operating_mode == Facility.OperatingMode.STANDALONE_LAB:
            return "lis_standalone"
        return "full_hmis"


class FacilityDetailSerializer(serializers.ModelSerializer):
    """
    Full serializer for facility detail / retrieve views.

    Includes the complete module capability map (``modules``) as a nested
    dictionary, plus resolved location names.  ``enabled_module_names``
    provides a convenience list of only the enabled modules for quick
    frontend rendering.

    ``effective_logo_url`` returns the facility's own logo URL if set,
    otherwise falls back to the parent organization's logo URL.
    """

    county_name = serializers.CharField(source="county.name", read_only=True)
    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True)
    ward_name = serializers.CharField(source="ward.name", read_only=True, default=None)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
    )
    modules = serializers.DictField(read_only=True)
    enabled_module_names = serializers.ListField(child=serializers.CharField(), read_only=True)
    effective_logo_url = serializers.SerializerMethodField()
    deployment_profile = serializers.SerializerMethodField()

    # Biometrics fields
    workstation_id = serializers.CharField(required=False, allow_blank=True, default="")
    biometrics_enforced = serializers.BooleanField(required=False, default=False)

    # Encrypted PII fields — exposed via model property descriptors
    biometrics_agent_national_id = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    dha_admin_name = serializers.CharField(read_only=True)
    dha_admin_phone = serializers.CharField(read_only=True)
    dha_admin_email = serializers.CharField(read_only=True)
    dha_admin_id = serializers.CharField(read_only=True)
    dha_facility_phone = serializers.CharField(read_only=True)
    dha_facility_email = serializers.CharField(read_only=True)

    class Meta:
        """Meta options for FacilityDetailSerializer."""

        model = Facility
        fields = [
            "id",
            "organization",
            "organization_name",
            "mfl_code",
            "facility_registry_code",
            "country_code",
            "name",
            "level",
            "level_subtype",
            "ownership",
            "is_headquarters",
            "branch_code",
            "logo",
            "effective_logo_url",
            # Location
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            "ward",
            "ward_name",
            "region_state",
            "district",
            "locality",
            # SHA
            "sha_contracted",
            "sha_contract_expiry",
            "sha_facility_code",
            "workstation_id",
            "biometrics_enforced",
            "biometrics_agent_national_id",
            # DHA Registry Cache
            "dha_registry_synced_at",
            "dha_fid_code",
            "dha_fr_code",
            "dha_license_status",
            "dha_license_number",
            "dha_license_issue_date",
            "dha_license_expiry",
            "laboratory_license_number",
            "laboratory_license_issuer",
            "laboratory_license_issue_date",
            "laboratory_license_expiry",
            "dha_operational_status",
            "dha_sha_contract_status",
            "dha_sha_contract_start",
            "dha_sha_contract_end",
            "dha_total_beds",
            "dha_icu_beds",
            "dha_hdu_beds",
            "dha_facility_type",
            "dha_facility_type_normalized",
            "dha_keph_level",
            "dha_ownership",
            "dha_regulatory_body",
            "dha_contract_types",
            "dha_admin_name",
            "dha_admin_phone",
            "dha_admin_email",
            "dha_admin_id",
            "dha_facility_phone",
            "dha_facility_email",
            "dha_registry_data",
            # DHIS2
            "dhis2_org_unit",
            # Modules
            "modules",
            "enabled_module_names",
            # Individual module flags (for admin editing)
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
            "has_lis_standalone",
            "has_pharmacy_standalone",
            "has_imaging_standalone",
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
            # Operating mode
            "operating_mode",
            "deployment_profile",
            # Status & timestamps
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "modules",
            "enabled_module_names",
            "effective_logo_url",
            "dha_registry_synced_at",
            "dha_fid_code",
            "dha_fr_code",
            "dha_license_status",
            "dha_operational_status",
            "dha_sha_contract_status",
            "dha_sha_contract_start",
            "dha_sha_contract_end",
            "dha_total_beds",
            "dha_icu_beds",
            "dha_hdu_beds",
            "dha_facility_type",
            "dha_facility_type_normalized",
            "dha_keph_level",
            "dha_ownership",
            "dha_regulatory_body",
            "dha_contract_types",
            "dha_admin_name",
            "dha_admin_phone",
            "dha_admin_email",
            "dha_admin_id",
            "dha_facility_phone",
            "dha_facility_email",
            "dha_registry_data",
            "created_at",
            "updated_at",
        ]

    def get_effective_logo_url(self, obj) -> str | None:
        """Return the effective logo URL (facility logo or organization fallback)."""
        effective = obj.effective_logo
        if effective:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(effective.url)
            return effective.url
        return None

    def get_deployment_profile(self, obj) -> str:
        """Return deployment profile used by frontend standalone guards."""
        if obj.operating_mode == Facility.OperatingMode.STANDALONE_LAB:
            return "lis_standalone"
        return "full_hmis"

    def validate(self, attrs: dict) -> dict:
        """Subscription tier gating for module flags and operating_mode."""
        _validate_facility_tier(self, attrs, instance=self.instance)
        _validate_facility_level_subtype(attrs, instance=self.instance)
        return attrs

    def to_representation(self, instance):
        """Strip ``has_*`` flags, ``modules`` entries, and
        ``enabled_module_names`` for modules not covered by the org's
        subscription plan. Superusers and ``SUBSCRIPTION_FEATURE_ENFORCEMENT=False``
        bypass the filter and see the full module surface.
        """
        data = super().to_representation(instance)
        allowed = _plan_allowed_module_flags(instance, self.context.get("request"))
        if allowed is None:
            return data
        # 1) Drop has_* fields the plan does not cover.
        for flag in Facility.MODULE_FLAG_TO_FEATURE:
            if flag not in allowed and flag in data:
                data.pop(flag, None)
        # 2) Filter the modules dict.
        modules = data.get("modules")
        if isinstance(modules, dict):
            data["modules"] = {
                name: enabled for name, enabled in modules.items() if f"has_{name}" in allowed
            }
        # 3) Filter enabled_module_names.
        names = data.get("enabled_module_names")
        if isinstance(names, list):
            data["enabled_module_names"] = [name for name in names if f"has_{name}" in allowed]
        return data


class FacilityCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new facility.

    Accepts all writable fields.  Validates that ``sub_county`` belongs to
    the chosen ``county``, and that ``ward`` (when provided) belongs to
    the chosen ``sub_county``.

    If no module flags are explicitly set, the ``create`` method will
    apply the KEPH-level defaults via ``Facility.default_modules_for_level``.
    """

    class Meta:
        """Meta options for FacilityCreateSerializer."""

        model = Facility
        fields = [
            "organization",
            "mfl_code",
            "facility_registry_code",
            "country_code",
            "name",
            "level",
            "level_subtype",
            "ownership",
            "is_headquarters",
            "branch_code",
            # Location
            "county",
            "sub_county",
            "ward",
            "region_state",
            "district",
            "locality",
            # SHA
            "sha_contracted",
            "sha_contract_expiry",
            "sha_facility_code",
            # DHIS2
            "dhis2_org_unit",
            # Modules
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
            "has_lis_standalone",
            "has_pharmacy_standalone",
            "has_imaging_standalone",
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
            # Operating mode
            "operating_mode",
            # Status
            "is_active",
        ]

    def validate(self, attrs: dict) -> dict:
        """
        Cross-field validation for location hierarchy consistency.

        Ensures:
        * ``sub_county`` belongs to ``county``.
        * ``ward`` (if given) belongs to ``sub_county``.
        """
        county = attrs.get("county")
        sub_county = attrs.get("sub_county")
        ward = attrs.get("ward")
        country_code = str(attrs.get("country_code", "KE") or "KE").upper()
        attrs["country_code"] = country_code

        if country_code != "KE":
            attrs["county"] = None
            attrs["sub_county"] = None
            attrs["ward"] = None
            if not str(attrs.get("facility_registry_code", "") or "").strip():
                raise serializers.ValidationError(
                    {
                        "facility_registry_code": (
                            "Facility registry code is required for non-Kenya facilities."
                        )
                    }
                )
            if not str(attrs.get("mfl_code", "") or "").strip():
                attrs["mfl_code"] = f"INT-{country_code}-{uuid.uuid4().hex[:10].upper()}"[:20]
            county = None
            sub_county = None
            ward = None
        else:
            if not county:
                raise serializers.ValidationError(
                    {"county": "County is required for Kenya facilities."}
                )
            if not sub_county:
                raise serializers.ValidationError(
                    {"sub_county": "Sub-county is required for Kenya facilities."}
                )
            if not str(attrs.get("mfl_code", "") or "").strip():
                raise serializers.ValidationError(
                    {"mfl_code": "MFL code is required for Kenya facilities."}
                )

        if county and sub_county and sub_county.county_id != county.id:
            raise serializers.ValidationError(
                {"sub_county": "Sub-county must belong to the selected county."}
            )
        if sub_county and ward and ward.sub_county_id != sub_county.id:
            raise serializers.ValidationError(
                {"ward": "Ward must belong to the selected sub-county."}
            )

        # Subscription tier gating: reject modules / operating modes that
        # are not included in the org's plan.
        _validate_facility_tier(self, attrs, instance=None)
        _validate_facility_level_subtype(attrs, instance=None)

        return attrs

    def create(self, validated_data: dict) -> Facility:
        """
        Create facility, applying KEPH-level module defaults when no
        module flags are explicitly provided in the request payload.
        """
        # Detect whether the caller explicitly set any module flag
        module_fields = [
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
            "has_lis_standalone",
            "has_pharmacy_standalone",
            "has_imaging_standalone",
            "has_procedures",
            "has_analytics",
        ]
        any_module_set = any(f in self.initial_data for f in module_fields)

        if not any_module_set:
            level = validated_data.get("level", "1")
            defaults = Facility.default_modules_for_level(level)
            for module_name, enabled in defaults.items():
                validated_data[f"has_{module_name}"] = enabled

        facility = Facility(**validated_data)
        if any_module_set:
            facility._skip_module_defaults = True
        facility.save()
        return facility


# =============================================================================
# PKI & Digital Signature Serializers (DHA Gap #32 — Sprint 3.C)
# =============================================================================
