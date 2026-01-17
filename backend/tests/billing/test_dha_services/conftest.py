"""
Shared fixtures for DHA Services tests.

This conftest provides common mocking for all DHA service tests,
ensuring the auth service doesn't make real API calls.
"""

from unittest.mock import Mock, patch

import pytest


def create_mock_response(status_code=200, json_data=None, text=""):
    """Create a properly configured mock response with headers.

    Args:
        status_code: HTTP status code
        json_data: Data to return from json() method
        text: Response text

    Returns:
        Mock object configured like a requests.Response
    """
    mock = Mock()
    mock.status_code = status_code
    mock.json = lambda: json_data or {}
    mock.text = text or str(json_data or {})
    mock.headers = {"Content-Type": "application/json"}
    return mock


@pytest.fixture
def mock_sha_auth():
    """
    Mock SHAAuthService to prevent real auth API calls.

    This fixture patches SHAAuthService at the module level before
    any service is instantiated, ensuring tests never hit real APIs.

    Usage:
        def test_something(self, mock_sha_auth, service):
            # mock_sha_auth is already active
            ...
    """
    mock_instance = Mock()
    mock_instance.get_auth_headers.return_value = {
        "Authorization": "Bearer test-token",
        "Content-Type": "application/json",
    }
    mock_instance.is_configured.return_value = True
    mock_instance.get_token.return_value = "test-token"

    # Patch all locations where SHAAuthService is imported
    patches = [
        patch("hmis.apps.billing.services.dha_search.SHAAuthService", return_value=mock_instance),
        patch(
            "hmis.apps.billing.services.client_registry.SHAAuthService", return_value=mock_instance
        ),
        patch("hmis.apps.billing.services.terminology.SHAAuthService", return_value=mock_instance),
    ]

    for p in patches:
        p.start()

    yield mock_instance

    for p in patches:
        p.stop()


class SharedMock:
    """A wrapper that syncs return_value and side_effect across multiple mocks."""

    def __init__(self, *mocks):
        self.mocks = mocks
        self._return_value = None
        self._side_effect = None

    @property
    def return_value(self):
        return self._return_value

    @return_value.setter
    def return_value(self, value):
        self._return_value = value
        for mock in self.mocks:
            mock.return_value = value

    @property
    def side_effect(self):
        return self._side_effect

    @side_effect.setter
    def side_effect(self, value):
        self._side_effect = value
        for mock in self.mocks:
            mock.side_effect = value

    def assert_called_once(self):
        """Check that at least one mock was called once."""
        call_count = sum(m.call_count for m in self.mocks)
        if call_count != 1:
            raise AssertionError(f"Expected exactly 1 call, got {call_count}")

    @property
    def call_args(self):
        """Return the call args of the first mock that was called."""
        for mock in self.mocks:
            if mock.call_count > 0:
                return mock.call_args
        return None


@pytest.fixture
def mock_requests_get():
    """
    Mock requests.get for API calls.

    Patches at all service module locations to ensure
    all HTTP GET calls are intercepted. Returns a SharedMock
    that syncs return_value across all patches.
    """
    with patch("hmis.apps.billing.services.dha_search.requests.get") as mock_dha, patch(
        "hmis.apps.billing.services.client_registry.requests.get"
    ) as mock_client, patch(
        "hmis.apps.billing.services.terminology.requests.get"
    ) as mock_term, patch(
        "hmis.apps.billing.services.sha_auth.requests.post"
    ) as mock_auth:
        # Configure auth mock to return valid token
        mock_auth.return_value = Mock(status_code=200, json=lambda: {"access_token": "test-token"})
        # Use SharedMock to sync return_value across all mocks
        shared = SharedMock(mock_dha, mock_client, mock_term)
        yield shared


@pytest.fixture
def mock_requests_post():
    """
    Mock requests.post for API calls.

    Patches at all service module locations to ensure
    all HTTP POST calls are intercepted.
    Note: sha_auth.requests.post is handled separately to always return valid token.
    """
    with patch("hmis.apps.billing.services.dha_search.requests.post") as mock_dha, patch(
        "hmis.apps.billing.services.client_registry.requests.post"
    ) as mock_client, patch("hmis.apps.billing.services.terminology.requests.post") as mock_term:
        # Use SharedMock for service mocks only (not auth)
        shared = SharedMock(mock_dha, mock_client, mock_term)
        yield shared


@pytest.fixture
def mock_requests_put():
    """
    Mock requests.put for API calls.

    Patches at all service module locations to ensure
    all HTTP PUT calls are intercepted.
    """
    with patch("hmis.apps.billing.services.dha_search.requests.put") as mock_dha, patch(
        "hmis.apps.billing.services.client_registry.requests.put"
    ) as mock_client, patch("hmis.apps.billing.services.terminology.requests.put") as mock_term:
        shared = SharedMock(mock_dha, mock_client, mock_term)
        yield shared
