"""
Tests for the CDS (Clinical Decision Support) module.

Covers:
- CDSRule model (creation, state transitions, properties)
- CDSAlert model (creation, state transitions, properties)
- Rule evaluation engine (vital_range, drug_allergy, drug_drug, lab_range, custom)
- API endpoints (CRUD, custom actions, dashboard)
- Serializer validation
- Seed command
"""

from datetime import date
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

import pytest  # type: ignore
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status

from hmis.apps.cds.engine import (
    EvaluationContext,
    _render_message,
    build_encounter_context,
    evaluate_rule,
    evaluate_rules,
)
from hmis.apps.cds.models import (
    CDSAlert,
    CDSAlertStatus,
    CDSRule,
    CDSRuleCategory,
    CDSRulePriority,
    CDSRuleStatus,
)

# ──────────────────────────── Fixtures ────────────────────────────


@pytest.fixture
def cds_rule(db):
    """A basic active vital sign CDS rule."""
    return CDSRule.objects.create(
        code="TEST-VITAL-001",
        name="Test High Temperature",
        description="Alert on high temperature",
        category=CDSRuleCategory.VITAL_SIGN,
        priority=CDSRulePriority.HIGH,
        evidence_level="A",
        status=CDSRuleStatus.ACTIVE,
        condition={
            "type": "vital_range",
            "vital": "temperature",
            "max": 38.0,
            "max_label": "Fever",
        },
        action_type="ALERT",
        action_message="High temp: {value}°C (>{threshold}°C). {label}.",
        suggestion="Assess for infection.",
        references=["Test Reference"],
    )


@pytest.fixture
def cds_rule_draft(db):
    """A draft CDS rule."""
    return CDSRule.objects.create(
        code="TEST-DRAFT-001",
        name="Draft Rule",
        description="A draft rule for testing",
        category=CDSRuleCategory.GUIDELINE,
        priority=CDSRulePriority.LOW,
        evidence_level="D",
        status=CDSRuleStatus.DRAFT,
        condition={"type": "custom", "field": "patient_age_years", "operator": "gte", "value": 65},
        action_type="SUGGEST",
        action_message="Elderly patient: age {actual_value}",
        suggestion="Consider geriatric screening.",
    )


@pytest.fixture
def drug_allergy_rule(db):
    """Drug-allergy prescribing check rule."""
    return CDSRule.objects.create(
        code="TEST-DRUG-ALLERGY",
        name="Drug-Allergy Check",
        category=CDSRuleCategory.DRUG_ALLERGY,
        priority=CDSRulePriority.CRITICAL,
        evidence_level="A",
        status=CDSRuleStatus.ACTIVE,
        condition={"type": "drug_allergy", "check_mode": "prescribing"},
        action_type="CONTRAINDICATE",
        action_message="Allergy to '{allergy}', prescribing '{prescribing_drug}' is contraindicated.",
    )


@pytest.fixture
def drug_drug_rule(db):
    """Drug-drug interaction rule."""
    return CDSRule.objects.create(
        code="TEST-DDI-001",
        name="Warfarin-Aspirin DDI",
        category=CDSRuleCategory.DRUG_DRUG,
        priority=CDSRulePriority.HIGH,
        evidence_level="A",
        status=CDSRuleStatus.ACTIVE,
        condition={
            "type": "drug_drug",
            "drug_a": "warfarin",
            "drug_b": "aspirin",
            "severity": "major",
        },
        action_type="WARN",
        action_message="Interaction: {drug_a} + {drug_b} ({severity}).",
    )


@pytest.fixture
def lab_rule(db):
    """Critical lab value rule."""
    return CDSRule.objects.create(
        code="TEST-LAB-K",
        name="Critical Potassium",
        category=CDSRuleCategory.CRITICAL_LAB,
        priority=CDSRulePriority.CRITICAL,
        evidence_level="A",
        status=CDSRuleStatus.ACTIVE,
        condition={
            "type": "lab_range",
            "test_name": "potassium",
            "critical_low": 2.5,
            "critical_high": 6.5,
            "unit": "mmol/L",
        },
        action_type="ALERT",
        action_message="Critical potassium: {value} {unit} ({direction}).",
    )


@pytest.fixture
def cds_alert(cds_rule, sample_patient, sample_encounter, sample_organization, sample_facility):
    """A pending CDS alert."""
    return CDSAlert.objects.create(
        rule=cds_rule,
        patient=sample_patient,
        encounter=sample_encounter,
        priority=CDSRulePriority.HIGH,
        status=CDSAlertStatus.PENDING,
        message="Test alert message",
        suggestion="Take action",
        details={"vital": "temperature", "value": 39.0},
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def basic_context():
    """Basic evaluation context."""
    return EvaluationContext(patient_id=1, encounter_id=1)


# ──────────────────────────── Model Tests ────────────────────────────


class TestCDSRuleModel:
    """Tests for CDSRule model."""

    def test_create_rule(self, cds_rule):
        """Should create a CDS rule with all fields."""
        assert cds_rule.code == "TEST-VITAL-001"
        assert cds_rule.category == CDSRuleCategory.VITAL_SIGN
        assert cds_rule.is_active is True

    def test_rule_str(self, cds_rule):
        """Should return formatted string representation."""
        assert str(cds_rule) == "[TEST-VITAL-001] Test High Temperature"

    def test_activate_draft_rule(self, cds_rule_draft, test_user):
        """Should activate a draft rule and set approved_by/approved_at."""
        cds_rule_draft.activate(user=test_user)
        cds_rule_draft.refresh_from_db()
        assert cds_rule_draft.status == CDSRuleStatus.ACTIVE
        assert cds_rule_draft.approved_by == test_user
        assert cds_rule_draft.approved_at is not None

    def test_deactivate_active_rule(self, cds_rule):
        """Should deactivate an active rule."""
        cds_rule.deactivate()
        cds_rule.refresh_from_db()
        assert cds_rule.status == CDSRuleStatus.INACTIVE
        assert cds_rule.is_active is False

    def test_retire_rule(self, cds_rule):
        """Should permanently retire a rule."""
        cds_rule.retire()
        cds_rule.refresh_from_db()
        assert cds_rule.status == CDSRuleStatus.RETIRED

    def test_trigger_count_no_alerts(self, cds_rule):
        """Should return 0 when no alerts exist."""
        assert cds_rule.trigger_count == 0

    def test_trigger_count_with_alerts(self, cds_rule, cds_alert):
        """Should return count of associated alerts."""
        assert cds_rule.trigger_count == 1

    def test_override_rate_none_when_no_alerts(self, cds_rule):
        """Should return None when no alerts exist."""
        assert cds_rule.override_rate is None

    def test_override_rate_with_overrides(self, cds_rule, cds_alert):
        """Should calculate override rate."""
        cds_alert.override(reason="Clinical justification")
        rate = cds_rule.override_rate
        assert rate == 100.0


class TestCDSAlertModel:
    """Tests for CDSAlert model."""

    def test_create_alert(self, cds_alert):
        """Should create a pending alert."""
        assert cds_alert.status == CDSAlertStatus.PENDING
        assert cds_alert.is_pending is True
        assert cds_alert.is_resolved is False

    def test_alert_str(self, cds_alert):
        """Should return formatted string representation."""
        assert "TEST-VITAL-001" in str(cds_alert)

    def test_acknowledge_alert(self, cds_alert, test_user):
        """Should acknowledge alert and record resolver."""
        cds_alert.acknowledge(user=test_user)
        cds_alert.refresh_from_db()
        assert cds_alert.status == CDSAlertStatus.ACKNOWLEDGED
        assert cds_alert.resolved_by == test_user
        assert cds_alert.resolved_at is not None
        assert cds_alert.is_resolved is True

    def test_accept_alert(self, cds_alert, test_user):
        """Should accept the recommendation."""
        cds_alert.accept(user=test_user)
        cds_alert.refresh_from_db()
        assert cds_alert.status == CDSAlertStatus.ACCEPTED

    def test_override_alert(self, cds_alert, test_user):
        """Should override alert with reason."""
        cds_alert.override(user=test_user, reason="Patient tolerates well")
        cds_alert.refresh_from_db()
        assert cds_alert.status == CDSAlertStatus.OVERRIDDEN
        assert cds_alert.override_reason == "Patient tolerates well"

    def test_dismiss_alert(self, cds_alert, test_user):
        """Should dismiss the alert."""
        cds_alert.dismiss(user=test_user)
        cds_alert.refresh_from_db()
        assert cds_alert.status == CDSAlertStatus.DISMISSED

    def test_auto_resolve_alert(self, cds_alert):
        """Should auto-resolve the alert."""
        cds_alert.auto_resolve()
        cds_alert.refresh_from_db()
        assert cds_alert.status == CDSAlertStatus.AUTO_RESOLVED
        assert cds_alert.is_resolved is True

    def test_is_critical(self, cds_rule, sample_patient, sample_encounter, sample_organization, sample_facility):
        """Should correctly identify critical alerts."""
        alert = CDSAlert.objects.create(
            rule=cds_rule,
            patient=sample_patient,
            encounter=sample_encounter,
            priority=CDSRulePriority.CRITICAL,
            message="Critical test",
            facility=sample_facility,
            organization=sample_organization,
        )
        assert alert.is_critical is True

    def test_alert_properties(self, cds_alert):
        """Should expose rule and patient properties."""
        assert cds_alert.rule_code == "TEST-VITAL-001"
        assert cds_alert.rule_name == "Test High Temperature"
        assert cds_alert.patient_mrn is not None
        assert cds_alert.patient_name != ""

    def test_age_hours(self, cds_alert):
        """Should calculate hours since creation."""
        assert cds_alert.age_hours is not None
        assert cds_alert.age_hours >= 0


# ──────────────────────────── Engine Tests ────────────────────────────


class TestVitalRangeEvaluation:
    """Tests for vital sign range rule evaluation."""

    def test_high_temperature_triggers(self, cds_rule, basic_context):
        """Should trigger when temperature exceeds max threshold."""
        basic_context.temperature = Decimal("39.5")
        result = evaluate_rule(cds_rule, basic_context)
        assert result.triggered is True
        assert "39.5" in result.message
        assert result.details["direction"] == "above"

    def test_normal_temperature_does_not_trigger(self, cds_rule, basic_context):
        """Should not trigger for normal temperature."""
        basic_context.temperature = Decimal("37.0")
        result = evaluate_rule(cds_rule, basic_context)
        assert result.triggered is False

    def test_missing_vital_does_not_trigger(self, cds_rule, basic_context):
        """Should not trigger when vital is missing."""
        result = evaluate_rule(cds_rule, basic_context)
        assert result.triggered is False

    def test_low_spo2_triggers(self, db, basic_context):
        """Should trigger on low SpO2."""
        rule = CDSRule.objects.create(
            code="TEST-SPO2",
            name="Low SpO2",
            category=CDSRuleCategory.VITAL_SIGN,
            priority=CDSRulePriority.CRITICAL,
            status=CDSRuleStatus.ACTIVE,
            condition={"type": "vital_range", "vital": "spo2", "min": 95.0, "min_label": "Hypoxemia"},
            action_type="ALERT",
            action_message="SpO2 {value}% below {threshold}%.",
        )
        basic_context.spo2 = Decimal("90.0")
        result = evaluate_rule(rule, basic_context)
        assert result.triggered is True
        assert result.details["direction"] == "below"


class TestDrugAllergyEvaluation:
    """Tests for drug-allergy interaction evaluation."""

    def test_prescribing_matching_allergy_triggers(self, drug_allergy_rule, basic_context):
        """Should trigger when prescribing drug matches patient allergy."""
        basic_context.allergy_substances = ["penicillin"]
        basic_context.prescribing_drug_name = "Penicillin V"
        result = evaluate_rule(drug_allergy_rule, basic_context)
        assert result.triggered is True
        assert "penicillin" in result.message.lower()

    def test_prescribing_non_allergenic_drug(self, drug_allergy_rule, basic_context):
        """Should not trigger for non-allergenic drug."""
        basic_context.allergy_substances = ["penicillin"]
        basic_context.prescribing_drug_name = "Paracetamol"
        result = evaluate_rule(drug_allergy_rule, basic_context)
        assert result.triggered is False

    def test_no_allergies_does_not_trigger(self, drug_allergy_rule, basic_context):
        """Should not trigger when patient has no allergies."""
        basic_context.prescribing_drug_name = "Penicillin"
        result = evaluate_rule(drug_allergy_rule, basic_context)
        assert result.triggered is False

    def test_penicillin_cross_reactivity(self, db, basic_context):
        """Should trigger for cross-reactive penicillin allergy."""
        rule = CDSRule.objects.create(
            code="TEST-PEN-CROSS",
            name="Penicillin Cross-React",
            category=CDSRuleCategory.DRUG_ALLERGY,
            priority=CDSRulePriority.CRITICAL,
            status=CDSRuleStatus.ACTIVE,
            condition={
                "type": "drug_allergy",
                "substance": "penicillin",
                "cross_reactive": ["amoxicillin", "ampicillin"],
            },
            action_type="CONTRAINDICATE",
            action_message="Cross-reactivity: allergy '{allergy}', medication '{medication}'.",
        )
        basic_context.allergy_substances = ["penicillin"]
        basic_context.current_medications = ["amoxicillin 500mg"]
        result = evaluate_rule(rule, basic_context)
        assert result.triggered is True


class TestDrugDrugEvaluation:
    """Tests for drug-drug interaction evaluation."""

    def test_warfarin_aspirin_interaction(self, drug_drug_rule, basic_context):
        """Should trigger when both drugs are present."""
        basic_context.current_medications = ["warfarin 5mg", "aspirin 100mg"]
        result = evaluate_rule(drug_drug_rule, basic_context)
        assert result.triggered is True
        assert "warfarin" in result.message
        assert "aspirin" in result.message

    def test_prescribing_interacting_drug(self, drug_drug_rule, basic_context):
        """Should trigger when prescribing interacting drug."""
        basic_context.current_medications = ["warfarin 5mg"]
        basic_context.prescribing_drug_name = "aspirin"
        result = evaluate_rule(drug_drug_rule, basic_context)
        assert result.triggered is True

    def test_no_interaction_different_drugs(self, drug_drug_rule, basic_context):
        """Should not trigger for non-interacting drugs."""
        basic_context.current_medications = ["paracetamol", "amoxicillin"]
        result = evaluate_rule(drug_drug_rule, basic_context)
        assert result.triggered is False


class TestLabRangeEvaluation:
    """Tests for critical lab value evaluation."""

    def test_critically_high_potassium(self, lab_rule, basic_context):
        """Should trigger on critically high potassium."""
        basic_context.lab_results = [{"test_name": "Potassium", "value": "7.2"}]
        result = evaluate_rule(lab_rule, basic_context)
        assert result.triggered is True
        assert result.details["direction"] == "critically_high"

    def test_critically_low_potassium(self, lab_rule, basic_context):
        """Should trigger on critically low potassium."""
        basic_context.lab_results = [{"test_name": "Potassium", "value": "2.0"}]
        result = evaluate_rule(lab_rule, basic_context)
        assert result.triggered is True
        assert result.details["direction"] == "critically_low"

    def test_normal_potassium_no_trigger(self, lab_rule, basic_context):
        """Should not trigger for normal potassium."""
        basic_context.lab_results = [{"test_name": "Potassium", "value": "4.5"}]
        result = evaluate_rule(lab_rule, basic_context)
        assert result.triggered is False

    def test_no_lab_results(self, lab_rule, basic_context):
        """Should not trigger when no lab results present."""
        result = evaluate_rule(lab_rule, basic_context)
        assert result.triggered is False


class TestCustomEvaluation:
    """Tests for custom rule evaluation."""

    def test_elderly_patient_triggers(self, cds_rule_draft, basic_context):
        """Should trigger for patients >= 65 years."""
        basic_context.patient_age_years = 70
        result = evaluate_rule(cds_rule_draft, basic_context)
        assert result.triggered is True

    def test_young_patient_no_trigger(self, cds_rule_draft, basic_context):
        """Should not trigger for patients < 65 years."""
        basic_context.patient_age_years = 30
        result = evaluate_rule(cds_rule_draft, basic_context)
        assert result.triggered is False


class TestEvaluateMultipleRules:
    """Tests for evaluating multiple rules at once."""

    def test_evaluate_rules_returns_only_triggered(self, cds_rule, drug_drug_rule, basic_context):
        """Should return only triggered results."""
        basic_context.temperature = Decimal("39.0")
        basic_context.current_medications = ["paracetamol"]  # No DDI
        results = evaluate_rules([cds_rule, drug_drug_rule], basic_context)
        assert len(results) == 1
        assert results[0].rule_code == "TEST-VITAL-001"

    def test_evaluate_rules_multiple_triggers(self, cds_rule, drug_drug_rule, basic_context):
        """Should return all triggered rules."""
        basic_context.temperature = Decimal("39.0")
        basic_context.current_medications = ["warfarin", "aspirin"]
        results = evaluate_rules([cds_rule, drug_drug_rule], basic_context)
        assert len(results) == 2


class TestEngineHelpers:
    """Tests for engine helper functions."""

    def test_render_message_with_variables(self):
        """Should substitute template variables."""
        result = _render_message("Value: {value}, Unit: {unit}", {"value": 5.0, "unit": "mg"})
        assert result == "Value: 5.0, Unit: mg"

    def test_render_message_missing_variable(self):
        """Should handle missing variables gracefully."""
        result = _render_message("Value: {value}, Unknown: {unknown}", {"value": 5.0})
        assert "5.0" in result

    def test_unknown_rule_type(self, db, basic_context):
        """Should not trigger for unknown rule types."""
        rule = CDSRule.objects.create(
            code="TEST-UNKNOWN",
            name="Unknown Type",
            category=CDSRuleCategory.GUIDELINE,
            priority=CDSRulePriority.LOW,
            status=CDSRuleStatus.ACTIVE,
            condition={"type": "nonexistent_type"},
            action_type="ALERT",
            action_message="Should not fire",
        )
        result = evaluate_rule(rule, basic_context)
        assert result.triggered is False

    def test_invalid_condition_format(self, db, basic_context):
        """Should not trigger for invalid condition format."""
        rule = CDSRule.objects.create(
            code="TEST-INVALID",
            name="Invalid Condition",
            category=CDSRuleCategory.GUIDELINE,
            priority=CDSRulePriority.LOW,
            status=CDSRuleStatus.ACTIVE,
            condition="not a dict",
            action_type="ALERT",
            action_message="Should not fire",
        )
        result = evaluate_rule(rule, basic_context)
        assert result.triggered is False


class TestBuildEncounterContext:
    """Tests for building context from an encounter."""

    def test_builds_context_from_encounter(self, sample_encounter):
        """Should build context with vitals and patient info."""
        ctx = build_encounter_context(sample_encounter)
        assert ctx.patient_id == sample_encounter.patient.id
        assert ctx.encounter_id == sample_encounter.id

    def test_parses_blood_pressure(self, sample_encounter):
        """Should parse systolic/diastolic from blood pressure string."""
        sample_encounter.blood_pressure = "140/90"
        sample_encounter.save()
        ctx = build_encounter_context(sample_encounter)
        assert ctx.systolic_bp == 140
        assert ctx.diastolic_bp == 90

    def test_calculates_patient_age(self, sample_encounter):
        """Should calculate patient age in years."""
        ctx = build_encounter_context(sample_encounter)
        assert ctx.patient_age_years is not None
        assert ctx.patient_age_years > 0


# ──────────────────────────── API Tests ────────────────────────────


class TestCDSRuleAPI:
    """Tests for CDS Rule API endpoints."""

    def test_list_rules(self, authenticated_client, cds_rule):
        """Should list CDS rules (paginated)."""
        response = authenticated_client.get("/api/cds/rules/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_rule(self, authenticated_client):
        """Should create a new CDS rule."""
        data = {
            "code": "NEW-RULE-001",
            "name": "New Test Rule",
            "description": "A test rule",
            "category": "VITAL_SIGN",
            "priority": "MEDIUM",
            "evidence_level": "B",
            "condition": {"type": "vital_range", "vital": "pulse", "max": 120},
            "action_type": "ALERT",
            "action_message": "Pulse elevated: {value}",
        }
        response = authenticated_client.post("/api/cds/rules/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "NEW-RULE-001"

    def test_create_rule_invalid_condition_type(self, authenticated_client):
        """Should reject invalid condition type."""
        data = {
            "code": "BAD-RULE",
            "name": "Bad Rule",
            "category": "VITAL_SIGN",
            "condition": {"type": "invalid_type"},
            "action_type": "ALERT",
            "action_message": "test",
        }
        response = authenticated_client.post("/api/cds/rules/", data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_rule_condition_missing_type(self, authenticated_client):
        """Should reject condition without type field."""
        data = {
            "code": "BAD-RULE-2",
            "name": "No Type",
            "category": "VITAL_SIGN",
            "condition": {"vital": "pulse"},
            "action_type": "ALERT",
            "action_message": "test",
        }
        response = authenticated_client.post("/api/cds/rules/", data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_retrieve_rule(self, authenticated_client, cds_rule):
        """Should retrieve a single CDS rule with full detail."""
        response = authenticated_client.get(f"/api/cds/rules/{cds_rule.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "TEST-VITAL-001"
        assert "trigger_count" in response.data
        assert "override_rate" in response.data

    def test_update_rule(self, authenticated_client, cds_rule):
        """Should update a CDS rule."""
        response = authenticated_client.patch(
            f"/api/cds/rules/{cds_rule.id}/",
            {"name": "Updated Name"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_activate_rule(self, authenticated_client, cds_rule_draft):
        """Should activate a draft rule."""
        response = authenticated_client.post(f"/api/cds/rules/{cds_rule_draft.id}/activate/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACTIVE"

    def test_activate_already_active_fails(self, authenticated_client, cds_rule):
        """Should reject activating an already active rule."""
        response = authenticated_client.post(f"/api/cds/rules/{cds_rule.id}/activate/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_deactivate_rule(self, authenticated_client, cds_rule):
        """Should deactivate an active rule."""
        response = authenticated_client.post(f"/api/cds/rules/{cds_rule.id}/deactivate/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "INACTIVE"

    def test_deactivate_non_active_fails(self, authenticated_client, cds_rule_draft):
        """Should reject deactivating a non-active rule."""
        response = authenticated_client.post(f"/api/cds/rules/{cds_rule_draft.id}/deactivate/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_retire_rule(self, authenticated_client, cds_rule):
        """Should retire a rule."""
        response = authenticated_client.post(f"/api/cds/rules/{cds_rule.id}/retire/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "RETIRED"

    def test_retire_already_retired_fails(self, authenticated_client, cds_rule):
        """Should reject retiring an already retired rule."""
        cds_rule.retire()
        response = authenticated_client.post(f"/api/cds/rules/{cds_rule.id}/retire/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_evaluate_rule_against_encounter(self, authenticated_client, cds_rule, sample_encounter):
        """Should evaluate a rule against an encounter."""
        sample_encounter.temperature = Decimal("39.5")
        sample_encounter.save()
        response = authenticated_client.post(
            f"/api/cds/rules/{cds_rule.id}/evaluate/",
            {"encounter_id": sample_encounter.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["triggered"] is True

    def test_evaluate_rule_encounter_not_found(self, authenticated_client, cds_rule):
        """Should 404 for non-existent encounter."""
        response = authenticated_client.post(
            f"/api/cds/rules/{cds_rule.id}/evaluate/",
            {"encounter_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_access_denied(self, api_client, cds_rule):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/cds/rules/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestCDSAlertAPI:
    """Tests for CDS Alert API endpoints."""

    def test_list_alerts(self, authenticated_client, cds_alert):
        """Should list CDS alerts."""
        response = authenticated_client.get("/api/cds/alerts/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve_alert(self, authenticated_client, cds_alert):
        """Should retrieve an alert with full detail."""
        response = authenticated_client.get(f"/api/cds/alerts/{cds_alert.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["rule_code"] == "TEST-VITAL-001"
        assert "patient_name" in response.data

    def test_acknowledge_alert(self, authenticated_client, cds_alert):
        """Should acknowledge a pending alert."""
        response = authenticated_client.post(f"/api/cds/alerts/{cds_alert.id}/acknowledge/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACKNOWLEDGED"

    def test_accept_alert(self, authenticated_client, cds_alert):
        """Should accept a pending alert."""
        response = authenticated_client.post(f"/api/cds/alerts/{cds_alert.id}/accept/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACCEPTED"

    def test_override_alert(self, authenticated_client, cds_alert):
        """Should override alert with reason."""
        response = authenticated_client.post(
            f"/api/cds/alerts/{cds_alert.id}/override/",
            {"reason": "Patient tolerates this medication well and benefits outweigh risks"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "OVERRIDDEN"
        assert response.data["override_reason"] != ""

    def test_override_requires_reason(self, authenticated_client, cds_alert):
        """Should reject override without reason."""
        response = authenticated_client.post(
            f"/api/cds/alerts/{cds_alert.id}/override/",
            {"reason": "short"},  # Less than 10 chars
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_dismiss_alert(self, authenticated_client, cds_alert):
        """Should dismiss the alert."""
        response = authenticated_client.post(f"/api/cds/alerts/{cds_alert.id}/dismiss/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "DISMISSED"

    def test_action_on_resolved_alert_fails(self, authenticated_client, cds_alert):
        """Should reject actions on already-resolved alerts."""
        cds_alert.acknowledge()
        response = authenticated_client.post(f"/api/cds/alerts/{cds_alert.id}/accept/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_pending_alerts(self, authenticated_client, cds_alert, sample_patient):
        """Should list pending alerts."""
        response = authenticated_client.get(
            f"/api/cds/alerts/pending/?patient={sample_patient.id}"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_evaluate_encounter(self, authenticated_client, cds_rule, sample_encounter):
        """Should evaluate all rules against an encounter."""
        sample_encounter.temperature = Decimal("39.5")
        sample_encounter.save()
        response = authenticated_client.post(
            "/api/cds/alerts/evaluate_encounter/",
            {"encounter_id": sample_encounter.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "rules_evaluated" in response.data
        assert "rules_triggered" in response.data

    def test_dashboard(self, authenticated_client, cds_alert, cds_rule):
        """Should return dashboard statistics."""
        response = authenticated_client.get("/api/cds/alerts/dashboard/")
        assert response.status_code == status.HTTP_200_OK
        assert "total_rules" in response.data
        assert "pending_alerts" in response.data
        assert "alerts_by_category" in response.data

    def test_direct_create_not_allowed(self, authenticated_client):
        """Should reject direct alert creation."""
        response = authenticated_client.post(
            "/api/cds/alerts/",
            {"message": "test"},
            format="json",
        )
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_filter_by_status(self, authenticated_client, cds_alert):
        """Should filter alerts by status."""
        response = authenticated_client.get("/api/cds/alerts/?status=PENDING")
        assert response.status_code == status.HTTP_200_OK

    def test_filter_by_priority(self, authenticated_client, cds_alert):
        """Should filter alerts by priority."""
        response = authenticated_client.get("/api/cds/alerts/?priority=HIGH")
        assert response.status_code == status.HTTP_200_OK


# ──────────────────────────── Seed Command Tests ────────────────────────────


class TestSeedCDSRules:
    """Tests for seed_cds_rules management command."""

    def test_seed_creates_rules(self, db):
        """Should create initial CDS rules."""
        out = StringIO()
        call_command("seed_cds_rules", stdout=out)
        output = out.getvalue()
        assert "CREATED" in output
        assert CDSRule.objects.count() > 0

    def test_seed_dry_run(self, db):
        """Should preview without creating in dry-run mode."""
        out = StringIO()
        call_command("seed_cds_rules", "--dry-run", stdout=out)
        output = out.getvalue()
        assert "WOULD CREATE" in output
        assert CDSRule.objects.count() == 0

    def test_seed_skips_existing(self, db):
        """Should skip rules that already exist."""
        call_command("seed_cds_rules", stdout=StringIO())
        initial_count = CDSRule.objects.count()

        out = StringIO()
        call_command("seed_cds_rules", stdout=out)
        output = out.getvalue()
        assert "SKIP" in output
        assert CDSRule.objects.count() == initial_count

    def test_seed_with_activate(self, db):
        """Should activate rules when --activate flag is used."""
        call_command("seed_cds_rules", "--activate", stdout=StringIO())
        active_count = CDSRule.objects.filter(status=CDSRuleStatus.ACTIVE).count()
        assert active_count == CDSRule.objects.count()
