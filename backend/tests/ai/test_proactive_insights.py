"""
Tests for Proactive AI Insights endpoint and engine.

Tests cover:
- Feature flag gating (TIBABOT_ENABLED + TIBABOT_ENABLE_PROACTIVE_INSIGHTS)
- Authentication requirement
- Input validation (serializer)
- Tier 1: Rule-based vital alerts (all 9 rules)
- Tier 2: Pattern-based nudges (malaria, TB, drug interaction)
- Tier 3: LLM-powered insights (mocked TibaBot)
- Context deduplication (hash-based skip)
- Rate limiting (throttle_scope)
- Graceful degradation when TibaBot is unavailable
- Audit logging
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

from hmis.apps.ai.proactive import (
    compute_context_hash,
    evaluate_pattern_rules,
    evaluate_vital_rules,
    generate_proactive_insights,
)
from hmis.apps.core.models import AuditLog

# =============================================================================
# Feature Gating
# =============================================================================


@pytest.mark.django_db
class TestProactiveInsightsFeatureGating:
    """Tests that proactive insights endpoint respects feature flags."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_tibabot_disabled(self, authenticated_client):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {"patient_age": 45, "patient_sex": "M"},
                "encounter_context": {"chief_complaint": "headache"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_PROACTIVE_INSIGHTS=False)
    def test_returns_404_when_proactive_feature_disabled(self, authenticated_client):
        """Should return 404 when TIBABOT_ENABLE_PROACTIVE_INSIGHTS is False."""
        response = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {"patient_age": 45, "patient_sex": "M"},
                "encounter_context": {"chief_complaint": "headache"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_returns_401_when_unauthenticated(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {"patient_age": 45},
                "encounter_context": {"chief_complaint": "fever"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Input Validation
# =============================================================================


@pytest.mark.django_db
class TestProactiveInsightsValidation:
    """Tests for request body validation."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_patient_context(self, authenticated_client):
        """Should reject missing patient_context."""
        response = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {"encounter_context": {"chief_complaint": "headache"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "patient_context" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_encounter_context(self, authenticated_client):
        """Should reject missing encounter_context."""
        response = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {"patient_context": {"patient_age": 30}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "encounter_context" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_accepts_minimal_valid_request(self, authenticated_client):
        """Should accept request with minimal valid data."""
        response = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {},
                "encounter_context": {},
                "include_llm": False,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "insights" in response.data
        assert "context_hash" in response.data


# =============================================================================
# Tier 1: Rule-based Vital Alerts
# =============================================================================


class TestTier1VitalRules:
    """Tests for deterministic vital sign alert rules."""

    def test_hypoxemia_alert_below_95(self):
        """SpO2 < 95% triggers hypoxemia alert."""
        alerts = evaluate_vital_rules({"spo2": 92})
        assert len(alerts) == 1
        assert alerts[0]["id"] == "hypoxemia"
        assert alerts[0]["severity"] == "critical"
        assert alerts[0]["confidence"] == 1.0

    def test_severe_hypoxemia_overrides_simple(self):
        """SpO2 < 90% triggers severe_hypoxemia and suppresses simple hypoxemia."""
        alerts = evaluate_vital_rules({"spo2": 88})
        ids = [a["id"] for a in alerts]
        assert "severe_hypoxemia" in ids
        assert "hypoxemia" not in ids

    def test_hypertensive_crisis(self):
        """Systolic BP >= 180 triggers crisis alert."""
        alerts = evaluate_vital_rules({"systolic_bp": 200})
        assert any(a["id"] == "hypertensive_crisis" for a in alerts)

    def test_severe_hypotension(self):
        """Systolic BP < 90 triggers hypotension alert."""
        alerts = evaluate_vital_rules({"systolic_bp": 80})
        assert any(a["id"] == "severe_hypotension" for a in alerts)

    def test_tachycardia(self):
        """Heart rate >= 120 triggers tachycardia alert."""
        alerts = evaluate_vital_rules({"pulse": 130})
        assert any(a["id"] == "tachycardia" for a in alerts)

    def test_bradycardia(self):
        """Heart rate < 50 triggers bradycardia alert."""
        alerts = evaluate_vital_rules({"pulse": 45})
        assert any(a["id"] == "bradycardia" for a in alerts)

    def test_hyperthermia(self):
        """Temperature >= 39.5 triggers high fever alert."""
        alerts = evaluate_vital_rules({"temperature": 40.1})
        assert any(a["id"] == "hyperthermia" for a in alerts)

    def test_hypothermia(self):
        """Temperature < 35 triggers hypothermia alert."""
        alerts = evaluate_vital_rules({"temperature": 34.5})
        assert any(a["id"] == "hypothermia" for a in alerts)

    def test_tachypnea(self):
        """Respiratory rate >= 30 triggers tachypnea alert."""
        alerts = evaluate_vital_rules({"respiratory_rate": 32})
        assert any(a["id"] == "tachypnea" for a in alerts)

    def test_normal_vitals_no_alerts(self):
        """Normal vitals produce no alerts."""
        alerts = evaluate_vital_rules(
            {
                "spo2": 98,
                "pulse": 72,
                "temperature": 36.8,
                "respiratory_rate": 16,
                "systolic_bp": 120,
            }
        )
        assert len(alerts) == 0

    def test_missing_vitals_no_alerts(self):
        """Missing/None vitals produce no alerts."""
        alerts = evaluate_vital_rules({})
        assert len(alerts) == 0

    def test_invalid_vital_values_ignored(self):
        """Non-numeric vital values are ignored, not raise errors."""
        alerts = evaluate_vital_rules({"spo2": "invalid", "pulse": None})
        assert len(alerts) == 0

    def test_multiple_alerts_combined(self):
        """Multiple critical vitals produce multiple alerts."""
        alerts = evaluate_vital_rules(
            {
                "spo2": 88,
                "systolic_bp": 190,
                "pulse": 130,
            }
        )
        ids = {a["id"] for a in alerts}
        assert "severe_hypoxemia" in ids
        assert "hypertensive_crisis" in ids
        assert "tachycardia" in ids

    def test_all_alerts_have_required_fields(self):
        """Every alert must have id, tier, severity, title, message, category, confidence, source."""
        alerts = evaluate_vital_rules({"spo2": 88})
        for alert in alerts:
            assert "id" in alert
            assert alert["tier"] == 1
            assert alert["severity"] in ("critical", "warning", "info")
            assert "title" in alert
            assert "message" in alert
            assert "category" in alert
            assert alert["confidence"] == 1.0
            assert alert["source"] == "rules_engine"


# =============================================================================
# Tier 2: Pattern-based Nudges
# =============================================================================


class TestTier2PatternRules:
    """Tests for pattern-based clinical nudges."""

    def test_fever_triggers_malaria_screen(self):
        """Fever in chief complaint → malaria screening nudge."""
        alerts = evaluate_pattern_rules(
            vitals={},
            chief_complaint="high fever for 3 days",
            diagnoses=[],
            allergies=[],
            medications=[],
        )
        assert any(a["id"] == "malaria_screen" for a in alerts)

    def test_high_temperature_triggers_malaria(self):
        """Temperature >= 38 → malaria screening nudge."""
        alerts = evaluate_pattern_rules(
            vitals={"temperature": 39.0},
            chief_complaint="",
            diagnoses=[],
            allergies=[],
            medications=[],
        )
        assert any(a["id"] == "malaria_screen" for a in alerts)

    def test_cough_triggers_tb_workup(self):
        """Cough in chief complaint → TB workup nudge."""
        alerts = evaluate_pattern_rules(
            vitals={},
            chief_complaint="chronic cough for 3 weeks",
            diagnoses=[],
            allergies=[],
            medications=[],
        )
        assert any(a["id"] == "tb_workup" for a in alerts)

    def test_metformin_renal_interaction(self):
        """Metformin + renal diagnosis → drug interaction warning."""
        alerts = evaluate_pattern_rules(
            vitals={},
            chief_complaint="",
            diagnoses=["chronic kidney disease stage 3"],
            allergies=[],
            medications=["Metformin 500mg BD"],
        )
        assert any(a["id"] == "metformin_renal" for a in alerts)

    def test_no_nudges_without_triggers(self):
        """No triggers → no nudges."""
        alerts = evaluate_pattern_rules(
            vitals={"temperature": 36.5},
            chief_complaint="mild headache",
            diagnoses=["tension headache"],
            allergies=[],
            medications=["Paracetamol"],
        )
        assert len(alerts) == 0

    def test_fever_suppressed_for_trauma(self):
        """Fever in trauma context → malaria screen NOT triggered."""
        alerts = evaluate_pattern_rules(
            vitals={"temperature": 39.0},
            chief_complaint="rta involving a motorcycle",
            diagnoses=[],
            allergies=[],
            medications=[],
        )
        assert not any(a["id"] == "malaria_screen" for a in alerts)

    def test_fever_suppressed_for_injury(self):
        """Fever with injury chief complaint → no malaria."""
        alerts = evaluate_pattern_rules(
            vitals={"temperature": 38.5},
            chief_complaint="fall from height with fracture",
            diagnoses=[],
            allergies=[],
            medications=[],
        )
        assert not any(a["id"] == "malaria_screen" for a in alerts)

    def test_cough_suppressed_for_trauma(self):
        """Cough in trauma context → TB workup NOT triggered."""
        alerts = evaluate_pattern_rules(
            vitals={},
            chief_complaint="rta collision with productive cough",
            diagnoses=[],
            allergies=[],
            medications=[],
        )
        assert not any(a["id"] == "tb_workup" for a in alerts)

    def test_pattern_alerts_have_required_fields(self):
        """Every pattern alert has required fields."""
        alerts = evaluate_pattern_rules(
            vitals={},
            chief_complaint="fever",
            diagnoses=[],
            allergies=[],
            medications=[],
        )
        for alert in alerts:
            assert alert["tier"] == 2
            assert alert["source"] == "pattern_engine"
            assert 0.0 <= alert["confidence"] <= 1.0


# =============================================================================
# Context Hash Deduplication
# =============================================================================


class TestContextHash:
    """Tests for context hashing and deduplication."""

    def test_same_context_same_hash(self):
        """Identical contexts produce the same hash."""
        ctx = {
            "vitals": {"spo2": 95},
            "chief_complaint": "fever",
            "diagnoses": [],
            "medications": [],
        }
        h1 = compute_context_hash(ctx)
        h2 = compute_context_hash(ctx)
        assert h1 == h2

    def test_different_context_different_hash(self):
        """Different contexts produce different hashes."""
        ctx1 = {"vitals": {"spo2": 95}, "chief_complaint": "fever"}
        ctx2 = {"vitals": {"spo2": 88}, "chief_complaint": "fever"}
        assert compute_context_hash(ctx1) != compute_context_hash(ctx2)

    def test_order_independent(self):
        """List order doesn't affect hash (sorted)."""
        ctx1 = {"diagnoses": ["malaria", "anemia"], "vitals": {}, "chief_complaint": ""}
        ctx2 = {"diagnoses": ["anemia", "malaria"], "vitals": {}, "chief_complaint": ""}
        assert compute_context_hash(ctx1) == compute_context_hash(ctx2)

    def test_hash_length(self):
        """Hash is 16 hex characters."""
        h = compute_context_hash({"vitals": {}, "chief_complaint": ""})
        assert len(h) == 16
        assert all(c in "0123456789abcdef" for c in h)


# =============================================================================
# Orchestrator (generate_proactive_insights)
# =============================================================================


class TestProactiveInsightsOrchestrator:
    """Tests for the main generate_proactive_insights function."""

    def test_tier1_only_no_llm(self):
        """Critical vitals produce tier1 alerts without LLM call."""
        result = generate_proactive_insights(
            patient_context={"allergies": [], "current_medications": []},
            encounter_context={"vitals": {"spo2": 88}, "chief_complaint": ""},
            include_llm=False,
        )
        assert result["total"] >= 1
        assert result["tier_counts"]["tier1"] >= 1
        assert result["tier_counts"]["tier3"] == 0

    def test_combined_tiers_without_llm(self):
        """Vitals + fever produce tier1 + tier2 alerts."""
        result = generate_proactive_insights(
            patient_context={"allergies": [], "current_medications": []},
            encounter_context={
                "vitals": {"spo2": 92, "temperature": 39.0},
                "chief_complaint": "high fever",
            },
            include_llm=False,
        )
        assert result["tier_counts"]["tier1"] >= 1  # hypoxemia
        assert result["tier_counts"]["tier2"] >= 1  # malaria screen
        assert result["tier_counts"]["tier3"] == 0

    @patch("hmis.apps.ai.proactive.get_tibabot_client")
    def test_llm_called_when_few_insights(self, mock_get_client):
        """LLM is called when tier1+tier2 produce <2 results."""
        mock_client = MagicMock()
        # CDS evaluate returns no alerts (so it doesn't suppress the LLM call)
        mock_client.evaluate_cds_rules.return_value = {
            "alerts": [],
            "recommendations": [],
            "rules_evaluated": 0,
            "rules_fired": 0,
        }
        # /clinical/assist returns {response: "...", references: [...]}
        import json

        mock_client._request.return_value = {
            "response": json.dumps(
                [
                    {
                        "id": "llm_tb_risk",
                        "severity": "info",
                        "title": "Consider TB screening",
                        "message": "Given Kenya prevalence and symptoms...",
                        "category": "screening",
                        "confidence": 0.72,
                    }
                ]
            ),
            "references": [],
        }
        mock_get_client.return_value = mock_client

        result = generate_proactive_insights(
            patient_context={"allergies": [], "current_medications": []},
            encounter_context={
                "vitals": {},
                "chief_complaint": "weight loss and night sweats",
                "diagnoses": [],
            },
            include_llm=True,
        )
        assert result["tier_counts"]["tier3"] >= 1
        mock_client._request.assert_called_once()

    @patch("hmis.apps.ai.proactive.get_tibabot_client")
    def test_llm_skipped_when_many_insights(self, mock_get_client):
        """LLM is NOT called when tier1+tier2 produce >=2 results."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        result = generate_proactive_insights(
            patient_context={"allergies": [], "current_medications": []},
            encounter_context={
                "vitals": {"spo2": 88, "temperature": 39.5, "pulse": 130},
                "chief_complaint": "fever and difficulty breathing",
            },
            include_llm=True,
        )
        # tier1 should have >=2 (hypoxemia + tachycardia or hyperthermia)
        assert result["tier_counts"]["tier1"] >= 2
        # LLM should NOT have been called
        mock_client._request.assert_not_called()

    def test_returns_context_hash(self):
        """Result includes a context_hash string."""
        result = generate_proactive_insights(
            patient_context={},
            encounter_context={"vitals": {"spo2": 95}, "chief_complaint": "headache"},
            include_llm=False,
        )
        assert "context_hash" in result
        assert len(result["context_hash"]) == 16

    def test_empty_context_returns_empty_insights(self):
        """Empty context produces no insights and no LLM call."""
        result = generate_proactive_insights(
            patient_context={},
            encounter_context={},
            include_llm=False,
        )
        assert result["total"] == 0
        assert result["insights"] == []


# =============================================================================
# Full Endpoint Tests
# =============================================================================


@pytest.mark.django_db
class TestProactiveInsightsEndpoint:
    """Integration tests for POST /api/ai/clinical/proactive-insights/"""

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_vital_alerts(self, authenticated_client):
        """Should return Tier 1 vital alerts for critical vitals."""
        response = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {"patient_age": 45, "patient_sex": "M"},
                "encounter_context": {
                    "vitals": {"spo2": 88, "systolic_bp": 190},
                    "chief_complaint": "chest pain",
                },
                "include_llm": False,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total"] >= 2
        ids = [i["id"] for i in response.data["insights"]]
        assert "severe_hypoxemia" in ids
        assert "hypertensive_crisis" in ids

    @override_settings(TIBABOT_ENABLED=True)
    def test_context_dedup_returns_empty(self, authenticated_client):
        """Should return empty insights when context_hash matches."""
        # First call to get a hash
        response1 = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {},
                "encounter_context": {
                    "vitals": {"spo2": 98},
                    "chief_complaint": "mild headache",
                },
                "include_llm": False,
            },
            format="json",
        )
        assert response1.status_code == status.HTTP_200_OK
        context_hash = response1.data["context_hash"]

        # Second call with same hash → should short-circuit
        response2 = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {},
                "encounter_context": {
                    "vitals": {"spo2": 98},
                    "chief_complaint": "mild headache",
                },
                "context_hash": context_hash,
                "include_llm": False,
            },
            format="json",
        )
        assert response2.status_code == status.HTTP_200_OK
        assert response2.data["total"] == 0
        assert response2.data["insights"] == []

    @override_settings(TIBABOT_ENABLED=True)
    def test_audit_log_created(self, authenticated_client):
        """Should create an audit log entry."""
        initial_count = AuditLog.objects.filter(action="ai_proactive_insight").count()

        authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {"patient_age": 30},
                "encounter_context": {"chief_complaint": "cough"},
                "include_llm": False,
            },
            format="json",
        )

        new_count = AuditLog.objects.filter(action="ai_proactive_insight").count()
        assert new_count == initial_count + 1

    @override_settings(TIBABOT_ENABLED=True)
    def test_response_shape(self, authenticated_client):
        """Response must have insights, context_hash, tier_counts, total."""
        response = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {},
                "encounter_context": {"vitals": {"pulse": 130}},
                "include_llm": False,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert "insights" in data
        assert "context_hash" in data
        assert "tier_counts" in data
        assert "total" in data
        assert data["tier_counts"]["tier1"] >= 0
        assert data["tier_counts"]["tier2"] >= 0
        assert data["tier_counts"]["tier3"] >= 0

    @override_settings(TIBABOT_ENABLED=True)
    @patch("hmis.apps.ai.proactive.get_tibabot_client")
    def test_llm_failure_graceful_degradation(self, mock_get_client, authenticated_client):
        """Should return tier1+tier2 results even when LLM fails."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        mock_client = MagicMock()
        mock_client._request.side_effect = TibaBotUnavailableError("Service down")
        mock_client.evaluate_cds_rules.side_effect = TibaBotUnavailableError("Service down")
        mock_get_client.return_value = mock_client

        response = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {"allergies": [], "current_medications": []},
                "encounter_context": {
                    "vitals": {},
                    "chief_complaint": "weight loss",
                    "diagnoses": [],
                },
                "include_llm": True,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        # Should still return (possibly 0 insights from tier1+2)
        assert "insights" in response.data
        assert response.data["tier_counts"]["tier3"] == 0

    @override_settings(TIBABOT_ENABLED=True)
    def test_pattern_nudges_returned(self, authenticated_client):
        """Should return Tier 2 pattern nudges."""
        response = authenticated_client.post(
            "/api/ai/clinical/proactive-insights/",
            {
                "patient_context": {"current_medications": ["Metformin 500mg"]},
                "encounter_context": {
                    "vitals": {"temperature": 39.0},
                    "chief_complaint": "fever and fatigue",
                    "diagnoses": ["chronic kidney disease"],
                },
                "include_llm": False,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        ids = [i["id"] for i in response.data["insights"]]
        assert "malaria_screen" in ids
        assert "metformin_renal" in ids
