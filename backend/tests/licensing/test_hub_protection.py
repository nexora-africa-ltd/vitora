# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for Phase 0 & Phase 1 hub code protection features.

Covers:
- HubLicenseGuardMiddleware (grace period enforcement)
- Cloud relay views (SHA submit, preauth, eligibility, KHIS)
- CloudProxyClient (hub-side proxy)
- Feature gating on hub installations
"""

import datetime
import os
import tempfile
import time
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest  # type: ignore
from django.test import RequestFactory, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.middleware import HubLicenseGuardMiddleware
from hmis.apps.licensing.cloud_proxy import (
    CloudProxyClient,
    CloudProxyResponse,
    is_hub_mode,
    submit_sha_claim_via_cloud,
)
from hmis.apps.licensing.cloud_relay_views import HubLicenseAuthenticated
from hmis.apps.licensing.tokens import (
    ALGORITHM,
    AUDIENCE,
    ISSUER,
    get_private_key,
    sign_license_token,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def license_keypair():
    """Ensure license keypair is available for signing/verifying."""
    try:
        get_private_key()
        return True
    except RuntimeError:
        pytest.skip("License keypair not available")


@pytest.fixture
def valid_license_token(license_keypair):
    """A valid license JWT with all features enabled."""
    payload = {
        "installation_id": "test-hub-001",
        "org_id": 1,
        "org_name": "Test Organization",
        "tier": "PROFESSIONAL",
        "subscription_status": "ACTIVE",
        "features": {
            "outpatient": True,
            "inpatient": True,
            "pharmacy": True,
            "laboratory": True,
            "sha_claims": True,
            "ai_assistant": True,
            "offline_sync": True,
            "dhis2_reporting": True,
        },
        "max_staff": 50,
        "max_facilities": 3,
        "max_patients": None,
    }
    return sign_license_token(payload)


@pytest.fixture
def expired_token_soft_grace(license_keypair):
    """A token expired 3 days ago (within soft grace)."""
    private_key = get_private_key()
    now = time.time()
    payload = {
        "installation_id": "test-hub-002",
        "org_id": 1,
        "tier": "PROFESSIONAL",
        "subscription_status": "ACTIVE",
        "features": {"sha_claims": True},
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": int(now - 100 * 86400),
        "exp": int(now - 3 * 86400),  # Expired 3 days ago
    }
    return pyjwt.encode(payload, private_key, algorithm=ALGORITHM)


@pytest.fixture
def expired_token_hard_grace(license_keypair):
    """A token expired 10 days ago (in hard grace / read-only)."""
    private_key = get_private_key()
    now = time.time()
    payload = {
        "installation_id": "test-hub-003",
        "org_id": 1,
        "tier": "PROFESSIONAL",
        "subscription_status": "ACTIVE",
        "features": {"sha_claims": True},
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": int(now - 100 * 86400),
        "exp": int(now - 10 * 86400),  # Expired 10 days ago
    }
    return pyjwt.encode(payload, private_key, algorithm=ALGORITHM)


@pytest.fixture
def expired_token_locked(license_keypair):
    """A token expired 20 days ago (locked)."""
    private_key = get_private_key()
    now = time.time()
    payload = {
        "installation_id": "test-hub-004",
        "org_id": 1,
        "tier": "PROFESSIONAL",
        "subscription_status": "ACTIVE",
        "features": {},
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": int(now - 120 * 86400),
        "exp": int(now - 20 * 86400),  # Expired 20 days ago
    }
    return pyjwt.encode(payload, private_key, algorithm=ALGORITHM)


@pytest.fixture
def token_file(valid_license_token):
    """Create a temp file containing a valid license token."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jwt", delete=False) as f:
        f.write(valid_license_token)
        path = f.name
    yield path
    os.unlink(path)


@pytest.fixture
def expired_soft_token_file(expired_token_soft_grace):
    """Create a temp file containing a soft-grace expired token."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jwt", delete=False) as f:
        f.write(expired_token_soft_grace)
        path = f.name
    yield path
    os.unlink(path)


@pytest.fixture
def expired_hard_token_file(expired_token_hard_grace):
    """Create a temp file containing a hard-grace expired token."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jwt", delete=False) as f:
        f.write(expired_token_hard_grace)
        path = f.name
    yield path
    os.unlink(path)


@pytest.fixture
def expired_locked_token_file(expired_token_locked):
    """Create a temp file containing a locked expired token."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jwt", delete=False) as f:
        f.write(expired_token_locked)
        path = f.name
    yield path
    os.unlink(path)


# ---------------------------------------------------------------------------
# HubLicenseGuardMiddleware Tests
# ---------------------------------------------------------------------------


class TestHubLicenseGuardMiddleware:
    """Tests for the hub license guard middleware."""

    def _make_middleware(self):
        """Create middleware instance with a simple pass-through response."""
        from django.http import HttpResponse

        def get_response(request):
            return HttpResponse("OK", status=200)

        return HubLicenseGuardMiddleware(get_response)

    def _make_request(self, path="/api/patients/", method="GET"):
        """Create a test request."""
        factory = RequestFactory()
        if method == "GET":
            return factory.get(path)
        elif method == "POST":
            return factory.post(path, content_type="application/json")
        elif method == "PATCH":
            return factory.patch(path, content_type="application/json")
        elif method == "DELETE":
            return factory.delete(path)
        return factory.get(path)

    @patch.dict(os.environ, {"DJANGO_ENV": "cloud"})
    def test_skips_non_hub_environments(self, db):
        """Middleware should be no-op when not running as hub."""
        middleware = self._make_middleware()
        request = self._make_request()
        response = middleware(request)
        assert response.status_code == 200

    @patch.dict(os.environ, {"DJANGO_ENV": "hub", "LICENSE_TOKEN": ""})
    def test_exempt_paths_always_pass(self, db):
        """Exempt paths should always pass regardless of license state."""
        middleware = self._make_middleware()

        for path in [
            "/api/licensing/check-in/",
            "/api/licensing/activate/",
            "/api/token/",
            "/api/auth/login/",
            "/api/hub/health/",
        ]:
            request = self._make_request(path=path)
            response = middleware(request)
            assert response.status_code == 200, f"Path {path} should be exempt"

    @patch.dict(os.environ, {"DJANGO_ENV": "hub", "LICENSE_TOKEN": ""})
    @override_settings(HUB_LICENSE_TOKEN_PATH="/nonexistent/license.jwt")
    def test_missing_license_blocks_api(self, db):
        """Missing license file should block all API requests."""
        middleware = self._make_middleware()
        request = self._make_request("/api/patients/")
        response = middleware(request)
        assert response.status_code == 403
        assert b"hub_not_activated" in response.content

    @patch.dict(os.environ, {"DJANGO_ENV": "hub"})
    def test_valid_license_allows_requests(self, db, token_file):
        """A valid license should allow all requests."""
        middleware = self._make_middleware()
        # Clear cache
        middleware._cached_payload = None
        middleware._cache_time = None

        with override_settings(HUB_LICENSE_TOKEN_PATH=token_file):
            request = self._make_request("/api/patients/")
            response = middleware(request)
            assert response.status_code == 200

    @patch.dict(os.environ, {"DJANGO_ENV": "hub", "LICENSE_TOKEN": ""})
    def test_soft_grace_allows_writes_with_warning(self, db, expired_soft_token_file):
        """Soft grace (expired ≤7 days) should allow writes but add warning header."""
        middleware = self._make_middleware()
        middleware._cached_payload = None
        middleware._cache_time = None

        with override_settings(HUB_LICENSE_TOKEN_PATH=expired_soft_token_file):
            request = self._make_request("/api/patients/", method="POST")
            response = middleware(request)
            assert response.status_code == 200
            assert response.get("X-License-Warning") == "expired-soft-grace"

    @patch.dict(os.environ, {"DJANGO_ENV": "hub", "LICENSE_TOKEN": ""})
    def test_hard_grace_blocks_writes(self, db, expired_hard_token_file):
        """Hard grace (expired 7-14 days) should block writes."""
        middleware = self._make_middleware()
        middleware._cached_payload = None
        middleware._cache_time = None

        with override_settings(HUB_LICENSE_TOKEN_PATH=expired_hard_token_file):
            request = self._make_request("/api/patients/", method="POST")
            response = middleware(request)
            assert response.status_code == 403
            assert b"hub_license_read_only" in response.content

    @patch.dict(os.environ, {"DJANGO_ENV": "hub", "LICENSE_TOKEN": ""})
    def test_hard_grace_allows_reads(self, db, expired_hard_token_file):
        """Hard grace should still allow GET requests."""
        middleware = self._make_middleware()
        middleware._cached_payload = None
        middleware._cache_time = None

        with override_settings(HUB_LICENSE_TOKEN_PATH=expired_hard_token_file):
            request = self._make_request("/api/patients/", method="GET")
            response = middleware(request)
            assert response.status_code == 200
            assert response.get("X-License-Warning") == "expired-read-only"

    @patch.dict(os.environ, {"DJANGO_ENV": "hub", "LICENSE_TOKEN": ""})
    def test_locked_blocks_everything(self, db, expired_locked_token_file):
        """Locked state (expired >14 days) should block all requests."""
        middleware = self._make_middleware()
        middleware._cached_payload = None
        middleware._cache_time = None

        with override_settings(HUB_LICENSE_TOKEN_PATH=expired_locked_token_file):
            # Block GET
            request = self._make_request("/api/patients/", method="GET")
            response = middleware(request)
            assert response.status_code == 403
            assert b"hub_license_locked" in response.content

            # Block POST
            middleware._cached_payload = None
            middleware._cache_time = None
            request = self._make_request("/api/patients/", method="POST")
            response = middleware(request)
            assert response.status_code == 403

    @patch.dict(os.environ, {"DJANGO_ENV": "hub", "LICENSE_TOKEN": "garbage.token.here"})
    @override_settings(HUB_LICENSE_TOKEN_PATH="/nonexistent/path")
    def test_invalid_token_blocks_api(self, db):
        """An invalid/tampered token should block all API requests."""
        middleware = self._make_middleware()
        middleware._cached_payload = None
        middleware._cache_time = None

        request = self._make_request("/api/patients/")
        response = middleware(request)
        assert response.status_code == 403
        assert b"hub_license_invalid" in response.content

    @patch.dict(os.environ, {"DJANGO_ENV": "hub"})
    def test_valid_token_from_env_var(self, db, valid_license_token):
        """LICENSE_TOKEN env var should be used when set."""
        middleware = self._make_middleware()
        middleware._cached_payload = None
        middleware._cache_time = None

        with patch.dict(os.environ, {"LICENSE_TOKEN": valid_license_token}):
            request = self._make_request("/api/patients/")
            response = middleware(request)
            assert response.status_code == 200

    @patch.dict(os.environ, {"DJANGO_ENV": "hub", "LICENSE_TOKEN": ""})
    def test_non_api_paths_pass_through(self, db):
        """Non-API paths (admin, static) should not be checked."""
        middleware = self._make_middleware()

        for path in ["/admin/", "/static/css/app.css", "/some-page/"]:
            request = self._make_request(path=path)
            response = middleware(request)
            assert response.status_code == 200, f"Path {path} should pass through"


# ---------------------------------------------------------------------------
# Cloud Relay Views Tests
# ---------------------------------------------------------------------------


class TestCloudRelayViews:
    """Tests for cloud-side relay endpoints."""

    @pytest.fixture
    def active_installation_for_relay(self, db, sample_organization, sample_facility):
        """An active installation with a valid license for relay tests."""
        from hmis.apps.core.models import SubscriptionPlan
        from hmis.apps.licensing.models import Installation

        plan, _ = SubscriptionPlan.objects.get_or_create(
            code="PROFESSIONAL",
            defaults={
                "name": "Hospital Plan",
                "monthly_price": 49999,
                "annual_price": 499990,
                "max_facilities": 3,
                "max_users": 50,
                "max_patients": None,
                "features": {
                    "sha_claims": True,
                    "dhis2_reporting": True,
                },
            },
        )
        sample_organization.subscription_plan = plan
        sample_organization.subscription_tier = "PROFESSIONAL"
        sample_organization.subscription_status = "ACTIVE"
        sample_organization.save(
            update_fields=["subscription_plan", "subscription_tier", "subscription_status"]
        )

        installation = Installation.objects.create(
            installation_id="relay-test-hub",
            organization=sample_organization,
            facility=sample_facility,
            name="Relay Test Hub",
            status=Installation.Status.ACTIVE,
        )
        return installation

    @pytest.fixture
    def hub_auth_token(self, active_installation_for_relay, license_keypair):
        """A valid license JWT for the test installation."""
        from hmis.apps.licensing.tokens import build_license_payload, sign_license_token

        payload = build_license_payload(active_installation_for_relay)
        return sign_license_token(payload)

    def test_sha_submit_requires_license_auth(self, db, api_client):
        """Cloud SHA submit should reject requests without a valid license."""
        response = api_client.post(
            "/api/licensing/cloud/sha/submit/",
            data={"claim": "data"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_sha_submit_rejects_invalid_token(self, db, api_client):
        """Cloud SHA submit should reject requests with an invalid token."""
        api_client.credentials(HTTP_AUTHORIZATION="Bearer invalid.token.here")
        response = api_client.post(
            "/api/licensing/cloud/sha/submit/",
            data={"claim": "data"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @patch("hmis.apps.billing.services.ilm_client.IlmClient")
    def test_sha_submit_with_valid_license(
        self, mock_ilm_class, db, api_client, hub_auth_token, active_installation_for_relay
    ):
        """Cloud SHA submit should forward claims with a valid license."""
        # Mock ILM client response
        mock_client = MagicMock()
        mock_client.post.return_value = MagicMock(
            success=True, status_code=200, data={"claim_id": "DHA-123"}
        )
        mock_ilm_class.return_value = mock_client

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {hub_auth_token}")
        response = api_client.post(
            "/api/licensing/cloud/sha/submit/",
            data={"invoice_number": "INV-001", "otp": "123456"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True

    def test_sha_submit_rejects_without_feature(
        self, db, api_client, sample_organization, sample_facility, license_keypair
    ):
        """Cloud SHA submit should reject hubs without sha_claims feature."""
        from hmis.apps.core.models import SubscriptionPlan
        from hmis.apps.licensing.models import Installation

        # Create plan WITHOUT sha_claims
        plan, _ = SubscriptionPlan.objects.get_or_create(
            code="BASIC_NO_SHA",
            defaults={
                "name": "Basic Plan",
                "monthly_price": 9999,
                "annual_price": 99990,
                "max_facilities": 1,
                "max_users": 10,
                "max_patients": 100,
                "features": {
                    "outpatient": True,
                    "sha_claims": False,
                },
            },
        )
        sample_organization.subscription_plan = plan
        sample_organization.subscription_tier = "BASIC"
        sample_organization.subscription_status = "ACTIVE"
        sample_organization.save(
            update_fields=["subscription_plan", "subscription_tier", "subscription_status"]
        )

        installation = Installation.objects.create(
            installation_id="no-sha-hub",
            organization=sample_organization,
            facility=sample_facility,
            name="No SHA Hub",
            status=Installation.Status.ACTIVE,
        )

        from hmis.apps.licensing.tokens import build_license_payload, sign_license_token

        token = sign_license_token(build_license_payload(installation))

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = api_client.post(
            "/api/licensing/cloud/sha/submit/",
            data={"claim": "data"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["code"] == "feature_not_available"

    def test_khis_report_accepted(self, db, api_client, hub_auth_token):
        """Cloud KHIS report should accept and queue the report."""
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {hub_auth_token}")
        response = api_client.post(
            "/api/licensing/cloud/khis/report/",
            data={"period": "2026-05", "org_unit": "OU-001", "values": []},
            format="json",
        )
        assert response.status_code == status.HTTP_202_ACCEPTED
        assert response.data["status"] == "queued"

    def test_revoked_installation_blocked(
        self, db, api_client, active_installation_for_relay, hub_auth_token
    ):
        """A revoked installation should be blocked from cloud relay."""
        active_installation_for_relay.status = "REVOKED"
        active_installation_for_relay.save(update_fields=["status"])

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {hub_auth_token}")
        response = api_client.post(
            "/api/licensing/cloud/sha/submit/",
            data={"claim": "data"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# CloudProxyClient Tests
# ---------------------------------------------------------------------------


class TestCloudProxyClient:
    """Tests for the hub-side cloud proxy client."""

    def test_is_hub_mode_true(self):
        """is_hub_mode should return True when DJANGO_ENV=hub."""
        with patch.dict(os.environ, {"DJANGO_ENV": "hub"}):
            assert is_hub_mode() is True

    def test_is_hub_mode_false(self):
        """is_hub_mode should return False for non-hub environments."""
        with patch.dict(os.environ, {"DJANGO_ENV": "cloud"}):
            assert is_hub_mode() is False
        with patch.dict(os.environ, {"DJANGO_ENV": ""}):
            assert is_hub_mode() is False

    @patch("hmis.apps.licensing.cloud_proxy.requests.post")
    def test_successful_proxy_post(self, mock_post):
        """Successful proxy POST should return success response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"claim_id": "DHA-456"}
        mock_post.return_value = mock_response

        client = CloudProxyClient()
        client.base_url = "https://api.vitora.digital"

        with patch.dict(os.environ, {"LICENSE_TOKEN": "test-jwt-token", "HUB_ID": "hub-001"}):
            result = client.post("/api/cloud/sha/submit/", {"data": "test"})

        assert result.success is True
        assert result.status_code == 200
        assert result.data == {"claim_id": "DHA-456"}

    @patch("hmis.apps.licensing.cloud_proxy.requests.post")
    def test_proxy_timeout(self, mock_post):
        """Timeout should return 504 response."""
        import requests as req

        mock_post.side_effect = req.exceptions.Timeout()

        client = CloudProxyClient()
        client.base_url = "https://api.vitora.digital"

        with patch.dict(os.environ, {"LICENSE_TOKEN": "test-jwt", "HUB_ID": "hub-001"}):
            result = client.post("/api/cloud/sha/submit/", {"data": "test"})

        assert result.success is False
        assert result.status_code == 504
        assert "timed out" in result.error

    @patch("hmis.apps.licensing.cloud_proxy.requests.post")
    def test_proxy_connection_error(self, mock_post):
        """Connection error should return 503 response."""
        import requests as req

        mock_post.side_effect = req.exceptions.ConnectionError()

        client = CloudProxyClient()
        client.base_url = "https://api.vitora.digital"

        with patch.dict(os.environ, {"LICENSE_TOKEN": "test-jwt", "HUB_ID": "hub-001"}):
            result = client.post("/api/cloud/sha/submit/", {"data": "test"})

        assert result.success is False
        assert result.status_code == 503
        assert "connectivity" in result.error

    @patch("hmis.apps.licensing.cloud_proxy.requests.post")
    def test_proxy_4xx_error(self, mock_post):
        """4xx responses should be returned as failures."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.json.return_value = {"detail": "Feature not available"}
        mock_post.return_value = mock_response

        client = CloudProxyClient()
        client.base_url = "https://api.vitora.digital"

        with patch.dict(os.environ, {"LICENSE_TOKEN": "test-jwt", "HUB_ID": "hub-001"}):
            result = client.post("/api/cloud/sha/submit/", {"data": "test"})

        assert result.success is False
        assert result.status_code == 403

    @patch("hmis.apps.licensing.cloud_proxy.requests.post")
    def test_submit_sha_claim_via_cloud(self, mock_post):
        """The convenience function should call the correct endpoint."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"submitted": True}
        mock_post.return_value = mock_response

        # Reset singleton
        import hmis.apps.licensing.cloud_proxy as proxy_mod

        proxy_mod._client = None

        with patch.dict(
            os.environ,
            {
                "LICENSE_TOKEN": "test-jwt",
                "HUB_ID": "hub-001",
                "SYNC_SERVER_URL": "https://api.vitora.digital/api/sync",
            },
        ):
            result = submit_sha_claim_via_cloud({"invoice": "INV-001"})

        assert result.success is True
        mock_post.assert_called_once()
        call_url = mock_post.call_args[0][0]
        assert "/api/cloud/sha/submit/" in call_url


# ---------------------------------------------------------------------------
# Copyright Header Tests
# ---------------------------------------------------------------------------


class TestCopyrightHeaders:
    """Verify copyright headers are present in source files."""

    def test_core_models_has_copyright(self):
        """Core models.py should have the copyright header."""
        import hmis.apps.core.models as mod

        source_file = mod.__file__
        with open(source_file) as f:
            first_line = f.readline()
        assert "Nexora Consulting Ltd" in first_line

    def test_licensing_tokens_has_copyright(self):
        """Licensing tokens.py should have the copyright header."""
        import hmis.apps.licensing.tokens as mod

        source_file = mod.__file__
        with open(source_file) as f:
            first_line = f.readline()
        assert "Nexora Consulting Ltd" in first_line

    def test_middleware_has_copyright(self):
        """Core middleware.py should have the copyright header."""
        import hmis.apps.core.middleware as mod

        source_file = mod.__file__
        with open(source_file) as f:
            first_line = f.readline()
        assert "Nexora Consulting Ltd" in first_line
