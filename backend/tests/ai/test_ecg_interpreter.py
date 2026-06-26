"""
Tests for ECG Interpreter AI integration.

Covers:
- Feature flag gating (master + per-feature)
- Authentication requirement
- Input validation
- TibaBot success path (interpret, compare, upload, report, scores, patterns)
- Graceful degradation (503 when TibaBot unavailable)
- Error handling (502 on TibaBot errors)
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status


@pytest.fixture
def mock_tibabot_ecg():
    """Yields a mock TibaBot client and patches get_tibabot_client for ECG views."""
    with patch("hmis.apps.ai.views_ecg.get_tibabot_client") as mock_get:
        mock_client = MagicMock()
        mock_get.return_value = mock_client
        yield mock_client


@pytest.fixture
def ecg_interpret_request():
    """Valid ECG interpretation request payload."""
    return {
        "heart_rate": 142,
        "rhythm": "irregularly irregular",
        "axis": "normal",
        "pr_interval": None,
        "qrs_duration": 88,
        "qtc_interval": 480,
        "p_wave": "absent",
        "st_segment": "depression_lateral",
        "t_wave": "inverted_lateral",
        "clinical_context": "68yo female, chest pain, known hypertension",
        "medications": ["metoprolol", "aspirin"],
        "age": 68,
        "sex": "female",
    }


@pytest.fixture
def ecg_interpret_response():
    """Mock TibaBot ECG interpret response."""
    return {
        "interpretation": "Atrial fibrillation with rapid ventricular response.",
        "rhythm_diagnosis": "Atrial fibrillation",
        "rate_category": "tachycardia",
        "findings": [
            {
                "component": "rhythm",
                "value": "irregularly irregular",
                "interpretation": "Atrial fibrillation",
                "severity": "abnormal",
            }
        ],
        "clinical_significance": "New-onset AF with rapid rate.",
        "differentials": [
            {
                "condition": "Atrial fibrillation with RVR",
                "probability": "high",
                "supporting_evidence": ["absent P waves", "irregularly irregular rhythm"],
                "icd10": "I48.0",
            }
        ],
        "urgency": "urgent",
        "action_required": ["Rate control", "12-lead ECG serial monitoring"],
        "sgarbossa_score": None,
        "wellens_criteria": None,
        "brugada_pattern": None,
        "fhir_diagnostic_report": None,
        "loinc_codes": ["8601-7"],
        "icd10_codes": ["I48.0"],
        "confidence": 0.85,
        "sources": ["rules_engine", "pattern_matching"],
        "disclaimer": "Clinical decision support tool.",
    }


@pytest.fixture
def ecg_compare_request():
    """Valid ECG comparison request payload."""
    return {
        "baseline": {
            "heart_rate": 72,
            "rhythm": "regular",
            "pr_interval": 180,
            "qrs_duration": 90,
        },
        "current": {
            "heart_rate": 68,
            "rhythm": "regular",
            "pr_interval": 220,
            "qrs_duration": 130,
            "bundle_branch": "LBBB",
        },
        "interval_hours": 48,
        "clinical_context": "Post cardiac catheterization",
    }


@pytest.fixture
def ecg_compare_response():
    """Mock TibaBot ECG compare response."""
    return {
        "changes": [
            {
                "component": "pr_interval",
                "baseline_value": "180 ms",
                "current_value": "220 ms",
                "interpretation": "Interval prolongation",
                "significance": "notable",
            },
            {
                "component": "qrs_duration",
                "baseline_value": "90 ms",
                "current_value": "130 ms",
                "interpretation": "New QRS widening with LBBB",
                "significance": "critical",
            },
        ],
        "clinical_significance": "New LBBB post-catheterization.",
        "progression": "worsened",
        "action_required": ["Urgent cardiology review"],
    }


@pytest.fixture
def cha2ds2_vasc_request():
    """Valid CHA₂DS₂-VASc request."""
    return {
        "age": 72,
        "sex": "female",
        "congestive_heart_failure": False,
        "hypertension": True,
        "stroke_tia_thromboembolism": False,
        "vascular_disease": True,
        "diabetes": True,
    }


@pytest.fixture
def cha2ds2_vasc_response():
    """Mock TibaBot CHA₂DS₂-VASc response."""
    return {
        "score": 5,
        "max_score": 9,
        "risk_category": "high",
        "annual_stroke_risk_percent": 6.7,
        "recommendation": "Oral anticoagulation strongly recommended.",
        "components": {
            "C_heart_failure": 0,
            "H_hypertension": 1,
            "A2_age_75": 0,
            "D_diabetes": 1,
            "S2_stroke": 0,
            "V_vascular": 1,
            "A_age_65_74": 1,
            "Sc_sex_female": 1,
        },
        "anticoagulation_indicated": True,
        "sources": ["ESC 2020 AF Guidelines"],
    }


@pytest.fixture
def has_bled_request():
    """Valid HAS-BLED request."""
    return {
        "hypertension_uncontrolled": True,
        "renal_disease": False,
        "liver_disease": False,
        "stroke_history": False,
        "bleeding_history": True,
        "labile_inr": True,
        "age_over_65": True,
        "drugs_predisposing": True,
        "alcohol_excess": False,
    }


@pytest.fixture
def has_bled_response():
    """Mock TibaBot HAS-BLED response."""
    return {
        "score": 5,
        "max_score": 9,
        "risk_category": "high",
        "annual_bleed_risk_percent": 12.5,
        "recommendation": "High bleeding risk. Ensure BP control.",
        "components": {
            "H_hypertension": 1,
            "A_abnormal_renal": 0,
            "A_abnormal_liver": 0,
            "S_stroke": 0,
            "B_bleeding": 1,
            "L_labile_inr": 1,
            "E_elderly": 1,
            "D_drugs": 1,
            "D_alcohol": 0,
        },
        "sources": ["ESC 2020 AF Guidelines"],
    }


# ---------------------------------------------------------------------------
# Feature Flag Gating
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestECGFeatureFlags:
    """Feature flags gate all ECG endpoints."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_404_when_master_flag_disabled(self, authenticated_client, ecg_interpret_request):
        response = authenticated_client.post(
            "/api/ai/ecg/interpret/",
            ecg_interpret_request,
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=False)
    def test_404_when_ecg_feature_disabled(self, authenticated_client, ecg_interpret_request):
        response = authenticated_client.post(
            "/api/ai/ecg/interpret/",
            ecg_interpret_request,
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestECGAuthentication:
    """All ECG endpoints (except patterns) require authentication."""

    def test_interpret_requires_auth(self, api_client, ecg_interpret_request):
        response = api_client.post("/api/ai/ecg/interpret/", ecg_interpret_request, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_compare_requires_auth(self, api_client, ecg_compare_request):
        response = api_client.post("/api/ai/ecg/compare/", ecg_compare_request, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_scores_require_auth(self, api_client, cha2ds2_vasc_request):
        response = api_client.post(
            "/api/ai/ecg/scores/cha2ds2-vasc/", cha2ds2_vasc_request, format="json"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# ECG Interpret
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestECGInterpret:
    """Tests for POST /api/ai/ecg/interpret/."""

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_success(
        self, authenticated_client, mock_tibabot_ecg, ecg_interpret_request, ecg_interpret_response
    ):
        mock_tibabot_ecg.ecg_interpret.return_value = ecg_interpret_response

        response = authenticated_client.post(
            "/api/ai/ecg/interpret/", ecg_interpret_request, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["rhythm_diagnosis"] == "Atrial fibrillation"
        assert response.data["urgency"] == "urgent"
        assert response.data["confidence"] == 0.85
        mock_tibabot_ecg.ecg_interpret.assert_called_once()

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_minimal_input(self, authenticated_client, mock_tibabot_ecg, ecg_interpret_response):
        """Accepts minimal input (all fields optional)."""
        mock_tibabot_ecg.ecg_interpret.return_value = ecg_interpret_response

        response = authenticated_client.post(
            "/api/ai/ecg/interpret/", {"heart_rate": 88}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_raw_findings_input(
        self, authenticated_client, mock_tibabot_ecg, ecg_interpret_response
    ):
        """Accepts free-text raw_findings."""
        mock_tibabot_ecg.ecg_interpret.return_value = ecg_interpret_response

        response = authenticated_client.post(
            "/api/ai/ecg/interpret/",
            {"raw_findings": "Sinus rhythm, normal axis, no ST changes"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_invalid_heart_rate(self, authenticated_client, mock_tibabot_ecg):
        """Rejects heart rate out of range."""
        response = authenticated_client.post(
            "/api/ai/ecg/interpret/", {"heart_rate": 500}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_tibabot_unavailable_returns_503(self, authenticated_client, mock_tibabot_ecg):
        from hmis.apps.ai.client import TibaBotUnavailableError

        mock_tibabot_ecg.ecg_interpret.side_effect = TibaBotUnavailableError("Service down")

        response = authenticated_client.post(
            "/api/ai/ecg/interpret/", {"heart_rate": 88}, format="json"
        )
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "error" in response.data

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_tibabot_error_returns_502(self, authenticated_client, mock_tibabot_ecg):
        from hmis.apps.ai.client import TibaBotError

        mock_tibabot_ecg.ecg_interpret.side_effect = TibaBotError("Bad request", status_code=400)

        response = authenticated_client.post(
            "/api/ai/ecg/interpret/", {"heart_rate": 88}, format="json"
        )
        assert response.status_code == status.HTTP_502_BAD_GATEWAY


# ---------------------------------------------------------------------------
# ECG Compare
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestECGCompare:
    """Tests for POST /api/ai/ecg/compare/."""

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_success(
        self, authenticated_client, mock_tibabot_ecg, ecg_compare_request, ecg_compare_response
    ):
        mock_tibabot_ecg.ecg_compare.return_value = ecg_compare_response

        response = authenticated_client.post(
            "/api/ai/ecg/compare/", ecg_compare_request, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["progression"] == "worsened"
        assert len(response.data["changes"]) == 2

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_missing_baseline_rejected(self, authenticated_client, mock_tibabot_ecg):
        response = authenticated_client.post(
            "/api/ai/ecg/compare/", {"current": {"heart_rate": 88}}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_missing_current_rejected(self, authenticated_client, mock_tibabot_ecg):
        response = authenticated_client.post(
            "/api/ai/ecg/compare/", {"baseline": {"heart_rate": 72}}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# ECG Upload
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestECGUpload:
    """Tests for POST /api/ai/ecg/upload/."""

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_success(self, authenticated_client, mock_tibabot_ecg):
        from django.core.files.uploadedfile import SimpleUploadedFile

        upload_response = {
            "interpretation": {"rhythm_diagnosis": "Sinus rhythm", "urgency": "routine"},
            "source_format": "image",
            "extracted_parameters": {"heart_rate": 75},
            "quality_score": 0.85,
            "warnings": [],
        }
        mock_tibabot_ecg.ecg_upload.return_value = upload_response

        file = SimpleUploadedFile("ecg_strip.jpg", b"fake-image-data", content_type="image/jpeg")
        response = authenticated_client.post(
            "/api/ai/ecg/upload/", {"file": file}, format="multipart"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["source_format"] == "image"
        mock_tibabot_ecg.ecg_upload.assert_called_once()

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_no_file_returns_400(self, authenticated_client, mock_tibabot_ecg):
        response = authenticated_client.post("/api/ai/ecg/upload/", {}, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "No file" in response.data["error"]

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_unsupported_format_returns_400(self, authenticated_client, mock_tibabot_ecg):
        from django.core.files.uploadedfile import SimpleUploadedFile

        file = SimpleUploadedFile("data.csv", b"csv-data", content_type="text/csv")
        response = authenticated_client.post(
            "/api/ai/ecg/upload/", {"file": file}, format="multipart"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Unsupported" in response.data["error"]


# ---------------------------------------------------------------------------
# ECG Report (PDF)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestECGReport:
    """Tests for POST /api/ai/ecg/report/."""

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_success_returns_pdf(
        self, authenticated_client, mock_tibabot_ecg, ecg_interpret_response
    ):
        mock_tibabot_ecg.ecg_report.return_value = b"%PDF-1.4 fake pdf content"

        response = authenticated_client.post(
            "/api/ai/ecg/report/",
            {
                "interpretation": ecg_interpret_response,
                "patient_context": {"name": "Jane W.", "age": 68, "sex": "female"},
                "facility_name": "Test Hospital",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/pdf"
        assert "ecg_report.pdf" in response["Content-Disposition"]

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_missing_interpretation_rejected(self, authenticated_client, mock_tibabot_ecg):
        response = authenticated_client.post(
            "/api/ai/ecg/report/", {"facility_name": "Test"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# CHA₂DS₂-VASc Score
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCHA2DS2VASc:
    """Tests for POST /api/ai/ecg/scores/cha2ds2-vasc/."""

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_success(
        self, authenticated_client, mock_tibabot_ecg, cha2ds2_vasc_request, cha2ds2_vasc_response
    ):
        mock_tibabot_ecg.ecg_score_cha2ds2_vasc.return_value = cha2ds2_vasc_response

        response = authenticated_client.post(
            "/api/ai/ecg/scores/cha2ds2-vasc/", cha2ds2_vasc_request, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["score"] == 5
        assert response.data["anticoagulation_indicated"] is True

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_missing_age_rejected(self, authenticated_client, mock_tibabot_ecg):
        response = authenticated_client.post(
            "/api/ai/ecg/scores/cha2ds2-vasc/", {"sex": "male"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_missing_sex_rejected(self, authenticated_client, mock_tibabot_ecg):
        response = authenticated_client.post(
            "/api/ai/ecg/scores/cha2ds2-vasc/", {"age": 72}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# HAS-BLED Score
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestHASBLED:
    """Tests for POST /api/ai/ecg/scores/has-bled/."""

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_success(
        self, authenticated_client, mock_tibabot_ecg, has_bled_request, has_bled_response
    ):
        mock_tibabot_ecg.ecg_score_has_bled.return_value = has_bled_response

        response = authenticated_client.post(
            "/api/ai/ecg/scores/has-bled/", has_bled_request, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["score"] == 5
        assert response.data["risk_category"] == "high"

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_all_defaults(self, authenticated_client, mock_tibabot_ecg, has_bled_response):
        """Works with empty body (all boolean fields default to False)."""
        mock_tibabot_ecg.ecg_score_has_bled.return_value = has_bled_response

        response = authenticated_client.post("/api/ai/ecg/scores/has-bled/", {}, format="json")
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# ECG Patterns (Public)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestECGPatterns:
    """Tests for GET /api/ai/ecg/patterns/."""

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_ECG_INTERPRETER=True)
    def test_success(self, api_client, mock_tibabot_ecg):
        """Patterns endpoint is publicly accessible (no auth)."""
        patterns = [
            {
                "id": "afib",
                "name": "Atrial Fibrillation",
                "category": "Arrhythmia",
                "icd10": "I48.0",
            },
            {"id": "stemi_anterior", "name": "Anterior STEMI", "category": "ACS", "icd10": "I21.0"},
        ]
        mock_tibabot_ecg.ecg_patterns.return_value = patterns

        response = api_client.get("/api/ai/ecg/patterns/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        assert response.data[0]["id"] == "afib"
