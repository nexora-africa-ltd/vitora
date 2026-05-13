"""
Tests for Phase L2: Delta Checks & Auto-Verification.
Covers: models, delta engine, auto-verify engine, API endpoints, domain events.
"""

from datetime import timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.laboratory.autoverify.delta_engine import evaluate_delta_check
from hmis.apps.laboratory.autoverify.models import (
    AutoVerifyConfig,
    AutoVerifyLog,
    AutoVerifyRule,
    DeltaCheckResult,
    DeltaCheckRule,
)
from hmis.apps.laboratory.autoverify.verify_engine import evaluate_auto_verify

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def test_catalog(db):
    """Create a test catalog entry for Hemoglobin."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="HGB",
        name="Hemoglobin",
        short_name="HGB",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        cost=Decimal("500.00"),
        result_unit="g/dL",
        normal_range_male="13.5-17.5",
        normal_range_female="12.0-16.0",
    )


@pytest.fixture
def test_catalog_potassium(db):
    """Create a test catalog for Potassium (absolute delta check)."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="K",
        name="Potassium",
        short_name="K+",
        category="CHEMISTRY",
        specimen_type="SERUM",
        result_type="NUMERIC",
        cost=Decimal("400.00"),
        result_unit="mmol/L",
        normal_range_male="3.5-5.0",
        normal_range_female="3.5-5.0",
    )


@pytest.fixture
def lab_order(
    db, sample_patient, sample_encounter, sample_facility, sample_organization, test_user
):
    """Create a lab order for the sample patient."""
    from hmis.apps.laboratory.models import LabOrder

    return LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        facility=sample_facility,
        organization=sample_organization,
        ordered_by=test_user,
        order_type="IN_HOUSE",
        status="IN_PROGRESS",
        priority="ROUTINE",
        clinical_notes="Test order",
    )


@pytest.fixture
def lab_order_item(db, lab_order, test_catalog):
    """Create a lab order item linked to the HGB test."""
    from hmis.apps.laboratory.models import LabOrderItem

    return LabOrderItem.objects.create(
        lab_order=lab_order,
        test=test_catalog,
        status="IN_PROGRESS",
        unit_cost=test_catalog.cost,
    )


@pytest.fixture
def lab_result(db, lab_order_item, test_user):
    """Create a lab result with numeric value."""
    from hmis.apps.laboratory.models import LabResult

    return LabResult.objects.create(
        order_item=lab_order_item,
        numeric_value=Decimal("14.5"),
        result_unit="g/dL",
        result_flag="NORMAL",
        verification_status="UNVERIFIED",
        entered_by=test_user,
    )


@pytest.fixture
def previous_result(
    db,
    sample_patient,
    sample_encounter,
    sample_facility,
    sample_organization,
    test_catalog,
    test_user,
):
    """Create a previous lab result for the same patient/test."""
    from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult

    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        facility=sample_facility,
        organization=sample_organization,
        ordered_by=test_user,
        order_type="IN_HOUSE",
        status="COMPLETED",
        priority="ROUTINE",
        clinical_notes="Previous order",
    )
    item = LabOrderItem.objects.create(
        lab_order=order,
        test=test_catalog,
        status="COMPLETED",
        unit_cost=test_catalog.cost,
    )
    result = LabResult.objects.create(
        order_item=item,
        numeric_value=Decimal("13.0"),
        result_unit="g/dL",
        result_flag="NORMAL",
        verification_status="VERIFIED",
        entered_by=test_user,
    )
    # Backdate the entry
    LabResult.objects.filter(pk=result.pk).update(entered_at=timezone.now() - timedelta(hours=24))
    result.refresh_from_db()
    return result


@pytest.fixture
def delta_rule(db, test_catalog, sample_facility, sample_organization):
    """Create a delta check rule for HGB (33% threshold)."""
    return DeltaCheckRule.objects.create(
        test=test_catalog,
        facility=sample_facility,
        organization=sample_organization,
        check_type=DeltaCheckRule.CheckType.PERCENT,
        threshold_percent=Decimal("33.00"),
        lookback_hours=72,
        action=DeltaCheckRule.Action.FLAG_FOR_REVIEW,
        is_active=True,
    )


@pytest.fixture
def autoverify_config(db, sample_facility, sample_organization):
    """Create auto-verify config (enabled)."""
    return AutoVerifyConfig.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        is_enabled=True,
        max_auto_verify_percent=70,
        max_specimen_age_hours=24,
    )


@pytest.fixture
def autoverify_rules(db, test_catalog, sample_facility, sample_organization):
    """Create standard auto-verify rules for HGB test."""
    rules = []
    for condition in [
        AutoVerifyRule.ConditionType.IN_REFERENCE_RANGE,
        AutoVerifyRule.ConditionType.DELTA_CHECK_PASS,
        AutoVerifyRule.ConditionType.NO_CRITICAL_FLAG,
        AutoVerifyRule.ConditionType.NUMERIC_RESULT,
    ]:
        rules.append(
            AutoVerifyRule.objects.create(
                test=test_catalog,
                facility=sample_facility,
                organization=sample_organization,
                condition_type=condition,
                is_active=True,
            )
        )
    return rules


# =============================================================================
# Delta Check Engine Tests
# =============================================================================


class TestDeltaCheckEngine:
    """Tests for the delta check evaluation engine."""

    def test_no_rule_returns_none(self, lab_result):
        """No rule configured for test → returns None."""
        result = evaluate_delta_check(lab_result)
        assert result is None

    def test_no_prior_result(self, lab_result, delta_rule):
        """No prior result found within lookback window → NO_PRIOR."""
        check = evaluate_delta_check(lab_result)
        assert check is not None
        assert check.outcome == DeltaCheckResult.Outcome.NO_PRIOR
        assert check.current_value == Decimal("14.5")

    def test_pass_within_threshold(self, lab_result, previous_result, delta_rule):
        """Delta within threshold → PASS. 14.5 vs 13.0 = 11.5% < 33%."""
        check = evaluate_delta_check(lab_result)
        assert check is not None
        assert check.outcome == DeltaCheckResult.Outcome.PASS
        assert check.previous_value == Decimal("13.0")
        assert check.delta_percent is not None
        # (14.5 - 13.0) / 13.0 * 100 = 11.54%
        assert check.delta_percent < Decimal("33")

    def test_fail_exceeds_threshold(self, lab_result, previous_result, delta_rule):
        """Delta exceeds threshold → FAIL."""
        from hmis.apps.laboratory.models import LabResult

        # Change current to 20.0 → (20 - 13) / 13 * 100 = 53.8% > 33%
        lab_result.numeric_value = Decimal("20.0")
        lab_result.save()
        # Remove any existing delta check
        DeltaCheckResult.objects.filter(result=lab_result).delete()

        check = evaluate_delta_check(lab_result)
        assert check is not None
        assert check.outcome == DeltaCheckResult.Outcome.FAIL
        assert check.delta_percent > Decimal("33")
        assert check.action_taken == DeltaCheckRule.Action.FLAG_FOR_REVIEW

    def test_absolute_threshold(
        self,
        db,
        test_catalog_potassium,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        test_user,
    ):
        """Absolute delta check works correctly."""
        from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult

        # Create rule: absolute threshold 1.5 mmol/L
        DeltaCheckRule.objects.create(
            test=test_catalog_potassium,
            facility=sample_facility,
            organization=sample_organization,
            check_type=DeltaCheckRule.CheckType.ABSOLUTE,
            threshold_absolute=Decimal("1.5"),
            lookback_hours=48,
            action=DeltaCheckRule.Action.BLOCK_RELEASE,
            is_active=True,
        )

        # Previous: 4.0
        order1 = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            status="COMPLETED",
            priority="ROUTINE",
        )
        item1 = LabOrderItem.objects.create(
            lab_order=order1,
            test=test_catalog_potassium,
            status="COMPLETED",
            unit_cost=Decimal("400"),
        )
        prev = LabResult.objects.create(
            order_item=item1,
            numeric_value=Decimal("4.0"),
            result_unit="mmol/L",
            result_flag="NORMAL",
            verification_status="VERIFIED",
            entered_by=test_user,
        )
        LabResult.objects.filter(pk=prev.pk).update(entered_at=timezone.now() - timedelta(hours=12))

        # Current: 6.0 → |6.0 - 4.0| = 2.0 > 1.5 → FAIL
        order2 = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
        )
        item2 = LabOrderItem.objects.create(
            lab_order=order2,
            test=test_catalog_potassium,
            status="IN_PROGRESS",
            unit_cost=Decimal("400"),
        )
        current = LabResult.objects.create(
            order_item=item2,
            numeric_value=Decimal("6.0"),
            result_unit="mmol/L",
            result_flag="HIGH",
            verification_status="UNVERIFIED",
            entered_by=test_user,
        )

        check = evaluate_delta_check(current)
        assert check.outcome == DeltaCheckResult.Outcome.FAIL
        assert check.delta_absolute == Decimal("2.0000")
        assert check.action_taken == DeltaCheckRule.Action.BLOCK_RELEASE

    def test_lookback_window_respected(self, lab_result, delta_rule, previous_result):
        """Prior result outside lookback window is ignored."""
        from hmis.apps.laboratory.models import LabResult

        # Move previous result to 100 hours ago (beyond 72h lookback)
        LabResult.objects.filter(pk=previous_result.pk).update(
            entered_at=timezone.now() - timedelta(hours=100)
        )

        check = evaluate_delta_check(lab_result)
        assert check.outcome == DeltaCheckResult.Outcome.NO_PRIOR

    def test_non_numeric_result_skipped(self, delta_rule, lab_result):
        """Non-numeric results are skipped."""
        lab_result.numeric_value = None
        lab_result.save()
        DeltaCheckResult.objects.filter(result=lab_result).delete()

        check = evaluate_delta_check(lab_result)
        assert check.outcome == DeltaCheckResult.Outcome.SKIPPED


# =============================================================================
# Auto-Verification Engine Tests
# =============================================================================


class TestAutoVerifyEngine:
    """Tests for the auto-verification engine."""

    def test_disabled_config_skips(self, lab_result, sample_facility, sample_organization):
        """Disabled config → SKIPPED."""
        AutoVerifyConfig.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            is_enabled=False,
        )
        log = evaluate_auto_verify(lab_result)
        assert log.outcome == AutoVerifyLog.Outcome.SKIPPED

    def test_no_config_skips(self, lab_result):
        """No config at all → SKIPPED."""
        log = evaluate_auto_verify(lab_result)
        assert log.outcome == AutoVerifyLog.Outcome.SKIPPED

    def test_all_rules_pass_auto_verifies(
        self, lab_result, previous_result, delta_rule, autoverify_config, autoverify_rules
    ):
        """All rules pass → result is auto-verified."""
        # First evaluate delta check so delta_check_pass rule can read it
        evaluate_delta_check(lab_result)

        log = evaluate_auto_verify(lab_result)
        assert log.outcome == AutoVerifyLog.Outcome.AUTO_VERIFIED
        assert log.auto_verified_by_system is True

        # Verify the result was actually marked as verified
        lab_result.refresh_from_db()
        assert lab_result.verification_status == "VERIFIED"
        assert lab_result.verified_at is not None

    def test_critical_flag_blocks(self, lab_result, autoverify_config, autoverify_rules):
        """Critical flag on result → BLOCKED."""
        # Keep result_flag NORMAL so IN_REFERENCE_RANGE passes,
        # but set is_critical_result=True so NO_CRITICAL_FLAG blocks
        lab_result.result_flag = "NORMAL"
        lab_result.is_critical_result = True
        lab_result.save()

        log = evaluate_auto_verify(lab_result)
        assert log.outcome == AutoVerifyLog.Outcome.BLOCKED
        assert log.blocking_rule is not None
        assert log.blocking_rule.condition_type == AutoVerifyRule.ConditionType.NO_CRITICAL_FLAG

    def test_failed_delta_blocks(
        self, lab_result, previous_result, delta_rule, autoverify_config, autoverify_rules
    ):
        """Failed delta check → BLOCKED by DELTA_CHECK_PASS rule."""
        # Make delta fail: large change
        lab_result.numeric_value = Decimal("20.0")
        lab_result.save()
        evaluate_delta_check(lab_result)

        log = evaluate_auto_verify(lab_result)
        assert log.outcome == AutoVerifyLog.Outcome.BLOCKED
        # Find the blocking condition
        blocked_conditions = [e["condition_type"] for e in log.rules_evaluated if not e["passed"]]
        assert "DELTA_CHECK_PASS" in blocked_conditions

    def test_non_numeric_blocks(self, lab_result, autoverify_config, autoverify_rules):
        """Non-numeric result blocked by NUMERIC_RESULT rule."""
        lab_result.numeric_value = None
        lab_result.text_value = "Positive"
        lab_result.save()

        log = evaluate_auto_verify(lab_result)
        assert log.outcome == AutoVerifyLog.Outcome.BLOCKED

    def test_excluded_priority_skips(self, lab_result, autoverify_config, autoverify_rules):
        """STAT priority excluded from auto-verify."""
        autoverify_config.excluded_priorities = ["STAT"]
        autoverify_config.save()
        lab_result.order_item.lab_order.priority = "STAT"
        lab_result.order_item.lab_order.save()

        log = evaluate_auto_verify(lab_result)
        assert log.outcome == AutoVerifyLog.Outcome.SKIPPED

    def test_cap_exceeded(
        self,
        lab_result,
        autoverify_config,
        autoverify_rules,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Daily cap exceeded → CAP_EXCEEDED."""
        # Set cap very low
        autoverify_config.max_auto_verify_percent = 0
        autoverify_config.save()

        # Create a fake auto-verified log to exceed the cap
        from hmis.apps.laboratory.models import LabOrder, LabOrderItem
        from hmis.apps.laboratory.models import LabResult as LR

        order = LabOrder.objects.create(
            patient=lab_result.order_item.lab_order.patient,
            encounter=lab_result.order_item.lab_order.encounter,
            facility=sample_facility,
            organization=sample_organization,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            status="COMPLETED",
            priority="ROUTINE",
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=lab_result.order_item.test,
            status="COMPLETED",
            unit_cost=Decimal("500"),
        )
        other_result = LR.objects.create(
            order_item=item,
            numeric_value=Decimal("14.0"),
            result_unit="g/dL",
            result_flag="NORMAL",
            verification_status="VERIFIED",
            entered_by=test_user,
        )

        # This counts as entered today, and with cap=0, any auto-verify will exceed
        log = evaluate_auto_verify(lab_result)
        assert log.outcome == AutoVerifyLog.Outcome.CAP_EXCEEDED

    def test_no_rules_for_test_skips(self, lab_result, autoverify_config):
        """No active rules for this test → SKIPPED."""
        log = evaluate_auto_verify(lab_result)
        assert log.outcome == AutoVerifyLog.Outcome.SKIPPED


# =============================================================================
# Delta Check Rule Model Tests
# =============================================================================


class TestDeltaCheckRuleModel:
    """Tests for DeltaCheckRule model validation."""

    def test_create_percent_rule(self, test_catalog, sample_facility, sample_organization):
        rule = DeltaCheckRule.objects.create(
            test=test_catalog,
            facility=sample_facility,
            organization=sample_organization,
            check_type=DeltaCheckRule.CheckType.PERCENT,
            threshold_percent=Decimal("50.00"),
            lookback_hours=72,
            action=DeltaCheckRule.Action.FLAG_FOR_REVIEW,
        )
        assert str(rule) == "Delta: Hemoglobin (Percentage Change)"
        assert rule.is_active is True

    def test_unique_per_facility_test(
        self, delta_rule, test_catalog, sample_facility, sample_organization
    ):
        """Only one delta rule per test per facility."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            DeltaCheckRule.objects.create(
                test=test_catalog,
                facility=sample_facility,
                organization=sample_organization,
                check_type=DeltaCheckRule.CheckType.ABSOLUTE,
                threshold_absolute=Decimal("2.0"),
                lookback_hours=48,
                action=DeltaCheckRule.Action.ALERT_ONLY,
            )


# =============================================================================
# Auto-Verify Rule Model Tests
# =============================================================================


class TestAutoVerifyRuleModel:
    """Tests for AutoVerifyRule model."""

    def test_create_rule(self, test_catalog, sample_facility, sample_organization):
        rule = AutoVerifyRule.objects.create(
            test=test_catalog,
            facility=sample_facility,
            organization=sample_organization,
            condition_type=AutoVerifyRule.ConditionType.IN_REFERENCE_RANGE,
            is_active=True,
        )
        assert "Reference Range" in str(rule)

    def test_unique_condition_per_test_per_facility(
        self, test_catalog, sample_facility, sample_organization
    ):
        """Only one rule per condition type per test per facility."""
        from django.db import IntegrityError

        AutoVerifyRule.objects.create(
            test=test_catalog,
            facility=sample_facility,
            organization=sample_organization,
            condition_type=AutoVerifyRule.ConditionType.IN_REFERENCE_RANGE,
        )
        with pytest.raises(IntegrityError):
            AutoVerifyRule.objects.create(
                test=test_catalog,
                facility=sample_facility,
                organization=sample_organization,
                condition_type=AutoVerifyRule.ConditionType.IN_REFERENCE_RANGE,
            )


# =============================================================================
# API Endpoint Tests
# =============================================================================


class TestDeltaCheckRuleAPI:
    """Tests for delta check rule CRUD API."""

    def test_list_rules(self, authenticated_client, delta_rule):
        response = authenticated_client.get("/api/lab/autoverify/delta-rules/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["test_name"] == "Hemoglobin"

    def test_create_rule(self, authenticated_client, test_catalog_potassium, sample_facility):
        data = {
            "test": test_catalog_potassium.pk,
            "check_type": "ABSOLUTE",
            "threshold_absolute": "1.5",
            "lookback_hours": 48,
            "action": "BLOCK_RELEASE",
        }
        response = authenticated_client.post("/api/lab/autoverify/delta-rules/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["test_name"] == "Potassium"
        assert response.data["action"] == "BLOCK_RELEASE"

    def test_create_percent_rule_without_threshold_fails(self, authenticated_client, test_catalog):
        data = {
            "test": test_catalog.pk,
            "check_type": "PERCENT",
            "lookback_hours": 72,
            "action": "FLAG_FOR_REVIEW",
        }
        response = authenticated_client.post("/api/lab/autoverify/delta-rules/", data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_rule(self, authenticated_client, delta_rule):
        response = authenticated_client.patch(
            f"/api/lab/autoverify/delta-rules/{delta_rule.pk}/",
            {"lookback_hours": 48},
        )
        assert response.status_code == status.HTTP_200_OK
        delta_rule.refresh_from_db()
        assert delta_rule.lookback_hours == 48

    def test_delete_rule(self, authenticated_client, delta_rule):
        response = authenticated_client.delete(f"/api/lab/autoverify/delta-rules/{delta_rule.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_seed_defaults(self, authenticated_client, test_catalog):
        response = authenticated_client.post("/api/lab/autoverify/delta-rules/seed_defaults/")
        assert response.status_code == status.HTTP_201_CREATED
        # HGB rule should be created since test_catalog has code "HGB"
        assert response.data["created"] >= 1


class TestDeltaCheckResultAPI:
    """Tests for delta check result read endpoints."""

    def test_list_results(self, authenticated_client, lab_result, delta_rule, previous_result):
        evaluate_delta_check(lab_result)
        response = authenticated_client.get("/api/lab/autoverify/delta-results/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1

    def test_evaluate_endpoint(self, authenticated_client, lab_result, delta_rule, previous_result):
        response = authenticated_client.post(
            "/api/lab/autoverify/delta-results/evaluate/",
            {"result_id": lab_result.pk},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["outcome"] == "PASS"

    def test_filter_by_outcome(self, authenticated_client, lab_result, delta_rule):
        evaluate_delta_check(lab_result)
        response = authenticated_client.get("/api/lab/autoverify/delta-results/?outcome=NO_PRIOR")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1


class TestAutoVerifyRuleAPI:
    """Tests for auto-verify rule CRUD API."""

    def test_list_rules(self, authenticated_client, autoverify_rules):
        response = authenticated_client.get("/api/lab/autoverify/rules/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 4

    def test_create_rule(self, authenticated_client, test_catalog):
        data = {
            "test": test_catalog.pk,
            "condition_type": "SPECIMEN_AGE_OK",
            "is_active": True,
            "parameters": {"max_specimen_age_hours": 12},
        }
        response = authenticated_client.post("/api/lab/autoverify/rules/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["condition_type"] == "SPECIMEN_AGE_OK"

    def test_seed_defaults(self, authenticated_client, test_catalog):
        response = authenticated_client.post(
            "/api/lab/autoverify/rules/seed_defaults/",
            {"test_id": test_catalog.pk},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["created"] == 5  # 5 default conditions


class TestAutoVerifyConfigAPI:
    """Tests for auto-verify config API."""

    def test_get_current_config(self, authenticated_client, sample_facility):
        response = authenticated_client.get("/api/lab/autoverify/config/current/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_enabled"] is False  # default

    def test_update_config(self, authenticated_client, autoverify_config):
        response = authenticated_client.patch(
            f"/api/lab/autoverify/config/{autoverify_config.pk}/",
            {"max_auto_verify_percent": 80},
        )
        assert response.status_code == status.HTTP_200_OK
        autoverify_config.refresh_from_db()
        assert autoverify_config.max_auto_verify_percent == 80


class TestAutoVerifyLogAPI:
    """Tests for auto-verify log API."""

    def test_list_logs(
        self,
        authenticated_client,
        lab_result,
        autoverify_config,
        autoverify_rules,
        previous_result,
        delta_rule,
    ):
        evaluate_delta_check(lab_result)
        evaluate_auto_verify(lab_result)
        response = authenticated_client.get("/api/lab/autoverify/logs/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1

    def test_evaluate_endpoint(
        self,
        authenticated_client,
        lab_result,
        autoverify_config,
        autoverify_rules,
        previous_result,
        delta_rule,
    ):
        evaluate_delta_check(lab_result)
        response = authenticated_client.post(
            "/api/lab/autoverify/logs/evaluate/",
            {"result_id": lab_result.pk},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["outcome"] == "AUTO_VERIFIED"

    def test_stats_endpoint(
        self,
        authenticated_client,
        lab_result,
        autoverify_config,
        autoverify_rules,
        previous_result,
        delta_rule,
    ):
        evaluate_delta_check(lab_result)
        evaluate_auto_verify(lab_result)
        response = authenticated_client.get("/api/lab/autoverify/logs/stats/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_evaluated"] == 1
        assert response.data["auto_verified"] == 1
        assert response.data["auto_verify_rate"] == 100.0


# =============================================================================
# Domain Event Tests
# =============================================================================


class TestAutoVerifyDomainEvents:
    """Tests for domain event publication."""

    def test_delta_check_fail_publishes_event(
        self, db, mocker, lab_result, previous_result, delta_rule
    ):
        mock_publish = mocker.patch("hmis.apps.laboratory.autoverify.signals.publish_event")
        # Make delta fail
        lab_result.numeric_value = Decimal("20.0")
        lab_result.save()
        DeltaCheckResult.objects.filter(result=lab_result).delete()
        evaluate_delta_check(lab_result)

        mock_publish.assert_called_once()
        call_args = mock_publish.call_args
        assert call_args[0][0] == "laboratory.delta_check.failed"

    def test_delta_check_pass_no_event(self, db, mocker, lab_result, previous_result, delta_rule):
        mock_publish = mocker.patch("hmis.apps.laboratory.autoverify.signals.publish_event")
        evaluate_delta_check(lab_result)
        mock_publish.assert_not_called()

    def test_auto_verify_publishes_event(
        self,
        db,
        mocker,
        lab_result,
        previous_result,
        delta_rule,
        autoverify_config,
        autoverify_rules,
    ):
        mock_publish = mocker.patch("hmis.apps.laboratory.autoverify.signals.publish_event")
        evaluate_delta_check(lab_result)
        evaluate_auto_verify(lab_result)

        # Should publish AUTO_VERIFY_PASSED
        assert mock_publish.called
        event_types = [call[0][0] for call in mock_publish.call_args_list]
        assert "laboratory.auto_verify.passed" in event_types

    def test_auto_verify_blocked_publishes_event(
        self, db, mocker, lab_result, autoverify_config, autoverify_rules
    ):
        mock_publish = mocker.patch("hmis.apps.laboratory.autoverify.signals.publish_event")
        # Make it critical → blocks
        lab_result.result_flag = "CRITICAL_HIGH"
        lab_result.is_critical_result = True
        lab_result.save()
        evaluate_auto_verify(lab_result)

        event_types = [call[0][0] for call in mock_publish.call_args_list]
        assert "laboratory.auto_verify.blocked" in event_types


# =============================================================================
# Auth Tests
# =============================================================================


class TestAutoVerifyAuth:
    """Test authentication is required."""

    def test_unauthenticated_delta_rules(self, api_client):
        response = api_client.get("/api/lab/autoverify/delta-rules/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_unauthenticated_auto_verify_rules(self, api_client):
        response = api_client.get("/api/lab/autoverify/rules/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_unauthenticated_logs(self, api_client):
        response = api_client.get("/api/lab/autoverify/logs/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
