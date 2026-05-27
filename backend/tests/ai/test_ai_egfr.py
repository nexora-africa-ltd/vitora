"""
Tests for eGFR Calculator AI integration.

Covers:
- Feature flag gating (master + per-feature)
- Authentication requirement
- Input validation
- TibaBot success path
- Graceful degradation (fallback calculation)
- Result persistence
- Stored results retrieval
- Fallback calculation accuracy
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status


@pytest.fixture
def mock_tibabot():
    """Yields a mock TibaBot client and patches get_tibabot_client."""
    with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
        mock_client = MagicMock()
        mock_get.return_value = mock_client
        yield mock_client


@pytest.fixture
def egfr_request_data():
    """Valid eGFR calculation request payload (Kenya µmol/L)."""
    return {
        "creatinine": 150,
        "creatinine_unit": "umol/L",
        "age": 55,
        "sex": "male",
        "weight_kg": 70,
    }


@pytest.fixture
def egfr_tibabot_response():
    """Mock TibaBot eGFR response."""
    return {
        "egfr_ckd_epi": 47.1,
        "egfr_cockcroft_gault": 48.7,
        "ckd_stage": "G3a",
        "category": "Mildly to moderately decreased",
        "dose_adjustment_band": "mild",
        "flags": ["monitor_egfr_quarterly", "check_urine_acr"],
        "interpretation": (
            "eGFR 47.1 mL/min/1.73m² — CKD Stage G3a "
            "(Mildly to moderately decreased). Mild impairment — "
            "check renally-cleared drugs for dose adjustment."
        ),
        "creatinine_used_mg_dl": 1.697,
    }


# ---------------------------------------------------------------------------
# Feature Flag Gating
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEGFRFeatureFlags:
    """Feature flags gate the eGFR endpoint."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_404_when_master_flag_disabled(self, authenticated_client, egfr_request_data):
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            egfr_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_EGFR=False)
    def test_404_when_egfr_feature_disabled(self, authenticated_client, egfr_request_data):
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            egfr_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_enabled_by_default_when_master_on(
        self, authenticated_client, egfr_request_data, mock_tibabot, egfr_tibabot_response
    ):
        """TIBABOT_ENABLE_EGFR defaults to True (opt-out pattern)."""
        mock_tibabot.calculate_egfr.return_value = egfr_tibabot_response
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            egfr_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEGFRAuthentication:
    """Authentication is required for eGFR endpoints."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_calculate_requires_auth(self, api_client, egfr_request_data):
        response = api_client.post(
            "/api/ai/egfr/calculate/",
            egfr_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_stored_results_requires_auth(self, api_client):
        response = api_client.get("/api/ai/results/egfr/?patient_id=1")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# Input Validation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEGFRValidation:
    """Input validation for eGFR calculation."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_missing_required_fields(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "creatinine" in response.data
        assert "age" in response.data
        assert "sex" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_age_below_minimum(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {"creatinine": 100, "creatinine_unit": "umol/L", "age": 10, "sex": "male"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "age" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_age_above_maximum(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {"creatinine": 100, "creatinine_unit": "umol/L", "age": 130, "sex": "male"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "age" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_invalid_sex(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {"creatinine": 100, "creatinine_unit": "umol/L", "age": 50, "sex": "other"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "sex" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_invalid_creatinine_unit(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {"creatinine": 1.5, "creatinine_unit": "invalid", "age": 50, "sex": "male"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "creatinine_unit" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_creatinine_zero_rejected(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {"creatinine": 0, "creatinine_unit": "umol/L", "age": 50, "sex": "male"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "creatinine" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_negative_creatinine_rejected(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {"creatinine": -5, "creatinine_unit": "umol/L", "age": 50, "sex": "male"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# TibaBot Success Path
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEGFRTibaBotSuccess:
    """Tests for successful TibaBot eGFR calculation."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_success_response(
        self, authenticated_client, mock_tibabot, egfr_request_data, egfr_tibabot_response
    ):
        mock_tibabot.calculate_egfr.return_value = egfr_tibabot_response
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            egfr_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["egfr_ckd_epi"] == 47.1
        assert response.data["ckd_stage"] == "G3a"
        assert response.data["dose_adjustment_band"] == "mild"
        assert response.data["mode"] == "tibabot"
        assert "monitor_egfr_quarterly" in response.data["flags"]
        assert "check_urine_acr" in response.data["flags"]

    @override_settings(TIBABOT_ENABLED=True)
    def test_result_persisted(
        self, authenticated_client, mock_tibabot, egfr_request_data, egfr_tibabot_response
    ):
        mock_tibabot.calculate_egfr.return_value = egfr_tibabot_response
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            egfr_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "stored_id" in response.data

        from hmis.apps.ai.models import AIEGFRResult

        stored = AIEGFRResult.objects.get(id=response.data["stored_id"])
        assert stored.ckd_stage == "G3a"
        assert stored.egfr_ckd_epi == 47.1
        assert stored.dose_adjustment_band == "mild"

    @override_settings(TIBABOT_ENABLED=True)
    def test_sends_correct_payload_to_tibabot(
        self, authenticated_client, mock_tibabot, egfr_tibabot_response, sample_patient
    ):
        """Should not send encounter_id/patient_id to TibaBot."""
        mock_tibabot.calculate_egfr.return_value = egfr_tibabot_response
        authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {
                "creatinine": 150,
                "creatinine_unit": "umol/L",
                "age": 55,
                "sex": "male",
                "weight_kg": 70,
                "patient_id": sample_patient.id,
            },
            format="json",
        )
        payload = mock_tibabot.calculate_egfr.call_args[0][0]
        assert "encounter_id" not in payload
        assert "patient_id" not in payload
        assert payload["creatinine"] == 150
        assert payload["age"] == 55

    @override_settings(TIBABOT_ENABLED=True)
    def test_mg_dl_unit_accepted(self, authenticated_client, mock_tibabot, egfr_tibabot_response):
        mock_tibabot.calculate_egfr.return_value = egfr_tibabot_response
        response = authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {"creatinine": 1.7, "creatinine_unit": "mg/dL", "age": 55, "sex": "male"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Fallback (TibaBot Unavailable)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEGFRFallback:
    """Tests for local fallback when TibaBot is unavailable."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_on_tibabot_unavailable(self, authenticated_client, egfr_request_data):
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.calculate_egfr.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/egfr/calculate/",
                egfr_request_data,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["mode"] == "fallback"
            assert response.data["ckd_stage"] in ("G1", "G2", "G3a", "G3b", "G4", "G5")
            assert response.data["egfr_ckd_epi"] > 0

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_on_tibabot_error(self, authenticated_client, egfr_request_data):
        from hmis.apps.ai.client import TibaBotError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.calculate_egfr.side_effect = TibaBotError("API error", status_code=422)
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/egfr/calculate/",
                egfr_request_data,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["mode"] == "fallback"

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_cockcroft_gault_null_without_weight(self, authenticated_client):
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.calculate_egfr.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/egfr/calculate/",
                {"creatinine": 100, "creatinine_unit": "umol/L", "age": 40, "sex": "female"},
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["egfr_cockcroft_gault"] is None


# ---------------------------------------------------------------------------
# Fallback Calculation Accuracy
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEGFRFallbackAccuracy:
    """Tests for local CKD-EPI and Cockcroft-Gault calculation accuracy."""

    def test_normal_male(self):
        from hmis.apps.ai.services.egfr_fallback import calculate_egfr_fallback

        result = calculate_egfr_fallback(
            {"creatinine": 80, "creatinine_unit": "umol/L", "age": 30, "sex": "male"}
        )
        # Cr 80 µmol/L = ~0.905 mg/dL, 30yo male → eGFR should be >90 (G1)
        assert result["ckd_stage"] == "G1"
        assert result["dose_adjustment_band"] == "normal"
        assert result["egfr_ckd_epi"] > 90

    def test_moderate_female(self):
        from hmis.apps.ai.services.egfr_fallback import calculate_egfr_fallback

        result = calculate_egfr_fallback(
            {"creatinine": 200, "creatinine_unit": "umol/L", "age": 65, "sex": "female"}
        )
        # Cr 200 µmol/L = ~2.26 mg/dL, 65yo female → eGFR should be low
        assert result["ckd_stage"] in ("G3b", "G4")
        assert result["dose_adjustment_band"] in ("moderate", "severe")
        assert "avoid_nsaids" in result["flags"]

    def test_severe_ckd(self):
        from hmis.apps.ai.services.egfr_fallback import calculate_egfr_fallback

        result = calculate_egfr_fallback(
            {"creatinine": 500, "creatinine_unit": "umol/L", "age": 70, "sex": "male"}
        )
        # Cr 500 µmol/L = ~5.66 mg/dL → very low eGFR
        assert result["ckd_stage"] in ("G4", "G5")
        assert "refer_nephrology" in result["flags"]

    def test_cockcroft_gault_with_weight(self):
        from hmis.apps.ai.services.egfr_fallback import calculate_egfr_fallback

        result = calculate_egfr_fallback(
            {
                "creatinine": 1.5,
                "creatinine_unit": "mg/dL",
                "age": 55,
                "sex": "male",
                "weight_kg": 70,
            }
        )
        # CG = (140-55)*70 / (72*1.5) = 5950/108 = 55.1 mL/min
        assert result["egfr_cockcroft_gault"] is not None
        assert 50 < result["egfr_cockcroft_gault"] < 60

    def test_cockcroft_gault_female_factor(self):
        from hmis.apps.ai.services.egfr_fallback import calculate_egfr_fallback

        result = calculate_egfr_fallback(
            {
                "creatinine": 1.5,
                "creatinine_unit": "mg/dL",
                "age": 55,
                "sex": "female",
                "weight_kg": 70,
            }
        )
        # CG = (140-55)*70 / (72*1.5) * 0.85 = ~46.8 mL/min
        assert result["egfr_cockcroft_gault"] is not None
        assert 44 < result["egfr_cockcroft_gault"] < 50

    def test_unit_conversion_umol_to_mg(self):
        from hmis.apps.ai.services.egfr_fallback import calculate_egfr_fallback

        result = calculate_egfr_fallback(
            {"creatinine": 88.4, "creatinine_unit": "umol/L", "age": 40, "sex": "male"}
        )
        # 88.4 µmol/L = 1.0 mg/dL exactly
        assert abs(result["creatinine_used_mg_dl"] - 1.0) < 0.01

    def test_g5_flags(self):
        from hmis.apps.ai.services.egfr_fallback import calculate_egfr_fallback

        result = calculate_egfr_fallback(
            {"creatinine": 800, "creatinine_unit": "umol/L", "age": 60, "sex": "male"}
        )
        assert result["ckd_stage"] == "G5"
        assert result["dose_adjustment_band"] == "dialysis"
        assert "discuss_rrt_options" in result["flags"]
        assert "refer_nephrology" in result["flags"]
        assert "avoid_gadolinium_contrast" in result["flags"]


# ---------------------------------------------------------------------------
# Stored Results
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStoredEGFRResults:
    """Tests for GET /api/ai/results/egfr/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_empty_without_filter(self, authenticated_client):
        response = authenticated_client.get("/api/ai/results/egfr/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_results_by_patient_id(
        self, authenticated_client, mock_tibabot, egfr_tibabot_response, sample_patient
    ):
        mock_tibabot.calculate_egfr.return_value = egfr_tibabot_response
        # Create a result first
        authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {
                "creatinine": 150,
                "creatinine_unit": "umol/L",
                "age": 55,
                "sex": "male",
                "patient_id": sample_patient.id,
            },
            format="json",
        )
        # Query by patient
        response = authenticated_client.get(f"/api/ai/results/egfr/?patient_id={sample_patient.id}")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["ckd_stage"] == "G3a"
        assert response.data[0]["egfr_ckd_epi"] == 47.1

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_results_by_encounter_id(
        self, authenticated_client, mock_tibabot, egfr_tibabot_response, sample_encounter
    ):
        mock_tibabot.calculate_egfr.return_value = egfr_tibabot_response
        authenticated_client.post(
            "/api/ai/egfr/calculate/",
            {
                "creatinine": 150,
                "creatinine_unit": "umol/L",
                "age": 55,
                "sex": "male",
                "encounter_id": sample_encounter.id,
            },
            format="json",
        )
        response = authenticated_client.get(
            f"/api/ai/results/egfr/?encounter_id={sample_encounter.id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    @override_settings(TIBABOT_ENABLED=False)
    def test_404_when_feature_disabled(self, authenticated_client):
        response = authenticated_client.get("/api/ai/results/egfr/?patient_id=1")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Audit Logging
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEGFRAuditLogging:
    """Verify eGFR calculation is audit logged."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_audit_log_created(
        self, authenticated_client, mock_tibabot, egfr_request_data, egfr_tibabot_response
    ):
        mock_tibabot.calculate_egfr.return_value = egfr_tibabot_response
        authenticated_client.post(
            "/api/ai/egfr/calculate/",
            egfr_request_data,
            format="json",
        )

        from hmis.apps.core.models import AuditLog

        log = AuditLog.objects.filter(action="ai_egfr_calculate").first()
        assert log is not None
        assert log.details["age"] == 55
        assert log.details["sex"] == "male"
        assert log.details["creatinine_unit"] == "umol/L"
