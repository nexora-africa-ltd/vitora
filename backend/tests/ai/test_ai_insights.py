"""
Tests for AI Insights aggregation endpoint.

Tests cover:
- Feature flag gating (TIBABOT_ENABLED)
- Authentication requirement
- Response shape and all aggregation sections
- Graceful degradation when TibaBot is unavailable
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from hmis.apps.ai.models import AICarePlanResult, AICDSResult, ChatMessage, ChatSession
from hmis.apps.core.models import AuditLog


@pytest.mark.django_db
class TestAIInsightsFeatureGating:
    """Tests that insights endpoint respects TIBABOT_ENABLED."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_disabled(self, authenticated_client):
        response = authenticated_client.get("/api/ai/insights/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_returns_401_when_unauthenticated(self, api_client):
        response = api_client.get("/api/ai/insights/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestAIInsightsResponse:
    """Tests for insights response shape and data."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_aggregated_insights(self, authenticated_client):
        """Should return all sections of insights data."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.get_feedback_stats.return_value = {
                "total_up": 42,
                "total_down": 3,
                "recent_negatives": 1,
            }
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/insights/")

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # Verify all top-level keys
        assert "stored_results" in data
        assert "suggestion_audit" in data
        assert "chat_metrics" in data
        assert "usage_breakdown" in data
        assert "total_ai_actions_30d" in data
        assert "feedback" in data
        assert "advisory_links" in data
        assert "period" in data

        # Stored results has expected keys
        assert "total" in data["stored_results"]
        assert "care_plans" in data["stored_results"]
        assert "cds_evaluations" in data["stored_results"]

        # Feedback reflects mocked values
        assert data["feedback"]["total_up"] == 42
        assert data["feedback"]["total_down"] == 3

        # Suggestion audit has expected keys
        assert "accepted" in data["suggestion_audit"]
        assert "applied" in data["suggestion_audit"]
        assert "total" in data["suggestion_audit"]

        # Chat metrics
        assert "total_sessions" in data["chat_metrics"]
        assert "recent_sessions" in data["chat_metrics"]
        assert "total_messages" in data["chat_metrics"]

    @override_settings(TIBABOT_ENABLED=True)
    def test_graceful_degradation_when_tibabot_unavailable(self, authenticated_client):
        """Should return zeros for feedback when TibaBot is down."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            from hmis.apps.ai.client import TibaBotUnavailableError

            mock_client = MagicMock()
            mock_client.get_feedback_stats.side_effect = TibaBotUnavailableError(
                "Service unavailable"
            )
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/insights/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["feedback"]["total_up"] == 0
        assert response.data["feedback"]["total_down"] == 0

    @override_settings(TIBABOT_ENABLED=True)
    def test_counts_audit_log_suggestions(self, authenticated_client, test_user, sample_facility):
        """Should aggregate suggestion audit actions from the last 30 days."""
        # Create some audit log entries (with facility to match tenant scoping)
        AuditLog.objects.create(
            user=test_user,
            action="ai_suggestion_accepted",
            resource_type="AI",
            facility=sample_facility,
            timestamp=timezone.now(),
        )
        AuditLog.objects.create(
            user=test_user,
            action="ai_suggestion_applied",
            resource_type="AI",
            facility=sample_facility,
            timestamp=timezone.now(),
        )

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.get_feedback_stats.return_value = {
                "total_up": 0,
                "total_down": 0,
                "recent_negatives": 0,
            }
            mock_get_client.return_value = mock_client

            response = authenticated_client.get("/api/ai/insights/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["suggestion_audit"]["accepted"] == 1
        assert response.data["suggestion_audit"]["applied"] == 1
        assert response.data["suggestion_audit"]["total"] == 2
