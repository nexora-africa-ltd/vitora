"""
Tests for AI Condition Predictor endpoint (POST /api/ai/predict/condition/).

Tests cover:
- Feature flag gating (TIBABOT_ENABLED)
- Authentication requirement
- Input validation (patient_features required, field constraints)
- Successful prediction with mocked TibaBot response
- Graceful degradation when TibaBot is unavailable
- PII sanitization of chief_complaint and allergies
- Audit logging
- Response serialization with risk_factors and differential_conditions
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status


@pytest.fixture
def condition_predict_payload():
    """Valid payload for condition prediction."""
    return {
        "patient_features": {
            "age": 45,
            "gender": "M",
            "chief_complaint": "chest pain and shortness of breath for 3 days",
            "chief_complaint_category": "CHEST_PAIN",
            "spo2": 92,
            "heart_rate": 110,
            "systolic_bp": 150,
            "diastolic_bp": 95,
            "temperature": 38.5,
            "respiratory_rate": 28,
            "pain_score": 7,
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "allergies": "Penicillin",
        }
    }


@pytest.fixture
def tibabot_condition_response():
    """Mock TibaBot condition prediction response."""
    return {
        "primary_condition": "Acute Coronary Syndrome",
        "confidence": 0.85,
        "risk_level": "high",
        "risk_factors": [
            {
                "factor": "Elevated heart rate",
                "severity": "high",
                "description": "Heart rate of 110 bpm suggests cardiovascular stress.",
            },
            {
                "factor": "Low SpO2",
                "severity": "critical",
                "description": "SpO2 of 92% indicates hypoxemia.",
            },
            {
                "factor": "Hypertension",
                "severity": "moderate",
                "description": "BP 150/95 mmHg above normal range.",
            },
        ],
        "differential_conditions": [
            {
                "condition": "Pulmonary Embolism",
                "confidence": 0.72,
                "icd10_code": "I26.9",
            },
            {
                "condition": "Pneumonia",
                "confidence": 0.61,
                "icd10_code": "J18.9",
            },
        ],
        "recommendations": [
            "Obtain 12-lead ECG immediately",
            "Consider troponin levels",
            "Chest X-ray recommended",
            "Monitor SpO2 continuously",
        ],
    }


@pytest.mark.django_db
class TestConditionPredictFeatureGating:
    """Tests that condition predict endpoint respects TIBABOT_ENABLED."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_disabled(self, authenticated_client, condition_predict_payload):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.post(
            "/api/ai/predict/condition/",
            condition_predict_payload,
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_accessible_when_enabled(
        self,
        authenticated_client,
        condition_predict_payload,
        tibabot_condition_response,
    ):
        """Should accept request when TIBABOT_ENABLED is True."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/condition/",
                condition_predict_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["primary_condition"] == "Acute Coronary Syndrome"


@pytest.mark.django_db
class TestConditionPredictAuthentication:
    """Tests authentication requirement."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client, condition_predict_payload):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/ai/predict/condition/",
            condition_predict_payload,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestConditionPredictValidation:
    """Tests input validation for condition prediction."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_missing_patient_features(self, authenticated_client):
        """Should reject request without patient_features."""
        response = authenticated_client.post(
            "/api/ai/predict/condition/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "patient_features" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_missing_age(self, authenticated_client):
        """Should reject patient_features without age."""
        response = authenticated_client.post(
            "/api/ai/predict/condition/",
            {"patient_features": {"gender": "M"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_missing_gender(self, authenticated_client):
        """Should reject patient_features without gender."""
        response = authenticated_client.post(
            "/api/ai/predict/condition/",
            {"patient_features": {"age": 45}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_invalid_gender(self, authenticated_client):
        """Should reject invalid gender value."""
        response = authenticated_client.post(
            "/api/ai/predict/condition/",
            {"patient_features": {"age": 45, "gender": "X"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_negative_age(self, authenticated_client):
        """Should reject negative age."""
        response = authenticated_client.post(
            "/api/ai/predict/condition/",
            {"patient_features": {"age": -1, "gender": "M"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_age_over_150(self, authenticated_client):
        """Should reject unrealistic age over 150."""
        response = authenticated_client.post(
            "/api/ai/predict/condition/",
            {"patient_features": {"age": 200, "gender": "M"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_invalid_mental_status(self, authenticated_client):
        """Should reject invalid AVPU mental status."""
        response = authenticated_client.post(
            "/api/ai/predict/condition/",
            {"patient_features": {"age": 45, "gender": "M", "mental_status": "X"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_accepts_minimal_payload(
        self,
        authenticated_client,
        tibabot_condition_response,
    ):
        """Should accept minimal payload with only age and gender."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/condition/",
                {"patient_features": {"age": 30, "gender": "F"}},
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_accepts_pain_score_range(
        self,
        authenticated_client,
        tibabot_condition_response,
    ):
        """Should accept pain scores 0-10."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            for score in [0, 5, 10]:
                response = authenticated_client.post(
                    "/api/ai/predict/condition/",
                    {"patient_features": {"age": 30, "gender": "F", "pain_score": score}},
                    format="json",
                )
                assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestConditionPredictResponse:
    """Tests successful condition prediction response."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_full_prediction(
        self,
        authenticated_client,
        condition_predict_payload,
        tibabot_condition_response,
    ):
        """Should return full prediction with risk factors and differentials."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/condition/",
                condition_predict_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["primary_condition"] == "Acute Coronary Syndrome"
            assert response.data["confidence"] == 0.85
            assert response.data["risk_level"] == "high"
            assert len(response.data["risk_factors"]) == 3
            assert len(response.data["differential_conditions"]) == 2
            assert len(response.data["recommendations"]) == 4

    @override_settings(TIBABOT_ENABLED=True)
    def test_risk_factor_structure(
        self,
        authenticated_client,
        condition_predict_payload,
        tibabot_condition_response,
    ):
        """Should return properly structured risk factors."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/condition/",
                condition_predict_payload,
                format="json",
            )
            risk_factor = response.data["risk_factors"][0]
            assert "factor" in risk_factor
            assert "severity" in risk_factor
            assert risk_factor["severity"] in ["low", "moderate", "high", "critical"]

    @override_settings(TIBABOT_ENABLED=True)
    def test_differential_condition_structure(
        self,
        authenticated_client,
        condition_predict_payload,
        tibabot_condition_response,
    ):
        """Should return properly structured differential conditions."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/condition/",
                condition_predict_payload,
                format="json",
            )
            differential = response.data["differential_conditions"][0]
            assert "condition" in differential
            assert "confidence" in differential
            assert 0.0 <= differential["confidence"] <= 1.0

    @override_settings(TIBABOT_ENABLED=True)
    def test_forwards_payload_to_tibabot(
        self,
        authenticated_client,
        condition_predict_payload,
        tibabot_condition_response,
    ):
        """Should forward patient_features with user/facility context to TibaBot."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/predict/condition/",
                condition_predict_payload,
                format="json",
            )

            # Verify call was made with enriched payload
            mock_client.predict_condition.assert_called_once()
            call_payload = mock_client.predict_condition.call_args[0][0]
            assert "patient_features" in call_payload
            assert "user_context" in call_payload
            assert "facility_context" in call_payload
            assert call_payload["patient_features"]["age"] == 45
            assert call_payload["patient_features"]["gender"] == "M"


@pytest.mark.django_db
class TestConditionPredictGracefulDegradation:
    """Tests graceful degradation when TibaBot is unavailable."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_empty_on_tibabot_unavailable(
        self,
        authenticated_client,
        condition_predict_payload,
    ):
        """Should return 200 with empty data and error message when TibaBot is down."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.side_effect = TibaBotUnavailableError(
                "TibaBot is unavailable"
            )
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/condition/",
                condition_predict_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["primary_condition"] == ""
            assert response.data["confidence"] == 0.0
            assert response.data["risk_level"] == "low"
            assert response.data["risk_factors"] == []
            assert response.data["differential_conditions"] == []
            assert "error" in response.data
            assert "unavailable" in response.data["error"].lower()

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_empty_on_tibabot_error(
        self,
        authenticated_client,
        condition_predict_payload,
    ):
        """Should return 200 with empty data and error message on TibaBot error."""
        from hmis.apps.ai.client import TibaBotError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.side_effect = TibaBotError(
                "TibaBot error", status_code=422
            )
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/condition/",
                condition_predict_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["primary_condition"] == ""
            assert "error" in response.data


@pytest.mark.django_db
class TestConditionPredictAuditLogging:
    """Tests audit logging for condition predictions."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_creates_audit_log(
        self,
        authenticated_client,
        condition_predict_payload,
        tibabot_condition_response,
    ):
        """Should create an audit log entry for condition prediction."""
        from hmis.apps.core.models import AuditLog

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/predict/condition/",
                condition_predict_payload,
                format="json",
            )

            log = AuditLog.objects.filter(action="ai_condition_predict").first()
            assert log is not None
            assert log.resource_type == "AI"
            assert log.details["age"] == 45
            assert log.details["gender"] == "M"
            assert log.details["chief_complaint_category"] == "CHEST_PAIN"


@pytest.mark.django_db
class TestConditionPredictSanitization:
    """Tests PII sanitization before forwarding to TibaBot."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_sanitizes_chief_complaint(
        self,
        authenticated_client,
        tibabot_condition_response,
    ):
        """Should sanitize PII from chief complaint before forwarding."""
        payload = {
            "patient_features": {
                "age": 30,
                "gender": "F",
                "chief_complaint": "Patient MRN-20260101-0001 has fever",
            }
        }

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/predict/condition/",
                payload,
                format="json",
            )

            call_payload = mock_client.predict_condition.call_args[0][0]
            # MRN should be stripped from the chief complaint
            assert "MRN-20260101-0001" not in call_payload["patient_features"][
                "chief_complaint"
            ]

    @override_settings(TIBABOT_ENABLED=True)
    def test_sanitizes_allergies(
        self,
        authenticated_client,
        tibabot_condition_response,
    ):
        """Should sanitize PII from allergies before forwarding."""
        payload = {
            "patient_features": {
                "age": 30,
                "gender": "F",
                "allergies": "Call 0712345678 for details. Allergic to penicillin.",
            }
        }

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_condition.return_value = tibabot_condition_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/predict/condition/",
                payload,
                format="json",
            )

            call_payload = mock_client.predict_condition.call_args[0][0]
            # Phone number should be stripped
            assert "0712345678" not in call_payload["patient_features"]["allergies"]
