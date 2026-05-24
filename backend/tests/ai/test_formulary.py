"""
Tests for Drug Formulary proxy endpoints.

Tests cover:
- Feature flag gating (TIBABOT_ENABLED)
- Authentication requirement
- Search input validation
- Formulary search proxy
- SmPC detail proxy
- Stats endpoint
- Graceful degradation when TibaBot is unavailable
- Graceful degradation for non-availability errors (TibaBotError)
- Audit logging
- Default limit parameter
- Query length boundary validation
- SmPC detail audit logging
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status


@pytest.mark.django_db
class TestFormularySearch:
    """Tests for GET /api/ai/formulary/search/."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_ai_disabled(self, authenticated_client):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.get("/api/ai/formulary/search/?q=metformin")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/ai/formulary/search/?q=metformin")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_validates_query_min_length(self, authenticated_client):
        """Should reject queries shorter than 2 characters."""
        response = authenticated_client.get("/api/ai/formulary/search/?q=a")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_validates_query_required(self, authenticated_client):
        """Should reject requests without query parameter."""
        response = authenticated_client.get("/api/ai/formulary/search/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_validates_limit_range(self, authenticated_client):
        """Should reject limit outside 1-50 range."""
        response = authenticated_client.get("/api/ai/formulary/search/?q=metformin&limit=100")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_successful_search(self, authenticated_client):
        """Should proxy search results from TibaBot."""
        mock_response = {
            "query": "metformin",
            "total_results": 3,
            "smpc": [
                {
                    "id": "smpc_metformin_500mg_tablets",
                    "product_name": "METFORMIN 500MG TABLETS SmPC",
                    "active_ingredients": ["metformin hydrochloride"],
                    "indications": "Type 2 diabetes mellitus",
                }
            ],
            "ppb_products": [
                {
                    "registration_no": "PPB-001234",
                    "trade_name": "GLUCOPHAGE 500MG",
                    "active_ingredient": "Metformin Hydrochloride",
                    "is_valid": True,
                }
            ],
            "keml": [
                {
                    "code": "18.1",
                    "name": "Metformin",
                    "level_of_use": 3,
                    "level_description": "H3 (County Referral Hospital)",
                }
            ],
        }
        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/search/?q=metformin&limit=5")
            assert response.status_code == status.HTTP_200_OK
            assert response.data["query"] == "metformin"
            assert response.data["total_results"] == 3
            assert len(response.data["smpc"]) == 1
            assert len(response.data["ppb_products"]) == 1
            assert len(response.data["keml"]) == 1

            # Verify client was called with correct params
            mock_client._request.assert_called_once_with(
                "GET",
                "/drugs/search",
                params={"q": "metformin", "limit": 5},
            )

    @override_settings(TIBABOT_ENABLED=True)
    def test_graceful_degradation_on_unavailable(self, authenticated_client):
        """Should return empty results when TibaBot is unavailable."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.side_effect = TibaBotUnavailableError("unavailable")
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/search/?q=metformin")
            assert response.status_code == status.HTTP_200_OK
            assert response.data["total_results"] == 0
            assert response.data["smpc"] == []
            assert response.data["ppb_products"] == []
            assert response.data["keml"] == []
            assert "error" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_audit_log_created(self, authenticated_client):
        """Should create an audit log entry for formulary searches."""
        from hmis.apps.core.models import AuditLog

        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = {
                "query": "amoxicillin",
                "total_results": 0,
                "smpc": [],
                "ppb_products": [],
                "keml": [],
            }
            mock_get_client.return_value = mock_client

            authenticated_client.get("/api/ai/formulary/search/?q=amoxicillin")

            log = AuditLog.objects.filter(action="ai_formulary_search").first()
            assert log is not None
            assert log.details["query"] == "amoxicillin"


@pytest.mark.django_db
class TestFormularySmpcDetail:
    """Tests for GET /api/ai/formulary/smpc/{doc_id}/."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_ai_disabled(self, authenticated_client):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.get("/api/ai/formulary/smpc/smpc_metformin_500mg/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/ai/formulary/smpc/smpc_metformin_500mg/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_successful_smpc_retrieval(self, authenticated_client):
        """Should proxy SmPC detail from TibaBot."""
        mock_response = {
            "id": "smpc_metformin_500mg_tablets",
            "product_name": "METFORMIN 500MG TABLETS SmPC",
            "pharmaceutical_form": "Film-coated tablets",
            "active_ingredients": ["metformin hydrochloride"],
            "indications": "Treatment of type 2 diabetes mellitus",
            "posology": "Adults: Initially 500mg or 850mg 2-3 times daily",
            "contraindications": "Diabetic ketoacidosis",
            "adverse_effects": "Gastrointestinal symptoms",
        }
        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.get(
                "/api/ai/formulary/smpc/smpc_metformin_500mg_tablets/"
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["product_name"] == "METFORMIN 500MG TABLETS SmPC"
            assert "metformin hydrochloride" in response.data["active_ingredients"]

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_404_for_unknown_doc(self, authenticated_client):
        """Should return 404 when SmPC doc_id not found."""
        from hmis.apps.ai.client import TibaBotError

        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.side_effect = TibaBotError("Not found", status_code=404)
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/smpc/nonexistent_doc/")
            assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_503_when_unavailable(self, authenticated_client):
        """Should return 503 when TibaBot is unavailable."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.side_effect = TibaBotUnavailableError("unavailable")
            mock_get_client.return_value = mock_client

            response = authenticated_client.get(
                "/api/ai/formulary/smpc/smpc_metformin_500mg_tablets/"
            )
            assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


@pytest.mark.django_db
class TestFormularyStats:
    """Tests for GET /api/ai/formulary/stats/."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_ai_disabled(self, authenticated_client):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.get("/api/ai/formulary/stats/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_successful_stats(self, authenticated_client):
        """Should return formulary statistics."""
        mock_response = {
            "loaded": True,
            "smpc_count": 1819,
            "ppb_products_count": 2652,
            "keml_count": 366,
        }
        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/stats/")
            assert response.status_code == status.HTTP_200_OK
            assert response.data["loaded"] is True
            assert response.data["smpc_count"] == 1819

    @override_settings(TIBABOT_ENABLED=True)
    def test_graceful_degradation(self, authenticated_client):
        """Should return zeros when TibaBot is unavailable."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.side_effect = TibaBotUnavailableError("unavailable")
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/stats/")
            assert response.status_code == status.HTTP_200_OK
            assert response.data["loaded"] is False


@pytest.mark.django_db
class TestFormularySearchEdgeCases:
    """Additional edge case tests for formulary search."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_default_limit_is_10(self, authenticated_client):
        """Should use limit=10 when not specified."""
        mock_response = {
            "query": "aspirin",
            "total_results": 0,
            "smpc": [],
            "ppb_products": [],
            "keml": [],
        }
        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.get("/api/ai/formulary/search/?q=aspirin")

            mock_client._request.assert_called_once_with(
                "GET",
                "/drugs/search",
                params={"q": "aspirin", "limit": 10},
            )

    @override_settings(TIBABOT_ENABLED=True)
    def test_query_exactly_2_chars_is_valid(self, authenticated_client):
        """Should accept a query of exactly 2 characters (minimum)."""
        mock_response = {
            "query": "ab",
            "total_results": 0,
            "smpc": [],
            "ppb_products": [],
            "keml": [],
        }
        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/search/?q=ab")
            assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_limit_boundary_50_is_valid(self, authenticated_client):
        """Should accept limit=50 (maximum)."""
        mock_response = {
            "query": "test",
            "total_results": 0,
            "smpc": [],
            "ppb_products": [],
            "keml": [],
        }
        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/search/?q=test&limit=50")
            assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_limit_zero_is_invalid(self, authenticated_client):
        """Should reject limit=0."""
        response = authenticated_client.get("/api/ai/formulary/search/?q=metformin&limit=0")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_error_returns_graceful_response(self, authenticated_client):
        """Should return empty results with error message for TibaBotError."""
        from hmis.apps.ai.client import TibaBotError

        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.side_effect = TibaBotError("Bad request", status_code=400)
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/search/?q=metformin")
            assert response.status_code == status.HTTP_200_OK
            assert response.data["total_results"] == 0
            assert "error" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_search_with_special_characters(self, authenticated_client):
        """Should handle queries with special characters."""
        mock_response = {
            "query": "co-amoxiclav",
            "total_results": 1,
            "smpc": [
                {
                    "id": "smpc_co_amoxiclav",
                    "product_name": "CO-AMOXICLAV",
                    "active_ingredients": [],
                }
            ],
            "ppb_products": [],
            "keml": [],
        }
        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/search/?q=co-amoxiclav")
            assert response.status_code == status.HTTP_200_OK
            assert response.data["total_results"] == 1


@pytest.mark.django_db
class TestFormularySmpcDetailEdgeCases:
    """Additional edge case tests for SmPC detail."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_smpc_detail_audit_log(self, authenticated_client):
        """Should create audit log for SmPC detail views."""
        from hmis.apps.core.models import AuditLog

        mock_response = {
            "id": "smpc_paracetamol_500mg",
            "product_name": "PARACETAMOL 500MG",
            "active_ingredients": ["paracetamol"],
        }
        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.get("/api/ai/formulary/smpc/smpc_paracetamol_500mg/")

            log = AuditLog.objects.filter(action="ai_formulary_smpc_view").first()
            assert log is not None
            assert log.details["doc_id"] == "smpc_paracetamol_500mg"

    @override_settings(TIBABOT_ENABLED=True)
    def test_smpc_detail_server_error_returns_502(self, authenticated_client):
        """Should return 502 for non-404 TibaBotError."""
        from hmis.apps.ai.client import TibaBotError

        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.side_effect = TibaBotError("Server error", status_code=500)
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/smpc/smpc_some_drug/")
            assert response.status_code == status.HTTP_502_BAD_GATEWAY

    @override_settings(TIBABOT_ENABLED=True)
    def test_smpc_doc_id_with_underscores_and_numbers(self, authenticated_client):
        """Should accept doc_id with underscores and numbers."""
        mock_response = {
            "id": "smpc_amoxicillin_250mg_5ml_suspension",
            "product_name": "AMOXICILLIN 250MG/5ML SUSPENSION",
            "active_ingredients": ["amoxicillin trihydrate"],
        }
        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.get(
                "/api/ai/formulary/smpc/smpc_amoxicillin_250mg_5ml_suspension/"
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["product_name"] == "AMOXICILLIN 250MG/5ML SUSPENSION"


@pytest.mark.django_db
class TestFormularyStatsEdgeCases:
    """Additional edge case tests for stats endpoint."""

    def test_stats_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/ai/formulary/stats/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_stats_tibabot_error_returns_zeros(self, authenticated_client):
        """Should return zeros for TibaBotError (non-unavailable)."""
        from hmis.apps.ai.client import TibaBotError

        with patch("hmis.apps.ai.views_formulary.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.side_effect = TibaBotError("error", status_code=500)
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/formulary/stats/")
            assert response.status_code == status.HTTP_200_OK
            assert response.data["loaded"] is False
            assert response.data["smpc_count"] == 0
