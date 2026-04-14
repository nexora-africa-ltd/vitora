"""
Tests for AI ICU Predictor endpoint (POST /api/ai/predict/icu/).

Tests cover:
- Feature flag gating (TIBABOT_ENABLED)
- Authentication requirement
- Input validation (patient_data required, field constraints)
- Successful prediction with mocked TibaBot response (predict + risk-stratify)
- Graceful degradation when TibaBot is unavailable
- PII sanitization of admission_diagnosis
- Audit logging
- Response serialization with SOFA/qSOFA scores, alerts, escalation
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status


@pytest.fixture
def icu_predict_payload():
    """Valid payload for ICU risk prediction."""
    return {
        "patient_data": {
            "age": 65,
            "gender": "M",
            "temperature": 38.9,
            "heart_rate": 115,
            "systolic_bp": 88,
            "diastolic_bp": 55,
            "respiratory_rate": 26,
            "spo2": 90,
            "mean_arterial_pressure": 66,
            "wbc": 18.5,
            "platelets": 95,
            "creatinine": 2.8,
            "bilirubin": 1.9,
            "lactate": 3.2,
            "gcs": 13,
            "on_vasopressors": False,
            "on_mechanical_ventilation": False,
            "admission_diagnosis": "sepsis secondary to urinary tract infection",
            "length_of_stay_days": 3,
        },
        "prediction_type": "predict",
    }


@pytest.fixture
def icu_risk_stratify_payload(icu_predict_payload):
    """Payload for risk stratification prediction type."""
    payload = icu_predict_payload.copy()
    payload["prediction_type"] = "risk-stratify"
    return payload


@pytest.fixture
def tibabot_icu_predict_response():
    """Mock TibaBot ICU predict response."""
    return {
        "risk_level": "high",
        "risk_score": 0.82,
        "sofa_score": 9,
        "sofa_breakdown": {
            "respiratory": 2,
            "coagulation": 2,
            "liver": 1,
            "cardiovascular": 2,
            "neurological": 1,
            "renal": 1,
        },
        "qsofa_score": 3,
        "qsofa_criteria": [
            "Altered mentation (GCS < 15)",
            "Respiratory rate >= 22",
            "Systolic BP <= 100",
        ],
        "critical_alerts": [
            {
                "alert_type": "sepsis",
                "severity": "critical",
                "message": "High sepsis risk: SOFA score 9 with qSOFA 3/3",
                "recommendation": "Initiate sepsis bundle within 1 hour",
            },
            {
                "alert_type": "aki",
                "severity": "warning",
                "message": "Elevated creatinine (2.8 mg/dL) suggests AKI stage 2",
                "recommendation": "Monitor urine output, consider nephrology consult",
            },
        ],
        "escalation": {
            "recommended": True,
            "urgency": "urgent",
            "reasoning": "SOFA score >= 8 with qSOFA 3/3 and lactate > 2 mmol/L "
            "indicates organ dysfunction with high mortality risk",
        },
        "recommendations": [
            "Obtain blood cultures before antibiotics",
            "Administer broad-spectrum antibiotics within 1 hour",
            "IV fluid resuscitation (30 mL/kg crystalloid)",
            "Monitor lactate clearance every 2 hours",
            "Consider vasopressors if MAP < 65 after fluids",
        ],
    }


@pytest.fixture
def tibabot_icu_risk_stratify_response(tibabot_icu_predict_response):
    """Mock TibaBot ICU risk-stratify response (adds probability scores)."""
    response = tibabot_icu_predict_response.copy()
    response.update(
        {
            "sepsis_probability": 0.87,
            "aki_probability": 0.72,
            "deterioration_probability": 0.65,
        }
    )
    return response


@pytest.mark.django_db
class TestICUPredictFeatureGating:
    """Tests that ICU predict endpoint respects TIBABOT_ENABLED."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_disabled(self, authenticated_client, icu_predict_payload):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            icu_predict_payload,
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_accessible_when_enabled(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should accept request when TIBABOT_ENABLED is True."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["risk_level"] == "high"


@pytest.mark.django_db
class TestICUPredictAuthentication:
    """Tests authentication requirement."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client, icu_predict_payload):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/ai/predict/icu/",
            icu_predict_payload,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestICUPredictValidation:
    """Tests input validation for ICU prediction."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_missing_patient_data(self, authenticated_client):
        """Should reject request without patient_data."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "patient_data" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_missing_age(self, authenticated_client):
        """Should reject patient_data without age."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            {"patient_data": {"gender": "M"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_missing_gender(self, authenticated_client):
        """Should reject patient_data without gender."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            {"patient_data": {"age": 65}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_invalid_gender(self, authenticated_client):
        """Should reject invalid gender value."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            {"patient_data": {"age": 65, "gender": "X"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_negative_age(self, authenticated_client):
        """Should reject negative age."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            {"patient_data": {"age": -1, "gender": "M"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_age_over_150(self, authenticated_client):
        """Should reject unrealistic age over 150."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            {"patient_data": {"age": 200, "gender": "M"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_invalid_gcs(self, authenticated_client):
        """Should reject GCS out of range (3-15)."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            {"patient_data": {"age": 65, "gender": "M", "gcs": 1}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_invalid_prediction_type(self, authenticated_client):
        """Should reject invalid prediction_type."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            {
                "patient_data": {"age": 65, "gender": "M"},
                "prediction_type": "invalid",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_rejects_minimal_payload_missing_vitals(
        self,
        authenticated_client,
    ):
        """Should reject payload missing required vitals."""
        response = authenticated_client.post(
            "/api/ai/predict/icu/",
            {"patient_data": {"age": 65, "gender": "M"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "missing_fields" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_accepts_vitals_only_defaults_labs(
        self,
        authenticated_client,
        tibabot_icu_predict_response,
    ):
        """Should accept payload with vitals but no labs — labs get normal defaults."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                {
                    "patient_data": {
                        "age": 65,
                        "gender": "M",
                        "temperature": 38.0,
                        "heart_rate": 100,
                        "systolic_bp": 110,
                        "diastolic_bp": 70,
                        "respiratory_rate": 20,
                        "spo2": 95,
                    },
                },
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert set(response.data["defaulted_labs"]) == {
                "creatinine",
                "wbc",
                "platelets",
                "lactate",
            }

    @override_settings(TIBABOT_ENABLED=True)
    def test_accepts_payload_with_required_fields(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should accept payload with all required vitals and labs."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_accepts_gcs_range(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should accept valid GCS values (3-15)."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            for gcs in [3, 8, 15]:
                payload = icu_predict_payload.copy()
                payload["patient_data"] = {**payload["patient_data"], "gcs": gcs}
                response = authenticated_client.post(
                    "/api/ai/predict/icu/",
                    payload,
                    format="json",
                )
                assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestICUPredictResponse:
    """Tests ICU prediction response structure."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_full_predict_response(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should return full ICU prediction with SOFA/qSOFA scores."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK

            data = response.data
            assert data["risk_level"] == "high"
            assert data["risk_score"] == 0.82
            assert data["sofa_score"] == 9
            assert data["qsofa_score"] == 3

    @override_settings(TIBABOT_ENABLED=True)
    def test_sofa_breakdown_structure(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should return SOFA score component breakdown."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )
            breakdown = response.data["sofa_breakdown"]
            assert breakdown["respiratory"] == 2
            assert breakdown["coagulation"] == 2
            assert breakdown["liver"] == 1
            assert breakdown["cardiovascular"] == 2
            assert breakdown["neurological"] == 1
            assert breakdown["renal"] == 1

    @override_settings(TIBABOT_ENABLED=True)
    def test_critical_alerts_structure(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should return critical alerts with type, severity, message."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )
            alerts = response.data["critical_alerts"]
            assert len(alerts) == 2
            assert alerts[0]["alert_type"] == "sepsis"
            assert alerts[0]["severity"] == "critical"
            assert alerts[1]["alert_type"] == "aki"
            assert alerts[1]["severity"] == "warning"

    @override_settings(TIBABOT_ENABLED=True)
    def test_escalation_structure(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should return escalation recommendation."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )
            escalation = response.data["escalation"]
            assert escalation["recommended"] is True
            assert escalation["urgency"] == "urgent"
            assert "SOFA score" in escalation["reasoning"]

    @override_settings(TIBABOT_ENABLED=True)
    def test_risk_stratify_response(
        self,
        authenticated_client,
        icu_risk_stratify_payload,
        tibabot_icu_risk_stratify_response,
    ):
        """Should return risk stratification probabilities."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu_risk_stratify.return_value = tibabot_icu_risk_stratify_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_risk_stratify_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["sepsis_probability"] == 0.87
            assert response.data["aki_probability"] == 0.72
            assert response.data["deterioration_probability"] == 0.65

    @override_settings(TIBABOT_ENABLED=True)
    def test_forwards_payload_with_context(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should forward payload enriched with user and facility context."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )
            # Verify the payload sent to TibaBot
            call_args = mock_client.predict_icu.call_args
            sent_payload = call_args[0][0]
            assert "patient_data" in sent_payload
            assert "user_context" in sent_payload
            assert "facility_context" in sent_payload
            assert sent_payload["patient_data"]["age"] == 65

    @override_settings(TIBABOT_ENABLED=True)
    def test_risk_stratify_calls_correct_method(
        self,
        authenticated_client,
        icu_risk_stratify_payload,
        tibabot_icu_risk_stratify_response,
    ):
        """Should call predict_icu_risk_stratify for risk-stratify type."""
        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu_risk_stratify.return_value = tibabot_icu_risk_stratify_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_risk_stratify_payload,
                format="json",
            )
            mock_client.predict_icu_risk_stratify.assert_called_once()
            mock_client.predict_icu.assert_not_called()


@pytest.mark.django_db
class TestICUPredictGracefulDegradation:
    """Tests graceful degradation when TibaBot is unavailable."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_200_on_tibabot_unavailable(self, authenticated_client, icu_predict_payload):
        """Should return 200 with empty defaults when TibaBot is unavailable."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.side_effect = TibaBotUnavailableError("Service unavailable")
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["risk_level"] == "low"
            assert response.data["risk_score"] == 0.0
            assert response.data["sofa_score"] is None
            assert response.data["critical_alerts"] == []
            assert "error" in response.data
            assert "unavailable" in response.data["error"].lower()

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_200_on_tibabot_error(self, authenticated_client, icu_predict_payload):
        """Should return 200 with empty defaults on TibaBot error."""
        from hmis.apps.ai.client import TibaBotError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.side_effect = TibaBotError("API error")
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["risk_level"] == "low"
            assert "error" in response.data


@pytest.mark.django_db
class TestICUPredictAuditLogging:
    """Tests audit logging for ICU prediction."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_creates_audit_log(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should create an audit log entry for ICU prediction."""
        from hmis.apps.core.models import AuditLog

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )

            log = AuditLog.objects.filter(action="ai_icu_predict").first()
            assert log is not None
            assert log.resource_type == "AI"
            assert log.details["age"] == 65
            assert log.details["gender"] == "M"
            assert log.details["prediction_type"] == "predict"
            assert log.details["has_lab_data"] is True


@pytest.mark.django_db
class TestICUPredictSanitization:
    """Tests PII sanitization in ICU prediction."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_sanitizes_admission_diagnosis(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should strip MRN from admission_diagnosis."""
        icu_predict_payload["patient_data"][
            "admission_diagnosis"
        ] = "Sepsis MRN-20260101-0001 patient admitted"

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )

            call_args = mock_client.predict_icu.call_args
            sent_payload = call_args[0][0]
            sent_diagnosis = sent_payload["patient_data"]["admission_diagnosis"]
            assert "MRN-20260101-0001" not in sent_diagnosis

    @override_settings(TIBABOT_ENABLED=True)
    def test_sanitizes_phone_from_diagnosis(
        self,
        authenticated_client,
        icu_predict_payload,
        tibabot_icu_predict_response,
    ):
        """Should strip phone numbers from admission_diagnosis."""
        icu_predict_payload["patient_data"]["admission_diagnosis"] = "UTI sepsis call 0712345678"

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_icu_predict_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/predict/icu/",
                icu_predict_payload,
                format="json",
            )

            call_args = mock_client.predict_icu.call_args
            sent_payload = call_args[0][0]
            sent_diagnosis = sent_payload["patient_data"]["admission_diagnosis"]
            assert "0712345678" not in sent_diagnosis
