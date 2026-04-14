"""
Tests for AI autopopulate endpoint.

TDD: Tests define expected behavior for the smart autopopulate feature.
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from rest_framework import status


@pytest.fixture
def smart_autopopulate_enabled(db):
    """Enable the smart_autopopulate feature flag."""
    from hmis.apps.core.models import FeatureFlag

    return FeatureFlag.objects.create(
        name="smart_autopopulate",
        is_enabled=True,
    )


@pytest.fixture
def smart_autopopulate_disabled(db):
    """Disable the smart_autopopulate feature flag."""
    from hmis.apps.core.models import FeatureFlag

    return FeatureFlag.objects.create(
        name="smart_autopopulate",
        is_enabled=False,
    )


class TestAutopopulateEndpoint:
    """Tests for POST /api/ai/autopopulate/."""

    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/ai/autopopulate/", {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @patch("hmis.apps.ai.feature_flags.is_ai_enabled", return_value=True)
    def test_returns_404_when_feature_flag_disabled(
        self, mock_ai, authenticated_client, smart_autopopulate_disabled
    ):
        """Should return 404 when smart_autopopulate flag is off."""
        response = authenticated_client.post(
            "/api/ai/autopopulate/",
            {"chief_complaint": "headache and fever"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @patch("hmis.apps.ai.feature_flags.is_ai_enabled", return_value=False)
    def test_returns_404_when_ai_disabled(
        self, mock_ai, authenticated_client, smart_autopopulate_enabled
    ):
        """Should return 404 when TIBABOT_ENABLED is off."""
        response = authenticated_client.post(
            "/api/ai/autopopulate/",
            {"chief_complaint": "headache"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @patch("hmis.apps.ai.feature_flags.is_ai_enabled", return_value=True)
    @patch("hmis.apps.ai.views.get_tibabot_client")
    def test_returns_icd10_suggestions_with_high_confidence(
        self, mock_client_fn, mock_ai, authenticated_client, smart_autopopulate_enabled
    ):
        """When chief complaint has high-confidence ICD-10 match, suggest it."""
        mock_client = MagicMock()
        mock_client.suggest_icd10.return_value = {
            "suggestions": [
                {"code": "B50.9", "description": "Plasmodium falciparum malaria", "confidence": 0.92},
                {"code": "A01.0", "description": "Typhoid fever", "confidence": 0.45},
            ]
        }
        mock_client.clinical_assist.return_value = {"response": ""}
        mock_client_fn.return_value = mock_client

        response = authenticated_client.post(
            "/api/ai/autopopulate/",
            {"chief_complaint": "Patient has high fever and chills, tested for malaria"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert "icd10_suggestions" in data
        assert len(data["icd10_suggestions"]) == 2

        # High-confidence suggestion should appear in suggested_fields
        assert "suggested_fields" in data
        diagnosis_fields = [f for f in data["suggested_fields"] if f["field_name"] == "primary_diagnosis"]
        assert len(diagnosis_fields) == 1
        assert diagnosis_fields[0]["value"]["icd10_code"] == "B50.9"
        assert diagnosis_fields[0]["confidence"] >= 0.85

    @patch("hmis.apps.ai.feature_flags.is_ai_enabled", return_value=True)
    @patch("hmis.apps.ai.views.get_tibabot_client")
    def test_no_diagnosis_suggestion_for_low_confidence(
        self, mock_client_fn, mock_ai, authenticated_client, smart_autopopulate_enabled
    ):
        """When no ICD-10 suggestion exceeds 0.85, don't auto-suggest diagnosis."""
        mock_client = MagicMock()
        mock_client.suggest_icd10.return_value = {
            "suggestions": [
                {"code": "R50.9", "description": "Fever, unspecified", "confidence": 0.60},
            ]
        }
        mock_client.clinical_assist.return_value = {"response": ""}
        mock_client_fn.return_value = mock_client

        response = authenticated_client.post(
            "/api/ai/autopopulate/",
            {"chief_complaint": "Patient has fever"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        # ICD-10 suggestions should still be in the response
        assert len(data["icd10_suggestions"]) == 1
        # But no auto-fill suggestion for primary_diagnosis
        diagnosis_fields = [f for f in data["suggested_fields"] if f["field_name"] == "primary_diagnosis"]
        assert len(diagnosis_fields) == 0

    @patch("hmis.apps.ai.feature_flags.is_ai_enabled", return_value=True)
    @patch("hmis.apps.ai.views.get_tibabot_client")
    def test_returns_assessment_suggestion(
        self, mock_client_fn, mock_ai, authenticated_client, smart_autopopulate_enabled
    ):
        """Should include AI-generated assessment in suggested_fields."""
        mock_client = MagicMock()
        mock_client.suggest_icd10.return_value = {"suggestions": []}
        mock_client.clinical_assist.return_value = {
            "response": "Assessment: Patient presents with classic malaria symptoms."
        }
        mock_client_fn.return_value = mock_client

        response = authenticated_client.post(
            "/api/ai/autopopulate/",
            {
                "chief_complaint": "fever and chills",
                "patient_age": 35,
                "patient_sex": "M",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assessment_fields = [f for f in data["suggested_fields"] if f["field_name"] == "assessment"]
        assert len(assessment_fields) == 1
        assert "malaria" in assessment_fields[0]["value"].lower()

    @patch("hmis.apps.ai.feature_flags.is_ai_enabled", return_value=True)
    @patch("hmis.apps.ai.views.get_tibabot_client")
    def test_graceful_degradation_on_tibabot_error(
        self, mock_client_fn, mock_ai, authenticated_client, smart_autopopulate_enabled
    ):
        """Should return empty suggestions when TibaBot is unavailable."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        mock_client_fn.side_effect = TibaBotUnavailableError("Service down")

        response = authenticated_client.post(
            "/api/ai/autopopulate/",
            {"chief_complaint": "headache"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["suggested_fields"] == []
        assert "error" in data

    @patch("hmis.apps.ai.feature_flags.is_ai_enabled", return_value=True)
    @patch("hmis.apps.ai.views.get_tibabot_client")
    def test_empty_request_returns_empty_suggestions(
        self, mock_client_fn, mock_ai, authenticated_client, smart_autopopulate_enabled
    ):
        """Empty request body should return empty suggestions (no errors)."""
        mock_client = MagicMock()
        mock_client_fn.return_value = mock_client

        response = authenticated_client.post(
            "/api/ai/autopopulate/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["suggested_fields"] == []

    @patch("hmis.apps.ai.feature_flags.is_ai_enabled", return_value=True)
    @patch("hmis.apps.ai.views.get_tibabot_client")
    def test_audit_log_created(
        self, mock_client_fn, mock_ai, authenticated_client, smart_autopopulate_enabled
    ):
        """Should create audit log entry for autopopulate requests."""
        from hmis.apps.core.models import AuditLog

        mock_client = MagicMock()
        mock_client.suggest_icd10.return_value = {"suggestions": []}
        mock_client.clinical_assist.return_value = {"response": ""}
        mock_client_fn.return_value = mock_client

        response = authenticated_client.post(
            "/api/ai/autopopulate/",
            {"chief_complaint": "test"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        audit = AuditLog.objects.filter(action="ai_autopopulate_request").first()
        assert audit is not None
        assert audit.details["has_chief_complaint"] is True
