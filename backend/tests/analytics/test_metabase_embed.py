"""Tests for the Metabase embed URL endpoint."""

import jwt
import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

EMBED_URL = "/api/analytics/metabase-embed/"


@pytest.mark.django_db
class TestMetabaseEmbedView:
    """Tests for GET /api/analytics/metabase-embed/."""

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    def test_requires_authentication(self, api_client):
        response = api_client.get(EMBED_URL, {"resource_type": "dashboard", "resource_id": 1})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def test_missing_resource_id_returns_400(self, authenticated_client):
        response = authenticated_client.get(EMBED_URL, {"resource_type": "dashboard"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_resource_type_returns_400(self, authenticated_client):
        response = authenticated_client.get(EMBED_URL, {"resource_type": "table", "resource_id": 1})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_negative_resource_id_returns_400(self, authenticated_client):
        response = authenticated_client.get(
            EMBED_URL, {"resource_type": "dashboard", "resource_id": -1}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # ------------------------------------------------------------------
    # Not configured
    # ------------------------------------------------------------------

    @override_settings(METABASE_EMBEDDING_SECRET="")
    def test_returns_503_when_not_configured(self, authenticated_client):
        response = authenticated_client.get(
            EMBED_URL, {"resource_type": "dashboard", "resource_id": 1}
        )
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "not configured" in response.data["detail"]

    # ------------------------------------------------------------------
    # Success
    # ------------------------------------------------------------------

    @override_settings(
        METABASE_EMBEDDING_SECRET="test-secret-key-for-metabase",
        METABASE_SITE_URL="https://metabase.example.com",
    )
    def test_returns_embed_url_for_dashboard(self, authenticated_client):
        response = authenticated_client.get(
            EMBED_URL, {"resource_type": "dashboard", "resource_id": 42}
        )
        assert response.status_code == status.HTTP_200_OK
        embed_url = response.data["embed_url"]
        assert embed_url.startswith("https://metabase.example.com/embed/dashboard/")
        assert "#bordered=false&titled=true" in embed_url

        # Extract and decode the token
        token_str = embed_url.split("/embed/dashboard/")[1].split("#")[0]
        decoded = jwt.decode(token_str, "test-secret-key-for-metabase", algorithms=["HS256"])
        assert decoded["resource"] == {"dashboard": 42}
        assert "exp" in decoded
        assert "params" in decoded

    @override_settings(
        METABASE_EMBEDDING_SECRET="test-secret-key-for-metabase",
        METABASE_SITE_URL="https://metabase.example.com",
    )
    def test_returns_embed_url_for_question(self, authenticated_client):
        response = authenticated_client.get(
            EMBED_URL, {"resource_type": "question", "resource_id": 7}
        )
        assert response.status_code == status.HTTP_200_OK
        embed_url = response.data["embed_url"]
        assert "/embed/question/" in embed_url

    @override_settings(
        METABASE_EMBEDDING_SECRET="test-secret-key-for-metabase",
        METABASE_SITE_URL="https://metabase.example.com",
    )
    def test_embed_token_contains_facility_id(self, authenticated_client, sample_facility):
        """The signed JWT should include facility_id from the user's staff profile."""
        response = authenticated_client.get(
            EMBED_URL, {"resource_type": "dashboard", "resource_id": 1}
        )
        assert response.status_code == status.HTTP_200_OK

        token_str = response.data["embed_url"].split("/embed/dashboard/")[1].split("#")[0]
        decoded = jwt.decode(token_str, "test-secret-key-for-metabase", algorithms=["HS256"])
        assert decoded["params"]["facility_id"] == [sample_facility.id]

    @override_settings(
        METABASE_EMBEDDING_SECRET="secret",
        METABASE_SITE_URL="https://metabase.example.com/",
    )
    def test_trailing_slash_stripped_from_site_url(self, authenticated_client):
        """Trailing slash on METABASE_SITE_URL should not cause double-slash."""
        response = authenticated_client.get(
            EMBED_URL, {"resource_type": "dashboard", "resource_id": 1}
        )
        assert response.status_code == status.HTTP_200_OK
        assert "//embed" not in response.data["embed_url"]

    @override_settings(
        METABASE_EMBEDDING_SECRET="secret",
        METABASE_SITE_URL="https://metabase.example.com",
    )
    def test_token_expiry_is_10_minutes(self, authenticated_client):
        import time

        response = authenticated_client.get(
            EMBED_URL, {"resource_type": "dashboard", "resource_id": 1}
        )
        token_str = response.data["embed_url"].split("/embed/dashboard/")[1].split("#")[0]
        decoded = jwt.decode(token_str, "secret", algorithms=["HS256"])
        assert decoded["exp"] - int(time.time()) <= 600
        assert decoded["exp"] - int(time.time()) >= 595  # within 5s of 10 minutes
