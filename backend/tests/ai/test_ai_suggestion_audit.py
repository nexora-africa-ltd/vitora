"""Tests for AI suggestion accountability audit endpoint."""

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status


@pytest.mark.django_db
class TestAISuggestionAuditEndpoint:
    """Tests for POST /api/ai/suggestion-audit/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        response = api_client.post(
            "/api/ai/suggestion-audit/",
            {
                "suggestion_type": "clerking_autocomplete",
                "event_type": "accepted",
                "suggestions": [{"field_name": "assessment", "source": "ai"}],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_validates_non_empty_suggestions(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/suggestion-audit/",
            {
                "suggestion_type": "autopopulate",
                "event_type": "applied",
                "suggestions": [],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "suggestions" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_logs_clerking_acceptance_event(self, authenticated_client):
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.post(
            "/api/ai/suggestion-audit/",
            {
                "suggestion_type": "clerking_autocomplete",
                "event_type": "accepted",
                "note_format": "soap",
                "suggestions": [
                    {
                        "field_name": "assessment",
                        "source": "ai",
                        "confidence": 0.91,
                        "accepted_value": "Patient MRN-20260302-0001 has likely CAP.",
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "logged"
        assert response.data["logged_count"] == 1

        log = AuditLog.objects.filter(action="ai_suggestion_accepted").first()
        assert log is not None
        assert log.details["suggestion_type"] == "clerking_autocomplete"
        assert log.details["note_format"] == "soap"
        assert log.details["logged_count"] == 1
        assert log.details["suggestions"][0]["field_name"] == "assessment"
        assert log.details["suggestions"][0]["confidence"] == 0.91
        assert "MRN-20260302-0001" not in log.details["suggestions"][0]["accepted_value_preview"]

    @override_settings(TIBABOT_ENABLED=True)
    def test_logs_autopopulate_apply_batch(self, authenticated_client):
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.post(
            "/api/ai/suggestion-audit/",
            {
                "suggestion_type": "autopopulate",
                "event_type": "applied",
                "encounter_type": "OPD",
                "suggestions": [
                    {
                        "suggestion_id": "ai-assessment-0",
                        "field_name": "assessment",
                        "source": "ai",
                        "confidence": 0.87,
                        "accepted_value": "Likely malaria based on symptoms.",
                    },
                    {
                        "suggestion_id": "ai-primary_diagnosis-1",
                        "field_name": "primary_diagnosis",
                        "source": "ai",
                        "confidence": 0.92,
                        "accepted_value": {"icd10_code": "B50.9", "description": "Malaria"},
                    },
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["logged_count"] == 2

        log = AuditLog.objects.filter(action="ai_suggestion_applied").first()
        assert log is not None
        assert log.details["suggestion_type"] == "autopopulate"
        assert log.details["encounter_type"] == "OPD"
        assert len(log.details["suggestions"]) == 2
        assert log.details["suggestions"][1]["field_name"] == "primary_diagnosis"
        assert log.details["suggestions"][1]["accepted_value_type"] == "dict"
