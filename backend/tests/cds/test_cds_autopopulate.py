"""
Tests for CDS engine structured actions and autopopulate integration.

TDD: Tests define expected behavior BEFORE implementation.
"""

from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.cds.engine import EvaluationContext, EvaluationResult, evaluate_rule


@pytest.fixture
def vital_rule_with_actions(db):
    """CDS rule for low SpO2 with structured suggested actions."""
    from hmis.apps.cds.models import CDSRule

    return CDSRule.objects.create(
        code="VITAL-SPO2-LOW-TEST",
        name="Low SpO2 (Test)",
        description="Critical SpO2 alert with structured actions.",
        category="VITAL_SIGN",
        priority="CRITICAL",
        evidence_level="A",
        status="ACTIVE",
        action_type="CONTRAINDICATE",
        action_message="Critical: SpO2 {value}% is below {threshold}%.",
        suggestion="Administer supplemental oxygen. Escalate to senior clinician.",
        condition={
            "type": "vital_range",
            "vital": "spo2",
            "min": 95.0,
            "min_label": "Hypoxemia",
        },
        metadata={
            "suggested_actions": [
                {
                    "action_type": "ESCALATE_PRIORITY",
                    "target_field": "encounter_type",
                    "value": "EMERGENCY",
                    "confidence": 0.95,
                    "reason": "SpO2 < 95% indicates hypoxemia — escalation per Kenya ETAT+",
                },
                {
                    "action_type": "ORDER_TEST",
                    "target_field": "lab_orders",
                    "value": {"test_name": "Arterial Blood Gas", "priority": "STAT"},
                    "confidence": 0.90,
                    "reason": "ABG recommended for hypoxemia assessment",
                },
            ]
        },
    )


@pytest.fixture
def drug_interaction_rule_with_actions(db):
    """CDS rule for drug-drug interaction with alternative medication action."""
    from hmis.apps.cds.models import CDSRule

    return CDSRule.objects.create(
        code="DRUG-DRUG-WAR-ASP-TEST",
        name="Warfarin-Aspirin Interaction (Test)",
        description="Drug-drug interaction with structured alternative suggestion.",
        category="DRUG_DRUG",
        priority="HIGH",
        evidence_level="A",
        status="ACTIVE",
        action_type="WARN",
        action_message="Warning: {drug_a} and {drug_b} interaction ({severity}).",
        suggestion="Consider alternative antiplatelet agent.",
        condition={
            "type": "drug_drug",
            "drug_a": "warfarin",
            "drug_b": "aspirin",
            "severity": "major",
        },
        metadata={
            "suggested_actions": [
                {
                    "action_type": "REMOVE_MEDICATION",
                    "target_field": "current_medications",
                    "value": "aspirin",
                    "confidence": 0.85,
                    "reason": "Remove aspirin due to major interaction with warfarin",
                },
                {
                    "action_type": "ADD_MEDICATION",
                    "target_field": "current_medications",
                    "value": {"drug_name": "Clopidogrel", "dose": "75mg", "frequency": "OD"},
                    "confidence": 0.80,
                    "reason": "Clopidogrel as alternative antiplatelet per Kenya KEML",
                },
            ]
        },
    )


@pytest.fixture
def rule_without_actions(db):
    """CDS rule without suggested actions (legacy behavior)."""
    from hmis.apps.cds.models import CDSRule

    return CDSRule.objects.create(
        code="VITAL-PULSE-HIGH-TEST",
        name="Tachycardia (Test)",
        description="Alert for high pulse without structured actions.",
        category="VITAL_SIGN",
        priority="MEDIUM",
        evidence_level="A",
        status="ACTIVE",
        action_type="ALERT",
        action_message="Tachycardia: Pulse {value} bpm exceeds {threshold} bpm.",
        suggestion="Assess for underlying cause.",
        condition={
            "type": "vital_range",
            "vital": "pulse",
            "max": 100,
            "max_label": "Tachycardia",
        },
        metadata={},
    )


class TestStructuredActions:
    """Tests for CDS engine returning suggested_actions."""

    def test_evaluation_result_has_suggested_actions(self, vital_rule_with_actions):
        """EvaluationResult should include suggested_actions from rule metadata."""
        context = EvaluationContext(patient_id=1, spo2=Decimal("92"))
        result = evaluate_rule(vital_rule_with_actions, context)

        assert result.triggered is True
        assert isinstance(result.suggested_actions, list)
        assert len(result.suggested_actions) == 2

    def test_suggested_action_structure(self, vital_rule_with_actions):
        """Each suggested action should have required fields."""
        context = EvaluationContext(patient_id=1, spo2=Decimal("92"))
        result = evaluate_rule(vital_rule_with_actions, context)

        action = result.suggested_actions[0]
        assert action["action_type"] == "ESCALATE_PRIORITY"
        assert action["target_field"] == "encounter_type"
        assert action["value"] == "EMERGENCY"
        assert action["confidence"] == 0.95
        assert "reason" in action

    def test_no_actions_when_rule_not_triggered(self, vital_rule_with_actions):
        """Should return empty actions when rule doesn't trigger."""
        context = EvaluationContext(patient_id=1, spo2=Decimal("98"))
        result = evaluate_rule(vital_rule_with_actions, context)

        assert result.triggered is False
        assert result.suggested_actions == []

    def test_empty_actions_for_legacy_rules(self, rule_without_actions):
        """Rules without metadata.suggested_actions should return empty list."""
        context = EvaluationContext(patient_id=1, pulse=120)
        result = evaluate_rule(rule_without_actions, context)

        assert result.triggered is True
        assert result.suggested_actions == []

    def test_drug_interaction_actions(self, drug_interaction_rule_with_actions):
        """Drug-drug rules should include alternative medication suggestions."""
        context = EvaluationContext(
            patient_id=1,
            current_medications=["warfarin", "aspirin"],
        )
        result = evaluate_rule(drug_interaction_rule_with_actions, context)

        assert result.triggered is True
        assert len(result.suggested_actions) == 2

        remove_action = result.suggested_actions[0]
        assert remove_action["action_type"] == "REMOVE_MEDICATION"
        assert remove_action["value"] == "aspirin"

        add_action = result.suggested_actions[1]
        assert add_action["action_type"] == "ADD_MEDICATION"
        assert add_action["value"]["drug_name"] == "Clopidogrel"

    def test_actions_filtered_by_feature_flag(self, vital_rule_with_actions):
        """When smart_autopopulate flag is disabled, actions should still be returned.

        Filtering by feature flag is done at the view/serializer layer, not engine.
        """
        context = EvaluationContext(patient_id=1, spo2=Decimal("92"))
        result = evaluate_rule(vital_rule_with_actions, context)

        # Engine always returns actions — view layer gates them
        assert len(result.suggested_actions) == 2


class TestAlertSuggestedActionsSerializer:
    """Tests for suggested_actions in CDS alert serializer, gated by feature flag."""

    @pytest.fixture
    def sample_alert_with_actions(self, vital_rule_with_actions, sample_patient, sample_organization, sample_facility):
        """Create a CDS alert whose details contain suggested_actions."""
        from hmis.apps.cds.models import CDSAlert

        return CDSAlert.objects.create(
            rule=vital_rule_with_actions,
            patient=sample_patient,
            priority="CRITICAL",
            message="Critical: SpO2 92% is below 95%.",
            suggestion="Administer supplemental oxygen.",
            details={
                "vital": "spo2",
                "value": 92.0,
                "threshold": 95.0,
                "direction": "below",
                "suggested_actions": [
                    {
                        "action_type": "ESCALATE_PRIORITY",
                        "target_field": "encounter_type",
                        "value": "EMERGENCY",
                        "confidence": 0.95,
                        "reason": "SpO2 < 95% indicates hypoxemia",
                    },
                ],
            },
            facility=sample_facility,
            organization=sample_organization,
        )

    def test_serializer_returns_actions_when_flag_enabled(self, sample_alert_with_actions):
        """When smart_autopopulate is enabled, serializer returns suggested_actions."""
        from hmis.apps.cds.serializers import CDSAlertSerializer
        from hmis.apps.core.models import FeatureFlag

        FeatureFlag.objects.create(name="smart_autopopulate", is_enabled=True)
        serializer = CDSAlertSerializer(sample_alert_with_actions)
        data = serializer.data

        assert "suggested_actions" in data
        assert len(data["suggested_actions"]) == 1
        assert data["suggested_actions"][0]["action_type"] == "ESCALATE_PRIORITY"

    def test_serializer_hides_actions_when_flag_disabled(self, sample_alert_with_actions):
        """When smart_autopopulate is disabled, serializer returns empty actions."""
        from hmis.apps.cds.serializers import CDSAlertSerializer
        from hmis.apps.core.models import FeatureFlag

        FeatureFlag.objects.create(name="smart_autopopulate", is_enabled=False)
        serializer = CDSAlertSerializer(sample_alert_with_actions)
        data = serializer.data

        assert "suggested_actions" in data
        assert data["suggested_actions"] == []

    def test_serializer_hides_actions_when_flag_missing(self, sample_alert_with_actions):
        """When smart_autopopulate flag doesn't exist, returns empty actions."""
        from hmis.apps.cds.serializers import CDSAlertSerializer

        serializer = CDSAlertSerializer(sample_alert_with_actions)
        data = serializer.data

        assert data["suggested_actions"] == []

    def test_list_serializer_also_gated(self, sample_alert_with_actions):
        """List serializer should also gate suggested_actions."""
        from hmis.apps.cds.serializers import CDSAlertListSerializer
        from hmis.apps.core.models import FeatureFlag

        FeatureFlag.objects.create(name="smart_autopopulate", is_enabled=True)
        serializer = CDSAlertListSerializer(sample_alert_with_actions)
        assert len(serializer.data["suggested_actions"]) == 1

        # Disable and verify
        flag = FeatureFlag.objects.get(name="smart_autopopulate")
        flag.is_enabled = False
        flag.save()
        serializer = CDSAlertListSerializer(sample_alert_with_actions)
        assert serializer.data["suggested_actions"] == []

    def test_alert_without_actions_returns_empty(self, vital_rule_with_actions, sample_patient, sample_organization, sample_facility):
        """Alert with no suggested_actions in details returns empty list."""
        from hmis.apps.cds.models import CDSAlert
        from hmis.apps.cds.serializers import CDSAlertSerializer
        from hmis.apps.core.models import FeatureFlag

        FeatureFlag.objects.create(name="smart_autopopulate", is_enabled=True)
        alert = CDSAlert.objects.create(
            rule=vital_rule_with_actions,
            patient=sample_patient,
            priority="MEDIUM",
            message="Some alert",
            details={"vital": "temperature", "value": 38.0},
            facility=sample_facility,
            organization=sample_organization,
        )
        serializer = CDSAlertSerializer(alert)
        assert serializer.data["suggested_actions"] == []
