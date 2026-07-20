"""Tests for cart pricing quote endpoint."""

import hashlib
import hmac
import time
from decimal import Decimal

import pytest
from django.core.management import call_command
from rest_framework import status


@pytest.fixture
def seeded_pricing_catalog(db):
    call_command("seed_pricing_skus")


class TestPricingQuoteAPI:
    @pytest.fixture(autouse=True)
    def _disable_nonce_guard(self, settings):
        settings.PRICING_REQUIRE_SIGNED_NONCE = False

    def test_quote_success_returns_effective_feature_set(self, api_client, seeded_pricing_catalog):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": ["mod_emergency", "plat_sha_claims"],
            "quantities": {"facilities": 1, "users": 8},
            "usage_estimate": {"ai_tokens": 0, "sms_messages": 0, "api_calls": 0},
        }

        response = api_client.post("/api/pricing/quote/", payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["currency"] == "KES"
        assert "outpatient" in response.data["effective_feature_set"]
        assert "billing" in response.data["effective_feature_set"]
        assert "pharmacy" in response.data["effective_feature_set"]
        assert "emergency" in response.data["effective_feature_set"]
        assert "sha_claims" in response.data["effective_feature_set"]
        assert Decimal(response.data["total"]) > Decimal("0")

    def test_quote_rejects_dependency_violation(self, api_client, seeded_pricing_catalog):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": ["mod_theatre"],
            "quantities": {"facilities": 1, "users": 5},
        }

        response = api_client.post("/api/pricing/quote/", payload, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["detail"] == "Cart has dependency violations."
        assert response.data["dependency_errors"][0]["sku_code"] == "mod_theatre"
        assert "inpatient" in response.data["dependency_errors"][0]["required_feature_keys"]

    def test_quote_applies_bundle_discount(self, api_client, seeded_pricing_catalog):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": [
                "mod_emergency",
                "mod_inventory",
                "mod_scheduling",
                "plat_sha_claims",
                "plat_dhis2_reporting",
                "plat_offline_sync",
            ],
            "quantities": {"facilities": 1, "users": 10},
        }

        response = api_client.post("/api/pricing/quote/", payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["applied_bundle"] is not None
        assert response.data["applied_bundle"]["code"] == "clinic_bundle"
        assert Decimal(response.data["discount_total"]) == Decimal("0.00")
        assert Decimal(response.data["total"]) == Decimal("8999.00")

    def test_quote_includes_quantity_and_usage_overage_charges(
        self, api_client, seeded_pricing_catalog
    ):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": ["plat_ai_assistant", "plat_sms_notifications", "plat_api_access"],
            "quantities": {"facilities": 3, "users": 15},
            "usage_estimate": {
                "ai_tokens": 150000,
                "sms_messages": 7000,
                "api_calls": 250000,
            },
        }

        response = api_client.post("/api/pricing/quote/", payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["quantity_charges"]) == 2
        usage_types = {item["type"] for item in response.data["usage_charges"]}
        assert "ai_token_overage" in usage_types
        assert "sms_overage" in usage_types
        assert "api_call_overage" in usage_types
        assert Decimal(response.data["total"]) > Decimal("0")

    def test_hospital_bundle_aligns_to_public_price(self, api_client, seeded_pricing_catalog):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": [
                "mod_inpatient",
                "mod_laboratory",
                "mod_imaging",
                "mod_theatre",
                "mod_icu",
                "mod_maternity",
                "mod_inventory",
                "mod_scheduling",
                "plat_sha_claims",
                "plat_dhis2_reporting",
                "plat_ai_assistant",
                "plat_analytics",
                "plat_api_access",
                "plat_custom_reports",
                "plat_offline_sync",
                "plat_sms_notifications",
            ],
            "quantities": {"facilities": 1, "users": 50},
        }

        response = api_client.post("/api/pricing/quote/", payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["applied_bundle"] is not None
        assert response.data["applied_bundle"]["code"] == "hospital_bundle"
        assert Decimal(response.data["total"]) == Decimal("49999.00")

    def test_quote_rejects_values_above_max_bounds(self, api_client, seeded_pricing_catalog):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": ["mod_emergency"],
            "quantities": {"facilities": 5001, "users": 5},
        }

        response = api_client.post("/api/pricing/quote/", payload, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "quantities" in response.data

    def test_quote_requires_valid_signed_nonce_when_enabled(
        self,
        api_client,
        seeded_pricing_catalog,
        settings,
    ):
        settings.PRICING_REQUIRE_SIGNED_NONCE = True
        settings.PRICING_NONCE_SECRET = "test-secret"
        settings.PRICING_NONCE_TTL_SECONDS = 300

        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": ["mod_emergency"],
            "quantities": {"facilities": 1, "users": 5},
        }

        missing_headers_response = api_client.post("/api/pricing/quote/", payload, format="json")
        assert missing_headers_response.status_code == status.HTTP_400_BAD_REQUEST

        nonce = "pricing-nonce-1"
        ts = str(int(time.time()))
        signature = hmac.new(
            b"test-secret",
            f"{nonce}:{ts}".encode(),
            hashlib.sha256,
        ).hexdigest()

        valid_response = api_client.post(
            "/api/pricing/quote/",
            payload,
            format="json",
            HTTP_X_PRICING_NONCE=nonce,
            HTTP_X_PRICING_TIMESTAMP=ts,
            HTTP_X_PRICING_SIGNATURE=signature,
        )
        assert valid_response.status_code == status.HTTP_200_OK

        replay_response = api_client.post(
            "/api/pricing/quote/",
            payload,
            format="json",
            HTTP_X_PRICING_NONCE=nonce,
            HTTP_X_PRICING_TIMESTAMP=ts,
            HTTP_X_PRICING_SIGNATURE=signature,
        )
        assert replay_response.status_code == status.HTTP_400_BAD_REQUEST

    def test_resolve_plan_returns_basic_for_clinic_base(self, api_client, seeded_pricing_catalog):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": [],
            "quantities": {"facilities": 1, "users": 10},
        }
        response = api_client.post("/api/pricing/resolve-plan/", payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resolved_plan"] == "BASIC"

    def test_resolve_plan_returns_professional_for_hospital_preset(
        self,
        api_client,
        seeded_pricing_catalog,
    ):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": [
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
            ],
            "quantities": {"facilities": 1, "users": 50},
        }
        response = api_client.post("/api/pricing/resolve-plan/", payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resolved_plan"] == "PROFESSIONAL"

    def test_resolve_plan_returns_custom_for_partial_addons(
        self, api_client, seeded_pricing_catalog
    ):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": ["mod_laboratory"],
            "quantities": {"facilities": 1, "users": 10},
        }
        response = api_client.post("/api/pricing/resolve-plan/", payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resolved_plan"] == "CUSTOM"

    def test_quote_snapshot_create_and_retrieve(self, api_client, seeded_pricing_catalog):
        payload = {
            "billing_cycle": "monthly",
            "base_sku": "base_platform",
            "selected_skus": ["mod_inpatient"],
            "quantities": {"facilities": 1, "users": 10},
            "source": "marketing_pricing_cart",
        }

        create_response = api_client.post("/api/pricing/quotes/", payload, format="json")
        assert create_response.status_code == status.HTTP_201_CREATED
        assert "quote_id" in create_response.data

        quote_id = create_response.data["quote_id"]
        detail_response = api_client.get(f"/api/pricing/quotes/{quote_id}/")
        assert detail_response.status_code == status.HTTP_200_OK
        assert detail_response.data["quote_id"] == quote_id
        assert detail_response.data["quote_payload"]["resolved_plan"] in {
            "BASIC",
            "PROFESSIONAL",
            "ENTERPRISE",
            "CUSTOM",
        }
