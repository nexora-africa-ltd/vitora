"""
Tests for Phase 5 AI clinical features:
- Lab Assist (lab/interpret)
- Discharge Readiness (discharge/assess, discharge/conditions)
- Care Plan Generator (care-plan/generate, care-plan/generate/fhir, care-plan/conditions)
- Clerking Assist (clerking/autocomplete, clerking/structure)
- Enhanced CDS (cds/evaluate)
- Per-feature flag gating

Covers:
- Feature flag gating (master + per-feature)
- Authentication requirement
- Input validation
- Graceful degradation (fallback services)
- Audit logging
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_tibabot():
    """Yields a mock TibaBot client and patches get_tibabot_client."""
    with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
        mock_client = MagicMock()
        mock_get.return_value = mock_client
        yield mock_client


# ---------------------------------------------------------------------------
# Per-feature flag gating
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPerFeatureFlags:
    """Per-feature flags gate individual endpoints behind TIBABOT_ENABLE_*."""

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_LAB_ASSIST=False)
    def test_lab_interpret_404_when_feature_disabled(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/lab/interpret/",
            {"patient_age": 30, "patient_sex": "male", "lab_results": [
                {"test_name": "hemoglobin", "value": 14.0, "unit": "g/dL"},
            ]},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_DISCHARGE_READINESS=False)
    def test_discharge_assess_404_when_feature_disabled(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/discharge/assess/",
            {"patient_age": 50, "primary_diagnosis": "Pneumonia", "days_admitted": 3},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_CARE_PLAN=False)
    def test_care_plan_404_when_feature_disabled(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/care-plan/generate/",
            {"primary_diagnosis": "Malaria", "patient_age": 25, "patient_sex": "male"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_CLERKING_ASSIST=False)
    def test_clerking_autocomplete_404_when_feature_disabled(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/clerking/autocomplete/",
            {"text": "patient presents", "field_name": "chief_complaint"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=False)
    def test_all_phase5_endpoints_404_when_master_disabled(self, authenticated_client):
        """Master flag off → all endpoints return 404."""
        endpoints = [
            ("/api/ai/lab/interpret/", {"patient_age": 30, "patient_sex": "male",
                                        "lab_results": [{"test_name": "wbc", "value": 8.0, "unit": "x10^9/L"}]}),
            ("/api/ai/discharge/assess/", {"patient_age": 50, "primary_diagnosis": "Pneumonia", "days_admitted": 3}),
            ("/api/ai/care-plan/generate/", {"primary_diagnosis": "Malaria", "patient_age": 25, "patient_sex": "male"}),
            ("/api/ai/clerking/autocomplete/", {"text": "patient presents", "field_name": "chief_complaint"}),
            ("/api/ai/clerking/structure/", {"free_text": "Patient presents with fever and cough for three days", "note_format": "soap"}),
            ("/api/ai/cds/evaluate/", {"medications": ["Metformin"]}),
        ]
        for url, body in endpoints:
            response = authenticated_client.post(url, body, format="json")
            assert response.status_code == status.HTTP_404_NOT_FOUND, f"{url} should be 404"


# ---------------------------------------------------------------------------
# Lab Assist
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLabInterpretEndpoint:
    """Tests for POST /api/ai/lab/interpret/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        response = api_client.post(
            "/api/ai/lab/interpret/",
            {"patient_age": 30, "patient_sex": "male",
             "lab_results": [{"test_name": "hemoglobin", "value": 14.0, "unit": "g/dL"}]},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_validation_missing_required_fields(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/lab/interpret/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.interpret_lab.return_value = {
            "flags": [
                {"test_name": "hemoglobin", "value": 8.5, "unit": "g/dL",
                 "status": "low", "reference_range": {"low": 12.0, "high": 16.0, "unit": "g/dL"},
                 "deviation_percent": 29.2, "message": "hemoglobin: 8.5 g/dL (low)"},
            ],
            "patterns": [],
            "interpretation_summary": "Anemia detected.",
            "suggested_followup_labs": ["Ferritin", "Iron"],
            "critical_alerts": [],
        }

        response = authenticated_client.post(
            "/api/ai/lab/interpret/",
            {"patient_age": 35, "patient_sex": "female",
             "lab_results": [{"test_name": "hemoglobin", "value": 8.5, "unit": "g/dL"}]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["flags"][0]["status"] == "low"
        assert response.data["mode"] == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_on_tibabot_unavailable(self, authenticated_client):
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.interpret_lab.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/lab/interpret/",
                {"patient_age": 30, "patient_sex": "male",
                 "lab_results": [{"test_name": "hemoglobin", "value": 14.0, "unit": "g/dL"}]},
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["mode"] == "fallback"
            assert len(response.data["flags"]) == 1

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_critical_detection(self, authenticated_client):
        """Fallback should detect critical values."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.interpret_lab.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/lab/interpret/",
                {"patient_age": 60, "patient_sex": "male",
                 "lab_results": [
                     {"test_name": "potassium", "value": 7.0, "unit": "mmol/L"},
                 ]},
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["flags"][0]["status"] == "critical_high"
            assert len(response.data["critical_alerts"]) > 0


# ---------------------------------------------------------------------------
# Discharge Readiness
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDischargeAssessEndpoint:
    """Tests for POST /api/ai/discharge/assess/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        response = api_client.post(
            "/api/ai/discharge/assess/",
            {"patient_age": 50, "primary_diagnosis": "Pneumonia", "days_admitted": 3},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.assess_discharge.return_value = {
            "readiness_score": 0.85,
            "readiness_level": "ready",
            "criteria": [
                {"name": "Vital signs stable", "category": "vitals", "met": True, "details": "Stable"},
            ],
            "unmet_criteria_count": 1,
            "recommendations": ["Arrange follow-up in 1 week"],
            "vitals_stability": "stable",
        }

        response = authenticated_client.post(
            "/api/ai/discharge/assess/",
            {"patient_age": 50, "primary_diagnosis": "Pneumonia", "days_admitted": 5,
             "can_ambulate": True, "can_tolerate_oral": True, "has_follow_up_arranged": True},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["readiness_level"] in ("ready", "near_ready")
        assert response.data["mode"] == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_on_tibabot_unavailable(self, authenticated_client):
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.assess_discharge.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/discharge/assess/",
                {"patient_age": 50, "primary_diagnosis": "Pneumonia", "days_admitted": 5,
                 "can_ambulate": True, "can_tolerate_oral": True, "has_follow_up_arranged": True},
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["mode"] == "fallback"
            assert response.data["readiness_level"] in ("ready", "near_ready", "not_ready")


# ---------------------------------------------------------------------------
# Care Plan Generator
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCarePlanGenerateEndpoint:
    """Tests for POST /api/ai/care-plan/generate/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        response = api_client.post(
            "/api/ai/care-plan/generate/",
            {"primary_diagnosis": "Malaria", "patient_age": 25, "patient_sex": "male"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_validation_missing_required_fields(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/care-plan/generate/",
            {"primary_diagnosis": "Malaria"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.generate_care_plan.return_value = {
            "primary_diagnosis": "Malaria",
            "goals": [
                {"description": "Resolve malaria infection", "priority": "high",
                 "timeframe": "3-5 days", "measurable_target": "Negative blood smear"},
            ],
            "interventions": [
                {"category": "medications",
                 "items": [{"action": "Artemether-Lumefantrine", "frequency": "BD for 3 days", "rationale": "First-line ACT"}]},
            ],
            "discharge_criteria": ["Afebrile for 24h"],
            "follow_up": {"timing": "Day 7", "instructions": "Repeat malaria test", "red_flags": ["Return of fever"]},
            "references": ["Kenya Malaria Treatment Guidelines 2024"],
            "cds_alerts": [],
            "facility_level_notes": [],
            "llm_enriched": True,
            "evidence_sources": ["WHO Guidelines"],
        }

        response = authenticated_client.post(
            "/api/ai/care-plan/generate/",
            {"primary_diagnosis": "Malaria", "patient_age": 25, "patient_sex": "male"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["goals"][0]["priority"] == "high"
        assert response.data["mode"] == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_on_tibabot_unavailable(self, authenticated_client):
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.generate_care_plan.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/care-plan/generate/",
                {"primary_diagnosis": "Malaria", "patient_age": 25, "patient_sex": "male"},
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["mode"] == "fallback"
            assert len(response.data["goals"]) > 0


@pytest.mark.django_db
class TestCarePlanFHIREndpoint:
    """Tests for POST /api/ai/care-plan/generate/fhir/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_503_when_tibabot_unavailable(self, authenticated_client):
        """FHIR has no fallback, should return 503."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.generate_care_plan_fhir.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/care-plan/generate/fhir/",
                {"primary_diagnosis": "Malaria", "patient_age": 25, "patient_sex": "male"},
                format="json",
            )
            assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


# ---------------------------------------------------------------------------
# Clerking Assist
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestClerkingAutocompleteEndpoint:
    """Tests for POST /api/ai/clerking/autocomplete/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        response = api_client.post(
            "/api/ai/clerking/autocomplete/",
            {"text": "patient presents", "field_name": "chief_complaint"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.clerking_autocomplete.return_value = {
            "suggestions": [
                {"text": "patient presents with fever and chills", "confidence": 0.85, "category": "symptom"},
            ],
        }

        response = authenticated_client.post(
            "/api/ai/clerking/autocomplete/",
            {"text": "patient presents", "field_name": "chief_complaint"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["suggestions"]) > 0
        assert response.data["mode"] == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_returns_empty(self, authenticated_client):
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.clerking_autocomplete.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clerking/autocomplete/",
                {"text": "patient presents", "field_name": "chief_complaint"},
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["mode"] == "fallback"
            assert response.data["suggestions"] == []


@pytest.mark.django_db
class TestClerkingStructureEndpoint:
    """Tests for POST /api/ai/clerking/structure/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.clerking_structure.return_value = {
            "structured_note": {
                "Subjective": "Patient reports fever for 3 days",
                "Objective": "Temp 38.5, HR 90",
                "Assessment": "Malaria suspected",
                "Plan": "RDT, start ACT if positive",
            },
            "sections": ["Subjective", "Objective", "Assessment", "Plan"],
            "original_text": "Patient reports fever for 3 days...",
        }

        response = authenticated_client.post(
            "/api/ai/clerking/structure/",
            {"free_text": "Patient reports fever for 3 days. Temp 38.5, HR 90.",
             "note_format": "soap"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "Subjective" in response.data["structured_note"]
        assert response.data["mode"] == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_validation_min_length(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/clerking/structure/",
            {"free_text": "short", "note_format": "soap"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# Enhanced CDS
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCDSEvaluateEndpoint:
    """Tests for POST /api/ai/cds/evaluate/."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        response = api_client.post(
            "/api/ai/cds/evaluate/",
            {"medications": ["Metformin"]},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_tibabot_success(self, authenticated_client, mock_tibabot):
        mock_tibabot.evaluate_cds_rules.return_value = {
            "alerts": [
                {"rule_id": "DDI-001", "severity": "high",
                 "category": "drug-interaction", "title": "Metformin + Contrast",
                 "message": "Risk of lactic acidosis", "recommendation": "Hold metformin 48h before contrast"},
            ],
            "recommendations": [],
            "rules_evaluated": 15,
            "rules_fired": 1,
            "processing_time_ms": 45.2,
        }

        response = authenticated_client.post(
            "/api/ai/cds/evaluate/",
            {"medications": ["Metformin"], "pending_procedures": ["CT with contrast"]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["alerts"]) == 1
        assert response.data["alerts"][0]["severity"] == "high"
        assert response.data["mode"] == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_returns_empty_alerts(self, authenticated_client):
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.evaluate_cds_rules.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/cds/evaluate/",
                {"medications": ["Metformin"]},
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["mode"] == "fallback"
            assert response.data["alerts"] == []
            assert response.data["rules_evaluated"] == 0


# ---------------------------------------------------------------------------
# Lab Fallback Unit Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLabFallbackService:
    """Unit tests for the lab fallback reference range engine."""

    def test_normal_value_classified_correctly(self):
        from hmis.apps.ai.services.lab_fallback import interpret_lab_fallback

        result = interpret_lab_fallback({
            "patient_age": 30,
            "patient_sex": "male",
            "lab_results": [
                {"test_name": "hemoglobin", "value": 15.0, "unit": "g/dL"},
            ],
        })
        assert result["flags"][0]["status"] == "normal"

    def test_low_value_classified_correctly(self):
        from hmis.apps.ai.services.lab_fallback import interpret_lab_fallback

        result = interpret_lab_fallback({
            "patient_age": 30,
            "patient_sex": "female",
            "lab_results": [
                {"test_name": "hemoglobin", "value": 10.0, "unit": "g/dL"},
            ],
        })
        assert result["flags"][0]["status"] == "low"

    def test_critical_high_detected(self):
        from hmis.apps.ai.services.lab_fallback import interpret_lab_fallback

        result = interpret_lab_fallback({
            "patient_age": 60,
            "patient_sex": "male",
            "lab_results": [
                {"test_name": "potassium", "value": 7.0, "unit": "mmol/L"},
            ],
        })
        assert result["flags"][0]["status"] == "critical_high"
        assert len(result["critical_alerts"]) > 0

    def test_critical_low_detected(self):
        from hmis.apps.ai.services.lab_fallback import interpret_lab_fallback

        result = interpret_lab_fallback({
            "patient_age": 40,
            "patient_sex": "female",
            "lab_results": [
                {"test_name": "sodium", "value": 115.0, "unit": "mmol/L"},
            ],
        })
        assert result["flags"][0]["status"] == "critical_low"

    def test_pregnant_uses_adjusted_range(self):
        from hmis.apps.ai.services.lab_fallback import interpret_lab_fallback

        # Hemoglobin = 11.5 is normal for pregnant but low for non-pregnant female
        result_pregnant = interpret_lab_fallback({
            "patient_age": 28,
            "patient_sex": "female",
            "is_pregnant": True,
            "lab_results": [
                {"test_name": "hemoglobin", "value": 11.5, "unit": "g/dL"},
            ],
        })
        assert result_pregnant["flags"][0]["status"] == "normal"

    def test_unknown_test_returns_unknown_status(self):
        from hmis.apps.ai.services.lab_fallback import interpret_lab_fallback

        result = interpret_lab_fallback({
            "patient_age": 30,
            "patient_sex": "male",
            "lab_results": [
                {"test_name": "obscure_marker", "value": 42.0, "unit": "U/L"},
            ],
        })
        assert result["flags"][0]["status"] == "unknown"

    def test_multiple_results(self):
        from hmis.apps.ai.services.lab_fallback import interpret_lab_fallback

        result = interpret_lab_fallback({
            "patient_age": 45,
            "patient_sex": "male",
            "lab_results": [
                {"test_name": "hemoglobin", "value": 15.0, "unit": "g/dL"},
                {"test_name": "potassium", "value": 4.0, "unit": "mmol/L"},
                {"test_name": "wbc", "value": 12.5, "unit": "x10^9/L"},
            ],
        })
        assert len(result["flags"]) == 3
        statuses = [f["status"] for f in result["flags"]]
        assert "normal" in statuses  # hemoglobin and potassium are normal
        assert "high" in statuses  # wbc 12.5 > 11.0

    def test_mode_is_fallback(self):
        from hmis.apps.ai.services.lab_fallback import interpret_lab_fallback

        result = interpret_lab_fallback({
            "patient_age": 30,
            "patient_sex": "male",
            "lab_results": [
                {"test_name": "hemoglobin", "value": 15.0, "unit": "g/dL"},
            ],
        })
        assert result["mode"] == "fallback"


# ---------------------------------------------------------------------------
# Discharge Fallback Unit Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDischargeFallbackService:
    """Unit tests for the discharge fallback checker."""

    def test_all_criteria_met_returns_ready(self):
        from hmis.apps.ai.services.discharge_fallback import assess_discharge_fallback

        result = assess_discharge_fallback({
            "can_ambulate": True,
            "can_tolerate_oral": True,
            "has_follow_up_arranged": True,
            "has_caregiver_at_home": True,
        })
        assert result["readiness_level"] == "ready"
        assert result["mode"] == "fallback"

    def test_no_criteria_met_returns_not_ready(self):
        from hmis.apps.ai.services.discharge_fallback import assess_discharge_fallback

        result = assess_discharge_fallback({
            "can_ambulate": False,
            "can_tolerate_oral": False,
            "has_follow_up_arranged": False,
            "has_caregiver_at_home": False,
        })
        assert result["readiness_level"] == "not_ready"
        assert result["unmet_criteria_count"] > 0


# ---------------------------------------------------------------------------
# Care Plan Fallback Unit Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCarePlanFallbackService:
    """Unit tests for the care plan fallback generator."""

    def test_returns_generic_plan(self):
        from hmis.apps.ai.services.care_plan_fallback import generate_care_plan_fallback

        result = generate_care_plan_fallback({
            "primary_diagnosis": "Pneumonia",
            "patient_age": 50,
        })
        assert result["primary_diagnosis"] == "Pneumonia"
        assert len(result["goals"]) > 0
        assert len(result["interventions"]) > 0
        assert result["mode"] == "fallback"
        assert result["llm_enriched"] is False
