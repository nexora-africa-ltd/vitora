"""Tests for DHA Health Worker Registry practitioner search API.

These tests validate the backend URL structure and basic response behavior.

The backend exposes a SHA-style endpoint:
    /api/sha/practitioner/validate/
which mirrors the external DHA/SHA practitioner search:
    {{base_url}}/v1/practitioner-search
"""

import pytest  # type: ignore


@pytest.mark.django_db
class TestDHAPractitionerSearchAPI:
    """Tests for the DHA Practitioner Search/Validate endpoint."""

    # The correct endpoint path based on sha_urls.py
    ENDPOINT = "/api/sha/practitioner/validate/"

    def test_requires_authentication(self, api_client):
        response = api_client.get(
            f"{self.ENDPOINT}?identification_type=National%20ID&identification_number=34221265"
        )

        assert response.status_code == 401

    def test_missing_params_returns_400(self, authenticated_client):
        response = authenticated_client.get(self.ENDPOINT)

        assert response.status_code == 400
        assert "identification_number" in response.data["error"]

    def test_not_found_returns_404_with_null_message(self, authenticated_client, monkeypatch):
        from hmis.apps.billing.services.dha_search import DHASearchService

        def _fake_search_practitioner(self, **kwargs):  # noqa: ANN001
            return None

        monkeypatch.setattr(DHASearchService, "search_practitioner", _fake_search_practitioner)

        response = authenticated_client.get(
            f"{self.ENDPOINT}?identification_type=National%20ID&identification_number=12345678"
        )

        assert response.status_code == 404
        assert response.data["message"] is None
