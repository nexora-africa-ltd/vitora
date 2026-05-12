"""Tests for the Superset guest token and dashboard list endpoints."""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

GUEST_TOKEN_URL = "/api/analytics/superset-guest-token/"
DASHBOARD_LIST_URL = "/api/analytics/superset-dashboards/"


def _make_login_response():
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"access_token": "fake-access-token"}
    resp.raise_for_status = MagicMock()
    return resp


def _make_csrf_response():
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"result": "fake-csrf-token"}
    resp.raise_for_status = MagicMock()
    return resp


def _make_guest_token_response(token="guest-token-abc"):  # noqa: S107
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"token": token}
    resp.raise_for_status = MagicMock()
    return resp


def _make_dashboard_list_response(dashboards=None):
    if dashboards is None:
        dashboards = [
            {"id": 1, "dashboard_title": "Facility Overview", "description": "Main dashboard"},
            {"id": 2, "dashboard_title": "Revenue", "description": ""},
        ]
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"result": dashboards}
    resp.raise_for_status = MagicMock()
    return resp


@pytest.fixture(autouse=True)
def _clear_token_cache():
    """Clear the Superset token cache before each test."""
    from hmis.apps.analytics.views import _SupersetTokenCache

    _SupersetTokenCache.invalidate()
    yield
    _SupersetTokenCache.invalidate()


@pytest.mark.django_db
class TestSupersetGuestTokenView:
    """Tests for GET /api/analytics/superset-guest-token/."""

    def test_requires_authentication(self, api_client):
        response = api_client.get(GUEST_TOKEN_URL, {"dashboard_id": 1})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_missing_dashboard_id_returns_400(self, authenticated_client):
        response = authenticated_client.get(GUEST_TOKEN_URL)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "dashboard_id" in response.data["detail"]

    def test_invalid_dashboard_id_returns_400(self, authenticated_client):
        response = authenticated_client.get(GUEST_TOKEN_URL, {"dashboard_id": "abc"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_negative_dashboard_id_returns_400(self, authenticated_client):
        response = authenticated_client.get(GUEST_TOKEN_URL, {"dashboard_id": -1})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(SUPERSET_URL="")
    def test_returns_503_when_not_configured(self, authenticated_client):
        response = authenticated_client.get(GUEST_TOKEN_URL, {"dashboard_id": 1})
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "not configured" in response.data["detail"]

    @override_settings(
        SUPERSET_URL="https://superset.example.com",
        SUPERSET_ADMIN_USERNAME="admin",
        SUPERSET_ADMIN_PASSWORD="secret",
    )
    @patch("hmis.apps.analytics.views.http_requests")
    def test_returns_guest_token_for_dashboard(self, mock_requests, authenticated_client):
        mock_requests.post.side_effect = [
            _make_login_response(),
            _make_guest_token_response("test-guest-token"),
        ]
        mock_requests.get.return_value = _make_csrf_response()
        mock_requests.RequestException = Exception

        response = authenticated_client.get(GUEST_TOKEN_URL, {"dashboard_id": 42})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["guest_token"] == "test-guest-token"
        assert response.data["instance_url"] == "https://superset.example.com"

    @override_settings(
        SUPERSET_URL="https://superset.example.com/",
        SUPERSET_ADMIN_USERNAME="admin",
        SUPERSET_ADMIN_PASSWORD="secret",
    )
    @patch("hmis.apps.analytics.views.http_requests")
    def test_trailing_slash_stripped(self, mock_requests, authenticated_client):
        mock_requests.post.side_effect = [
            _make_login_response(),
            _make_guest_token_response(),
        ]
        mock_requests.get.return_value = _make_csrf_response()
        mock_requests.RequestException = Exception

        response = authenticated_client.get(GUEST_TOKEN_URL, {"dashboard_id": 1})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["instance_url"] == "https://superset.example.com"

    @override_settings(
        SUPERSET_URL="https://superset.example.com",
        SUPERSET_ADMIN_USERNAME="admin",
        SUPERSET_ADMIN_PASSWORD="secret",
    )
    @patch("hmis.apps.analytics.views.http_requests")
    def test_guest_token_includes_rls_for_facility(
        self, mock_requests, authenticated_client, sample_facility
    ):
        mock_requests.post.side_effect = [
            _make_login_response(),
            _make_guest_token_response(),
        ]
        mock_requests.get.return_value = _make_csrf_response()
        mock_requests.RequestException = Exception

        authenticated_client.get(GUEST_TOKEN_URL, {"dashboard_id": 1})

        # Second post call is the guest_token request
        guest_call = mock_requests.post.call_args_list[1]
        body = guest_call.kwargs.get("json") or guest_call[1].get("json")
        rls_rules = body["rls"]
        assert len(rls_rules) == 1
        assert f"facility_id = {sample_facility.id}" in rls_rules[0]["clause"]

    @override_settings(
        SUPERSET_URL="https://superset.example.com",
        SUPERSET_ADMIN_USERNAME="admin",
        SUPERSET_ADMIN_PASSWORD="secret",
    )
    @patch("hmis.apps.analytics.views.http_requests")
    def test_returns_502_on_superset_failure(self, mock_requests, authenticated_client):
        mock_requests.post.side_effect = Exception("Connection refused")
        mock_requests.RequestException = Exception

        response = authenticated_client.get(GUEST_TOKEN_URL, {"dashboard_id": 1})
        assert response.status_code == status.HTTP_502_BAD_GATEWAY


@pytest.mark.django_db
class TestSupersetDashboardListView:
    """Tests for GET /api/analytics/superset-dashboards/."""

    def test_requires_authentication(self, api_client):
        response = api_client.get(DASHBOARD_LIST_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(SUPERSET_URL="")
    def test_returns_503_when_not_configured(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_LIST_URL)
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    @override_settings(
        SUPERSET_URL="https://superset.example.com",
        SUPERSET_ADMIN_USERNAME="admin",
        SUPERSET_ADMIN_PASSWORD="secret",
    )
    @patch("hmis.apps.analytics.views.http_requests")
    def test_returns_published_dashboards(self, mock_requests, authenticated_client):
        mock_requests.post.return_value = _make_login_response()
        mock_requests.RequestException = Exception
        mock_requests.get.side_effect = [
            _make_csrf_response(),
            _make_dashboard_list_response(),
        ]

        response = authenticated_client.get(DASHBOARD_LIST_URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        assert response.data[0]["name"] == "Facility Overview"
        assert response.data[1]["name"] == "Revenue"

    @override_settings(
        SUPERSET_URL="https://superset.example.com",
        SUPERSET_ADMIN_USERNAME="admin",
        SUPERSET_ADMIN_PASSWORD="secret",
    )
    @patch("hmis.apps.analytics.views.http_requests")
    def test_returns_502_on_superset_failure(self, mock_requests, authenticated_client):
        mock_requests.post.return_value = _make_login_response()
        mock_requests.RequestException = Exception
        mock_requests.get.side_effect = [
            _make_csrf_response(),
            Exception("Connection refused"),
        ]

        response = authenticated_client.get(DASHBOARD_LIST_URL)
        assert response.status_code == status.HTTP_502_BAD_GATEWAY
