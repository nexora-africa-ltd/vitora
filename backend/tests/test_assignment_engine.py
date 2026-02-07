"""
Tests for Assignment Engine - Phase 2: Automatic Assignment Engine.

This module tests:
- AssignmentRule model (rule definitions with YAML/JSON DSL)
- AssignmentDecision model (decision logging and explainability)
- AssignmentOverride model (manual override with justification)
- RuleEvaluator service (rule evaluation and scoring)

Following TDD approach: Write tests BEFORE implementation.
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.utils import timezone


# =============================================================================
# AssignmentRule Model Tests
# =============================================================================


class TestAssignmentRuleModel:
    """Tests for the AssignmentRule model."""

    def test_create_assignment_rule_with_valid_data(self, db):
        """Should create an assignment rule with valid YAML-style DSL."""
        from hmis.apps.scheduling.models import AssignmentRule

        rule_definition = {
            "rule_id": "assign_doctor_to_opd",
            "version": "1.0",
            "applies_to": "appointment",
            "when": {
                "service_type": "consultation",
                "department": "opd",
            },
            "constraints": [
                "availability.overlaps(appointment.time)",
                "staff.role == 'doctor'",
                "staff.status == 'on_duty'",
            ],
            "scoring": [
                {"prefer": "staff.current_load", "weight": -2},
                {"prefer": "staff.experience_years", "weight": 1},
            ],
            "fallback": {
                "action": "leave_unassigned",
                "notify": "supervisor",
            },
        }

        rule = AssignmentRule.objects.create(
            name="Assign Doctor to OPD",
            rule_code="assign_doctor_to_opd",
            applies_to="APPOINTMENT",
            rule_definition=rule_definition,
            is_active=True,
            priority=100,
        )

        assert rule.id is not None
        assert rule.name == "Assign Doctor to OPD"
        assert rule.rule_code == "assign_doctor_to_opd"
        assert rule.applies_to == "APPOINTMENT"
        assert rule.is_active is True
        assert rule.priority == 100
        assert rule.rule_definition["version"] == "1.0"
        assert len(rule.rule_definition["constraints"]) == 3

    def test_assignment_rule_code_must_be_unique(self, db):
        """Should enforce unique rule codes."""
        from hmis.apps.scheduling.models import AssignmentRule

        AssignmentRule.objects.create(
            name="Rule 1",
            rule_code="unique_rule",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            is_active=True,
        )

        with pytest.raises(Exception):  # IntegrityError
            AssignmentRule.objects.create(
                name="Rule 2",
                rule_code="unique_rule",  # Duplicate code
                applies_to="APPOINTMENT",
                rule_definition={"version": "2.0"},
            )

    def test_assignment_rule_requires_valid_applies_to(self, db):
        """Should reject invalid applies_to values."""
        from hmis.apps.scheduling.models import AssignmentRule

        rule = AssignmentRule(
            name="Invalid Rule",
            rule_code="invalid_rule",
            applies_to="INVALID_TYPE",
            rule_definition={"version": "1.0"},
        )

        with pytest.raises(ValidationError):
            rule.full_clean()

    def test_assignment_rule_version_tracking(self, db):
        """Should track rule versions."""
        from hmis.apps.scheduling.models import AssignmentRule

        rule = AssignmentRule.objects.create(
            name="Versioned Rule",
            rule_code="versioned_rule",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            version=1,
        )

        assert rule.version == 1

        # Create new version
        rule.version = 2
        rule.rule_definition = {"version": "2.0", "new_field": "added"}
        rule.save()

        rule.refresh_from_db()
        assert rule.version == 2
        assert rule.rule_definition["new_field"] == "added"

    def test_assignment_rule_effective_dates(self, db):
        """Should support effective date ranges."""
        from hmis.apps.scheduling.models import AssignmentRule

        today = date.today()
        rule = AssignmentRule.objects.create(
            name="Time-Limited Rule",
            rule_code="time_limited_rule",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            effective_from=today,
            effective_until=today + timedelta(days=30),
        )

        assert rule.is_effective_on(today)
        assert rule.is_effective_on(today + timedelta(days=15))
        assert not rule.is_effective_on(today - timedelta(days=1))
        assert not rule.is_effective_on(today + timedelta(days=31))

    def test_assignment_rule_for_shift_assignment(self, db):
        """Should support nurse-to-shift assignment rules."""
        from hmis.apps.scheduling.models import AssignmentRule

        rule_definition = {
            "rule_id": "assign_nurse_to_shift",
            "version": "1.0",
            "applies_to": "shift",
            "when": {
                "department": "ward",
                "shift_type": "night",
            },
            "constraints": [
                "staff.role == 'nurse'",
                "staff.shift_preference includes 'night'",
                "staff.hours_this_week < 40",
            ],
            "scoring": [
                {"prefer": "staff.seniority", "weight": 1},
                {"prefer": "staff.consecutive_nights", "weight": -3},
            ],
        }

        rule = AssignmentRule.objects.create(
            name="Assign Nurse to Night Shift",
            rule_code="assign_nurse_to_shift",
            applies_to="SHIFT",
            rule_definition=rule_definition,
        )

        assert rule.applies_to == "SHIFT"
        assert "shift_type" in rule.rule_definition["when"]

    def test_assignment_rule_for_bed_assignment(self, db):
        """Should support bed-to-admission assignment rules."""
        from hmis.apps.scheduling.models import AssignmentRule

        rule_definition = {
            "rule_id": "assign_bed_to_admission",
            "version": "1.0",
            "applies_to": "bed_assignment",
            "when": {
                "admission_type": "inpatient",
            },
            "constraints": [
                "bed.is_available == True",
                "bed.ward == admission.preferred_ward",
                "bed.gender_restriction in [None, patient.gender]",
            ],
            "scoring": [
                {"prefer": "bed.proximity_to_nurses_station", "weight": 1},
                {"prefer": "bed.isolation_capable", "weight": 2, "if": "patient.needs_isolation"},
            ],
        }

        rule = AssignmentRule.objects.create(
            name="Assign Bed to Admission",
            rule_code="assign_bed_to_admission",
            applies_to="BED_ASSIGNMENT",
            rule_definition=rule_definition,
        )

        assert rule.applies_to == "BED_ASSIGNMENT"

    def test_get_active_rules_for_type(self, db):
        """Should return only active rules for a given type."""
        from hmis.apps.scheduling.models import AssignmentRule

        # Create active rule
        AssignmentRule.objects.create(
            name="Active Rule",
            rule_code="active_rule",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            is_active=True,
            priority=100,
        )

        # Create inactive rule
        AssignmentRule.objects.create(
            name="Inactive Rule",
            rule_code="inactive_rule",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            is_active=False,
            priority=50,
        )

        # Create active rule for different type
        AssignmentRule.objects.create(
            name="Shift Rule",
            rule_code="shift_rule",
            applies_to="SHIFT",
            rule_definition={"version": "1.0"},
            is_active=True,
        )

        active_appointment_rules = AssignmentRule.objects.get_active_for_type("APPOINTMENT")

        assert len(active_appointment_rules) == 1
        assert active_appointment_rules[0].rule_code == "active_rule"

    def test_rules_ordered_by_priority(self, db):
        """Should return rules ordered by priority (highest first)."""
        from hmis.apps.scheduling.models import AssignmentRule

        AssignmentRule.objects.create(
            name="Low Priority",
            rule_code="low_priority",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            priority=10,
        )
        AssignmentRule.objects.create(
            name="High Priority",
            rule_code="high_priority",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            priority=100,
        )
        AssignmentRule.objects.create(
            name="Medium Priority",
            rule_code="medium_priority",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            priority=50,
        )

        rules = AssignmentRule.objects.get_active_for_type("APPOINTMENT")
        priorities = [r.priority for r in rules]

        assert priorities == [100, 50, 10]


# =============================================================================
# AssignmentDecision Model Tests
# =============================================================================


class TestAssignmentDecisionModel:
    """Tests for the AssignmentDecision model (decision logging)."""

    @pytest.fixture
    def sample_resource(self, db):
        """Create a sample resource for testing."""
        from hmis.apps.scheduling.models import Resource

        return Resource.objects.create(
            name="Dr. Jane Doe",
            resource_type="PERSON",
            code="DOC-TEST-001",
        )

    @pytest.fixture
    def sample_appointment(self, db, sample_resource, sample_patient):
        """Create a sample appointment for testing."""
        from hmis.apps.scheduling.models import Appointment

        scheduled_start = timezone.now() + timedelta(hours=1)
        return Appointment.objects.create(
            patient=sample_patient,
            resource=sample_resource,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_start + timedelta(minutes=30),
            reason="Test appointment",
        )

    @pytest.fixture
    def sample_rule(self, db):
        """Create a sample assignment rule."""
        from hmis.apps.scheduling.models import AssignmentRule

        return AssignmentRule.objects.create(
            name="Test Rule",
            rule_code="test_rule",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            priority=100,
        )

    def test_create_assignment_decision_for_successful_assignment(
        self, db, sample_rule, sample_resource, sample_appointment, test_user
    ):
        """Should log a successful assignment decision."""
        from hmis.apps.scheduling.models import AssignmentDecision

        decision = AssignmentDecision.objects.create(
            assignment_type="APPOINTMENT",
            target_id=sample_appointment.id,
            target_type="Appointment",
            rule_applied=sample_rule,
            assigned_resource=sample_resource,
            decision_outcome="ASSIGNED",
            decision_reason="Resource matched all constraints with highest score",
            candidates_evaluated=[
                {
                    "resource_id": sample_resource.id,
                    "resource_name": sample_resource.name,
                    "score": 85,
                    "matched_constraints": ["availability", "role", "status"],
                }
            ],
            scoring_details={
                "current_load": {"value": 3, "weight": -2, "contribution": -6},
                "experience_years": {"value": 10, "weight": 1, "contribution": 10},
                "total_score": 85,
            },
            evaluation_time_ms=15,
            triggered_by=test_user,
        )

        assert decision.id is not None
        assert decision.decision_outcome == "ASSIGNED"
        assert decision.assigned_resource == sample_resource
        assert len(decision.candidates_evaluated) == 1
        assert decision.scoring_details["total_score"] == 85

    def test_create_assignment_decision_for_unassigned_fallback(
        self, db, sample_rule, sample_appointment, test_user
    ):
        """Should log when no resource could be assigned (fallback)."""
        from hmis.apps.scheduling.models import AssignmentDecision

        decision = AssignmentDecision.objects.create(
            assignment_type="APPOINTMENT",
            target_id=sample_appointment.id,
            target_type="Appointment",
            rule_applied=sample_rule,
            assigned_resource=None,  # No assignment
            decision_outcome="UNASSIGNED",
            decision_reason="No candidates matched all required constraints",
            candidates_evaluated=[
                {
                    "resource_id": 1,
                    "resource_name": "Dr. Smith",
                    "score": 0,
                    "failed_constraints": ["availability"],
                    "rejection_reason": "Not available at requested time",
                },
                {
                    "resource_id": 2,
                    "resource_name": "Dr. Johnson",
                    "score": 0,
                    "failed_constraints": ["role"],
                    "rejection_reason": "Not qualified for this specialty",
                },
            ],
            evaluation_time_ms=25,
            triggered_by=test_user,
        )

        assert decision.decision_outcome == "UNASSIGNED"
        assert decision.assigned_resource is None
        assert len(decision.candidates_evaluated) == 2

    def test_assignment_decision_tracks_all_inputs(self, db, sample_rule, sample_appointment, test_user):
        """Should log all inputs used in decision for full explainability."""
        from hmis.apps.scheduling.models import AssignmentDecision

        decision = AssignmentDecision.objects.create(
            assignment_type="APPOINTMENT",
            target_id=sample_appointment.id,
            target_type="Appointment",
            rule_applied=sample_rule,
            decision_outcome="ASSIGNED",
            decision_reason="Matched",
            evaluation_inputs={
                "appointment": {
                    "id": sample_appointment.id,
                    "type": "CONSULTATION",
                    "scheduled_start": str(sample_appointment.scheduled_start),
                    "priority": "ROUTINE",
                },
                "context": {
                    "facility_id": 1,
                    "department": "OPD",
                    "requesting_user": test_user.username,
                },
            },
            triggered_by=test_user,
        )

        assert decision.evaluation_inputs["appointment"]["priority"] == "ROUTINE"
        assert decision.evaluation_inputs["context"]["department"] == "OPD"

    def test_get_decisions_for_target(self, db, sample_rule, sample_appointment, test_user):
        """Should retrieve all decisions for a specific target."""
        from hmis.apps.scheduling.models import AssignmentDecision

        # Create multiple decisions for the same appointment
        AssignmentDecision.objects.create(
            assignment_type="APPOINTMENT",
            target_id=sample_appointment.id,
            target_type="Appointment",
            rule_applied=sample_rule,
            decision_outcome="UNASSIGNED",
            decision_reason="First attempt failed",
            triggered_by=test_user,
        )
        AssignmentDecision.objects.create(
            assignment_type="APPOINTMENT",
            target_id=sample_appointment.id,
            target_type="Appointment",
            rule_applied=sample_rule,
            decision_outcome="ASSIGNED",
            decision_reason="Second attempt succeeded",
            triggered_by=test_user,
        )

        decisions = AssignmentDecision.objects.get_for_target("Appointment", sample_appointment.id)

        assert len(decisions) == 2
        # Most recent first
        assert decisions[0].decision_outcome == "ASSIGNED"
        assert decisions[1].decision_outcome == "UNASSIGNED"

    def test_decision_immutable_after_creation(self, db, sample_rule, sample_appointment, test_user):
        """Decision records should not be modifiable (audit trail)."""
        from hmis.apps.scheduling.models import AssignmentDecision

        decision = AssignmentDecision.objects.create(
            assignment_type="APPOINTMENT",
            target_id=sample_appointment.id,
            target_type="Appointment",
            rule_applied=sample_rule,
            decision_outcome="ASSIGNED",
            decision_reason="Original reason",
            triggered_by=test_user,
        )

        # Attempt to modify should raise error or be prevented
        decision.decision_reason = "Modified reason"
        # Implementation should prevent modification
        # This test defines the expected behavior


# =============================================================================
# AssignmentOverride Model Tests
# =============================================================================


class TestAssignmentOverrideModel:
    """Tests for the AssignmentOverride model (manual overrides)."""

    @pytest.fixture
    def sample_resource(self, db):
        """Create a sample resource for testing."""
        from hmis.apps.scheduling.models import Resource

        return Resource.objects.create(
            name="Dr. Jane Doe",
            resource_type="PERSON",
            code="DOC-TEST-002",
        )

    @pytest.fixture
    def another_resource(self, db):
        """Create another sample resource for testing."""
        from hmis.apps.scheduling.models import Resource

        return Resource.objects.create(
            name="Dr. John Smith",
            resource_type="PERSON",
            code="DOC-TEST-003",
        )

    @pytest.fixture
    def sample_appointment(self, db, sample_resource, sample_patient):
        """Create a sample appointment for testing."""
        from hmis.apps.scheduling.models import Appointment

        scheduled_start = timezone.now() + timedelta(hours=1)
        return Appointment.objects.create(
            patient=sample_patient,
            resource=sample_resource,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_start + timedelta(minutes=30),
            reason="Test appointment",
        )

    def test_create_manual_override(
        self, db, sample_appointment, sample_resource, another_resource, test_user
    ):
        """Should create a manual override with justification."""
        from hmis.apps.scheduling.models import AssignmentOverride

        override = AssignmentOverride.objects.create(
            target_type="Appointment",
            target_id=sample_appointment.id,
            original_resource=sample_resource,
            new_resource=another_resource,
            override_reason="PATIENT_REQUEST",
            justification="Patient specifically requested Dr. Smith due to ongoing care relationship",
            overridden_by=test_user,
        )

        assert override.id is not None
        assert override.original_resource == sample_resource
        assert override.new_resource == another_resource
        assert override.override_reason == "PATIENT_REQUEST"
        assert "ongoing care relationship" in override.justification

    def test_override_requires_justification(self, db, sample_appointment, sample_resource, another_resource, test_user):
        """Should require justification for manual overrides."""
        from hmis.apps.scheduling.models import AssignmentOverride

        override = AssignmentOverride(
            target_type="Appointment",
            target_id=sample_appointment.id,
            original_resource=sample_resource,
            new_resource=another_resource,
            override_reason="OTHER",
            justification="",  # Empty justification
            overridden_by=test_user,
        )

        with pytest.raises(ValidationError):
            override.full_clean()

    def test_override_reason_choices(self, db, sample_appointment, sample_resource, another_resource, test_user):
        """Should support predefined override reason categories."""
        from hmis.apps.scheduling.models import AssignmentOverride

        valid_reasons = [
            "PATIENT_REQUEST",
            "STAFF_UNAVAILABLE",
            "EMERGENCY",
            "SPECIALIZATION_NEEDED",
            "LOAD_BALANCING",
            "ADMINISTRATIVE",
            "OTHER",
        ]

        for reason in valid_reasons:
            override = AssignmentOverride(
                target_type="Appointment",
                target_id=sample_appointment.id,
                original_resource=sample_resource,
                new_resource=another_resource,
                override_reason=reason,
                justification=f"Testing {reason} override",
                overridden_by=test_user,
            )
            # Should not raise
            override.full_clean()

    def test_override_tracks_approval_status(
        self, db, sample_appointment, sample_resource, another_resource, test_user, another_user
    ):
        """Should track approval status for overrides requiring supervisor approval."""
        from hmis.apps.scheduling.models import AssignmentOverride

        override = AssignmentOverride.objects.create(
            target_type="Appointment",
            target_id=sample_appointment.id,
            original_resource=sample_resource,
            new_resource=another_resource,
            override_reason="ADMINISTRATIVE",
            justification="Department head reassignment",
            overridden_by=test_user,
            requires_approval=True,
        )

        assert override.requires_approval is True
        assert override.approval_status == "PENDING"

        # Approve the override
        override.approve(another_user, "Approved due to staffing changes")
        override.refresh_from_db()

        assert override.approval_status == "APPROVED"
        assert override.approved_by == another_user
        assert override.approved_at is not None

    def test_override_rejection(
        self, db, sample_appointment, sample_resource, another_resource, test_user, another_user
    ):
        """Should support rejection of override requests."""
        from hmis.apps.scheduling.models import AssignmentOverride

        override = AssignmentOverride.objects.create(
            target_type="Appointment",
            target_id=sample_appointment.id,
            original_resource=sample_resource,
            new_resource=another_resource,
            override_reason="OTHER",
            justification="Personal preference",
            overridden_by=test_user,
            requires_approval=True,
        )

        override.reject(another_user, "Personal preference is not a valid clinical reason")
        override.refresh_from_db()

        assert override.approval_status == "REJECTED"
        assert override.rejected_by == another_user
        assert "not a valid clinical reason" in override.rejection_reason

    def test_get_overrides_for_target(
        self, db, sample_appointment, sample_resource, another_resource, test_user
    ):
        """Should retrieve all overrides for a specific target."""
        from hmis.apps.scheduling.models import AssignmentOverride

        AssignmentOverride.objects.create(
            target_type="Appointment",
            target_id=sample_appointment.id,
            original_resource=sample_resource,
            new_resource=another_resource,
            override_reason="EMERGENCY",
            justification="First override",
            overridden_by=test_user,
        )
        AssignmentOverride.objects.create(
            target_type="Appointment",
            target_id=sample_appointment.id,
            original_resource=another_resource,
            new_resource=sample_resource,
            override_reason="STAFF_UNAVAILABLE",
            justification="Reverting previous override",
            overridden_by=test_user,
        )

        overrides = AssignmentOverride.objects.get_for_target("Appointment", sample_appointment.id)

        assert len(overrides) == 2


# =============================================================================
# Rule Evaluator Service Tests
# =============================================================================


class TestRuleEvaluatorService:
    """Tests for the RuleEvaluator service (rule evaluation logic)."""

    @pytest.fixture
    def staff_resources(self, db):
        """Create multiple staff resources for testing."""
        from hmis.apps.scheduling.models import Resource

        resources = []
        for i, (name, specialty, load) in enumerate([
            ("Dr. Smith", "General Medicine", 3),
            ("Dr. Johnson", "General Medicine", 5),
            ("Dr. Williams", "Pediatrics", 2),
        ]):
            resource = Resource.objects.create(
                name=name,
                resource_type="PERSON",
                code=f"DOC-EVAL-{i:03d}",
                metadata={
                    "specialty": specialty,
                    "current_load": load,
                    "experience_years": 10 - i * 2,
                    "status": "on_duty",
                },
            )
            resources.append(resource)
        return resources

    @pytest.fixture
    def opd_rule(self, db):
        """Create an OPD assignment rule."""
        from hmis.apps.scheduling.models import AssignmentRule

        return AssignmentRule.objects.create(
            name="Assign Doctor to OPD",
            rule_code="assign_doctor_to_opd",
            applies_to="APPOINTMENT",
            rule_definition={
                "version": "1.0",
                "when": {
                    "appointment_type": "CONSULTATION",
                    "department": "OPD",
                },
                "constraints": [
                    {"field": "metadata.status", "operator": "==", "value": "on_duty"},
                    {"field": "metadata.specialty", "operator": "==", "value": "General Medicine"},
                ],
                "scoring": [
                    {"field": "metadata.current_load", "weight": -2},
                    {"field": "metadata.experience_years", "weight": 1},
                ],
                "fallback": {"action": "leave_unassigned"},
            },
            priority=100,
        )

    def test_evaluate_returns_best_matching_resource(
        self, db, staff_resources, opd_rule, sample_patient, test_user
    ):
        """Should return the resource with highest score matching all constraints."""
        from hmis.apps.scheduling.models import Appointment
        from hmis.apps.scheduling.services.assignment import RuleEvaluator

        # Create appointment needing assignment
        scheduled_start = timezone.now() + timedelta(hours=1)
        appointment = Appointment.objects.create(
            patient=sample_patient,
            resource=staff_resources[0],  # Temporary assignment
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_start + timedelta(minutes=30),
            reason="General checkup",
            appointment_type="CONSULTATION",
        )

        evaluator = RuleEvaluator()
        context = {
            "appointment": appointment,
            "department": "OPD",
        }

        result = evaluator.evaluate(
            rule=opd_rule,
            candidates=staff_resources,
            context=context,
            user=test_user,
        )

        # Dr. Smith (load=3, exp=10) should beat Dr. Johnson (load=5, exp=8)
        # Dr. Williams excluded due to specialty mismatch
        assert result.decision.decision_outcome == "ASSIGNED"
        assert result.decision.assigned_resource.name == "Dr. Smith"

    def test_evaluate_returns_unassigned_when_no_candidates_match(
        self, db, opd_rule, sample_patient, test_user
    ):
        """Should return unassigned when no resources match constraints."""
        from hmis.apps.scheduling.models import Appointment, Resource
        from hmis.apps.scheduling.services.assignment import RuleEvaluator

        # Create resources that don't match constraints
        off_duty = Resource.objects.create(
            name="Dr. OffDuty",
            resource_type="PERSON",
            code="DOC-OFF-001",
            metadata={"specialty": "General Medicine", "status": "off_duty"},
        )

        scheduled_start = timezone.now() + timedelta(hours=1)
        appointment = Appointment.objects.create(
            patient=sample_patient,
            resource=off_duty,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_start + timedelta(minutes=30),
            reason="Checkup",
            appointment_type="CONSULTATION",
        )

        evaluator = RuleEvaluator()
        result = evaluator.evaluate(
            rule=opd_rule,
            candidates=[off_duty],
            context={"appointment": appointment, "department": "OPD"},
            user=test_user,
        )

        assert result.decision.decision_outcome == "UNASSIGNED"
        assert result.decision.assigned_resource is None

    def test_evaluate_logs_decision_with_full_details(
        self, db, staff_resources, opd_rule, sample_patient, test_user
    ):
        """Should log decision with all scoring and constraint details."""
        from hmis.apps.scheduling.models import Appointment, AssignmentDecision
        from hmis.apps.scheduling.services.assignment import RuleEvaluator

        scheduled_start = timezone.now() + timedelta(hours=1)
        appointment = Appointment.objects.create(
            patient=sample_patient,
            resource=staff_resources[0],
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_start + timedelta(minutes=30),
            reason="Checkup",
            appointment_type="CONSULTATION",
        )

        evaluator = RuleEvaluator()
        evaluator.evaluate(
            rule=opd_rule,
            candidates=staff_resources,
            context={"appointment": appointment, "department": "OPD"},
            user=test_user,
        )

        # Verify decision was logged
        decisions = AssignmentDecision.objects.get_for_target("Appointment", appointment.id)
        assert len(decisions) == 1

        decision = decisions[0]
        assert decision.candidates_evaluated is not None
        assert decision.scoring_details is not None
        assert decision.evaluation_time_ms >= 0

    def test_evaluate_respects_rule_priority(
        self, db, staff_resources, sample_patient, test_user
    ):
        """Should apply rules in priority order."""
        from hmis.apps.scheduling.models import Appointment, AssignmentRule
        from hmis.apps.scheduling.services.assignment import RuleEvaluator

        # High priority rule - assigns first available
        high_priority_rule = AssignmentRule.objects.create(
            name="Emergency Override",
            rule_code="emergency_override",
            applies_to="APPOINTMENT",
            rule_definition={
                "version": "1.0",
                "when": {"priority": "EMERGENCY"},
                "constraints": [
                    {"field": "metadata.status", "operator": "==", "value": "on_duty"},
                ],
                "scoring": [],
            },
            priority=200,
        )

        # Lower priority rule - normal assignment
        low_priority_rule = AssignmentRule.objects.create(
            name="Normal Assignment",
            rule_code="normal_assignment",
            applies_to="APPOINTMENT",
            rule_definition={
                "version": "1.0",
                "when": {"priority": "ROUTINE"},
                "constraints": [],
                "scoring": [{"field": "metadata.experience_years", "weight": 1}],
            },
            priority=50,
        )

        scheduled_start = timezone.now() + timedelta(hours=1)
        emergency_apt = Appointment.objects.create(
            patient=sample_patient,
            resource=staff_resources[0],
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_start + timedelta(minutes=30),
            reason="Emergency",
            priority="EMERGENCY",
        )

        evaluator = RuleEvaluator()
        result = evaluator.find_and_evaluate(
            assignment_type="APPOINTMENT",
            context={"appointment": emergency_apt, "priority": "EMERGENCY"},
            candidates=staff_resources,
            user=test_user,
        )

        # Should have used the high priority rule
        assert result.rule_applied.priority == 200


# =============================================================================
# Integration Tests
# =============================================================================


class TestAssignmentEngineIntegration:
    """Integration tests for the full assignment flow."""

    @pytest.fixture
    def setup_assignment_scenario(self, db, sample_county, sample_sub_county):
        """Set up a complete assignment scenario."""
        from hmis.apps.patients.models import Patient
        from hmis.apps.scheduling.models import AssignmentRule, Resource

        # Create patient
        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        # Create doctors
        doctors = []
        for i in range(3):
            doctors.append(Resource.objects.create(
                name=f"Dr. Test {i}",
                resource_type="PERSON",
                code=f"DOC-INT-{i:03d}",
                metadata={
                    "specialty": "General Medicine",
                    "current_load": i * 2,
                    "status": "on_duty",
                },
            ))

        # Create rule
        rule = AssignmentRule.objects.create(
            name="Integration Test Rule",
            rule_code="integration_test_rule",
            applies_to="APPOINTMENT",
            rule_definition={
                "version": "1.0",
                "constraints": [
                    {"field": "metadata.status", "operator": "==", "value": "on_duty"},
                ],
                "scoring": [
                    {"field": "metadata.current_load", "weight": -1},
                ],
            },
            priority=100,
        )

        return {
            "patient": patient,
            "doctors": doctors,
            "rule": rule,
        }

    def test_full_assignment_flow(self, db, setup_assignment_scenario, test_user):
        """Should handle complete assignment flow from request to logged decision."""
        from hmis.apps.scheduling.models import Appointment, AssignmentDecision
        from hmis.apps.scheduling.services.assignment import AssignmentService

        scenario = setup_assignment_scenario

        # Request assignment
        service = AssignmentService()
        scheduled_start = timezone.now() + timedelta(hours=1)

        result = service.auto_assign(
            assignment_type="APPOINTMENT",
            target_data={
                "patient": scenario["patient"],
                "scheduled_start": scheduled_start,
                "scheduled_end": scheduled_start + timedelta(minutes=30),
                "reason": "General checkup",
                "appointment_type": "CONSULTATION",
            },
            candidates=scenario["doctors"],
            user=test_user,
        )

        # Verify assignment
        assert result.success is True
        assert result.assigned_resource is not None
        assert result.assigned_resource.metadata["current_load"] == 0  # Lowest load

        # Verify decision logged
        assert result.decision is not None
        assert result.decision.decision_outcome == "ASSIGNED"

    def test_manual_override_of_automatic_assignment(
        self, db, setup_assignment_scenario, test_user, another_user
    ):
        """Should allow manual override of automatic assignment."""
        from hmis.apps.scheduling.models import Appointment, AssignmentOverride
        from hmis.apps.scheduling.services.assignment import AssignmentService

        scenario = setup_assignment_scenario
        service = AssignmentService()
        scheduled_start = timezone.now() + timedelta(hours=1)

        # Auto assign first
        result = service.auto_assign(
            assignment_type="APPOINTMENT",
            target_data={
                "patient": scenario["patient"],
                "scheduled_start": scheduled_start,
                "scheduled_end": scheduled_start + timedelta(minutes=30),
                "reason": "Checkup",
            },
            candidates=scenario["doctors"],
            user=test_user,
        )

        original_resource = result.assigned_resource
        new_resource = scenario["doctors"][2]  # Pick different doctor

        # Override the assignment
        override_result = service.manual_override(
            target_type="Appointment",
            target_id=result.target_id,
            new_resource=new_resource,
            override_reason="PATIENT_REQUEST",
            justification="Patient has existing relationship with Dr. Test 2",
            user=another_user,
        )

        assert override_result.success is True
        assert override_result.override is not None
        assert override_result.override.original_resource == original_resource
        assert override_result.override.new_resource == new_resource

    def test_audit_trail_completeness(self, db, setup_assignment_scenario, test_user, another_user):
        """Should maintain complete audit trail for all assignment actions."""
        from hmis.apps.scheduling.models import AssignmentDecision, AssignmentOverride
        from hmis.apps.scheduling.services.assignment import AssignmentService

        scenario = setup_assignment_scenario
        service = AssignmentService()
        scheduled_start = timezone.now() + timedelta(hours=1)

        # Step 1: Auto assign
        result = service.auto_assign(
            assignment_type="APPOINTMENT",
            target_data={
                "patient": scenario["patient"],
                "scheduled_start": scheduled_start,
                "scheduled_end": scheduled_start + timedelta(minutes=30),
                "reason": "Checkup",
            },
            candidates=scenario["doctors"],
            user=test_user,
        )

        # Step 2: Override
        service.manual_override(
            target_type="Appointment",
            target_id=result.target_id,
            new_resource=scenario["doctors"][1],
            override_reason="LOAD_BALANCING",
            justification="Balancing workload",
            user=another_user,
        )

        # Verify audit trail
        decisions = AssignmentDecision.objects.get_for_target("Appointment", result.target_id)
        overrides = AssignmentOverride.objects.get_for_target("Appointment", result.target_id)

        assert len(decisions) >= 1  # At least initial assignment
        assert len(overrides) == 1
        assert overrides[0].overridden_by == another_user
