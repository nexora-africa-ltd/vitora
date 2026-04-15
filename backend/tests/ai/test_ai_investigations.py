"""
Tests for AI Investigation Suggestions feature.

Covers:
- Feature flag gating (master + per-feature)
- Authentication requirement
- Input validation
- Successful TibaBot response passthrough
- Result persistence (AIInvestigationSuggestResult)
- Domain event publication
- Stored results retrieval endpoint
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

# Shared mock fixture ---------------------------------------------------------


@pytest.fixture
def mock_tibabot():
    """Yields a mock TibaBot client and patches get_tibabot_client."""
    with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
        mock_client = MagicMock()
        mock_get.return_value = mock_client
        yield mock_client


VALID_PAYLOAD = {
    "chief_complaint": "Fever and joint pain for 3 days",
    "diagnoses": ["Malaria", "Rheumatoid arthritis"],
    "symptoms": ["fever", "joint pain", "fatigue"],
    "patient_age": 30,
    "patient_sex": "M",
    "max_suggestions": 10,
}

TIBABOT_RESPONSE = {
    "suggestions": [
        {
            "name": "Full Blood Count",
            "category": "haematology",
            "priority": "stat",
            "rationale": "Evaluate for malaria parasitemia and anaemia",
            "timing": "Immediately",
            "loinc_code": "58410-2",
            "loinc_display": "CBC panel - Blood by Automated count",
            "source": "kenya_guidelines",
            "condition_key": "malaria",
            "min_facility_level": "H2",
        },
        {
            "name": "Malaria RDT",
            "category": "microbiology",
            "priority": "stat",
            "rationale": "Confirm malaria diagnosis",
            "loinc_code": "70569-9",
            "loinc_display": "Plasmodium sp Ag [Presence] in Blood by Rapid immunoassay",
            "source": "kenya_guidelines",
            "condition_key": "malaria",
        },
        {
            "name": "ESR",
            "category": "haematology",
            "priority": "routine",
            "rationale": "Evaluate inflammatory markers for arthritis assessment",
            "source": "clinical_reasoning",
        },
    ],
    "matched_conditions": ["malaria", "rheumatoid_arthritis"],
    "cds_alerts_applied": 2,
    "total_suggestions": 3,
    "disclaimer": "Advisory only — clinical confirmation required.",
}


# ---------------------------------------------------------------------------
# Feature Flag Gating
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInvestigationFeatureFlags:
    """Feature flag gating for investigation suggestions endpoint."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_master_flag_off_returns_404(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            VALID_PAYLOAD,
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_INVESTIGATIONS=False)
    def test_per_feature_flag_off_returns_404(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            VALID_PAYLOAD,
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_feature_enabled_by_default(self, authenticated_client, mock_tibabot):
        """Per-feature flags default to True, so endpoint should be reachable."""
        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE
        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            VALID_PAYLOAD,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInvestigationAuth:
    """Authentication requirement for investigation suggestions."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_unauthenticated_returns_401(self, api_client):
        response = api_client.post(
            "/api/ai/investigations/suggest/",
            VALID_PAYLOAD,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# Input Validation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInvestigationValidation:
    """Input validation for investigation suggestions."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_empty_payload_accepted(self, authenticated_client, mock_tibabot):
        """All fields are optional, so an empty payload is valid."""
        mock_tibabot.suggest_investigations.return_value = {
            "suggestions": [],
            "matched_conditions": [],
            "cds_alerts_applied": 0,
            "total_suggestions": 0,
            "disclaimer": "Advisory only.",
        }
        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_invalid_patient_age_rejected(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            {"patient_age": -5},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "patient_age" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_patient_age_over_max_rejected(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            {"patient_age": 200},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "patient_age" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_invalid_patient_sex_rejected(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            {"patient_sex": "X"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "patient_sex" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_max_suggestions_bounds(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            {"max_suggestions": 0},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            {"max_suggestions": 100},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_chief_complaint_max_length(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            {"chief_complaint": "x" * 1001},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "chief_complaint" in response.data


# ---------------------------------------------------------------------------
# Successful Request
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInvestigationSuccess:
    """Successful investigation suggestion requests."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_success_response(self, authenticated_client, mock_tibabot):
        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            VALID_PAYLOAD,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["mode"] == "tibabot"
        assert response.data["total_suggestions"] == 3
        assert len(response.data["suggestions"]) == 3
        assert response.data["suggestions"][0]["name"] == "Full Blood Count"
        assert response.data["matched_conditions"] == ["malaria", "rheumatoid_arthritis"]

    @override_settings(TIBABOT_ENABLED=True)
    def test_stored_id_in_response(self, authenticated_client, mock_tibabot):
        """Response should include stored_id for the persisted result."""
        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        response = authenticated_client.post(
            "/api/ai/investigations/suggest/",
            VALID_PAYLOAD,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "stored_id" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_chief_complaint_sanitized(self, authenticated_client, mock_tibabot):
        """PII patterns in text fields should be sanitized before forwarding."""
        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        payload = {
            **VALID_PAYLOAD,
            "chief_complaint": "Patient MRN-20260101-0001 has fever",
        }
        authenticated_client.post(
            "/api/ai/investigations/suggest/",
            payload,
            format="json",
        )

        # Check what was sent to TibaBot — MRN should be redacted
        call_args = mock_tibabot.suggest_investigations.call_args[0][0]
        assert "MRN-20260101-0001" not in call_args.get("chief_complaint", "")
        assert "[REDACTED-MRN]" in call_args.get("chief_complaint", "")

    @override_settings(TIBABOT_ENABLED=True)
    def test_encounter_id_not_forwarded_to_tibabot(
        self, authenticated_client, mock_tibabot, sample_encounter
    ):
        """encounter_id is for local persistence only — should not reach TibaBot."""
        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        payload = {**VALID_PAYLOAD, "encounter_id": sample_encounter.id}
        authenticated_client.post(
            "/api/ai/investigations/suggest/",
            payload,
            format="json",
        )

        call_args = mock_tibabot.suggest_investigations.call_args[0][0]
        assert "encounter_id" not in call_args


# ---------------------------------------------------------------------------
# TibaBot Error Handling
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInvestigationErrors:
    """Error handling when TibaBot is unavailable or errors."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_unavailable_returns_503(self, authenticated_client):
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.suggest_investigations.side_effect = TibaBotUnavailableError(
                "Service unavailable"
            )
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/investigations/suggest/",
                VALID_PAYLOAD,
                format="json",
            )
            assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
            assert "error" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_error_returns_502(self, authenticated_client):
        from hmis.apps.ai.client import TibaBotError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.suggest_investigations.side_effect = TibaBotError("Bad response")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/investigations/suggest/",
                VALID_PAYLOAD,
                format="json",
            )
            assert response.status_code == status.HTTP_502_BAD_GATEWAY
            assert "error" in response.data


# ---------------------------------------------------------------------------
# Result Persistence
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInvestigationPersistence:
    """AIInvestigationSuggestResult persistence on successful requests."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_result_persisted(self, authenticated_client, mock_tibabot, test_user):
        from hmis.apps.ai.models import AIInvestigationSuggestResult

        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        authenticated_client.post(
            "/api/ai/investigations/suggest/",
            VALID_PAYLOAD,
            format="json",
        )

        assert AIInvestigationSuggestResult.objects.count() == 1
        result = AIInvestigationSuggestResult.objects.first()
        assert result.created_by == test_user
        assert result.suggestion_count == 3
        assert result.matched_conditions == ["malaria", "rheumatoid_arthritis"]
        assert result.service_mode == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_result_linked_to_encounter(self, authenticated_client, mock_tibabot, sample_encounter):
        from hmis.apps.ai.models import AIInvestigationSuggestResult

        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        payload = {**VALID_PAYLOAD, "encounter_id": sample_encounter.id}
        authenticated_client.post(
            "/api/ai/investigations/suggest/",
            payload,
            format="json",
        )

        result = AIInvestigationSuggestResult.objects.first()
        assert result.encounter_id == sample_encounter.id

    @override_settings(TIBABOT_ENABLED=True)
    def test_result_without_encounter(self, authenticated_client, mock_tibabot):
        from hmis.apps.ai.models import AIInvestigationSuggestResult

        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        authenticated_client.post(
            "/api/ai/investigations/suggest/",
            VALID_PAYLOAD,
            format="json",
        )

        result = AIInvestigationSuggestResult.objects.first()
        assert result.encounter_id is None


# ---------------------------------------------------------------------------
# Domain Events
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInvestigationDomainEvents:
    """Domain event publication for investigation suggestions."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_creation_publishes_event(self, authenticated_client, mock_tibabot):
        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        with patch("hmis.apps.ai.signals.publish_event") as mock_publish:
            authenticated_client.post(
                "/api/ai/investigations/suggest/",
                VALID_PAYLOAD,
                format="json",
            )
            mock_publish.assert_called_once()
            call_kwargs = mock_publish.call_args
            assert call_kwargs.kwargs["event_type"] == "ai.investigation_suggest.created"
            assert call_kwargs.kwargs["aggregate_type"] == "AIInvestigationSuggestResult"
            assert call_kwargs.kwargs["payload"]["suggestion_count"] == 3
            assert call_kwargs.kwargs["payload"]["matched_conditions"] == [
                "malaria",
                "rheumatoid_arthritis",
            ]


# ---------------------------------------------------------------------------
# Stored Results Retrieval
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStoredInvestigationSuggestions:
    """Tests for GET /api/ai/results/investigation-suggestions/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        response = api_client.get("/api/ai/results/investigation-suggestions/?encounter_id=1")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_empty_without_encounter_id(self, authenticated_client):
        response = authenticated_client.get("/api/ai/results/investigation-suggestions/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_stored_results(self, authenticated_client, mock_tibabot, sample_encounter):
        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        # Create a result via the view
        payload = {**VALID_PAYLOAD, "encounter_id": sample_encounter.id}
        authenticated_client.post(
            "/api/ai/investigations/suggest/",
            payload,
            format="json",
        )

        # Retrieve stored results
        response = authenticated_client.get(
            f"/api/ai/results/investigation-suggestions/?encounter_id={sample_encounter.id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["suggestion_count"] == 3
        assert response.data[0]["encounter_id"] == sample_encounter.id
        assert response.data[0]["matched_conditions"] == ["malaria", "rheumatoid_arthritis"]

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_empty_for_unrelated_encounter(
        self, authenticated_client, mock_tibabot, sample_encounter
    ):
        mock_tibabot.suggest_investigations.return_value = TIBABOT_RESPONSE.copy()

        # Create a result for one encounter
        payload = {**VALID_PAYLOAD, "encounter_id": sample_encounter.id}
        authenticated_client.post(
            "/api/ai/investigations/suggest/",
            payload,
            format="json",
        )

        # Query for a different encounter
        response = authenticated_client.get(
            "/api/ai/results/investigation-suggestions/?encounter_id=99999"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 0
