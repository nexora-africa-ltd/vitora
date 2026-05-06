"""
Tests for QC System (Phase L1).

Covers:
- QC Material & Lot CRUD
- QC Target management
- QC Result entry with Westgard rule evaluation
- Levey-Jennings chart data
- QC Rule management and seeding
- QC Violation acknowledgment
- EQA Survey, Sample, Submission workflows
- Westgard rules engine (unit tests)
- Domain event publishing
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.laboratory.models import Instrument, TestCatalog
from hmis.apps.laboratory.qc.models import (
    EQASample,
    EQASubmission,
    EQASurvey,
    QCLot,
    QCMaterial,
    QCResult,
    QCRule,
    QCRuleViolation,
    QCTarget,
)
from hmis.apps.laboratory.qc.westgard import (
    evaluate_1_2s,
    evaluate_1_3s,
    evaluate_2_2s,
    evaluate_4_1s,
    evaluate_10x,
    evaluate_r_4s,
    get_z_score,
)

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def sample_test_catalog(db):
    """Create a sample TestCatalog entry."""
    return TestCatalog.objects.create(
        code="GLU",
        name="Glucose",
        category="CHEMISTRY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="mmol/L",
        is_active=True,
    )


@pytest.fixture
def sample_instrument(db, sample_facility):
    """Create a sample Instrument."""
    return Instrument.objects.create(
        code="COBAS-C311-01",
        name="Roche cobas c311",
        manufacturer="Roche",
        model="cobas c311",
        department="Chemistry",
        is_active=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def qc_material(db, sample_facility):
    """Create a QC Material."""
    return QCMaterial.objects.create(
        name="Liquichek Unassayed Chemistry",
        manufacturer="Bio-Rad",
        catalog_number="LQ-123",
        storage_conditions="2-8°C",
        is_active=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def qc_lot(db, qc_material, sample_facility):
    """Create a QC Lot."""
    return QCLot.objects.create(
        material=qc_material,
        lot_number="LOT-2026-001",
        status=QCLot.Status.ACTIVE,
        open_date=date.today() - timedelta(days=30),
        expiry_date=date.today() + timedelta(days=60),
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def qc_target(db, qc_lot, sample_test_catalog, sample_instrument, sample_facility):
    """Create a QC Target."""
    return QCTarget.objects.create(
        lot=qc_lot,
        test=sample_test_catalog,
        instrument=sample_instrument,
        mean=Decimal("5.5000"),
        sd=Decimal("0.2500"),
        unit="mmol/L",
        n_values=20,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def qc_rules(db, sample_facility):
    """Seed default Westgard rules for the facility."""
    rules = []
    rule_defs = [
        ("1-2s Warning", QCRule.RuleType.RULE_1_2S, QCRule.Severity.WARNING),
        ("1-3s Reject", QCRule.RuleType.RULE_1_3S, QCRule.Severity.REJECT),
        ("2-2s Reject", QCRule.RuleType.RULE_2_2S, QCRule.Severity.REJECT),
        ("R-4s Reject", QCRule.RuleType.RULE_R_4S, QCRule.Severity.REJECT),
        ("4-1s Reject", QCRule.RuleType.RULE_4_1S, QCRule.Severity.REJECT),
        ("10x Reject", QCRule.RuleType.RULE_10X, QCRule.Severity.REJECT),
    ]
    for name, rule_type, severity in rule_defs:
        rules.append(
            QCRule.objects.create(
                name=name,
                rule_type=rule_type,
                severity=severity,
                is_active=True,
                facility=sample_facility,
                organization=sample_facility.organization,
            )
        )
    return rules


@pytest.fixture
def eqa_survey(db, sample_facility):
    """Create an EQA Survey."""
    return EQASurvey.objects.create(
        provider="HUQAS",
        survey_id="HQ-2026-Q1-CHEM",
        name="Chemistry Q1 2026",
        category="Chemistry",
        status=EQASurvey.Status.PENDING,
        received_date=date.today() - timedelta(days=10),
        due_date=date.today() + timedelta(days=20),
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def eqa_sample(db, eqa_survey, sample_test_catalog, sample_facility):
    """Create an EQA Sample."""
    return EQASample.objects.create(
        survey=eqa_survey,
        sample_id="S1",
        test=sample_test_catalog,
        expected_value="5.2",
        expected_unit="mmol/L",
        acceptable_range_low=Decimal("4.8"),
        acceptable_range_high=Decimal("5.6"),
        facility=sample_facility,
        organization=sample_facility.organization,
    )


# ============================================================================
# Westgard Rules Engine — Unit Tests
# ============================================================================


class TestWestgardRulesEngine:
    """Unit tests for Westgard rules evaluation functions."""

    def test_get_z_score(self):
        assert get_z_score(Decimal("6.0"), Decimal("5.5"), Decimal("0.25")) == pytest.approx(2.0)

    def test_get_z_score_zero_sd(self):
        assert get_z_score(Decimal("6.0"), Decimal("5.5"), Decimal("0")) is None

    def test_1_2s_violated(self):
        result = evaluate_1_2s([2.5])
        assert result.violated is True
        assert result.severity == "WARNING"

    def test_1_2s_passed(self):
        result = evaluate_1_2s([1.5])
        assert result.violated is False

    def test_1_3s_violated(self):
        result = evaluate_1_3s([3.5])
        assert result.violated is True
        assert result.severity == "REJECT"

    def test_1_3s_passed(self):
        result = evaluate_1_3s([2.5])
        assert result.violated is False

    def test_2_2s_violated_positive(self):
        result = evaluate_2_2s([2.5, 2.3])
        assert result.violated is True

    def test_2_2s_violated_negative(self):
        result = evaluate_2_2s([-2.5, -2.3])
        assert result.violated is True

    def test_2_2s_passed_opposite_sides(self):
        result = evaluate_2_2s([2.5, -2.3])
        assert result.violated is False

    def test_2_2s_passed_within_limits(self):
        result = evaluate_2_2s([1.5, 1.8])
        assert result.violated is False

    def test_r_4s_violated(self):
        result = evaluate_r_4s([2.5, -2.5])
        assert result.violated is True

    def test_r_4s_passed(self):
        result = evaluate_r_4s([2.5, 1.0])
        assert result.violated is False

    def test_4_1s_violated_positive(self):
        result = evaluate_4_1s([1.5, 1.3, 1.2, 1.4])
        assert result.violated is True

    def test_4_1s_violated_negative(self):
        result = evaluate_4_1s([-1.5, -1.3, -1.2, -1.4])
        assert result.violated is True

    def test_4_1s_passed(self):
        result = evaluate_4_1s([1.5, 1.3, -1.2, 1.4])
        assert result.violated is False

    def test_4_1s_insufficient_data(self):
        result = evaluate_4_1s([1.5, 1.3, 1.2])
        assert result.violated is False

    def test_10x_violated_all_positive(self):
        z_scores = [0.5, 0.3, 0.8, 0.2, 0.6, 0.1, 0.4, 0.7, 0.9, 0.3]
        result = evaluate_10x(z_scores)
        assert result.violated is True

    def test_10x_violated_all_negative(self):
        z_scores = [-0.5, -0.3, -0.8, -0.2, -0.6, -0.1, -0.4, -0.7, -0.9, -0.3]
        result = evaluate_10x(z_scores)
        assert result.violated is True

    def test_10x_passed(self):
        z_scores = [0.5, -0.3, 0.8, 0.2, -0.6, 0.1, 0.4, -0.7, 0.9, 0.3]
        result = evaluate_10x(z_scores)
        assert result.violated is False

    def test_10x_insufficient_data(self):
        result = evaluate_10x([0.5, 0.3, 0.8])
        assert result.violated is False


# ============================================================================
# QC Model Tests
# ============================================================================


class TestQCModels:
    """Tests for QC model methods and properties."""

    def test_qc_lot_is_expired_false(self, qc_lot):
        assert qc_lot.is_expired is False

    def test_qc_lot_is_expired_true(self, db, qc_material, sample_facility):
        lot = QCLot.objects.create(
            material=qc_material,
            lot_number="EXPIRED-001",
            expiry_date=date.today() - timedelta(days=2),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert lot.is_expired is True

    def test_qc_lot_days_until_expiry(self, qc_lot):
        # Lot expires in ~60 days, allow +/- 1 for timezone boundary
        assert 59 <= qc_lot.days_until_expiry <= 61

    def test_qc_target_auto_cv(self, db, qc_lot, sample_test_catalog, sample_facility):
        target = QCTarget.objects.create(
            lot=qc_lot,
            test=sample_test_catalog,
            mean=Decimal("5.5000"),
            sd=Decimal("0.2500"),
            unit="mmol/L",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        # CV = (0.25 / 5.5) * 100 = 4.55%
        assert float(target.cv_percent) == pytest.approx(4.55, rel=0.01)

    def test_qc_result_z_score(
        self, db, qc_lot, qc_target, sample_test_catalog, sample_instrument, sample_facility
    ):
        result = QCResult.objects.create(
            lot=qc_lot,
            test=sample_test_catalog,
            instrument=sample_instrument,
            value=Decimal("6.0000"),
            run_date=timezone.now(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert result.z_score == pytest.approx(2.0)

    def test_qc_violation_acknowledge(
        self,
        db,
        qc_lot,
        qc_target,
        qc_rules,
        sample_test_catalog,
        sample_instrument,
        sample_facility,
        test_user,
    ):
        result = QCResult.objects.create(
            lot=qc_lot,
            test=sample_test_catalog,
            instrument=sample_instrument,
            value=Decimal("6.5000"),  # >3 SD
            run_date=timezone.now(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        violation = QCRuleViolation.objects.create(
            qc_result=result,
            rule=qc_rules[1],  # 1-3s
            severity=QCRule.Severity.REJECT,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        violation.acknowledge(user=test_user, corrective_action="Recalibrated instrument")
        violation.refresh_from_db()
        assert violation.acknowledged is True
        assert violation.acknowledged_by == test_user
        assert violation.corrective_action == "Recalibrated instrument"

    def test_eqa_survey_is_overdue(self, db, sample_facility):
        survey = EQASurvey.objects.create(
            provider="HUQAS",
            survey_id="OVERDUE-1",
            name="Overdue Survey",
            due_date=date.today() - timedelta(days=5),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert survey.is_overdue is True

    def test_eqa_survey_not_overdue_when_submitted(self, db, sample_facility):
        survey = EQASurvey.objects.create(
            provider="HUQAS",
            survey_id="SUBMITTED-1",
            name="Submitted Survey",
            status=EQASurvey.Status.SUBMITTED,
            due_date=date.today() - timedelta(days=5),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert survey.is_overdue is False

    def test_eqa_submission_evaluate_performance_acceptable(self, db, eqa_sample, sample_facility):
        submission = EQASubmission.objects.create(
            sample=eqa_sample,
            submitted_value="5.1",
            z_score=Decimal("1.5"),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        submission.evaluate_performance()
        submission.refresh_from_db()
        assert submission.performance == EQASubmission.Performance.ACCEPTABLE

    def test_eqa_submission_evaluate_performance_unacceptable(
        self, db, eqa_sample, sample_facility
    ):
        submission = EQASubmission.objects.create(
            sample=eqa_sample,
            submitted_value="7.5",
            z_score=Decimal("3.5"),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        submission.evaluate_performance()
        submission.refresh_from_db()
        assert submission.performance == EQASubmission.Performance.UNACCEPTABLE


# ============================================================================
# QC API Tests — Materials
# ============================================================================


class TestQCMaterialAPI:
    """API tests for QC Materials."""

    URL = "/api/lab/qc/materials/"

    def test_list_materials(self, authenticated_client, qc_material, test_staff_profile):
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = (
            response.data if isinstance(response.data, list) else response.data.get("results", [])
        )
        assert len(results) >= 1
        assert results[0]["name"] == "Liquichek Unassayed Chemistry"

    def test_create_material(self, authenticated_client, test_staff_profile):
        data = {
            "name": "TrueLab Control",
            "manufacturer": "Randox",
            "catalog_number": "TL-456",
            "storage_conditions": "-20°C",
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "TrueLab Control"

    def test_update_material(self, authenticated_client, qc_material, test_staff_profile):
        url = f"{self.URL}{qc_material.id}/"
        response = authenticated_client.patch(url, {"is_active": False})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_active"] is False

    def test_unauthenticated_rejected(self, api_client):
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# QC API Tests — Lots
# ============================================================================


class TestQCLotAPI:
    """API tests for QC Lots."""

    URL = "/api/lab/qc/lots/"

    def test_list_lots(self, authenticated_client, qc_lot, test_staff_profile):
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = (
            response.data if isinstance(response.data, list) else response.data.get("results", [])
        )
        assert len(results) >= 1

    def test_create_lot(self, authenticated_client, qc_material, test_staff_profile):
        data = {
            "material": qc_material.id,
            "lot_number": "LOT-2026-NEW",
            "expiry_date": (date.today() + timedelta(days=90)).isoformat(),
            "open_date": date.today().isoformat(),
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["lot_number"] == "LOT-2026-NEW"

    def test_create_lot_invalid_dates(self, authenticated_client, qc_material, test_staff_profile):
        data = {
            "material": qc_material.id,
            "lot_number": "LOT-INVALID",
            "open_date": "2026-06-01",
            "expiry_date": "2026-01-01",  # Before open date
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_expiring_soon_action(
        self, authenticated_client, test_staff_profile, qc_material, sample_facility
    ):
        # Create a lot expiring within 30 days
        QCLot.objects.create(
            material=qc_material,
            lot_number="EXPIRING-SOON",
            expiry_date=date.today() + timedelta(days=10),
            status=QCLot.Status.ACTIVE,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.get(f"{self.URL}expiring_soon/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1


# ============================================================================
# QC API Tests — Targets
# ============================================================================


class TestQCTargetAPI:
    """API tests for QC Targets."""

    URL = "/api/lab/qc/targets/"

    def test_create_target(
        self,
        authenticated_client,
        qc_lot,
        sample_test_catalog,
        sample_instrument,
        test_staff_profile,
    ):
        data = {
            "lot": qc_lot.id,
            "test": sample_test_catalog.id,
            "instrument": sample_instrument.id,
            "mean": "5.5",
            "sd": "0.25",
            "unit": "mmol/L",
            "n_values": 20,
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["mean"] == "5.5000"

    def test_list_targets(self, authenticated_client, qc_target, test_staff_profile):
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK


# ============================================================================
# QC API Tests — Results & Westgard Evaluation
# ============================================================================


class TestQCResultAPI:
    """API tests for QC Results with Westgard evaluation."""

    URL = "/api/lab/qc/results/"

    def test_create_result_accepted(
        self,
        authenticated_client,
        qc_lot,
        qc_target,
        qc_rules,
        sample_test_catalog,
        sample_instrument,
        test_staff_profile,
    ):
        """Result within 2 SD should be accepted."""
        data = {
            "lot": qc_lot.id,
            "test": sample_test_catalog.id,
            "instrument": sample_instrument.id,
            "value": "5.6",  # +0.4 SD from mean of 5.5 (SD=0.25)
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["accepted"] is True

    def test_create_result_rejected_1_3s(
        self,
        authenticated_client,
        qc_lot,
        qc_target,
        qc_rules,
        sample_test_catalog,
        sample_instrument,
        test_staff_profile,
    ):
        """Result exceeding 3 SD should be rejected."""
        data = {
            "lot": qc_lot.id,
            "test": sample_test_catalog.id,
            "instrument": sample_instrument.id,
            "value": "6.5",  # +4 SD from mean of 5.5 (SD=0.25)
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        # Reload from DB to check after rule evaluation
        result_id = response.data["id"]
        result = QCResult.objects.get(id=result_id)
        assert result.accepted is False
        assert result.violations.count() > 0

    def test_levey_jennings_endpoint(
        self,
        authenticated_client,
        qc_lot,
        qc_target,
        qc_rules,
        sample_test_catalog,
        sample_instrument,
        sample_facility,
        test_staff_profile,
    ):
        """Levey-Jennings chart data endpoint should return chart data."""
        # Create a few results
        for val in ["5.5", "5.6", "5.4", "5.55", "5.45"]:
            QCResult.objects.create(
                lot=qc_lot,
                test=sample_test_catalog,
                instrument=sample_instrument,
                value=Decimal(val),
                run_date=timezone.now(),
                facility=sample_facility,
                organization=sample_facility.organization,
            )

        url = f"{self.URL}levey-jennings/?lot_id={qc_lot.id}&test_id={sample_test_catalog.id}&instrument_id={sample_instrument.id}"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["mean"] == "5.5000"
        assert response.data["sd"] == "0.2500"
        assert len(response.data["data_points"]) == 5

    def test_levey_jennings_missing_params(self, authenticated_client, test_staff_profile):
        url = f"{self.URL}levey-jennings/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# QC API Tests — Rules
# ============================================================================


class TestQCRuleAPI:
    """API tests for QC Rules."""

    URL = "/api/lab/qc/rules/"

    def test_seed_defaults(self, authenticated_client, test_staff_profile):
        """Seeding default rules should create 6 rules."""
        response = authenticated_client.post(f"{self.URL}seed-defaults/")
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data) == 6

    def test_seed_defaults_idempotent(self, authenticated_client, qc_rules, test_staff_profile):
        """Seeding when rules exist should not duplicate."""
        response = authenticated_client.post(f"{self.URL}seed-defaults/")
        assert response.status_code == status.HTTP_200_OK
        assert "already exist" in response.data["message"]

    def test_list_rules(self, authenticated_client, qc_rules, test_staff_profile):
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = (
            response.data if isinstance(response.data, list) else response.data.get("results", [])
        )
        assert len(results) == 6

    def test_create_custom_rule(self, authenticated_client, test_staff_profile):
        data = {
            "name": "Custom 2SD Rule",
            "rule_type": "CUSTOM",
            "severity": "WARNING",
            "description": "Custom rule for testing",
            "custom_expression": "abs(z) > 2.5",
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_201_CREATED


# ============================================================================
# QC API Tests — Violations
# ============================================================================


class TestQCViolationAPI:
    """API tests for QC Violations."""

    URL = "/api/lab/qc/violations/"

    def test_list_violations(
        self,
        authenticated_client,
        qc_lot,
        qc_target,
        qc_rules,
        sample_test_catalog,
        sample_instrument,
        sample_facility,
        test_staff_profile,
    ):
        # Create a violation by entering an out-of-range result
        result = QCResult.objects.create(
            lot=qc_lot,
            test=sample_test_catalog,
            instrument=sample_instrument,
            value=Decimal("6.5"),
            run_date=timezone.now(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        QCRuleViolation.objects.create(
            qc_result=result,
            rule=qc_rules[1],
            severity=QCRule.Severity.REJECT,
            description="Test violation",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK

    def test_acknowledge_violation(
        self,
        authenticated_client,
        qc_lot,
        qc_target,
        qc_rules,
        sample_test_catalog,
        sample_instrument,
        sample_facility,
        test_staff_profile,
    ):
        result = QCResult.objects.create(
            lot=qc_lot,
            test=sample_test_catalog,
            instrument=sample_instrument,
            value=Decimal("6.5"),
            run_date=timezone.now(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        violation = QCRuleViolation.objects.create(
            qc_result=result,
            rule=qc_rules[1],
            severity=QCRule.Severity.REJECT,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        url = f"{self.URL}{violation.id}/acknowledge/"
        response = authenticated_client.post(url, {"corrective_action": "Recalibrated"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["acknowledged"] is True
        assert response.data["corrective_action"] == "Recalibrated"


# ============================================================================
# EQA API Tests — Surveys
# ============================================================================


class TestEQASurveyAPI:
    """API tests for EQA Surveys."""

    URL = "/api/lab/qc/eqa/surveys/"

    def test_list_surveys(self, authenticated_client, eqa_survey, test_staff_profile):
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = (
            response.data if isinstance(response.data, list) else response.data.get("results", [])
        )
        assert len(results) >= 1

    def test_create_survey(self, authenticated_client, test_staff_profile):
        data = {
            "provider": "NEQAS",
            "survey_id": "NQ-2026-H1",
            "name": "Hematology H1 2026",
            "category": "Hematology",
            "due_date": (date.today() + timedelta(days=45)).isoformat(),
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["provider"] == "NEQAS"

    def test_mark_submitted(self, authenticated_client, eqa_survey, test_staff_profile):
        url = f"{self.URL}{eqa_survey.id}/submit/"
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SUBMITTED"
        assert response.data["submitted_date"] is not None


# ============================================================================
# EQA API Tests — Samples
# ============================================================================


class TestEQASampleAPI:
    """API tests for EQA Samples."""

    URL = "/api/lab/qc/eqa/samples/"

    def test_create_sample(
        self, authenticated_client, eqa_survey, sample_test_catalog, test_staff_profile
    ):
        data = {
            "survey": eqa_survey.id,
            "sample_id": "S2",
            "test": sample_test_catalog.id,
            "expected_value": "4.8",
            "expected_unit": "mmol/L",
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_201_CREATED

    def test_list_samples(self, authenticated_client, eqa_sample, test_staff_profile):
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK


# ============================================================================
# EQA API Tests — Submissions
# ============================================================================


class TestEQASubmissionAPI:
    """API tests for EQA Submissions."""

    URL = "/api/lab/qc/eqa/submissions/"

    def test_create_submission(self, authenticated_client, eqa_sample, test_staff_profile):
        data = {
            "sample": eqa_sample.id,
            "submitted_value": "5.3",
            "submitted_unit": "mmol/L",
            "method": "Hexokinase",
        }
        response = authenticated_client.post(self.URL, data)
        assert response.status_code == status.HTTP_201_CREATED

    def test_update_score(
        self, authenticated_client, eqa_sample, sample_facility, test_staff_profile
    ):
        submission = EQASubmission.objects.create(
            sample=eqa_sample,
            submitted_value="5.3",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        url = f"{self.URL}{submission.id}/update-score/"
        data = {
            "z_score": "1.2",
            "peer_group_mean": "5.2",
            "peer_group_sd": "0.3",
            "peer_group_n": 150,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["performance"] == "ACCEPTABLE"
        assert response.data["z_score"] == "1.20"

    def test_unacceptable_score(
        self, authenticated_client, eqa_sample, sample_facility, test_staff_profile
    ):
        submission = EQASubmission.objects.create(
            sample=eqa_sample,
            submitted_value="8.0",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        url = f"{self.URL}{submission.id}/update-score/"
        data = {"z_score": "4.5"}
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["performance"] == "UNACCEPTABLE"


# ============================================================================
# Domain Event Tests
# ============================================================================


class TestQCDomainEvents:
    """Tests for QC domain event publishing."""

    def test_qc_result_publishes_event(
        self, db, mocker, qc_lot, sample_test_catalog, sample_instrument, sample_facility
    ):
        mock_publish = mocker.patch("hmis.apps.laboratory.qc.signals.publish_event")
        QCResult.objects.create(
            lot=qc_lot,
            test=sample_test_catalog,
            instrument=sample_instrument,
            value=Decimal("5.5"),
            run_date=timezone.now(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        mock_publish.assert_called_once()
        call_args = mock_publish.call_args
        assert call_args[0][0] == "laboratory.qc.result_entered"
        assert call_args[0][1] == "QCResult"

    def test_qc_violation_publishes_event(
        self, db, mocker, qc_lot, qc_rules, sample_test_catalog, sample_instrument, sample_facility
    ):
        mock_publish = mocker.patch("hmis.apps.laboratory.qc.signals.publish_event")
        result = QCResult.objects.create(
            lot=qc_lot,
            test=sample_test_catalog,
            instrument=sample_instrument,
            value=Decimal("6.5"),
            run_date=timezone.now(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        mock_publish.reset_mock()
        QCRuleViolation.objects.create(
            qc_result=result,
            rule=qc_rules[1],
            severity=QCRule.Severity.REJECT,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == "laboratory.qc.rule_violated"
        assert mock_publish.call_args[0][1] == "QCRuleViolation"
