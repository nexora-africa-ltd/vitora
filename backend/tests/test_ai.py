"""
Tests for AI proxy endpoints (TibaBot ICD-10 auto-coding).

Tests cover:
- Feature flag gating (TIBABOT_ENABLED)
- ICD-10 suggestion proxy endpoint
- Authentication requirement
- Input validation
- Graceful degradation when TibaBot is unavailable
- PII sanitization
- Audit logging
- AI status endpoint
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status


@pytest.mark.django_db
class TestAIFeatureGating:
    """Tests that AI endpoints respect TIBABOT_ENABLED feature flag."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_icd10_suggest_returns_404_when_disabled(self, authenticated_client):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.post(
            "/api/ai/icd10-suggest/",
            {"clinical_text": "malaria symptoms"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_icd10_suggest_accessible_when_enabled(self, authenticated_client):
        """Should accept request when TIBABOT_ENABLED is True (mock TibaBot)."""
        mock_response = {
            "suggestions": [
                {
                    "code": "B50.9",
                    "description": "Plasmodium falciparum malaria, unspecified",
                    "confidence": 0.92,
                }
            ]
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.suggest_icd10.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {"clinical_text": "malaria symptoms and fever"},
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert len(response.data["suggestions"]) == 1
            assert response.data["suggestions"][0]["code"] == "B50.9"


@pytest.mark.django_db
class TestICD10SuggestEndpoint:
    """Tests for POST /api/ai/icd10-suggest/"""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/ai/icd10-suggest/",
            {"clinical_text": "malaria"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_validates_clinical_text_required(self, authenticated_client):
        """Should reject requests without clinical_text."""
        response = authenticated_client.post(
            "/api/ai/icd10-suggest/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "clinical_text" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_validates_clinical_text_min_length(self, authenticated_client):
        """Should reject clinical_text shorter than 3 characters."""
        response = authenticated_client.post(
            "/api/ai/icd10-suggest/",
            {"clinical_text": "ab"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "clinical_text" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_suggestions_from_tibabot(self, authenticated_client):
        """Should return ranked ICD-10 suggestions with confidence scores."""
        mock_response = {
            "suggestions": [
                {
                    "code": "B50.9",
                    "description": "Plasmodium falciparum malaria, unspecified",
                    "confidence": 0.92,
                },
                {
                    "code": "R50.9",
                    "description": "Fever, unspecified",
                    "confidence": 0.78,
                },
            ]
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.suggest_icd10.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {"clinical_text": "patient presenting with malaria symptoms and fever"},
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK
            assert len(response.data["suggestions"]) == 2
            assert response.data["suggestions"][0]["code"] == "B50.9"
            assert response.data["suggestions"][0]["confidence"] == 0.92
            assert response.data["suggestions"][1]["code"] == "R50.9"

    @override_settings(TIBABOT_ENABLED=True)
    def test_graceful_degradation_when_tibabot_unavailable(
        self, authenticated_client
    ):
        """Should return empty suggestions with error message when TibaBot is down."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.suggest_icd10.side_effect = TibaBotUnavailableError(
                "TibaBot AI service is currently unavailable."
            )
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {"clinical_text": "patient with chest pain"},
                format="json",
            )

            # Should still return 200 with empty suggestions
            assert response.status_code == status.HTTP_200_OK
            assert response.data["suggestions"] == []
            assert "unavailable" in response.data["error"].lower()

    @override_settings(TIBABOT_ENABLED=True)
    def test_graceful_degradation_on_tibabot_error(self, authenticated_client):
        """Should return empty suggestions with error message on TibaBot API errors."""
        from hmis.apps.ai.client import TibaBotError

        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.suggest_icd10.side_effect = TibaBotError(
                "TibaBot API error", status_code=422
            )
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {"clinical_text": "patient with chest pain and shortness of breath"},
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK
            assert response.data["suggestions"] == []
            assert "error" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_handles_unexpected_tibabot_response(self, authenticated_client):
        """Should handle gracefully when TibaBot returns unexpected data shape."""
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            # TibaBot returns something unexpected
            mock_client.suggest_icd10.return_value = {"unexpected": "data"}
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {"clinical_text": "fever and cough for three days"},
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK
            assert response.data["suggestions"] == []

    @override_settings(TIBABOT_ENABLED=True)
    def test_audit_log_created_for_suggestion(self, authenticated_client):
        """Should create an audit log entry for each AI request."""
        from hmis.apps.core.models import AuditLog

        mock_response = {
            "suggestions": [
                {
                    "code": "A00",
                    "description": "Cholera",
                    "confidence": 0.85,
                }
            ]
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.suggest_icd10.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {"clinical_text": "severe watery diarrhea"},
                format="json",
            )

            log = AuditLog.objects.filter(action="ai_icd10_suggest").first()
            assert log is not None
            assert log.resource_type == "AI"
            assert log.details["text_length"] == len("severe watery diarrhea")

    @override_settings(TIBABOT_ENABLED=True)
    def test_includes_clinical_text_preview_in_response(
        self, authenticated_client
    ):
        """Should include sanitized text preview in successful responses."""
        mock_response = {
            "suggestions": [
                {
                    "code": "J18.9",
                    "description": "Pneumonia, unspecified organism",
                    "confidence": 0.88,
                }
            ]
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.suggest_icd10.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {"clinical_text": "productive cough with fever"},
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK
            assert "clinical_text_preview" in response.data


@pytest.mark.django_db
class TestPIISanitization:
    """Tests for PII stripping before sending to TibaBot."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_mrn_stripped_from_clinical_text(self, authenticated_client):
        """Should strip MRN patterns before sending to TibaBot."""
        mock_response = {"suggestions": []}
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.suggest_icd10.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {
                    "clinical_text": "Patient MRN-20260302-0001 presents with fever and cough"
                },
                format="json",
            )

            # Verify sanitized text was sent to TibaBot
            call_args = mock_client.suggest_icd10.call_args[0][0]
            assert "MRN-20260302-0001" not in call_args
            assert "[REDACTED-MRN]" in call_args

    @override_settings(TIBABOT_ENABLED=True)
    def test_phone_number_stripped_from_clinical_text(
        self, authenticated_client
    ):
        """Should strip phone numbers before sending to TibaBot."""
        mock_response = {"suggestions": []}
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.suggest_icd10.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {
                    "clinical_text": "Patient called +254712345678 complaining of headache"
                },
                format="json",
            )

            call_args = mock_client.suggest_icd10.call_args[0][0]
            assert "+254712345678" not in call_args


@pytest.mark.django_db
class TestAIStatusEndpoint:
    """Tests for GET /api/ai/status/"""

    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/ai/status/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_disabled_when_flag_off(self, authenticated_client):
        """Should report disabled when TIBABOT_ENABLED is False."""
        response = authenticated_client.get("/api/ai/status/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["enabled"] is False
        assert response.data["service_name"] == "TibaBot"
        assert response.data["service_available"] is False

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_enabled_with_service_check(self, authenticated_client):
        """Should report enabled and check service availability."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.side_effect = TibaBotUnavailableError(
                "unavailable"
            )
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/status/")

            assert response.status_code == status.HTTP_200_OK
            assert response.data["enabled"] is True
            assert response.data["service_available"] is False

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_service_available_when_reachable(
        self, authenticated_client
    ):
        """Should report service_available=True when TibaBot responds."""
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client._request.return_value = {"status": "ok"}
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/status/")

            assert response.status_code == status.HTTP_200_OK
            assert response.data["enabled"] is True
            assert response.data["service_available"] is True


class TestSanitizer:
    """Unit tests for the PII sanitizer (no DB needed)."""

    def test_sanitize_mrn(self):
        from hmis.apps.ai.sanitizer import sanitize_clinical_text

        result = sanitize_clinical_text(
            "Patient MRN-20260302-0001 has fever"
        )
        assert "MRN-20260302-0001" not in result
        assert "[REDACTED-MRN]" in result
        assert "fever" in result

    def test_sanitize_phone_number(self):
        from hmis.apps.ai.sanitizer import sanitize_clinical_text

        result = sanitize_clinical_text(
            "Call +254712345678 for follow-up"
        )
        assert "+254712345678" not in result
        assert "[REDACTED-PHONE]" in result

    def test_sanitize_national_id(self):
        from hmis.apps.ai.sanitizer import sanitize_clinical_text

        result = sanitize_clinical_text("Patient ID: 12345678 presents with cough")
        assert "12345678" not in result
        assert "[REDACTED-ID]" in result

    def test_preserves_clinical_text(self):
        from hmis.apps.ai.sanitizer import sanitize_clinical_text

        text = "Productive cough with fever for 3 days, SpO2 92%"
        result = sanitize_clinical_text(text)
        assert result == text  # No PII to strip

    def test_handles_empty_string(self):
        from hmis.apps.ai.sanitizer import sanitize_clinical_text

        assert sanitize_clinical_text("") == ""

    def test_handles_none_equivalent(self):
        from hmis.apps.ai.sanitizer import sanitize_clinical_text

        assert sanitize_clinical_text("") == ""


class TestTibaBotClient:
    """Unit tests for the TibaBot HTTP client (no DB needed)."""

    @override_settings(
        TIBABOT_API_URL="https://test.tibabot.example.com",
        TIBABOT_API_KEY="test-key-123",
        TIBABOT_TIMEOUT=10,
    )
    def test_client_initialization(self):
        from hmis.apps.ai.client import TibaBotClient

        client = TibaBotClient()
        assert client.base_url == "https://test.tibabot.example.com"
        assert client.api_key == "test-key-123"
        assert client.timeout == 10
        assert (
            client.session.headers["X-API-Key"] == "test-key-123"
        )

    @override_settings(TIBABOT_API_URL="https://test.example.com")
    def test_suggest_icd10_sanitizes_input(self):
        from hmis.apps.ai.client import TibaBotClient

        client = TibaBotClient()
        with patch.object(client, "_request") as mock_request:
            mock_request.return_value = {"suggestions": []}
            client.suggest_icd10(
                "Patient MRN-20260302-0001 has malaria"
            )

            call_args = mock_request.call_args
            # suggest_icd10 calls _request(method, endpoint, data=...)
            sent_data = call_args[1].get("data") or call_args[0][2]
            sent_text = sent_data["clinical_text"]
            assert "MRN-20260302-0001" not in sent_text
            assert "malaria" in sent_text
