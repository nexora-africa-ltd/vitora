"""Tests for L6.1 Reflexive Testing."""

import pytest
from rest_framework import status


@pytest.fixture
def reflex_test_catalog(db):
    """Create a secondary test catalog for reflex ordering."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="FT4",
        name="Free T4",
        short_name="FT4",
        category="CHEMISTRY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        cost=800.00,
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def reflex_rule(db, sample_test_catalog, reflex_test_catalog, sample_facility, sample_organization):
    """Create a reflex rule: CBC > 10 → order FT4."""
    from hmis.apps.laboratory.reflex.models import ReflexRule

    return ReflexRule.objects.create(
        trigger_test=sample_test_catalog,
        operator="GT",
        threshold_value=10.0,
        reflex_test=reflex_test_catalog,
        action="AUTO_ORDER",
        priority="ROUTINE",
        description="High CBC → FT4",
        facility=sample_facility,
        organization=sample_organization,
    )


class TestReflexRuleAPI:
    """Tests for reflex rule CRUD."""

    def test_list_rules(self, authenticated_client, reflex_rule):
        response = authenticated_client.get("/api/lab/reflex/rules/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_rule(
        self, authenticated_client, sample_test_catalog, reflex_test_catalog, sample_facility
    ):
        data = {
            "trigger_test": sample_test_catalog.id,
            "operator": "LT",
            "threshold_value": 8.0,
            "reflex_test": reflex_test_catalog.id,
            "action": "SUGGEST",
            "description": "Low HGB → Retic",
        }
        response = authenticated_client.post("/api/lab/reflex/rules/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["description"] == "Low HGB → Retic"
        assert response.data["action"] == "SUGGEST"

    def test_update_rule(self, authenticated_client, reflex_rule):
        response = authenticated_client.patch(
            f"/api/lab/reflex/rules/{reflex_rule.id}/",
            {"threshold_value": 15.0},
        )
        assert response.status_code == status.HTTP_200_OK

    def test_delete_rule(self, authenticated_client, reflex_rule):
        response = authenticated_client.delete(f"/api/lab/reflex/rules/{reflex_rule.id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_seed_defaults(self, authenticated_client, sample_facility):
        response = authenticated_client.post("/api/lab/reflex/rules/seed_defaults/")
        assert response.status_code == status.HTTP_201_CREATED
        assert "created" in response.data


class TestReflexExecutionAPI:
    """Tests for reflex execution workflow."""

    def test_list_executions(self, authenticated_client, sample_facility):
        response = authenticated_client.get("/api/lab/reflex/executions/")
        assert response.status_code == status.HTTP_200_OK


class TestReflexEngine:
    """Tests for the reflex evaluation engine."""

    def test_evaluate_matching_rule(self, db, reflex_rule, sample_lab_result):
        """When result exceeds threshold, reflex execution should be created."""
        from hmis.apps.laboratory.reflex.engine import evaluate_reflex_rules

        # Set result value above threshold (10.0)
        sample_lab_result.numeric_value = 12.5
        sample_lab_result.text_value = "12.5"
        sample_lab_result.save()

        executions = evaluate_reflex_rules(sample_lab_result)
        assert len(executions) >= 1
        assert executions[0].status in ("ORDERED", "TRIGGERED")

    def test_no_match_when_below_threshold(self, db, reflex_rule, sample_lab_result):
        """When result is below threshold, no reflex execution."""
        from hmis.apps.laboratory.reflex.engine import evaluate_reflex_rules

        sample_lab_result.numeric_value = 5.0
        sample_lab_result.text_value = "5.0"
        sample_lab_result.save()

        executions = evaluate_reflex_rules(sample_lab_result)
        assert len(executions) == 0


class TestReflexRuleModel:
    """Tests for reflex rule model evaluate method."""

    def test_gt_operator(self, reflex_rule):
        assert reflex_rule.evaluate(12.0) is True
        assert reflex_rule.evaluate(8.0) is False
        assert reflex_rule.evaluate(10.0) is False

    def test_in_range_operator(
        self, db, sample_test_catalog, reflex_test_catalog, sample_facility, sample_organization
    ):
        from hmis.apps.laboratory.reflex.models import ReflexRule

        rule = ReflexRule.objects.create(
            trigger_test=sample_test_catalog,
            operator="IN_RANGE",
            threshold_value=5.0,
            threshold_high=10.0,
            reflex_test=reflex_test_catalog,
            action="SUGGEST",
            facility=sample_facility,
            organization=sample_organization,
        )
        assert rule.evaluate(7.0) is True
        assert rule.evaluate(3.0) is False
        assert rule.evaluate(12.0) is False


class TestReflexExecutionModel:
    """Tests for reflex execution state transitions."""

    def test_approve_execution(self, db, reflex_rule, sample_lab_result, test_user):
        from hmis.apps.laboratory.reflex.models import ReflexExecution

        execution = ReflexExecution.objects.create(
            rule=reflex_rule,
            trigger_result=sample_lab_result,
            status="SUGGESTED",
            facility=reflex_rule.facility,
            organization=reflex_rule.organization,
        )
        execution.approve(user=test_user)
        assert execution.status == "APPROVED"
        assert execution.approved_by == test_user

    def test_reject_execution(self, db, reflex_rule, sample_lab_result, test_user):
        from hmis.apps.laboratory.reflex.models import ReflexExecution

        execution = ReflexExecution.objects.create(
            rule=reflex_rule,
            trigger_result=sample_lab_result,
            status="SUGGESTED",
            facility=reflex_rule.facility,
            organization=reflex_rule.organization,
        )
        execution.reject(user=test_user, notes="Not clinically indicated")
        assert execution.status == "REJECTED"
        assert execution.notes == "Not clinically indicated"
