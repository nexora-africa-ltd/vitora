"""Tests for SHAAuthService authentication mode selection."""

from unittest.mock import Mock, patch

import pytest
from django.test import override_settings

from hmis.apps.billing.services.sha_auth import SHAAuthService


def make_response(status_code=200, json_data=None, text="", content_type="application/json"):
    """Build a minimal requests-style mock response."""
    response = Mock()
    response.status_code = status_code
    response.headers = {"Content-Type": content_type}
    response.text = text
    response.json.return_value = json_data or {}
    response.raise_for_status = Mock()
    return response


@pytest.mark.django_db
class TestSHAAuthService:
    """Auth service should support both legacy DHA and ILM middleware modes."""

    def setup_method(self):
        SHAAuthService.clear_token_cache()

    @override_settings(
        SHA_AUTH_MODE="legacy",
        SHA_API_BASE_URL="https://uat.dha.go.ke",
        SHA_CONSUMER_KEY="consumer-key",
        SHA_USERNAME="legacy-user",
        SHA_PASSWORD="legacy-pass",
    )
    @patch("hmis.apps.billing.services.sha_auth.requests.get")
    def test_get_token_uses_legacy_hie_auth(self, mock_get):
        """Legacy mode should fetch a token from the old HIE auth endpoint."""
        mock_get.return_value = make_response(json_data={"token": "legacy-token"})

        service = SHAAuthService()

        assert service.get_token() == "legacy-token"
        mock_get.assert_called_once()
        _, kwargs = mock_get.call_args
        assert kwargs["params"] == {"key": "consumer-key"}
        assert kwargs["headers"]["Authorization"].startswith("Basic ")

    @override_settings(
        SHA_AUTH_MODE="ilm",
        SHA_AUTH_BASE_URL="https://ilm-dev.dha.go.ke/uat-middleware",
        SHA_AUTH_TOKEN_ENDPOINT="/api/v1/tenants/token",
        SHA_CLIENT_ID="vitora",
        SHA_CLIENT_SECRET="ilm-secret",
    )
    @patch("hmis.apps.billing.services.sha_auth.requests.post")
    def test_get_token_uses_ilm_client_credentials(self, mock_post):
        """ILM mode should use form-urlencoded client credentials."""
        mock_post.return_value = make_response(
            json_data={
                "access_token": "ilm-token",
                "expires_in": 3600,
                "token_type": "Bearer",
            }
        )

        service = SHAAuthService()

        assert service.get_token() == "ilm-token"
        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        assert kwargs["headers"] == {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        assert kwargs["data"] == {
            "client_id": "vitora",
            "client_secret": "ilm-secret",
            "grant_type": "client_credentials",
        }

    @override_settings(
        SHA_AUTH_MODE="ilm",
        SHA_AUTH_BASE_URL="https://ilm-dev.dha.go.ke/uat-middleware",
        SHA_AUTH_TOKEN_ENDPOINT="/api/v1/tenants/token",
        SHA_CLIENT_ID="vitora",
        SHA_CLIENT_SECRET="ilm-secret",
    )
    @patch("hmis.apps.billing.services.sha_auth.requests.post")
    def test_get_auth_headers_uses_ilm_token(self, mock_post):
        """Dependent services should receive the same Bearer headers in ILM mode."""
        mock_post.return_value = make_response(json_data={"access_token": "ilm-token"})

        service = SHAAuthService()

        assert service.get_auth_headers() == {
            "Authorization": "Bearer ilm-token",
            "Content-Type": "application/json",
        }

    @override_settings(
        SHA_AUTH_MODE="ilm",
        SHA_AUTH_BASE_URL="https://ilm-dev.dha.go.ke/uat-middleware",
        SHA_AUTH_TOKEN_ENDPOINT="/api/v1/tenants/token",
        SHA_CLIENT_ID="vitora",
        SHA_CLIENT_SECRET="ilm-secret",
    )
    @patch("hmis.apps.billing.services.sha_auth.requests.post")
    def test_get_terminology_headers_falls_back_to_bearer_in_ilm_mode(self, mock_post):
        """ILM mode should not attempt legacy self-signed terminology JWTs."""
        mock_post.return_value = make_response(json_data={"access_token": "ilm-token"})

        service = SHAAuthService()

        assert service.get_terminology_headers() == {
            "Authorization": "Bearer ilm-token",
            "Accept": "application/json",
        }
