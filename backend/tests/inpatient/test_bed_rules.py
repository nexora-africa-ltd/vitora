"""
Tests for Rule-Based Bed Assignment (Phase B).

Tests the BedAssignmentRuleEvaluator service and related API endpoints.
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.inpatient.models import Bed, Ward
from hmis.apps.inpatient.services.bed_rules import (
    BedAssignmentRuleEvaluator,
    BedAssignmentRuleResult,
    BedCandidateEvaluation,
    bed_assignment_rule_evaluator,
)
from hmis.apps.scheduling.models import AssignmentDecision, AssignmentRule

User = get_user_model()


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def evaluator():
    """Create a BedAssignmentRuleEvaluator instance."""
    return BedAssignmentRuleEvaluator()


@pytest.fixture
def female_patient(db, sample_county, sample_sub_county, sample_organization):
    """Create a female patient for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Jane",
        last_name="Doe",
        date_of_birth=date(1990, 1, 1),
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def male_patient(db, sample_county, sample_sub_county, sample_organization):
    """Create a male patient for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="John",
        last_name="Smith",
        date_of_birth=date(1985, 6, 15),
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def child_patient(db, sample_county, sample_sub_county, sample_organization):
    """Create a child patient (age 10) for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Child",
        last_name="Patient",
        date_of_birth=date(2015, 3, 20),  # ~10 years old
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def general_ward(db, sample_facility, sample_organization):
    """Create a general ward with beds."""
    ward = Ward.objects.create(
        name="General Ward 1",
        code="GEN-01",
        ward_type="MEDICAL",
        capacity=5,
        daily_rate=Decimal("1500.00"),
        is_active=True,
        gender_restriction="ANY",
        oxygen_equipped=True,
        facility=sample_facility,
        organization=sample_organization,
    )
    # Beds are auto-created by Ward.save()
    return ward


@pytest.fixture
def maternity_ward(db, sample_facility, sample_organization):
    """Create a maternity ward (female-only)."""
    ward = Ward.objects.create(
        name="Maternity Ward",
        code="MAT-01",
        ward_type="MATERNITY",
        capacity=3,
        daily_rate=Decimal("2000.00"),
        is_active=True,
        # Should auto-set to FEMALE_ONLY and age range,
        facility=sample_facility,
        organization=sample_organization,
    )
    return ward


@pytest.fixture
def pediatric_ward(db, sample_facility, sample_organization):
    """Create a pediatric ward (age-restricted)."""
    ward = Ward.objects.create(
        name="Pediatric Ward",
        code="PED-01",
        ward_type="PEDIATRIC",
        capacity=4,
        daily_rate=Decimal("1800.00"),
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )
    return ward


@pytest.fixture
def icu_ward(db, sample_facility, sample_organization):
    """Create an ICU ward with equipment."""
    ward = Ward.objects.create(
        name="ICU",
        code="ICU-01",
        ward_type="ICU",
        capacity=2,
        daily_rate=Decimal("5000.00"),
        is_active=True,
        oxygen_equipped=True,
        ventilator_capable=True,
        facility=sample_facility,
        organization=sample_organization,
    )
    return ward


@pytest.fixture
def isolation_ward(db, sample_facility, sample_organization):
    """Create an isolation ward."""
    ward = Ward.objects.create(
        name="Isolation Ward",
        code="ISO-01",
        ward_type="ISOLATION",
        capacity=2,
        daily_rate=Decimal("3000.00"),
        is_active=True,
        isolation_capable=True,
        facility=sample_facility,
        organization=sample_organization,
    )
    return ward


@pytest.fixture
def ward_with_no_beds(db, sample_facility, sample_organization):
    """Create a ward with no available beds (all occupied)."""
    ward = Ward.objects.create(
        name="Full Ward",
        code="FULL-01",
        ward_type="MEDICAL",
        capacity=2,
        daily_rate=Decimal("1500.00"),
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )
    # Mark all beds as occupied
    ward.beds.update(status="OCCUPIED")
    return ward


@pytest.fixture
def general_ward_rule(db):
    """Create a general ward assignment rule."""
    return AssignmentRule.objects.create(
        name="General Ward Bed Assignment",
        rule_code="test_bed_assign_general",
        applies_to="BED_ASSIGNMENT",
        priority=100,
        rule_definition={
            "version": "1.0",
            "when": {"ward_type": "MEDICAL"},
            "constraints": [],
            "scoring": [{"field": "ward_occupancy_rate", "weight": -1}],
            "fallback": {"action": "use_first_available"},
        },
    )


@pytest.fixture
def icu_rule_with_oxygen_constraint(db):
    """Create an ICU rule requiring oxygen equipment."""
    return AssignmentRule.objects.create(
        name="ICU Bed Assignment",
        rule_code="test_bed_assign_icu",
        applies_to="BED_ASSIGNMENT",
        priority=200,
        rule_definition={
            "version": "1.0",
            "when": {"ward_type": "ICU"},
            "constraints": [
                {"field": "ward.oxygen_equipped", "operator": "==", "value": True},
            ],
            "scoring": [
                {"field": "ward.ventilator_capable", "weight": 10},
            ],
            "fallback": {"action": "leave_unassigned"},
        },
    )


# =============================================================================
# BedCandidateEvaluation Tests
# =============================================================================


class TestBedCandidateEvaluation:
    """Tests for BedCandidateEvaluation dataclass."""

    def test_passed_all_constraints_true(self):
        """Should return True when no failures."""
        evaluation = BedCandidateEvaluation(
            bed_id=1,
            bed_number="B-001",
            ward_id=1,
            ward_name="Test Ward",
            ward_code="TEST-01",
            matched_constraints=["constraint_a", "constraint_b"],
        )
        assert evaluation.passed_all_constraints is True

    def test_passed_all_constraints_false_with_failed(self):
        """Should return False when failed constraints exist."""
        evaluation = BedCandidateEvaluation(
            bed_id=1,
            bed_number="B-001",
            ward_id=1,
            ward_name="Test Ward",
            ward_code="TEST-01",
            failed_constraints=["constraint_a"],
        )
        assert evaluation.passed_all_constraints is False

    def test_passed_all_constraints_false_with_violations(self):
        """Should return False when compatibility violations exist."""
        evaluation = BedCandidateEvaluation(
            bed_id=1,
            bed_number="B-001",
            ward_id=1,
            ward_name="Test Ward",
            ward_code="TEST-01",
            compatibility_violations=[{"code": "GENDER_MISMATCH"}],
        )
        assert evaluation.passed_all_constraints is False

    def test_to_dict(self):
        """Should correctly serialize to dictionary."""
        evaluation = BedCandidateEvaluation(
            bed_id=1,
            bed_number="B-001",
            ward_id=2,
            ward_name="Test Ward",
            ward_code="TEST-01",
            score=85.5,
        )
        result = evaluation.to_dict()

        assert result["bed_id"] == 1
        assert result["bed_number"] == "B-001"
        assert result["ward_id"] == 2
        assert result["score"] == 85.5


# =============================================================================
# BedAssignmentRuleEvaluator Tests
# =============================================================================


@pytest.mark.django_db
class TestBedAssignmentRuleEvaluator:
    """Tests for BedAssignmentRuleEvaluator service."""

    def test_evaluate_general_ward_success(
        self, evaluator, female_patient, general_ward, test_user
    ):
        """Should successfully assign bed in general ward."""
        result = evaluator.evaluate_beds_for_patient(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
        )

        assert result.success is True
        assert result.assigned_bed is not None
        assert result.assigned_bed.ward == general_ward
        assert result.assigned_bed.status == "AVAILABLE"  # Not marked occupied by evaluator
        assert result.decision is not None
        assert result.decision.decision_outcome == "ASSIGNED"
        assert len(result.candidates_evaluated) > 0

    def test_evaluate_no_beds_available(
        self, evaluator, female_patient, ward_with_no_beds, test_user
    ):
        """Should return failure when no beds available."""
        result = evaluator.evaluate_beds_for_patient(
            patient=female_patient,
            ward=ward_with_no_beds,
            user=test_user,
        )

        assert result.success is False
        assert result.assigned_bed is None
        assert result.decision is not None
        assert result.decision.decision_outcome == "UNASSIGNED"
        assert "No available beds" in result.decision.decision_reason

    def test_gender_constraint_maternity(self, evaluator, male_patient, maternity_ward, test_user):
        """Should fail male patient for maternity ward."""
        result = evaluator.evaluate_beds_for_patient(
            patient=male_patient,
            ward=maternity_ward,
            user=test_user,
        )

        # Should have compatibility violations
        assert any(
            "GENDER_MISMATCH" in str(e.compatibility_violations)
            for e in result.candidates_evaluated
        )

    def test_gender_constraint_passes_for_female(
        self, evaluator, female_patient, maternity_ward, test_user
    ):
        """Should pass female patient for maternity ward."""
        result = evaluator.evaluate_beds_for_patient(
            patient=female_patient,
            ward=maternity_ward,
            user=test_user,
        )

        assert result.success is True
        assert result.assigned_bed is not None

    def test_pediatric_age_constraint(self, evaluator, male_patient, pediatric_ward, test_user):
        """Should fail adult patient for pediatric ward."""
        # male_patient is 40 years old, too old for pediatric
        result = evaluator.evaluate_beds_for_patient(
            patient=male_patient,
            ward=pediatric_ward,
            user=test_user,
        )

        # Should have age-related violations
        violations = [v for e in result.candidates_evaluated for v in e.compatibility_violations]
        assert any("AGE" in str(v) for v in violations)

    def test_pediatric_accepts_child(self, evaluator, child_patient, pediatric_ward, test_user):
        """Should accept child patient for pediatric ward."""
        result = evaluator.evaluate_beds_for_patient(
            patient=child_patient,
            ward=pediatric_ward,
            user=test_user,
        )

        assert result.success is True
        assert result.assigned_bed is not None

    def test_isolation_requirement(self, evaluator, female_patient, general_ward, test_user):
        """Should fail when isolation required but ward not capable."""
        result = evaluator.evaluate_beds_for_patient(
            patient=female_patient,
            ward=general_ward,
            requires_isolation=True,
            user=test_user,
        )

        # General ward is not isolation-capable
        assert result.success is False or any(
            "ISOLATION" in str(e.compatibility_violations) for e in result.candidates_evaluated
        )

    def test_isolation_passes_for_capable_ward(
        self, evaluator, female_patient, isolation_ward, test_user
    ):
        """Should succeed when isolation-capable ward used."""
        result = evaluator.evaluate_beds_for_patient(
            patient=female_patient,
            ward=isolation_ward,
            requires_isolation=True,
            user=test_user,
        )

        assert result.success is True
        assert result.assigned_bed is not None

    def test_oxygen_requirement(self, evaluator, male_patient, test_user):
        """Should add oxygen requirement to context."""
        # Create a ward without oxygen
        ward = Ward.objects.create(
            name="No Oxygen Ward",
            code="NO-O2-01",
            ward_type="MEDICAL",
            capacity=2,
            daily_rate=Decimal("1000.00"),
            is_active=True,
            oxygen_equipped=False,
        )

        result = evaluator.evaluate_beds_for_patient(
            patient=male_patient,
            ward=ward,
            requires_oxygen=True,
            user=test_user,
        )

        # Should fail because ward lacks oxygen
        assert result.success is False
        assert any(
            any(v.get("code") == "OXYGEN_REQUIRED" for v in e.compatibility_violations)
            for e in result.candidates_evaluated
        )

    def test_rule_applied_when_matching(
        self, evaluator, female_patient, general_ward, general_ward_rule, test_user
    ):
        """Should apply matching rule to evaluation."""
        result = evaluator.evaluate_beds_for_patient(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
        )

        assert result.success is True
        assert result.rule_applied == general_ward_rule
        assert result.decision.rule_applied == general_ward_rule

    def test_decision_logged_to_database(self, evaluator, female_patient, general_ward, test_user):
        """Should create AssignmentDecision record."""
        initial_count = AssignmentDecision.objects.count()

        result = evaluator.evaluate_beds_for_patient(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
        )

        assert AssignmentDecision.objects.count() == initial_count + 1
        assert result.decision.assignment_type == "BED_ASSIGNMENT"
        assert result.decision.target_type == "Patient"
        assert result.decision.target_id == female_patient.id
        assert result.decision.triggered_by == test_user

    def test_evaluation_time_recorded(self, evaluator, female_patient, general_ward, test_user):
        """Should record evaluation time in milliseconds."""
        result = evaluator.evaluate_beds_for_patient(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
        )

        assert result.evaluation_time_ms >= 0
        assert result.decision.evaluation_time_ms >= 0

    def test_scoring_applied_correctly(
        self, evaluator, female_patient, general_ward, general_ward_rule, test_user
    ):
        """Should apply scoring rules from rule definition."""
        result = evaluator.evaluate_beds_for_patient(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
        )

        # Should have scoring details in the best candidate
        if result.candidates_evaluated:
            passing = [e for e in result.candidates_evaluated if e.passed_all_constraints]
            if passing:
                assert passing[0].scoring_breakdown


# =============================================================================
# BedAssignmentService Integration Tests
# =============================================================================


@pytest.mark.django_db
class TestBedAssignmentServiceRuleBased:
    """Tests for rule-based method in BedAssignmentService."""

    def test_rule_based_assign_marks_bed_occupied(self, female_patient, general_ward, test_user):
        """Should mark bed as occupied when mark_as_occupied=True."""
        from hmis.apps.inpatient.services.bed_assignment import bed_assignment_service

        result = bed_assignment_service.rule_based_assign_bed(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
            mark_as_occupied=True,
        )

        assert result.success is True
        result.assigned_bed.refresh_from_db()
        assert result.assigned_bed.status == "OCCUPIED"

    def test_rule_based_assign_without_marking_occupied(
        self, female_patient, general_ward, test_user
    ):
        """Should NOT mark bed as occupied when mark_as_occupied=False."""
        from hmis.apps.inpatient.services.bed_assignment import bed_assignment_service

        result = bed_assignment_service.rule_based_assign_bed(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
            mark_as_occupied=False,
        )

        assert result.success is True
        result.assigned_bed.refresh_from_db()
        assert result.assigned_bed.status == "AVAILABLE"


# =============================================================================
# API Endpoint Tests
# =============================================================================


@pytest.mark.django_db
class TestRecommendBedAPI:
    """Tests for the recommend_bed API endpoint."""

    def test_recommend_bed_requires_auth(self, api_client, general_ward, female_patient):
        """Should require authentication."""
        response = api_client.post(
            f"/api/inpatient/wards/{general_ward.id}/recommend_bed/",
            {"patient_id": female_patient.id},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_recommend_bed_success(self, authenticated_client, general_ward, female_patient):
        """Should return recommended bed."""
        response = authenticated_client.post(
            f"/api/inpatient/wards/{general_ward.id}/recommend_bed/",
            {"patient_id": female_patient.id},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["assigned_bed_id"] is not None
        assert response.data["assigned_bed_number"] is not None
        assert response.data["decision_id"] is not None
        assert response.data["decision_outcome"] == "ASSIGNED"

    def test_recommend_bed_patient_not_found(self, authenticated_client, general_ward):
        """Should return 404 for non-existent patient."""
        response = authenticated_client.post(
            f"/api/inpatient/wards/{general_ward.id}/recommend_bed/",
            {"patient_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_recommend_bed_with_requirements(self, authenticated_client, icu_ward, female_patient):
        """Should handle equipment requirements."""
        response = authenticated_client.post(
            f"/api/inpatient/wards/{icu_ward.id}/recommend_bed/",
            {
                "patient_id": female_patient.id,
                "requires_oxygen": True,
                "requires_ventilator": True,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        # ICU ward has oxygen and ventilator, should succeed
        assert response.data["success"] is True

    def test_recommend_bed_does_not_mark_occupied(
        self, authenticated_client, general_ward, female_patient
    ):
        """Should only recommend, not occupy the bed."""
        response = authenticated_client.post(
            f"/api/inpatient/wards/{general_ward.id}/recommend_bed/",
            {"patient_id": female_patient.id},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        bed_id = response.data["assigned_bed_id"]

        # Verify bed is still available
        bed = Bed.objects.get(id=bed_id)
        assert bed.status == "AVAILABLE"

    def test_recommend_bed_returns_candidates(
        self, authenticated_client, general_ward, female_patient
    ):
        """Should return all evaluated candidates."""
        response = authenticated_client.post(
            f"/api/inpatient/wards/{general_ward.id}/recommend_bed/",
            {"patient_id": female_patient.id},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "candidates_evaluated" in response.data
        assert len(response.data["candidates_evaluated"]) > 0

    def test_recommend_bed_no_beds_available(
        self, authenticated_client, ward_with_no_beds, female_patient
    ):
        """Should return failure when no beds available."""
        response = authenticated_client.post(
            f"/api/inpatient/wards/{ward_with_no_beds.id}/recommend_bed/",
            {"patient_id": female_patient.id},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is False
        assert response.data["assigned_bed_id"] is None
        assert response.data["decision_outcome"] == "UNASSIGNED"


# =============================================================================
# Management Command Tests
# =============================================================================


@pytest.mark.django_db
class TestSeedBedAssignmentRulesCommand:
    """Tests for the seed_bed_assignment_rules management command."""

    def test_create_default_rules(self):
        """Should create default rules."""
        from django.core.management import call_command

        initial_count = AssignmentRule.objects.filter(applies_to="BED_ASSIGNMENT").count()

        call_command("seed_bed_assignment_rules")

        # Should have created rules
        final_count = AssignmentRule.objects.filter(applies_to="BED_ASSIGNMENT").count()
        assert final_count > initial_count

    def test_dry_run_does_not_create(self):
        """Should not create rules in dry-run mode."""
        from django.core.management import call_command

        # Clear any existing rules
        AssignmentRule.objects.filter(applies_to="BED_ASSIGNMENT").delete()
        initial_count = 0

        call_command("seed_bed_assignment_rules", "--dry-run")

        final_count = AssignmentRule.objects.filter(applies_to="BED_ASSIGNMENT").count()
        assert final_count == initial_count

    def test_force_updates_existing(self):
        """Should update existing rules when --force is used."""
        from django.core.management import call_command

        # Create a rule first
        call_command("seed_bed_assignment_rules")

        rule = AssignmentRule.objects.get(rule_code="bed_assign_general")
        original_version = rule.version

        # Force update
        call_command("seed_bed_assignment_rules", "--force")

        rule.refresh_from_db()
        assert rule.version == original_version + 1
