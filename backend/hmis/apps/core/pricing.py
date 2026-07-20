# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Cart pricing quote endpoint and helper serializers."""

import hashlib
import hmac
import json
import time
from copy import deepcopy
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from hmis.apps.core.models import SKU, Bundle, PriceBook, PricingQuoteSnapshot, SKUDependency

ANNUAL_MULTIPLIER = Decimal("10")
FACILITY_INCLUDED = 1
USER_INCLUDED = 10
FACILITY_OVERAGE_MONTHLY = Decimal("4000.00")
USER_OVERAGE_MONTHLY = Decimal("800.00")

AI_TOKEN_OVERAGE_RATE = Decimal("0.06")
SMS_OVERAGE_RATE = Decimal("2.50")
API_CALL_OVERAGE_RATE = Decimal("0.03")

MAX_SELECTED_SKUS = 120
MAX_FACILITIES = 1000
MAX_USERS = 20000
MAX_PATIENTS = 50000000
MAX_AI_TOKENS = 50000000
MAX_SMS_MESSAGES = 5000000
MAX_API_CALLS = 100000000

BUNDLE_INCLUDED_LIMITS: dict[str, dict[str, int]] = {
    "clinic_bundle": {"facilities": 1, "users": 10},
    "hospital_bundle": {"facilities": 3, "users": 50},
    # Enterprise is negotiated; use very high soft caps so normal quotes show no seat overage.
    "enterprise_bundle": {"facilities": 1000000, "users": 1000000},
}

CLINIC_INCLUDED_SKUS = {
    "base_platform",
    "mod_emergency",
    "mod_inventory",
    "mod_scheduling",
    "plat_sha_claims",
    "plat_dhis2_reporting",
    "plat_offline_sync",
}

HOSPITAL_ADDON_SKUS = {
    "mod_inpatient",
    "mod_laboratory",
    "mod_imaging",
    "mod_theatre",
    "mod_icu",
    "mod_maternity",
    "plat_ai_assistant",
    "plat_analytics",
    "plat_api_access",
    "plat_custom_reports",
    "plat_sms_notifications",
}

ENTERPRISE_ADDON_SKUS = {
    "mod_dialysis",
    "mod_mortuary",
    "mod_blood_bank",
    "mod_surveillance",
    "mod_quality",
    "mod_private_insurance",
    "mod_moh_reporting",
}


def _to_money(value: Decimal | int | float) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"))


class QuantitiesSerializer(serializers.Serializer):
    facilities = serializers.IntegerField(min_value=1, default=1)
    users = serializers.IntegerField(min_value=1, default=1)
    patients = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate(self, attrs):
        if attrs["facilities"] > MAX_FACILITIES:
            raise serializers.ValidationError({"facilities": f"Maximum is {MAX_FACILITIES}."})
        if attrs["users"] > MAX_USERS:
            raise serializers.ValidationError({"users": f"Maximum is {MAX_USERS}."})
        if attrs.get("patients", 0) > MAX_PATIENTS:
            raise serializers.ValidationError({"patients": f"Maximum is {MAX_PATIENTS}."})
        return attrs


class UsageEstimateSerializer(serializers.Serializer):
    ai_tokens = serializers.IntegerField(min_value=0, required=False, default=0)
    sms_messages = serializers.IntegerField(min_value=0, required=False, default=0)
    api_calls = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate(self, attrs):
        if attrs.get("ai_tokens", 0) > MAX_AI_TOKENS:
            raise serializers.ValidationError({"ai_tokens": f"Maximum is {MAX_AI_TOKENS}."})
        if attrs.get("sms_messages", 0) > MAX_SMS_MESSAGES:
            raise serializers.ValidationError({"sms_messages": f"Maximum is {MAX_SMS_MESSAGES}."})
        if attrs.get("api_calls", 0) > MAX_API_CALLS:
            raise serializers.ValidationError({"api_calls": f"Maximum is {MAX_API_CALLS}."})
        return attrs


class PricingQuoteRequestSerializer(serializers.Serializer):
    billing_cycle = serializers.ChoiceField(choices=["monthly", "annual"], default="monthly")
    base_sku = serializers.CharField(default="base_platform")
    selected_skus = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
        default=list,
    )
    quantities = QuantitiesSerializer(required=False, default=QuantitiesSerializer().get_default)
    usage_estimate = UsageEstimateSerializer(
        required=False, default=UsageEstimateSerializer().get_default
    )

    def validate_selected_skus(self, value):
        deduped = sorted(set(value))
        if len(deduped) > MAX_SELECTED_SKUS:
            raise serializers.ValidationError(f"Maximum selected_skus is {MAX_SELECTED_SKUS}.")
        return deduped


class PricingQuoteSnapshotRequestSerializer(PricingQuoteRequestSerializer):
    source = serializers.CharField(
        required=False, allow_blank=True, default="marketing_pricing_cart"
    )


def _normalized_payload(payload: dict) -> dict:
    normalized = deepcopy(payload)
    normalized["selected_skus"] = sorted(set(normalized.get("selected_skus") or []))

    quantities = normalized.get("quantities") or {}
    normalized["quantities"] = {
        "facilities": int(quantities.get("facilities", 1)),
        "users": int(quantities.get("users", 1)),
        "patients": int(quantities.get("patients", 0)),
    }

    usage = normalized.get("usage_estimate") or {}
    normalized["usage_estimate"] = {
        "ai_tokens": int(usage.get("ai_tokens", 0)),
        "sms_messages": int(usage.get("sms_messages", 0)),
        "api_calls": int(usage.get("api_calls", 0)),
    }
    return normalized


def _build_cache_key(price_book: PriceBook, payload: dict) -> str:
    canonical = json.dumps(_normalized_payload(payload), sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    version = f"{price_book.code}:{price_book.updated_at.isoformat()}"
    return f"pricing:quote:{version}:{digest}"


def _validate_signed_nonce_request(request) -> Response | None:
    if not getattr(settings, "PRICING_REQUIRE_SIGNED_NONCE", False):
        return None

    secret = getattr(settings, "PRICING_NONCE_SECRET", "")
    if not secret:
        return Response(
            {"detail": "Pricing nonce secret not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    nonce = request.headers.get("X-Pricing-Nonce", "")
    timestamp_raw = request.headers.get("X-Pricing-Timestamp", "")
    signature = request.headers.get("X-Pricing-Signature", "")

    if not nonce or not timestamp_raw or not signature:
        return Response(
            {"detail": "Missing pricing nonce headers."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        timestamp = int(timestamp_raw)
    except (TypeError, ValueError):
        return Response(
            {"detail": "Invalid pricing nonce timestamp."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ttl = int(getattr(settings, "PRICING_NONCE_TTL_SECONDS", 300))
    now = int(time.time())
    if abs(now - timestamp) > ttl:
        return Response(
            {"detail": "Expired pricing nonce."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    message = f"{nonce}:{timestamp}".encode()
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return Response(
            {"detail": "Invalid pricing nonce signature."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    replay_key = f"pricing:nonce:{nonce}:{timestamp}"
    if not cache.add(replay_key, 1, timeout=ttl):
        return Response(
            {"detail": "Pricing nonce replay detected."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return None


def _resolve_plan_code(selected_codes: set[str]) -> str:
    """Resolve cart into canonical plan code buckets."""
    if "base_platform" not in selected_codes:
        return "CUSTOM"

    allowed_enterprise = CLINIC_INCLUDED_SKUS | HOSPITAL_ADDON_SKUS | ENTERPRISE_ADDON_SKUS
    if ENTERPRISE_ADDON_SKUS.issubset(selected_codes) and selected_codes.issubset(
        allowed_enterprise
    ):
        return "ENTERPRISE"

    allowed_hospital = CLINIC_INCLUDED_SKUS | HOSPITAL_ADDON_SKUS
    if HOSPITAL_ADDON_SKUS.issubset(selected_codes) and selected_codes.issubset(allowed_hospital):
        return "PROFESSIONAL"

    if selected_codes.issubset(CLINIC_INCLUDED_SKUS):
        return "BASIC"

    return "CUSTOM"


def _compute_quote_payload(price_book: PriceBook, payload: dict) -> dict:
    billing_cycle = payload["billing_cycle"]
    multiplier = ANNUAL_MULTIPLIER if billing_cycle == "annual" else Decimal("1")

    selected_codes = set(payload.get("selected_skus") or [])
    selected_codes.add(payload["base_sku"])

    sku_queryset = SKU.objects.filter(
        price_book=price_book, is_active=True, code__in=selected_codes
    )
    sku_by_code = {sku.code: sku for sku in sku_queryset}
    missing_codes = sorted(code for code in selected_codes if code not in sku_by_code)
    if missing_codes:
        raise serializers.ValidationError(
            {
                "detail": "Unknown or inactive SKU code(s).",
                "missing_skus": missing_codes,
            }
        )

    selected_skus = [sku_by_code[code] for code in sorted(selected_codes)]
    effective_features: set[str] = set()
    for sku in selected_skus:
        for key in sku.enabled_feature_keys or []:
            if key:
                effective_features.add(key)

    dependency_errors = []
    for sku in selected_skus:
        dependencies = sku.dependencies.filter(is_active=True)
        for dep in dependencies:
            required = {key for key in dep.required_feature_keys if key}
            if not required:
                continue

            if dep.rule_type == SKUDependency.RuleType.FEATURE_ALL:
                valid = required.issubset(effective_features)
            else:
                valid = not required.isdisjoint(effective_features)

            if not valid:
                dependency_errors.append(
                    {
                        "sku_code": sku.code,
                        "rule_type": dep.rule_type,
                        "required_feature_keys": sorted(required),
                        "message": dep.error_message or "Dependency not satisfied.",
                    }
                )

    if dependency_errors:
        raise serializers.ValidationError(
            {
                "detail": "Cart has dependency violations.",
                "dependency_errors": dependency_errors,
            }
        )

    cart_codes = {sku.code for sku in selected_skus}
    matching_bundles = []
    for bundle in Bundle.objects.filter(price_book=price_book, is_active=True):
        required_codes = set(bundle.included_sku_codes or [])
        if required_codes and not required_codes.issubset(cart_codes):
            continue
        matching_bundles.append((bundle, len(required_codes)))

    applicable_bundle = None
    if matching_bundles:
        matching_bundles.sort(key=lambda item: item[1], reverse=True)
        applicable_bundle = matching_bundles[0][0]

    line_items = []
    sku_subtotal = Decimal("0")
    included_ai_tokens = 0
    included_sms_messages = 0
    included_api_calls = 0

    for sku in selected_skus:
        unit_price = sku.annual_price if billing_cycle == "annual" else sku.monthly_price
        total_price = _to_money(unit_price)
        line_items.append(
            {
                "type": "sku",
                "sku_code": sku.code,
                "name": sku.name,
                "quantity": 1,
                "unit_price": str(_to_money(unit_price)),
                "total_price": str(total_price),
            }
        )
        sku_subtotal += total_price
        included_ai_tokens += sku.included_ai_tokens
        included_sms_messages += sku.included_sms_messages
        included_api_calls += sku.included_api_calls

    quantities = payload.get("quantities") or {}
    facilities = int(quantities.get("facilities", 1))
    users = int(quantities.get("users", 1))
    bundle_limits = (
        BUNDLE_INCLUDED_LIMITS.get(applicable_bundle.code, {}) if applicable_bundle else {}
    )
    included_facilities = int(bundle_limits.get("facilities", FACILITY_INCLUDED))
    included_users = int(bundle_limits.get("users", USER_INCLUDED))
    extra_facilities = max(0, facilities - included_facilities)
    extra_users = max(0, users - included_users)

    quantity_charges = []
    quantity_subtotal = Decimal("0")
    if extra_facilities > 0:
        fac_price = _to_money(FACILITY_OVERAGE_MONTHLY * multiplier)
        fac_total = _to_money(fac_price * extra_facilities)
        quantity_charges.append(
            {
                "type": "facility_overage",
                "quantity": extra_facilities,
                "unit_price": str(fac_price),
                "total_price": str(fac_total),
            }
        )
        quantity_subtotal += fac_total

    if extra_users > 0:
        user_price = _to_money(USER_OVERAGE_MONTHLY * multiplier)
        user_total = _to_money(user_price * extra_users)
        quantity_charges.append(
            {
                "type": "user_overage",
                "quantity": extra_users,
                "unit_price": str(user_price),
                "total_price": str(user_total),
            }
        )
        quantity_subtotal += user_total

    usage = payload.get("usage_estimate") or {}
    usage_charges = []
    usage_subtotal = Decimal("0")

    ai_tokens = int(usage.get("ai_tokens", 0))
    sms_messages = int(usage.get("sms_messages", 0))
    api_calls = int(usage.get("api_calls", 0))

    ai_overage = max(0, ai_tokens - included_ai_tokens)
    if ai_overage > 0:
        ai_total = _to_money(Decimal(ai_overage) * AI_TOKEN_OVERAGE_RATE * multiplier)
        usage_charges.append(
            {
                "type": "ai_token_overage",
                "quantity": ai_overage,
                "unit_price": str(_to_money(AI_TOKEN_OVERAGE_RATE * multiplier)),
                "total_price": str(ai_total),
            }
        )
        usage_subtotal += ai_total

    sms_overage = max(0, sms_messages - included_sms_messages)
    if sms_overage > 0:
        sms_total = _to_money(Decimal(sms_overage) * SMS_OVERAGE_RATE * multiplier)
        usage_charges.append(
            {
                "type": "sms_overage",
                "quantity": sms_overage,
                "unit_price": str(_to_money(SMS_OVERAGE_RATE * multiplier)),
                "total_price": str(sms_total),
            }
        )
        usage_subtotal += sms_total

    api_overage = max(0, api_calls - included_api_calls)
    if api_overage > 0:
        api_total = _to_money(Decimal(api_overage) * API_CALL_OVERAGE_RATE * multiplier)
        usage_charges.append(
            {
                "type": "api_call_overage",
                "quantity": api_overage,
                "unit_price": str(_to_money(API_CALL_OVERAGE_RATE * multiplier)),
                "total_price": str(api_total),
            }
        )
        usage_subtotal += api_total

    discount_amount = Decimal("0")
    if applicable_bundle is not None:
        if (
            applicable_bundle.discount_type == Bundle.DiscountType.PERCENT
            and applicable_bundle.discount_value is not None
        ):
            discount_amount = _to_money(
                (sku_subtotal + quantity_subtotal)
                * (applicable_bundle.discount_value / Decimal("100"))
            )
        elif (
            applicable_bundle.discount_type == Bundle.DiscountType.FIXED
            and applicable_bundle.discount_value is not None
        ):
            discount_amount = _to_money(applicable_bundle.discount_value * multiplier)

    subtotal = _to_money(sku_subtotal + quantity_subtotal + usage_subtotal)
    discount_total = _to_money(discount_amount)
    total = _to_money(max(Decimal("0"), subtotal - discount_total))

    return {
        "catalog_version": price_book.code,
        "currency": price_book.currency,
        "billing_cycle": billing_cycle,
        "line_items": line_items,
        "quantity_charges": quantity_charges,
        "usage_charges": usage_charges,
        "subtotal": str(subtotal),
        "discount_total": str(discount_total),
        "total": str(total),
        "applied_bundle": (
            {
                "code": applicable_bundle.code,
                "name": applicable_bundle.name,
                "discount_type": applicable_bundle.discount_type,
            }
            if applicable_bundle is not None
            else None
        ),
        "effective_feature_set": sorted(effective_features),
        "resolved_plan": _resolve_plan_code(set(selected_codes)),
        "included_usage": {
            "ai_tokens": included_ai_tokens,
            "sms_messages": included_sms_messages,
            "api_calls": included_api_calls,
        },
        "limits": {
            "included_facilities": included_facilities,
            "included_users": included_users,
        },
    }


class PricingQuoteView(APIView):
    """Generate a cart quote and resolved feature set from selected SKUs."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pricing_quote"

    def post(self, request):
        nonce_error = _validate_signed_nonce_request(request)
        if nonce_error is not None:
            return nonce_error

        serializer = PricingQuoteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        price_book = (
            PriceBook.objects.filter(is_active=True).order_by("sort_order", "-updated_at").first()
        )
        if price_book is None:
            return Response(
                {"detail": "No active price book configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        cache_ttl = int(getattr(settings, "PRICING_QUOTE_CACHE_TTL_SECONDS", 120))
        cache_key = _build_cache_key(price_book, payload)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached, status=status.HTTP_200_OK)

        try:
            response_payload = _compute_quote_payload(price_book, payload)
        except serializers.ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        cache.set(cache_key, response_payload, timeout=cache_ttl)
        return Response(response_payload, status=status.HTTP_200_OK)


class PricingResolvePlanView(APIView):
    """Resolve a cart payload to BASIC/PROFESSIONAL/ENTERPRISE/CUSTOM."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pricing_quote"

    def post(self, request):
        serializer = PricingQuoteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        price_book = (
            PriceBook.objects.filter(is_active=True).order_by("sort_order", "-updated_at").first()
        )
        if price_book is None:
            return Response(
                {"detail": "No active price book configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        selected_codes = set(payload.get("selected_skus") or [])
        selected_codes.add(payload["base_sku"])

        sku_queryset = SKU.objects.filter(
            price_book=price_book, is_active=True, code__in=selected_codes
        )
        sku_by_code = {sku.code: sku for sku in sku_queryset}
        missing_codes = sorted(code for code in selected_codes if code not in sku_by_code)
        if missing_codes:
            return Response(
                {
                    "detail": "Unknown or inactive SKU code(s).",
                    "missing_skus": missing_codes,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        selected_skus = [sku_by_code[code] for code in sorted(selected_codes)]
        effective_features: set[str] = set()
        for sku in selected_skus:
            for key in sku.enabled_feature_keys or []:
                if key:
                    effective_features.add(key)

        dependency_errors = []
        for sku in selected_skus:
            dependencies = sku.dependencies.filter(is_active=True)
            for dep in dependencies:
                required = {key for key in dep.required_feature_keys if key}
                if not required:
                    continue
                valid = (
                    required.issubset(effective_features)
                    if dep.rule_type == SKUDependency.RuleType.FEATURE_ALL
                    else not required.isdisjoint(effective_features)
                )
                if not valid:
                    dependency_errors.append(
                        {
                            "sku_code": sku.code,
                            "rule_type": dep.rule_type,
                            "required_feature_keys": sorted(required),
                            "message": dep.error_message or "Dependency not satisfied.",
                        }
                    )

        if dependency_errors:
            return Response(
                {
                    "detail": "Cart has dependency violations.",
                    "dependency_errors": dependency_errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "catalog_version": price_book.code,
                "resolved_plan": _resolve_plan_code(set(selected_codes)),
                "effective_feature_set": sorted(effective_features),
            },
            status=status.HTTP_200_OK,
        )


class PricingQuoteSnapshotCreateView(APIView):
    """Create a persisted quote snapshot and return a stable quote_id."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pricing_quote"

    def post(self, request):
        nonce_error = _validate_signed_nonce_request(request)
        if nonce_error is not None:
            return nonce_error

        serializer = PricingQuoteSnapshotRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        price_book = (
            PriceBook.objects.filter(is_active=True).order_by("sort_order", "-updated_at").first()
        )
        if price_book is None:
            return Response(
                {"detail": "No active price book configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            quote_payload = _compute_quote_payload(price_book, payload)
        except serializers.ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        ttl_days = int(getattr(settings, "PRICING_QUOTE_SNAPSHOT_TTL_DAYS", 30))
        snapshot = PricingQuoteSnapshot.objects.create(
            source=(payload.get("source") or "marketing_pricing_cart")[:64],
            catalog_version=quote_payload.get("catalog_version", ""),
            resolved_plan=quote_payload.get(
                "resolved_plan", PricingQuoteSnapshot.ResolvedPlan.CUSTOM
            ),
            request_payload=_normalized_payload(payload),
            quote_payload=quote_payload,
            expires_at=timezone.now() + timedelta(days=ttl_days),
        )

        return Response(
            {
                "quote_id": str(snapshot.quote_id),
                "catalog_version": snapshot.catalog_version,
                "resolved_plan": snapshot.resolved_plan,
                "total": quote_payload.get("total"),
                "currency": quote_payload.get("currency"),
                "expires_at": snapshot.expires_at.isoformat() if snapshot.expires_at else None,
            },
            status=status.HTTP_201_CREATED,
        )


class PricingQuoteSnapshotDetailView(APIView):
    """Retrieve a persisted quote snapshot by quote_id."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pricing_quote"

    def get(self, _request, quote_id):
        snapshot = PricingQuoteSnapshot.objects.filter(quote_id=quote_id).first()
        if snapshot is None:
            return Response({"detail": "Quote not found."}, status=status.HTTP_404_NOT_FOUND)

        if snapshot.expires_at and snapshot.expires_at < timezone.now():
            return Response({"detail": "Quote expired."}, status=status.HTTP_410_GONE)

        return Response(
            {
                "quote_id": str(snapshot.quote_id),
                "source": snapshot.source,
                "catalog_version": snapshot.catalog_version,
                "resolved_plan": snapshot.resolved_plan,
                "request_payload": snapshot.request_payload,
                "quote_payload": snapshot.quote_payload,
                "created_at": snapshot.created_at.isoformat(),
                "expires_at": snapshot.expires_at.isoformat() if snapshot.expires_at else None,
            },
            status=status.HTTP_200_OK,
        )
