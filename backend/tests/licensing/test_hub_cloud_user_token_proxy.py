# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for the authenticated local hub cloud user-token proxy.

Run with: poetry run pytest tests/licensing/test_hub_cloud_user_token_proxy.py --no-cov
Inputs: an authenticated hub user and a protected hub Ed25519 signing key.
"""

import base64
from unittest.mock import patch

import pytest  # type: ignore
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat
from django.test import override_settings
from rest_framework import status

from hmis.apps.licensing.cloud_proxy import CloudProxyResponse

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def assert_runtime_settings_restored():
    """Proxy tests must restore Django settings after all overrides tear down."""
    from django.conf import settings

    original_settings = settings._wrapped
    original_environment = settings.ENVIRONMENT
    yield
    assert settings._wrapped is original_settings
    assert original_environment == settings.ENVIRONMENT


class TestHubCloudUserTokenProxy:
    """The hub proxies only the current local user's identity to cloud."""

    url = "/api/licensing/hub/user-token/"

    def _private_key(self):
        return base64.b64encode(
            Ed25519PrivateKey.generate().private_bytes(
                Encoding.Raw, PrivateFormat.Raw, NoEncryption()
            )
        ).decode("ascii")

    @override_settings(ENVIRONMENT="hub", HUB_ID="hub-proof-test")
    def test_forwards_current_user_identity_and_returns_only_cloud_token(
        self, authenticated_client, test_staff_profile
    ):
        """Browser-supplied identity cannot replace the authenticated local user."""
        cloud_response = CloudProxyResponse(
            success=True,
            status_code=200,
            data={
                "access_token": "short-lived-cloud-token",
                "token_type": "Bearer",
                "expires_in": 300,
            },
        )
        with (
            patch.dict("os.environ", {"HUB_DEVICE_SIGNING_PRIVATE_KEY": self._private_key()}),
            patch(
                "hmis.apps.licensing.cloud_proxy.exchange_cloud_user_token",
                return_value=cloud_response,
            ) as exchange,
        ):
            response = authenticated_client.post(
                self.url,
                {},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == cloud_response.data
        proof = exchange.call_args.args[0]
        assert proof["username"] == test_staff_profile.user.username
        assert proof["employee_id"] == test_staff_profile.employee_id
        assert proof["nonce"]
        assert proof["signature"]

    @override_settings(ENVIRONMENT="hub")
    def test_requires_authenticated_local_user(self, api_client):
        """A browser without a local authenticated session cannot use the hub license."""
        response = api_client.post(self.url, {}, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(ENVIRONMENT="hub")
    def test_rejects_browser_supplied_proof_fields(self, authenticated_client):
        """Proof metadata cannot be accepted from a browser or desktop client."""
        response = authenticated_client.post(
            self.url, {"signature": "browser-value"}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(ENVIRONMENT="production")
    def test_rejects_requests_outside_hub_mode(self, authenticated_client):
        """The local proxy endpoint is not usable by cloud deployments."""
        with patch("hmis.apps.licensing.cloud_proxy.exchange_cloud_user_token") as exchange:
            response = authenticated_client.post(self.url, {}, format="json")

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "hub_only"
        exchange.assert_not_called()

    @override_settings(ENVIRONMENT="hub", HUB_ID="hub-proof-test")
    def test_does_not_return_malformed_upstream_data(self, authenticated_client):
        """Only the expected short-lived token response shape reaches the browser."""
        cloud_response = CloudProxyResponse(
            success=True, status_code=200, data={"license_token": "secret"}
        )
        with (
            patch.dict("os.environ", {"HUB_DEVICE_SIGNING_PRIVATE_KEY": self._private_key()}),
            patch(
                "hmis.apps.licensing.cloud_proxy.exchange_cloud_user_token",
                return_value=cloud_response,
            ),
        ):
            response = authenticated_client.post(self.url, {}, format="json")

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert "license_token" not in response.data

    @override_settings(ENVIRONMENT="hub")
    def test_rejects_missing_hub_signing_key(self, authenticated_client):
        """The hub does not delegate proof signing to the browser if its key is absent."""
        with patch.dict("os.environ", {}, clear=True):
            response = authenticated_client.post(self.url, {}, format="json")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data["code"] == "hub_signing_key_unavailable"
