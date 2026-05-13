"""
Tests for subscription expiry enforcement and AI token metering.

Tests cover:
- Organization model methods (is_subscription_expired, ai_tokens, etc.)
- SubscriptionExpiryMiddleware (read-only mode on expiry)
- AITokenQuotaPermission (block AI when tokens exhausted)
- sync_from_plan includes monthly_ai_tokens
"""

from datetime import timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# ============================================================================
# Organization Model — Subscription Expiry
# ============================================================================


class TestOrganizationSubscriptionExpiry:
    """Tests for Organization.is_subscription_expired property."""

    def test_not_expired_when_valid_until_is_none(self, sample_organization):
        """Orgs without an expiry date are never expired."""
        sample_organization.subscription_valid_until = None
        sample_organization.save(update_fields=["subscription_valid_until"])
        assert sample_organization.is_subscription_expired is False

    def test_not_expired_when_valid_until_in_future(self, sample_organization):
        """Orgs with future expiry are not expired."""
        sample_organization.subscription_valid_until = timezone.now() + timedelta(days=30)
        sample_organization.save(update_fields=["subscription_valid_until"])
        assert sample_organization.is_subscription_expired is False

    def test_expired_when_valid_until_in_past(self, sample_organization):
        """Orgs with past expiry are expired."""
        sample_organization.subscription_valid_until = timezone.now() - timedelta(hours=1)
        sample_organization.save(update_fields=["subscription_valid_until"])
        assert sample_organization.is_subscription_expired is True


# ============================================================================
# Organization Model — AI Token Methods
# ============================================================================


class TestOrganizationAITokens:
    """Tests for Organization AI token quota methods."""

    def test_ai_tokens_remaining_unlimited(self, sample_organization):
        """Unlimited (None) monthly_ai_tokens returns None remaining."""
        sample_organization.monthly_ai_tokens = None
        assert sample_organization.ai_tokens_remaining is None

    def test_ai_tokens_remaining_computed(self, sample_organization):
        """Remaining = monthly_ai_tokens - ai_tokens_used."""
        sample_organization.monthly_ai_tokens = 1000
        sample_organization.ai_tokens_used = 400
        assert sample_organization.ai_tokens_remaining == 600

    def test_ai_tokens_remaining_floor_zero(self, sample_organization):
        """Remaining never goes below zero."""
        sample_organization.monthly_ai_tokens = 100
        sample_organization.ai_tokens_used = 200
        assert sample_organization.ai_tokens_remaining == 0

    def test_can_use_ai_tokens_unlimited(self, sample_organization):
        """Unlimited orgs can always use tokens."""
        sample_organization.monthly_ai_tokens = None
        assert sample_organization.can_use_ai_tokens() is True
        assert sample_organization.can_use_ai_tokens(tokens_needed=999999) is True

    def test_can_use_ai_tokens_within_budget(self, sample_organization):
        """Returns True when under quota."""
        sample_organization.monthly_ai_tokens = 1000
        sample_organization.ai_tokens_used = 500
        assert sample_organization.can_use_ai_tokens() is True
        assert sample_organization.can_use_ai_tokens(tokens_needed=500) is True

    def test_can_use_ai_tokens_at_limit(self, sample_organization):
        """Returns True when exactly at limit with no additional need."""
        sample_organization.monthly_ai_tokens = 1000
        sample_organization.ai_tokens_used = 1000
        assert sample_organization.can_use_ai_tokens(tokens_needed=0) is True

    def test_can_use_ai_tokens_over_budget(self, sample_organization):
        """Returns False when tokens_needed would exceed quota."""
        sample_organization.monthly_ai_tokens = 1000
        sample_organization.ai_tokens_used = 900
        assert sample_organization.can_use_ai_tokens(tokens_needed=200) is False

    def test_can_use_ai_tokens_exhausted(self, sample_organization):
        """Returns False when already at quota (default tokens_needed=0)."""
        sample_organization.monthly_ai_tokens = 1000
        sample_organization.ai_tokens_used = 1000
        assert sample_organization.can_use_ai_tokens(tokens_needed=1) is False

    def test_record_ai_token_usage(self, sample_organization):
        """Atomically increments ai_tokens_used."""
        sample_organization.monthly_ai_tokens = 1000
        sample_organization.ai_tokens_used = 0
        sample_organization.save(update_fields=["monthly_ai_tokens", "ai_tokens_used"])
        sample_organization.record_ai_token_usage(150)
        sample_organization.refresh_from_db()
        assert sample_organization.ai_tokens_used == 150

    def test_record_ai_token_usage_accumulates(self, sample_organization):
        """Multiple calls accumulate usage."""
        sample_organization.monthly_ai_tokens = 1000
        sample_organization.ai_tokens_used = 0
        sample_organization.save(update_fields=["monthly_ai_tokens", "ai_tokens_used"])
        sample_organization.record_ai_token_usage(100)
        sample_organization.record_ai_token_usage(200)
        sample_organization.refresh_from_db()
        assert sample_organization.ai_tokens_used == 300

    def test_reset_ai_tokens(self, sample_organization):
        """Resets usage to 0 and stamps reset_at."""
        sample_organization.ai_tokens_used = 500
        sample_organization.save(update_fields=["ai_tokens_used"])
        sample_organization.reset_ai_tokens()
        sample_organization.refresh_from_db()
        assert sample_organization.ai_tokens_used == 0
        assert sample_organization.ai_tokens_reset_at is not None


# ============================================================================
# sync_from_plan — monthly_ai_tokens
# ============================================================================


class TestSyncFromPlanAITokens:
    """Tests that sync_from_plan propagates monthly_ai_tokens."""

    def test_sync_from_plan_copies_ai_tokens(self, sample_organization):
        """sync_from_plan should copy monthly_ai_tokens from the plan."""
        from hmis.apps.core.models import SubscriptionPlan

        plan = SubscriptionPlan.objects.create(
            code="PROFESSIONAL",
            name="Pro Plan",
            monthly_price="5000.00",
            annual_price="50000.00",
            monthly_ai_tokens=10000,
        )
        sample_organization.subscription_plan = plan
        sample_organization.sync_from_plan()
        sample_organization.refresh_from_db()
        assert sample_organization.monthly_ai_tokens == 10000

    def test_sync_from_plan_copies_null_ai_tokens(self, sample_organization):
        """sync_from_plan should copy None (unlimited) ai_tokens."""
        from hmis.apps.core.models import SubscriptionPlan

        plan = SubscriptionPlan.objects.create(
            code="ENTERPRISE",
            name="Enterprise Plan",
            monthly_price="10000.00",
            annual_price="100000.00",
            monthly_ai_tokens=None,
        )
        sample_organization.subscription_plan = plan
        sample_organization.sync_from_plan()
        sample_organization.refresh_from_db()
        assert sample_organization.monthly_ai_tokens is None


# ============================================================================
# SubscriptionExpiryMiddleware
# ============================================================================


class TestSubscriptionExpiryMiddleware:
    """Tests for SubscriptionExpiryMiddleware read-only enforcement."""

    @pytest.fixture
    def expired_org_client(
        self, api_client, test_user, test_staff_profile, sample_organization, settings
    ):
        """Set up a session-authenticated client whose org is expired."""
        settings.SUBSCRIPTION_EXPIRY_ENFORCEMENT = True
        sample_organization.subscription_status = "EXPIRED"
        sample_organization.save(update_fields=["subscription_status"])
        api_client.login(username="testuser", password="testpassword123")
        return api_client

    def test_get_allowed_when_expired(self, expired_org_client):
        """GET requests pass through even with expired subscription."""
        response = expired_org_client.get("/api/patients/")
        assert response.status_code != 403

    def test_post_blocked_when_expired(self, expired_org_client):
        """POST requests are blocked when subscription expired."""
        response = expired_org_client.post("/api/patients/", {})
        assert response.status_code == 403
        assert response.json()["code"] == "subscription_expired"

    def test_patch_blocked_when_expired(self, expired_org_client):
        """PATCH requests are blocked when subscription expired."""
        response = expired_org_client.patch("/api/patients/999/", {})
        assert response.status_code == 403
        assert response.json()["code"] == "subscription_expired"

    def test_delete_blocked_when_expired(self, expired_org_client):
        """DELETE requests are blocked when subscription expired."""
        response = expired_org_client.delete("/api/patients/999/")
        assert response.status_code == 403
        assert response.json()["code"] == "subscription_expired"

    def test_exempt_path_token(self, expired_org_client):
        """Auth endpoints are exempt from expiry enforcement."""
        # Token endpoint is exempt — should not return subscription_expired 403
        response = expired_org_client.post("/api/token/", {})
        assert response.status_code != 403 or response.json().get("code") != "subscription_expired"

    def test_exempt_path_auth(self, expired_org_client):
        """Cookie auth endpoints are exempt."""
        response = expired_org_client.post("/api/auth/login/", {})
        assert response.status_code != 403 or response.json().get("code") != "subscription_expired"

    def test_superuser_bypasses(
        self, api_client, test_user, test_staff_profile, sample_organization, settings
    ):
        """Superusers bypass expiry enforcement."""
        settings.SUBSCRIPTION_EXPIRY_ENFORCEMENT = True
        sample_organization.subscription_status = "EXPIRED"
        sample_organization.save(update_fields=["subscription_status"])
        test_user.is_superuser = True
        test_user.save(update_fields=["is_superuser"])
        api_client.login(username="testuser", password="testpassword123")
        response = api_client.post("/api/patients/", {})
        # Should NOT get subscription_expired 403
        assert response.status_code != 403 or response.json().get("code") != "subscription_expired"

    def test_enforcement_disabled(
        self, api_client, test_user, test_staff_profile, sample_organization, settings
    ):
        """When enforcement is off, expired orgs can still write."""
        settings.SUBSCRIPTION_EXPIRY_ENFORCEMENT = False
        sample_organization.subscription_status = "EXPIRED"
        sample_organization.save(update_fields=["subscription_status"])
        api_client.login(username="testuser", password="testpassword123")
        response = api_client.post("/api/patients/", {})
        assert response.status_code != 403 or response.json().get("code") != "subscription_expired"

    def test_valid_until_expiry(
        self, api_client, test_user, test_staff_profile, sample_organization, settings
    ):
        """Block writes when subscription_valid_until is in the past."""
        settings.SUBSCRIPTION_EXPIRY_ENFORCEMENT = True
        sample_organization.subscription_status = "ACTIVE"
        sample_organization.subscription_valid_until = timezone.now() - timedelta(hours=1)
        sample_organization.save(update_fields=["subscription_status", "subscription_valid_until"])
        api_client.login(username="testuser", password="testpassword123")
        response = api_client.post("/api/patients/", {})
        assert response.status_code == 403
        assert response.json()["code"] == "subscription_expired"

    def test_active_subscription_allows_writes(
        self, api_client, test_user, test_staff_profile, sample_organization, settings
    ):
        """Active subscription with future validity allows writes."""
        settings.SUBSCRIPTION_EXPIRY_ENFORCEMENT = True
        sample_organization.subscription_status = "ACTIVE"
        sample_organization.subscription_valid_until = timezone.now() + timedelta(days=30)
        sample_organization.save(update_fields=["subscription_status", "subscription_valid_until"])
        api_client.login(username="testuser", password="testpassword123")
        response = api_client.post("/api/patients/", {})
        # Should NOT get subscription_expired — may fail validation but not 403 expiry
        assert response.status_code != 403 or response.json().get("code") != "subscription_expired"


# ============================================================================
# AITokenQuotaPermission
# ============================================================================


class TestAITokenQuotaPermission:
    """Tests for AITokenQuotaPermission."""

    def test_permission_allows_when_unlimited(self):
        """Orgs with unlimited tokens (None) are allowed."""
        from hmis.apps.core.permissions import AITokenQuotaPermission

        perm = AITokenQuotaPermission()

        class FakeOrg:
            monthly_ai_tokens = None

            def can_use_ai_tokens(self):
                return True

        class FakeProfile:
            organization = FakeOrg()

        class FakeUser:
            is_superuser = False
            staff_profile = FakeProfile()

        class FakeRequest:
            user = FakeUser()

        assert perm.has_permission(FakeRequest(), None) is True

    def test_permission_blocks_when_exhausted(self):
        """Orgs with exhausted tokens are blocked."""
        from hmis.apps.core.permissions import AITokenQuotaPermission

        perm = AITokenQuotaPermission()

        class FakeOrg:
            monthly_ai_tokens = 1000

            def can_use_ai_tokens(self):
                return False

        class FakeProfile:
            organization = FakeOrg()

        class FakeUser:
            is_superuser = False
            staff_profile = FakeProfile()

        class FakeRequest:
            user = FakeUser()

        assert perm.has_permission(FakeRequest(), None) is False

    def test_superuser_bypasses_quota(self):
        """Superusers bypass the quota check."""
        from hmis.apps.core.permissions import AITokenQuotaPermission

        perm = AITokenQuotaPermission()

        class FakeUser:
            is_superuser = True

        class FakeRequest:
            user = FakeUser()

        assert perm.has_permission(FakeRequest(), None) is True


# ============================================================================
# extract_token_usage utility
# ============================================================================


class TestExtractTokenUsage:
    """Tests for the extract_token_usage utility function."""

    def test_openai_style_usage(self):
        """Extracts OpenAI-style prompt_tokens/completion_tokens."""
        from hmis.apps.ai.client import extract_token_usage

        data = {
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 200,
                "total_tokens": 300,
            }
        }
        result = extract_token_usage(data)
        assert result["input_tokens"] == 100
        assert result["output_tokens"] == 200
        assert result["total_tokens"] == 300

    def test_generic_style_usage(self):
        """Extracts generic input_tokens/output_tokens."""
        from hmis.apps.ai.client import extract_token_usage

        data = {
            "usage": {
                "input_tokens": 50,
                "output_tokens": 80,
                "total_tokens": 130,
            }
        }
        result = extract_token_usage(data)
        assert result["input_tokens"] == 50
        assert result["output_tokens"] == 80
        assert result["total_tokens"] == 130

    def test_token_usage_key(self):
        """Falls back to token_usage key."""
        from hmis.apps.ai.client import extract_token_usage

        data = {
            "token_usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
            }
        }
        result = extract_token_usage(data)
        assert result["input_tokens"] == 10
        assert result["output_tokens"] == 20
        assert result["total_tokens"] == 30

    def test_no_usage_returns_none(self):
        """Returns None when no usage data present."""
        from hmis.apps.ai.client import extract_token_usage

        result = extract_token_usage({"result": "ok"})
        assert result["input_tokens"] is None
        assert result["output_tokens"] is None
        assert result["total_tokens"] is None
