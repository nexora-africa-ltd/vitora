"""
Westgard QC Rules Engine.

Implements standard Westgard multi-rule QC system:
- 1-2s: Single result exceeds ±2 SD (warning only)
- 1-3s: Single result exceeds ±3 SD (reject)
- 2-2s: Two consecutive results exceed ±2 SD on same side (reject)
- R-4s: One result >+2SD and next >-2SD (or vice versa), range > 4SD (reject)
- 4-1s: Four consecutive results exceed ±1 SD on same side (reject)
- 10x: Ten consecutive results on same side of mean (reject)

References:
- Westgard JO, Barry PL, Hunt MR, Groth T. Clin Chem 1981;27:493-501
"""

from decimal import Decimal
from typing import NamedTuple

from django.db import models

from .models import QCResult, QCRule, QCRuleViolation


class RuleEvaluation(NamedTuple):
    """Result of evaluating a single Westgard rule."""

    rule_type: str
    violated: bool
    severity: str
    description: str


def get_z_score(value: Decimal, mean: Decimal, sd: Decimal) -> float | None:
    """Calculate z-score."""
    if sd == 0:
        return None
    return float((value - mean) / sd)


def evaluate_1_2s(z_scores: list[float]) -> RuleEvaluation:
    """1-2s: Current result exceeds ±2 SD (warning)."""
    if not z_scores:
        return RuleEvaluation("1_2S", False, "WARNING", "")
    current = z_scores[0]
    violated = abs(current) > 2.0
    desc = f"Result at {current:.2f} SD from mean" if violated else ""
    return RuleEvaluation("1_2S", violated, "WARNING", desc)


def evaluate_1_3s(z_scores: list[float]) -> RuleEvaluation:
    """1-3s: Current result exceeds ±3 SD (reject)."""
    if not z_scores:
        return RuleEvaluation("1_3S", False, "REJECT", "")
    current = z_scores[0]
    violated = abs(current) > 3.0
    desc = f"Result at {current:.2f} SD from mean (exceeds 3 SD)" if violated else ""
    return RuleEvaluation("1_3S", violated, "REJECT", desc)


def evaluate_2_2s(z_scores: list[float]) -> RuleEvaluation:
    """2-2s: Two consecutive results exceed ±2 SD on same side."""
    if len(z_scores) < 2:
        return RuleEvaluation("2_2S", False, "REJECT", "")
    a, b = z_scores[0], z_scores[1]
    violated = (a > 2.0 and b > 2.0) or (a < -2.0 and b < -2.0)
    desc = f"Two consecutive results beyond ±2 SD: {a:.2f}, {b:.2f}" if violated else ""
    return RuleEvaluation("2_2S", violated, "REJECT", desc)


def evaluate_r_4s(z_scores: list[float]) -> RuleEvaluation:
    """R-4s: Range between two consecutive results exceeds 4 SD."""
    if len(z_scores) < 2:
        return RuleEvaluation("R_4S", False, "REJECT", "")
    a, b = z_scores[0], z_scores[1]
    # One >+2SD and the other <-2SD (or vice versa)
    violated = (a > 2.0 and b < -2.0) or (a < -2.0 and b > 2.0)
    desc = f"Range exceeds 4 SD: {a:.2f} and {b:.2f}" if violated else ""
    return RuleEvaluation("R_4S", violated, "REJECT", desc)


def evaluate_4_1s(z_scores: list[float]) -> RuleEvaluation:
    """4-1s: Four consecutive results exceed ±1 SD on same side."""
    if len(z_scores) < 4:
        return RuleEvaluation("4_1S", False, "REJECT", "")
    four = z_scores[:4]
    all_above = all(z > 1.0 for z in four)
    all_below = all(z < -1.0 for z in four)
    violated = all_above or all_below
    desc = (
        f"Four consecutive results beyond ±1 SD: {[f'{z:.2f}' for z in four]}" if violated else ""
    )
    return RuleEvaluation("4_1S", violated, "REJECT", desc)


def evaluate_10x(z_scores: list[float]) -> RuleEvaluation:
    """10x: Ten consecutive results on same side of mean."""
    if len(z_scores) < 10:
        return RuleEvaluation("10X", False, "REJECT", "")
    ten = z_scores[:10]
    all_positive = all(z > 0 for z in ten)
    all_negative = all(z < 0 for z in ten)
    violated = all_positive or all_negative
    side = "above" if all_positive else "below"
    desc = f"Ten consecutive results {side} mean" if violated else ""
    return RuleEvaluation("10X", violated, "REJECT", desc)


# Map rule types to evaluator functions
RULE_EVALUATORS = {
    "1_2S": evaluate_1_2s,
    "1_3S": evaluate_1_3s,
    "2_2S": evaluate_2_2s,
    "R_4S": evaluate_r_4s,
    "4_1S": evaluate_4_1s,
    "10X": evaluate_10x,
}


def evaluate_qc_result(qc_result: QCResult) -> list[RuleEvaluation]:
    """
    Evaluate a QC result against all active Westgard rules.

    Fetches recent results for multi-run rules and evaluates each active rule.

    Args:
        qc_result: The QCResult to evaluate

    Returns:
        List of RuleEvaluation results (both passed and failed)
    """
    # Get target for this result
    target = qc_result._get_target()
    if not target:
        return []

    # Fetch recent results for multi-point rules (most recent first, including current)
    recent_results = list(
        QCResult.objects.filter(
            lot=qc_result.lot,
            test=qc_result.test,
            instrument=qc_result.instrument,
            facility=qc_result.facility,
        )
        .order_by("-run_date")[:10]
        .values_list("value", flat=True)
    )

    # Calculate z-scores for all recent results
    z_scores = []
    for val in recent_results:
        z = get_z_score(val, target.mean, target.sd)
        if z is not None:
            z_scores.append(z)

    if not z_scores:
        return []

    # Get active rules for this test/facility
    active_rules = QCRule.objects.filter(
        facility=qc_result.facility,
        is_active=True,
    ).filter(models.Q(applies_to_test=qc_result.test) | models.Q(applies_to_test__isnull=True))

    evaluations = []
    for rule in active_rules:
        evaluator = RULE_EVALUATORS.get(rule.rule_type)
        if evaluator:
            evaluation = evaluator(z_scores)
            evaluations.append(evaluation)

    return evaluations


def apply_rules_and_record_violations(qc_result: QCResult) -> list[QCRuleViolation]:
    """
    Evaluate QC result and create violation records for any failed rules.

    This is the main entry point called after saving a QC result.

    Args:
        qc_result: The QCResult to evaluate

    Returns:
        List of created QCRuleViolation instances
    """
    target = qc_result._get_target()
    if not target:
        return []

    # Fetch recent results
    recent_results = list(
        QCResult.objects.filter(
            lot=qc_result.lot,
            test=qc_result.test,
            instrument=qc_result.instrument,
            facility=qc_result.facility,
        )
        .order_by("-run_date")[:10]
        .values_list("value", flat=True)
    )

    z_scores = []
    for val in recent_results:
        z = get_z_score(val, target.mean, target.sd)
        if z is not None:
            z_scores.append(z)

    if not z_scores:
        return []

    # Get active rules
    active_rules = QCRule.objects.filter(
        facility=qc_result.facility,
        is_active=True,
    ).filter(models.Q(applies_to_test=qc_result.test) | models.Q(applies_to_test__isnull=True))

    violations = []
    has_rejection = False

    for rule in active_rules:
        evaluator = RULE_EVALUATORS.get(rule.rule_type)
        if not evaluator:
            continue

        evaluation = evaluator(z_scores)
        if evaluation.violated:
            violation = QCRuleViolation.objects.create(
                qc_result=qc_result,
                rule=rule,
                severity=evaluation.severity,
                description=evaluation.description,
                facility=qc_result.facility,
                organization=qc_result.organization,
            )
            violations.append(violation)
            if evaluation.severity == "REJECT":
                has_rejection = True

    # Mark QC result as rejected if any reject-level rule was violated
    if has_rejection:
        qc_result.accepted = False
        qc_result.save(update_fields=["accepted"])

    return violations
