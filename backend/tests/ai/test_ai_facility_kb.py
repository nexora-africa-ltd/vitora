"""
Tests for TibaBot facility knowledge base proxy endpoints.

Covers:
- Feature flag gating
- Authentication requirement
- KB info listing
- Document upload (multipart)
- Document deletion
- KB search
- Graceful degradation when TibaBot is unavailable
"""

import io
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

from hmis.apps.ai.client import TibaBotError, TibaBotUnavailableError


@pytest.fixture
def mock_tibabot():
    with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
        mock_client = MagicMock()
        mock_get.return_value = mock_client
        yield mock_client


# ---------------------------------------------------------------------------
# Feature flag gating
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFacilityKBFeatureFlags:
    @override_settings(TIBABOT_ENABLED=False)
    def test_info_404_when_feature_disabled(self, authenticated_client):
        response = authenticated_client.get("/api/ai/facility/knowledge-base/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=False)
    def test_upload_404_when_feature_disabled(self, authenticated_client):
        response = authenticated_client.post("/api/ai/facility/knowledge-base/upload/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=False)
    def test_search_404_when_feature_disabled(self, authenticated_client):
        response = authenticated_client.get("/api/ai/facility/knowledge-base/search/?q=test")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFacilityKBAuth:
    @override_settings(TIBABOT_ENABLED=True)
    def test_unauthenticated_rejected(self, api_client):
        response = api_client.get("/api/ai/facility/knowledge-base/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_upload_unauthenticated_rejected(self, api_client):
        response = api_client.post("/api/ai/facility/knowledge-base/upload/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# KB info
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFacilityKBInfo:
    @override_settings(TIBABOT_ENABLED=True)
    def test_get_info_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.get_facility_kb.return_value = {
            "facility_name": "Test Hospital",
            "document_count": 3,
            "documents": [
                {
                    "id": "doc_1",
                    "filename": "protocols.pdf",
                    "size_bytes": 1024,
                    "status": "processed",
                },
            ],
            "total_size_bytes": 3072,
        }

        response = authenticated_client.get("/api/ai/facility/knowledge-base/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["facility_name"] == "Test Hospital"
        assert response.data["document_count"] == 3
        assert len(response.data["documents"]) == 1

    @override_settings(TIBABOT_ENABLED=True)
    def test_get_info_unavailable(self, authenticated_client, mock_tibabot):
        mock_tibabot.get_facility_kb.side_effect = TibaBotUnavailableError("Service down")

        response = authenticated_client.get("/api/ai/facility/knowledge-base/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    @override_settings(TIBABOT_ENABLED=True)
    def test_get_info_error(self, authenticated_client, mock_tibabot):
        mock_tibabot.get_facility_kb.side_effect = TibaBotError("Internal error", status_code=500)

        response = authenticated_client.get("/api/ai/facility/knowledge-base/")

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


# ---------------------------------------------------------------------------
# KB upload
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFacilityKBUpload:
    @override_settings(TIBABOT_ENABLED=True)
    def test_upload_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.upload_to_facility_kb.return_value = {
            "id": "doc_new",
            "filename": "guidelines.pdf",
            "status": "processing",
            "size_bytes": 2048,
        }

        pdf_content = b"%PDF-1.4 test pdf content"
        response = authenticated_client.post(
            "/api/ai/facility/knowledge-base/upload/",
            {"file": io.BytesIO(pdf_content)},
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["id"] == "doc_new"
        assert response.data["filename"] == "guidelines.pdf"

    @override_settings(TIBABOT_ENABLED=True)
    def test_upload_no_file(self, authenticated_client, mock_tibabot):
        response = authenticated_client.post(
            "/api/ai/facility/knowledge-base/upload/",
            {},
            format="multipart",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_upload_unavailable(self, authenticated_client, mock_tibabot):
        mock_tibabot.upload_to_facility_kb.side_effect = TibaBotUnavailableError("Service down")

        pdf_content = b"%PDF-1.4 test content"
        response = authenticated_client.post(
            "/api/ai/facility/knowledge-base/upload/",
            {"file": io.BytesIO(pdf_content)},
            format="multipart",
        )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    @override_settings(TIBABOT_ENABLED=True)
    def test_upload_large_file(self, authenticated_client, mock_tibabot):
        """Files over 20 MB should be rejected before reaching TibaBot."""
        large_content = b"x" * (21 * 1024 * 1024)  # 21 MB
        response = authenticated_client.post(
            "/api/ai/facility/knowledge-base/upload/",
            {"file": io.BytesIO(large_content)},
            format="multipart",
        )

        assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE


# ---------------------------------------------------------------------------
# KB document delete
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFacilityKBDocumentDelete:
    @override_settings(TIBABOT_ENABLED=True)
    def test_delete_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.delete_facility_kb_document.return_value = {
            "status": "deleted",
            "message": "Document removed successfully.",
        }

        response = authenticated_client.delete("/api/ai/facility/knowledge-base/documents/doc_abc/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "deleted"

    @override_settings(TIBABOT_ENABLED=True)
    def test_delete_not_found(self, authenticated_client, mock_tibabot):
        mock_tibabot.delete_facility_kb_document.side_effect = TibaBotError(
            "Not found", status_code=404
        )

        response = authenticated_client.delete(
            "/api/ai/facility/knowledge-base/documents/nonexistent/"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_delete_unavailable(self, authenticated_client, mock_tibabot):
        mock_tibabot.delete_facility_kb_document.side_effect = TibaBotUnavailableError(
            "Service down"
        )

        response = authenticated_client.delete("/api/ai/facility/knowledge-base/documents/doc_abc/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


# ---------------------------------------------------------------------------
# KB search
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFacilityKBSearch:
    @override_settings(TIBABOT_ENABLED=True)
    def test_search_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.search_facility_kb.return_value = {
            "results": [
                {
                    "id": "doc_1",
                    "filename": "malaria_protocol.pdf",
                    "snippet": "...malaria treatment...",
                    "score": 0.95,
                },
            ],
            "query": "malaria",
            "total": 1,
        }

        response = authenticated_client.get("/api/ai/facility/knowledge-base/search/?q=malaria")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total"] == 1
        assert len(response.data["results"]) == 1

    @override_settings(TIBABOT_ENABLED=True)
    def test_search_missing_query(self, authenticated_client, mock_tibabot):
        response = authenticated_client.get("/api/ai/facility/knowledge-base/search/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_search_empty_query(self, authenticated_client, mock_tibabot):
        response = authenticated_client.get("/api/ai/facility/knowledge-base/search/?q=")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_search_with_limit(self, authenticated_client, mock_tibabot):
        mock_tibabot.search_facility_kb.return_value = {
            "results": [],
            "query": "test",
            "total": 0,
        }

        response = authenticated_client.get(
            "/api/ai/facility/knowledge-base/search/?q=test&limit=5"
        )

        assert response.status_code == status.HTTP_200_OK
        mock_tibabot.search_facility_kb.assert_called_once_with("test", 5)

    @override_settings(TIBABOT_ENABLED=True)
    def test_search_limit_clamped(self, authenticated_client, mock_tibabot):
        """Limit should be clamped to max 50."""
        mock_tibabot.search_facility_kb.return_value = {
            "results": [],
            "query": "test",
            "total": 0,
        }

        response = authenticated_client.get(
            "/api/ai/facility/knowledge-base/search/?q=test&limit=100"
        )

        assert response.status_code == status.HTTP_200_OK
        mock_tibabot.search_facility_kb.assert_called_once_with("test", 50)

    @override_settings(TIBABOT_ENABLED=True)
    def test_search_unavailable(self, authenticated_client, mock_tibabot):
        mock_tibabot.search_facility_kb.side_effect = TibaBotUnavailableError("Service down")

        response = authenticated_client.get("/api/ai/facility/knowledge-base/search/?q=malaria")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
