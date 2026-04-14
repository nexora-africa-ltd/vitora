"""
Assignment Engine Services for Vitora HMIS.

Phase 2: Automatic Assignment Engine

This module contains:
- RuleEvaluator: Evaluates assignment rules against candidates
- AssignmentService: High-level assignment orchestration
- EvaluationResult: Result container for rule evaluation

Key Principles:
- Rules are deterministic and explainable
- Every decision is logged for audit
- Humans can always override automatic assignments
"""

import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from hmis.apps.scheduling.models import (
    Appointment,
    AssignmentDecision,
    AssignmentOverride,
    AssignmentRule,
    Resource,
)


@dataclass
class CandidateEvaluation:
    """Result of evaluating a single candidate against a rule."""

    resource_id: int
    resource_name: str
    matched_constraints: list[str] = field(default_factory=list)
    failed_constraints: list[str] = field(default_factory=list)
    rejection_reason: str = ""
    score: float = 0.0
    scoring_breakdown: dict[str, Any] = field(default_factory=dict)

    @property
    def passed_all_constraints(self) -> bool:
        """Check if candidate passed all constraints."""
        return len(self.failed_constraints) == 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for logging."""
        return {
            "resource_id": self.resource_id,
            "resource_name": self.resource_name,
            "matched_constraints": self.matched_constraints,
            "failed_constraints": self.failed_constraints,
            "rejection_reason": self.rejection_reason,
            "score": self.score,
            "scoring_breakdown": self.scoring_breakdown,
        }


@dataclass
class EvaluationResult:
    """Result of rule evaluation."""

    decision: AssignmentDecision
    rule_applied: AssignmentRule | None = None
    assigned_resource: Resource | None = None
    candidates_evaluated: list[CandidateEvaluation] = field(default_factory=list)
    evaluation_time_ms: int = 0
    success: bool = False

    @property
    def is_assigned(self) -> bool:
        """Check if a resource was assigned."""
        return self.assigned_resource is not None


@dataclass
class AssignmentResult:
    """Result of the full assignment process."""

    success: bool
    assigned_resource: Resource | None = None
    decision: AssignmentDecision | None = None
    target_id: int | None = None
    error: str | None = None


@dataclass
class OverrideResult:
    """Result of a manual override."""

    success: bool
    override: AssignmentOverride | None = None
    error: str | None = None


class RuleEvaluator:
    """
    Evaluates assignment rules against candidate resources.

    The evaluator:
    1. Checks if each candidate matches all constraints
    2. Scores passing candidates based on scoring rules
    3. Selects the highest-scoring candidate
    4. Logs the decision with full details

    Rule Definition Structure:
    {
        "version": "1.0",
        "when": { conditions for rule applicability },
        "constraints": [ required conditions ],
        "scoring": [ scoring factors ],
        "fallback": { action when no match }
    }
    """

    def evaluate(
        self,
        rule: AssignmentRule,
        candidates: list[Resource] | QuerySet,
        context: dict[str, Any],
        user=None,
    ) -> EvaluationResult:
        """
        Evaluate a rule against candidate resources.

        Args:
            rule: The assignment rule to evaluate
            candidates: List of candidate resources
            context: Context for evaluation (appointment, department, etc.)
            user: User triggering the evaluation

        Returns:
            EvaluationResult with the decision and details
        """
        start_time = time.time()

        # Evaluate all candidates
        evaluations = []
        for candidate in candidates:
            evaluation = self._evaluate_candidate(candidate, rule, context)
            evaluations.append(evaluation)

        # Filter to passing candidates and sort by score
        passing = [e for e in evaluations if e.passed_all_constraints]
        passing.sort(key=lambda e: e.score, reverse=True)

        # Select best candidate
        best_candidate = passing[0] if passing else None
        assigned_resource = None

        if best_candidate:
            assigned_resource = Resource.objects.get(id=best_candidate.resource_id)

        # Calculate evaluation time
        evaluation_time_ms = int((time.time() - start_time) * 1000)

        # Determine outcome and reason
        if assigned_resource:
            outcome = "ASSIGNED"
            reason = f"Resource {assigned_resource.name} matched all constraints with score {best_candidate.score}"
        else:
            outcome = "UNASSIGNED"
            reason = "No candidates matched all required constraints"

        # Get target info from context
        target_type, target_id = self._extract_target_info(context)

        # Log the decision
        decision = AssignmentDecision.objects.create(
            assignment_type=rule.applies_to,
            target_id=target_id,
            target_type=target_type,
            rule_applied=rule,
            assigned_resource=assigned_resource,
            decision_outcome=outcome,
            decision_reason=reason,
            candidates_evaluated=[e.to_dict() for e in evaluations],
            scoring_details=self._build_scoring_details(evaluations, best_candidate),
            evaluation_inputs=self._serialize_context(context),
            evaluation_time_ms=evaluation_time_ms,
            triggered_by=user,
        )

        return EvaluationResult(
            decision=decision,
            rule_applied=rule,
            assigned_resource=assigned_resource,
            candidates_evaluated=evaluations,
            evaluation_time_ms=evaluation_time_ms,
            success=assigned_resource is not None,
        )

    def find_and_evaluate(
        self,
        assignment_type: str,
        context: dict[str, Any],
        candidates: list[Resource] | QuerySet,
        user=None,
    ) -> EvaluationResult | None:
        """
        Find applicable rules and evaluate in priority order.

        Args:
            assignment_type: Type of assignment (APPOINTMENT, SHIFT, etc.)
            context: Context for evaluation
            candidates: Candidate resources
            user: User triggering evaluation

        Returns:
            EvaluationResult from the first matching rule, or None
        """
        rules = AssignmentRule.objects.get_active_for_type(assignment_type, for_date=date.today())

        for rule in rules:
            # Check if rule's "when" conditions are met
            if self._check_when_conditions(rule, context):
                return self.evaluate(rule, candidates, context, user)

        # No matching rules found
        target_type, target_id = self._extract_target_info(context)
        decision = AssignmentDecision.objects.create(
            assignment_type=assignment_type,
            target_id=target_id,
            target_type=target_type,
            rule_applied=None,
            assigned_resource=None,
            decision_outcome="SKIPPED",
            decision_reason="No applicable rules found for this context",
            evaluation_inputs=self._serialize_context(context),
            triggered_by=user,
        )

        return EvaluationResult(
            decision=decision,
            rule_applied=None,
            assigned_resource=None,
            success=False,
        )

    def _evaluate_candidate(
        self,
        candidate: Resource,
        rule: AssignmentRule,
        context: dict[str, Any],
    ) -> CandidateEvaluation:
        """
        Evaluate a single candidate against rule constraints.

        Args:
            candidate: Resource to evaluate
            rule: Rule with constraints and scoring
            context: Evaluation context

        Returns:
            CandidateEvaluation with results
        """
        evaluation = CandidateEvaluation(
            resource_id=candidate.id,
            resource_name=candidate.name,
        )

        rule_def = rule.rule_definition
        constraints = rule_def.get("constraints", [])
        scoring = rule_def.get("scoring", [])

        # Evaluate constraints
        for constraint in constraints:
            passed, reason = self._check_constraint(candidate, constraint, context)
            if passed:
                constraint_name = self._get_constraint_name(constraint)
                evaluation.matched_constraints.append(constraint_name)
            else:
                constraint_name = self._get_constraint_name(constraint)
                evaluation.failed_constraints.append(constraint_name)
                if not evaluation.rejection_reason:
                    evaluation.rejection_reason = reason

        # Only calculate score if all constraints passed
        if evaluation.passed_all_constraints:
            evaluation.score, evaluation.scoring_breakdown = self._calculate_score(
                candidate, scoring, context
            )

        return evaluation

    def _check_constraint(
        self,
        candidate: Resource,
        constraint: dict[str, Any] | str,
        context: dict[str, Any],
    ) -> tuple[bool, str]:
        """
        Check if a candidate meets a constraint.

        Supports both dict-based and string constraints.

        Args:
            candidate: Resource to check
            constraint: Constraint definition
            context: Evaluation context

        Returns:
            Tuple of (passed, failure_reason)
        """
        if isinstance(constraint, str):
            # String constraint (e.g., "staff.status == 'on_duty'")
            return self._evaluate_string_constraint(candidate, constraint, context)

        # Dict constraint
        field_path = constraint.get("field", "")
        operator = constraint.get("operator", "==")
        expected = constraint.get("value")

        actual = self._get_field_value(candidate, field_path)

        if operator == "==":
            passed = actual == expected
        elif operator == "!=":
            passed = actual != expected
        elif operator == "in":
            passed = actual in expected if expected else False
        elif operator == "contains":
            passed = expected in actual if actual else False
        elif operator == ">":
            passed = actual > expected if actual is not None else False
        elif operator == "<":
            passed = actual < expected if actual is not None else False
        elif operator == ">=":
            passed = actual >= expected if actual is not None else False
        elif operator == "<=":
            passed = actual <= expected if actual is not None else False
        else:
            passed = False

        reason = "" if passed else f"Field {field_path}: expected {expected}, got {actual}"
        return passed, reason

    def _evaluate_string_constraint(
        self,
        candidate: Resource,
        constraint: str,
        context: dict[str, Any],
    ) -> tuple[bool, str]:
        """
        Evaluate a string-based constraint expression.

        Args:
            candidate: Resource to evaluate
            constraint: String constraint expression
            context: Evaluation context

        Returns:
            Tuple of (passed, failure_reason)
        """
        # Simple parsing for common constraint patterns
        # Format: "field.path operator value"

        if "==" in constraint:
            parts = constraint.split("==")
            if len(parts) == 2:
                field_path = parts[0].strip()
                expected_str = parts[1].strip().strip("'\"")
                actual = self._get_field_value(candidate, field_path)
                passed = str(actual) == expected_str
                reason = "" if passed else f"{field_path}: expected {expected_str}, got {actual}"
                return passed, reason

        if " in " in constraint:
            parts = constraint.split(" in ")
            if len(parts) == 2:
                field_path = parts[0].strip()
                list_field = parts[1].strip()
                actual = self._get_field_value(candidate, field_path)
                expected_list = self._get_context_value(context, list_field)
                if isinstance(expected_list, list):
                    passed = actual in expected_list
                else:
                    passed = False
                reason = "" if passed else f"{field_path} not in {list_field}"
                return passed, reason

        # Default: treat as passed (unknown constraint format)
        return True, ""

    def _get_field_value(self, candidate: Resource, field_path: str) -> Any:
        """
        Get a value from a candidate resource using dot notation.

        Args:
            candidate: Resource object
            field_path: Field path (e.g., "metadata.specialty")

        Returns:
            Field value or None
        """
        parts = field_path.split(".")
        value: Any = candidate

        for part in parts:
            if hasattr(value, part):
                value = getattr(value, part)
            elif isinstance(value, dict) and part in value:
                value = value[part]
            else:
                return None

        return value

    def _get_context_value(self, context: dict[str, Any], path: str) -> Any:
        """
        Get a value from context using dot notation.

        Args:
            context: Context dictionary
            path: Field path

        Returns:
            Value or None
        """
        parts = path.split(".")
        value: Any = context

        for part in parts:
            if isinstance(value, dict) and part in value:
                value = value[part]
            elif hasattr(value, part):
                value = getattr(value, part)
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
        candidate: Resource,
        scoring: list[dict[str, Any]],
        context: dict[str, Any],
    ) -> tuple[float, dict[str, Any]]:
        """
        Calculate score for a candidate based on scoring rules.

        Args:
            candidate: Resource to score
            scoring: Scoring rules from rule definition
            context: Evaluation context

        Returns:
            Tuple of (total_score, breakdown_dict)
        """
        total_score = 0.0
        breakdown = {}

        for score_rule in scoring:
            field_path = score_rule.get("field", score_rule.get("prefer", ""))
            weight = score_rule.get("weight", 1)
            condition = score_rule.get("if")

            # Check condition if present
            if condition:
                condition_met = self._get_context_value(context, condition)
                if not condition_met:
                    continue

            value = self._get_field_value(candidate, field_path)
            if value is not None:
                try:
                    numeric_value = float(value)
                    contribution = numeric_value * weight
                    total_score += contribution
                    breakdown[field_path] = {
                        "value": numeric_value,
                        "weight": weight,
                        "contribution": contribution,
                    }
                except (ValueError, TypeError):
                    pass  # Non-numeric values don't contribute to score

        breakdown["total_score"] = total_score
        return total_score, breakdown

    def _check_when_conditions(
        self,
        rule: AssignmentRule,
        context: dict[str, Any],
    ) -> bool:
        """
        Check if a rule's "when" conditions are met.

        Args:
            rule: Rule to check
            context: Evaluation context

        Returns:
            True if conditions are met
        """
        rule_def = rule.rule_definition
        when = rule_def.get("when", {})

        if not when:
            return True  # No conditions = always applicable

        for key, expected in when.items():
            actual = context.get(key)

            # Also check nested objects (e.g., appointment.appointment_type)
            if actual is None and "." in key:
                actual = self._get_context_value(context, key)

            # Check direct context values and object attributes
            if actual is None:
                # Try to get from objects in context
                for ctx_key, ctx_val in context.items():
                    if hasattr(ctx_val, key):
                        actual = getattr(ctx_val, key)
                        break

            if actual != expected:
                return False

        return True

    def _extract_target_info(self, context: dict[str, Any]) -> tuple[str, int]:
        """Extract target type and ID from context."""
        # Look for common target objects
        if "appointment" in context:
            apt = context["appointment"]
            return ("Appointment", apt.id if hasattr(apt, "id") else 0)

        # Default fallback
        return ("Unknown", 0)

    def _serialize_context(self, context: dict[str, Any]) -> dict[str, Any]:
        """Serialize context for logging (convert objects to dicts)."""

        result = {}
        for key, value in context.items():
            result[key] = self._serialize_value(value)
        return result

    def _serialize_value(self, value: Any) -> Any:
        """Serialize a single value for JSON storage."""
        from datetime import date, datetime

        if value is None:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, date):
            return value.isoformat()
        if hasattr(value, "id"):
            # Model instance - serialize key fields
            serialized = {
                "id": value.id,
                "type": type(value).__name__,
            }
            # Add common fields if present
            for field in ["name", "status", "priority", "appointment_type"]:
                if hasattr(value, field):
                    field_val = getattr(value, field)
                    serialized[field] = self._serialize_value(field_val)
            return serialized
        if isinstance(value, (list, tuple)):
            return [self._serialize_value(v) for v in value]
        if isinstance(value, dict):
            return {k: self._serialize_value(v) for k, v in value.items()}
        return value

    def _build_scoring_details(
        self,
        evaluations: list[CandidateEvaluation],
        best_candidate: CandidateEvaluation | None,
    ) -> dict[str, Any]:
        """Build summary scoring details for logging."""
        return {
            "total_candidates": len(evaluations),
            "passing_candidates": len([e for e in evaluations if e.passed_all_constraints]),
            "best_score": best_candidate.score if best_candidate else 0,
            "best_candidate": best_candidate.resource_name if best_candidate else None,
            "breakdown": best_candidate.scoring_breakdown if best_candidate else {},
        }


class AssignmentService:
    """
    High-level service for managing resource assignments.

    Orchestrates:
    - Automatic assignment using rules
    - Manual overrides with justification
    - Audit trail maintenance
    """

    def __init__(self):
        """Initialize the assignment service."""
        self.evaluator = RuleEvaluator()

    @transaction.atomic
    def auto_assign(
        self,
        assignment_type: str,
        target_data: dict[str, Any],
        candidates: list[Resource] | QuerySet,
        user=None,
    ) -> AssignmentResult:
        """
        Automatically assign a resource based on active rules.

        Args:
            assignment_type: Type of assignment (APPOINTMENT, SHIFT, etc.)
            target_data: Data for creating/identifying the target
            candidates: Pool of candidate resources
            user: User triggering the assignment

        Returns:
            AssignmentResult with outcome details
        """
        try:
            # Ensure candidates is a list
            if hasattr(candidates, "__iter__") and not isinstance(candidates, list):
                candidates = list(candidates)

            # Build context for evaluation (include candidates for temp resource)
            context = self._build_context(assignment_type, target_data, candidates)

            # Evaluate rules to find best assignment
            result = self.evaluator.find_and_evaluate(
                assignment_type=assignment_type,
                context=context,
                candidates=candidates,
                user=user,
            )

            if result is None:
                return AssignmentResult(
                    success=False,
                    error="No rules available for this assignment type",
                )

            # Extract target ID from context
            target_id = None
            if "appointment" in context:
                appointment = context["appointment"]
                target_id = appointment.id

                # Update the appointment with the assigned resource if successful
                if result.is_assigned and result.assigned_resource:
                    appointment.resource = result.assigned_resource
                    appointment.save(update_fields=["resource", "updated_at"])

            return AssignmentResult(
                success=result.is_assigned,
                assigned_resource=result.assigned_resource,
                decision=result.decision,
                target_id=target_id,
            )

        except Exception as e:
            import traceback

            return AssignmentResult(
                success=False,
                error=f"{str(e)}: {traceback.format_exc()}",
            )

    @transaction.atomic
    def manual_override(
        self,
        target_type: str,
        target_id: int,
        new_resource: Resource,
        override_reason: str,
        justification: str,
        user,
        requires_approval: bool = False,
    ) -> OverrideResult:
        """
        Manually override an assignment.

        Args:
            target_type: Type of target (e.g., "Appointment")
            target_id: ID of the target
            new_resource: New resource to assign
            override_reason: Category of override reason
            justification: Detailed justification
            user: User making the override
            requires_approval: Whether supervisor approval is needed

        Returns:
            OverrideResult with outcome
        """
        try:
            # Find original resource (from last decision)
            original_resource = None
            decisions = AssignmentDecision.objects.get_for_target(target_type, target_id)
            if decisions.exists():
                last_decision = decisions.first()
                original_resource = last_decision.assigned_resource

            # Create override record
            override = AssignmentOverride.objects.create(
                target_type=target_type,
                target_id=target_id,
                original_resource=original_resource,
                new_resource=new_resource,
                override_reason=override_reason,
                justification=justification,
                overridden_by=user,
                requires_approval=requires_approval,
            )

            # Update the target if it's an Appointment
            if target_type == "Appointment":
                try:
                    appointment = Appointment.objects.get(id=target_id)
                    appointment.resource = new_resource
                    appointment.save(update_fields=["resource"])
                except Appointment.DoesNotExist:
                    pass  # Target doesn't exist

            return OverrideResult(
                success=True,
                override=override,
            )

        except Exception as e:
            return OverrideResult(
                success=False,
                error=str(e),
            )

    def _build_context(
        self,
        assignment_type: str,
        target_data: dict[str, Any],
        candidates: list[Resource] = None,
    ) -> dict[str, Any]:
        """
        Build evaluation context from target data.

        For APPOINTMENT type, creates the appointment if needed.

        Args:
            assignment_type: Type of assignment
            target_data: Data for the target
            candidates: List of candidate resources

        Returns:
            Context dictionary for rule evaluation
        """
        context = dict(target_data)
        candidates = candidates or []

        if assignment_type == "APPOINTMENT":
            # Create appointment if not already present
            if "appointment" not in context and "patient" in context:
                # Get first candidate as temporary resource
                temp_resource = candidates[0] if candidates else None

                if temp_resource is None:
                    # Need a resource - look for any active one
                    temp_resource = Resource.objects.filter(is_active=True).first()

                if temp_resource is None:
                    raise ValueError("No resources available for appointment creation")

                appointment = Appointment.objects.create(
                    patient=context["patient"],
                    resource=temp_resource,
                    scheduled_start=context.get("scheduled_start", timezone.now()),
                    scheduled_end=context.get("scheduled_end", timezone.now()),
                    reason=context.get("reason", "Auto-created"),
                    appointment_type=context.get("appointment_type", "CONSULTATION"),
                    priority=context.get("priority", "ROUTINE"),
                )
                context["appointment"] = appointment

        return context
