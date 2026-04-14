"""
Rules-Based Bed Assignment Service.

Phase B Implementation:
- Integrates with existing AssignmentRule DSL
- Uses WardCompatibilityService for constraint checking
- Logs decisions to AssignmentDecision for auditability
- Supports scoring-based bed selection

Key Design Principle: REUSE existing scheduling infrastructure.
- Don't duplicate the WardCompatibilityService constraint logic
- Use AssignmentRule model (supports BED_ASSIGNMENT type)
- Log to AssignmentDecision (use JSON fields for bed-specific info)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from django.db.models import QuerySet

from hmis.apps.core.models import AuditLog
from hmis.apps.inpatient.models import Bed, Ward
from hmis.apps.inpatient.services.compatibility import (
    ward_compatibility_service,
)
from hmis.apps.scheduling.models import AssignmentDecision, AssignmentRule

if TYPE_CHECKING:
    from django.contrib.auth.models import User

    from hmis.apps.patients.models import Patient


@dataclass
class BedCandidateEvaluation:
    """Result of evaluating a single bed against assignment rules."""

    bed_id: int
    bed_number: str
    ward_id: int
    ward_name: str
    ward_code: str
    matched_constraints: list[str] = field(default_factory=list)
    failed_constraints: list[str] = field(default_factory=list)
    compatibility_violations: list[dict] = field(default_factory=list)
    rejection_reason: str = ""
    score: float = 0.0
    scoring_breakdown: dict[str, Any] = field(default_factory=dict)

    @property
    def passed_all_constraints(self) -> bool:
        """Check if bed passed all constraints."""
        return len(self.failed_constraints) == 0 and len(self.compatibility_violations) == 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for logging."""
        return {
            "bed_id": self.bed_id,
            "bed_number": self.bed_number,
            "ward_id": self.ward_id,
            "ward_name": self.ward_name,
            "ward_code": self.ward_code,
            "matched_constraints": self.matched_constraints,
            "failed_constraints": self.failed_constraints,
            "compatibility_violations": self.compatibility_violations,
            "rejection_reason": self.rejection_reason,
            "score": self.score,
            "scoring_breakdown": self.scoring_breakdown,
        }


@dataclass
class BedAssignmentRuleResult:
    """Result of rule-based bed assignment."""

    success: bool
    assigned_bed: Bed | None = None
    decision: AssignmentDecision | None = None
    rule_applied: AssignmentRule | None = None
    candidates_evaluated: list[BedCandidateEvaluation] = field(default_factory=list)
    evaluation_time_ms: int = 0
    error: str | None = None

    @property
    def is_assigned(self) -> bool:
        """Check if a bed was assigned."""
        return self.assigned_bed is not None


class BedAssignmentRuleEvaluator:
    """
    Evaluates bed assignment rules against available beds.

    Integrates with:
    - WardCompatibilityService for constraint checking (reuse, don't duplicate)
    - AssignmentRule model for rule definitions
    - AssignmentDecision model for decision logging

    Rule Definition Structure for BED_ASSIGNMENT:
    {
        "version": "1.0",
        "when": {
            "ward_type": "GENERAL",      # Optional: filter by ward type
            "admission_type": "ELECTIVE" # Optional: admission context
        },
        "constraints": [
            # Compatibility checks are automatic via WardCompatibilityService
            # Additional custom constraints can be specified here
            {"field": "bed.bed_type", "operator": "==", "value": "STANDARD"},
            {"field": "ward.oxygen_equipped", "operator": "==", "value": true}
        ],
        "scoring": [
            {"field": "ward.occupancy_rate", "weight": -1},  # Prefer less busy wards
            {"field": "bed.proximity_score", "weight": 2}     # Prefer proximity to stations
        ],
        "fallback": {
            "action": "leave_unassigned",  # or "use_first_available"
            "notify": "ward_nurse_in_charge"
        }
    }
    """

    def __init__(self):
        """Initialize the evaluator."""
        self.compatibility_service = ward_compatibility_service

    def evaluate_beds_for_patient(
        self,
        patient: Patient,
        ward: Ward,
        requires_isolation: bool = False,
        requires_oxygen: bool = False,
        requires_ventilator: bool = False,
        admission_type: str = "ELECTIVE",
        user: User | None = None,
        ip_address: str = "0.0.0.0",
    ) -> BedAssignmentRuleResult:
        """
        Evaluate all available beds for a patient and return best match.

        This method:
        1. Gets available beds in the ward
        2. Finds applicable BED_ASSIGNMENT rules
        3. Evaluates each bed against rules
        4. Scores passing beds
        5. Returns the best match
        6. Logs the decision

        Args:
            patient: Patient being admitted
            ward: Target ward
            requires_isolation: Whether patient needs isolation
            requires_oxygen: Whether patient needs oxygen
            requires_ventilator: Whether patient needs ventilator
            admission_type: Type of admission (ELECTIVE, EMERGENCY, etc.)
            user: User triggering the assignment
            ip_address: Client IP for audit

        Returns:
            BedAssignmentRuleResult with outcome
        """
        start_time = time.time()

        # Get available beds
        available_beds = self._get_available_beds(ward)
        if not available_beds.exists():
            return self._create_no_beds_result(
                ward, patient, user, int((time.time() - start_time) * 1000)
            )

        # Build evaluation context
        context = self._build_context(
            patient=patient,
            ward=ward,
            requires_isolation=requires_isolation,
            requires_oxygen=requires_oxygen,
            requires_ventilator=requires_ventilator,
            admission_type=admission_type,
        )

        # Find applicable rules
        rules = AssignmentRule.objects.get_active_for_type("BED_ASSIGNMENT")

        # Find first applicable rule
        rule_to_apply = None
        for rule in rules:
            if self._check_when_conditions(rule, context):
                rule_to_apply = rule
                break

        # Evaluate all beds
        evaluations = []
        for bed in available_beds:
            evaluation = self._evaluate_bed(bed, patient, context, rule_to_apply)
            evaluations.append(evaluation)

        # Filter passing beds and sort by score
        passing = [e for e in evaluations if e.passed_all_constraints]
        passing.sort(key=lambda e: e.score, reverse=True)

        # Select best bed
        best_evaluation = passing[0] if passing else None
        assigned_bed = None

        if best_evaluation:
            assigned_bed = Bed.objects.get(id=best_evaluation.bed_id)

        evaluation_time_ms = int((time.time() - start_time) * 1000)

        # Build decision outcome
        if assigned_bed:
            outcome = "ASSIGNED"
            reason = (
                f"Bed {assigned_bed.bed_number} in ward {ward.name} matched all constraints "
                f"with score {best_evaluation.score:.2f}"
            )
        else:
            outcome = "UNASSIGNED"
            if evaluations:
                # Summarize why beds failed
                failure_reasons = set()
                for e in evaluations:
                    for v in e.compatibility_violations:
                        failure_reasons.add(v.get("code", "unknown"))
                    for c in e.failed_constraints:
                        failure_reasons.add(c)
                reason = f"No beds matched constraints. Failures: {', '.join(failure_reasons)}"
            else:
                reason = "No available beds to evaluate"

        # Check fallback action
        fallback_action = None
        if not assigned_bed and rule_to_apply:
            rule_def = rule_to_apply.rule_definition
            fallback = rule_def.get("fallback", {})
            fallback_action = fallback.get("action", "leave_unassigned")

            if fallback_action == "use_first_available":
                # Fall back to first available bed regardless of scoring
                first_bed = available_beds.first()
                if first_bed:
                    assigned_bed = first_bed
                    outcome = "ASSIGNED"
                    reason = f"Fallback: assigned first available bed {first_bed.bed_number}"

        # Log decision
        decision = AssignmentDecision.objects.create(
            assignment_type="BED_ASSIGNMENT",
            target_id=patient.id,
            target_type="Patient",
            rule_applied=rule_to_apply,
            assigned_resource=None,  # Beds aren't Resources
            decision_outcome=outcome,
            decision_reason=reason,
            candidates_evaluated=[e.to_dict() for e in evaluations],
            scoring_details=self._build_scoring_details(evaluations, best_evaluation),
            evaluation_inputs=self._serialize_context(context, assigned_bed),
            evaluation_time_ms=evaluation_time_ms,
            triggered_by=user,
        )

        # Create audit log for the assignment
        if assigned_bed:
            AuditLog.log(
                action="bed_rule_assigned",
                user=user,
                resource_type="Bed",
                resource_id=assigned_bed.id,
                details={
                    "ward": ward.code,
                    "ward_name": ward.name,
                    "bed_number": assigned_bed.bed_number,
                    "assignment_type": "rule_based",
                    "rule_applied": rule_to_apply.rule_code if rule_to_apply else None,
                    "decision_id": decision.id,
                    "score": best_evaluation.score if best_evaluation else 0,
                },
                ip_address=ip_address,
            )

        return BedAssignmentRuleResult(
            success=assigned_bed is not None,
            assigned_bed=assigned_bed,
            decision=decision,
            rule_applied=rule_to_apply,
            candidates_evaluated=evaluations,
            evaluation_time_ms=evaluation_time_ms,
        )

    def _get_available_beds(self, ward: Ward) -> QuerySet[Bed]:
        """Get available beds in a ward, ordered by bed number."""
        return (
            Bed.objects.filter(
                ward=ward,
                status="AVAILABLE",
            )
            .select_related("ward")
            .order_by("bed_number")
        )

    def _build_context(
        self,
        patient: Patient,
        ward: Ward,
        requires_isolation: bool,
        requires_oxygen: bool,
        requires_ventilator: bool,
        admission_type: str,
    ) -> dict[str, Any]:
        """Build evaluation context."""
        from datetime import date as date_type

        # Calculate patient age
        today = date_type.today()
        dob = patient.date_of_birth
        if isinstance(dob, str):
            dob = date_type.fromisoformat(dob)
        patient_age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

        return {
            "patient_id": patient.id,
            "patient_gender": patient.gender,
            "patient_age": patient_age,
            "ward_id": ward.id,
            "ward_type": ward.ward_type,
            "ward_code": ward.code,
            "requires_isolation": requires_isolation,
            "requires_oxygen": requires_oxygen,
            "requires_ventilator": requires_ventilator,
            "admission_type": admission_type,
            "ward_occupancy_rate": ward.occupancy_rate,
            "ward_available_beds": ward.available_beds,
        }

    def _check_when_conditions(self, rule: AssignmentRule, context: dict[str, Any]) -> bool:
        """Check if a rule's 'when' conditions are met."""
        rule_def = rule.rule_definition
        when = rule_def.get("when", {})

        if not when:
            return True  # No conditions = always applicable

        for key, expected in when.items():
            actual = context.get(key)
            if actual != expected:
                return False

        return True

    def _evaluate_bed(
        self,
        bed: Bed,
        patient: Patient,
        context: dict[str, Any],
        rule: AssignmentRule | None,
    ) -> BedCandidateEvaluation:
        """Evaluate a single bed against constraints and scoring."""
        evaluation = BedCandidateEvaluation(
            bed_id=bed.id,
            bed_number=bed.bed_number,
            ward_id=bed.ward.id,
            ward_name=bed.ward.name,
            ward_code=bed.ward.code,
        )

        # 1. Check ward compatibility using existing service
        compatibility_result = self.compatibility_service.check_compatibility(
            patient=patient,
            ward=bed.ward,
            requires_isolation=context.get("requires_isolation", False),
            requires_oxygen=context.get("requires_oxygen", False),
            requires_ventilator=context.get("requires_ventilator", False),
        )

        if not compatibility_result.compatible:
            for violation in compatibility_result.violations:
                evaluation.compatibility_violations.append(violation.to_dict())
                if not evaluation.rejection_reason:
                    evaluation.rejection_reason = violation.message

        # 2. Check rule-specific constraints
        if rule:
            rule_def = rule.rule_definition
            constraints = rule_def.get("constraints", [])
            for constraint in constraints:
                passed, reason = self._check_constraint(bed, constraint, context)
                if passed:
                    constraint_name = self._get_constraint_name(constraint)
                    evaluation.matched_constraints.append(constraint_name)
                else:
                    constraint_name = self._get_constraint_name(constraint)
                    evaluation.failed_constraints.append(constraint_name)
                    if not evaluation.rejection_reason:
                        evaluation.rejection_reason = reason

        # 4. Calculate score if all constraints passed
        if evaluation.passed_all_constraints:
            if rule:
                rule_def = rule.rule_definition
                scoring = rule_def.get("scoring", [])
                evaluation.score, evaluation.scoring_breakdown = self._calculate_score(
                    bed, scoring, context
                )
            else:
                # Default scoring: prefer lower bed numbers (deterministic)
                # and lower ward occupancy
                evaluation.score = 100 - bed.ward.occupancy_rate
                evaluation.scoring_breakdown = {
                    "base_score": 100,
                    "occupancy_penalty": -bed.ward.occupancy_rate,
                    "total_score": evaluation.score,
                }

        return evaluation

    def _check_constraint(
        self,
        bed: Bed,
        constraint: dict[str, Any] | str,
        context: dict[str, Any],
    ) -> tuple[bool, str]:
        """Check if a bed meets a constraint."""
        if isinstance(constraint, str):
            return self._evaluate_string_constraint(bed, constraint, context)

        field_path = constraint.get("field", "")
        operator = constraint.get("operator", "==")
        expected = constraint.get("value")

        actual = self._get_field_value(bed, field_path)

        if operator == "==":
            passed = actual == expected
        elif operator == "!=":
            passed = actual != expected
        elif operator == "in":
            passed = actual in expected if expected else False
        elif operator == ">":
            try:
                passed = float(actual) > float(expected) if actual is not None else False
            except (ValueError, TypeError):
                passed = False
        elif operator == "<":
            try:
                passed = float(actual) < float(expected) if actual is not None else False
            except (ValueError, TypeError):
                passed = False
        elif operator == ">=":
            try:
                passed = float(actual) >= float(expected) if actual is not None else False
            except (ValueError, TypeError):
                passed = False
        elif operator == "<=":
            try:
                passed = float(actual) <= float(expected) if actual is not None else False
            except (ValueError, TypeError):
                passed = False
        else:
            passed = False

        reason = "" if passed else f"Field {field_path}: expected {expected}, got {actual}"
        return passed, reason

    def _evaluate_string_constraint(
        self,
        bed: Bed,
        constraint: str,
        context: dict[str, Any],
    ) -> tuple[bool, str]:
        """Evaluate a string-based constraint expression."""
        if "==" in constraint:
            parts = constraint.split("==")
            if len(parts) == 2:
                field_path = parts[0].strip()
                expected_str = parts[1].strip().strip("'\"")
                actual = self._get_field_value(bed, field_path)
                passed = str(actual) == expected_str
                reason = "" if passed else f"{field_path}: expected {expected_str}, got {actual}"
                return passed, reason

        # Default: unknown format passes
        return True, ""

    def _get_field_value(self, bed: Bed, field_path: str) -> Any:
        """Get a value from a bed using dot notation."""
        parts = field_path.split(".")
        value: Any = None

        # Resolve first part - could be "bed" or "ward"
        if parts[0] == "bed":
            value = bed
            parts = parts[1:]
        elif parts[0] == "ward":
            value = bed.ward
            parts = parts[1:]
        else:
            # Default to bed
            value = bed

        for part in parts:
            if hasattr(value, part):
                value = getattr(value, part)
            elif isinstance(value, dict) and part in value:
                value = value[part]
            else:
                return None

        return value

    def _get_constraint_name(self, constraint: dict[str, Any] | str) -> str:
        """Get a human-readable name for a constraint."""
        if isinstance(constraint, str):
            return constraint
        return constraint.get("field", "unknown")

    def _calculate_score(
        self,
        bed: Bed,
        scoring: list[dict[str, Any]],
        context: dict[str, Any],
    ) -> tuple[float, dict[str, Any]]:
        """Calculate score for a bed based on scoring rules."""
        total_score = 0.0
        breakdown = {}

        for score_rule in scoring:
            field_path = score_rule.get("field", score_rule.get("prefer", ""))
            weight = score_rule.get("weight", 1)

            value = self._get_field_value(bed, field_path)
            if value is None:
                # Check context
                value = context.get(field_path.replace(".", "_"))

            if value is not None:
                try:
                    if isinstance(value, bool):
                        numeric_value = 1.0 if value else 0.0
                    elif isinstance(value, Decimal):
                        numeric_value = float(value)
                    else:
                        numeric_value = float(value)
                    contribution = numeric_value * weight
                    total_score += contribution
                    breakdown[field_path] = {
                        "value": numeric_value,
                        "weight": weight,
                        "contribution": contribution,
                    }
                except (ValueError, TypeError):
                    pass  # Non-numeric values don't contribute

        breakdown["total_score"] = total_score
        return total_score, breakdown

    def _create_no_beds_result(
        self,
        ward: Ward,
        patient: Patient,
        user: User | None,
        evaluation_time_ms: int,
    ) -> BedAssignmentRuleResult:
        """Create a result for when no beds are available."""
        decision = AssignmentDecision.objects.create(
            assignment_type="BED_ASSIGNMENT",
            target_id=patient.id,
            target_type="Patient",
            rule_applied=None,
            assigned_resource=None,
            decision_outcome="UNASSIGNED",
            decision_reason=f"No available beds in ward {ward.name} ({ward.code})",
            candidates_evaluated=[],
            scoring_details={"total_candidates": 0, "passing_candidates": 0},
            evaluation_inputs={
                "ward_id": ward.id,
                "ward_code": ward.code,
                "ward_name": ward.name,
                "patient_id": patient.id,
            },
            evaluation_time_ms=evaluation_time_ms,
            triggered_by=user,
        )

        return BedAssignmentRuleResult(
            success=False,
            decision=decision,
            error=f"No available beds in ward {ward.code}",
        )

    def _build_scoring_details(
        self,
        evaluations: list[BedCandidateEvaluation],
        best_evaluation: BedCandidateEvaluation | None,
    ) -> dict[str, Any]:
        """Build summary scoring details for logging."""
        return {
            "total_candidates": len(evaluations),
            "passing_candidates": len([e for e in evaluations if e.passed_all_constraints]),
            "best_score": best_evaluation.score if best_evaluation else 0,
            "best_bed": best_evaluation.bed_number if best_evaluation else None,
            "best_ward": best_evaluation.ward_name if best_evaluation else None,
            "breakdown": best_evaluation.scoring_breakdown if best_evaluation else {},
        }

    def _serialize_context(
        self,
        context: dict[str, Any],
        assigned_bed: Bed | None,
    ) -> dict[str, Any]:
        """Serialize context for logging."""
        result = dict(context)
        if assigned_bed:
            result["assigned_bed_id"] = assigned_bed.id
            result["assigned_bed_number"] = assigned_bed.bed_number
            result["assigned_ward_id"] = assigned_bed.ward.id
        return result


# Module-level singleton for convenience
bed_assignment_rule_evaluator = BedAssignmentRuleEvaluator()
