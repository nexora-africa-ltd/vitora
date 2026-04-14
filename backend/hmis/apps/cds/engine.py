"""
CDS Rule Evaluation Engine.

Evaluates CDS rules against patient context to generate alerts.

Supports rule types:
- vital_range: Vital sign threshold checks
- drug_allergy: Drug-allergy interaction detection
- drug_drug: Drug-drug interaction detection
- lab_range: Critical lab value alerts
- custom: Custom JSON logic

Each rule condition is a JSON object with a 'type' field that determines
the evaluation strategy. Additional fields are type-specific.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db.models import QuerySet

logger = logging.getLogger(__name__)


@dataclass
class EvaluationContext:
    """Context data for rule evaluation."""

    patient_id: int
    encounter_id: int | None = None
    # Vitals
    temperature: Decimal | None = None
    pulse: int | None = None
    systolic_bp: int | None = None
    diastolic_bp: int | None = None
    respiratory_rate: int | None = None
    spo2: Decimal | None = None
    weight: Decimal | None = None
    height: Decimal | None = None
    # Patient info
    patient_age_years: int | None = None
    patient_gender: str | None = None
    # Allergies (list of substance names, lowercase)
    allergy_substances: list[str] = field(default_factory=list)
    allergy_drug_ids: list[int] = field(default_factory=list)
    # Allergy coded substances: list of {substance_code, substance_code_system}
    allergy_substance_codes: list[dict[str, str]] = field(default_factory=list)
    # Current medications (list of drug names, lowercase)
    current_medications: list[str] = field(default_factory=list)
    current_drug_ids: list[int] = field(default_factory=list)
    # Current medication HPT codes: list of hpt_code strings
    current_medication_hpt_codes: list[str] = field(default_factory=list)
    # Lab results: list of {test_name, value, unit, ...}
    lab_results: list[dict[str, Any]] = field(default_factory=list)
    # Prescribing context
    prescribing_drug_name: str | None = None
    prescribing_drug_id: int | None = None
    prescribing_drug_hpt_code: str | None = None
    # Extra context
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class EvaluationResult:
    """Result of a single rule evaluation."""

    triggered: bool
    rule_id: int
    rule_code: str
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)
    suggested_actions: list[dict[str, Any]] = field(default_factory=list)


def evaluate_rule(rule: Any, context: EvaluationContext) -> EvaluationResult:
    """
    Evaluate a single CDS rule against the provided context.

    Args:
        rule: CDSRule model instance (must have .id, .code, .condition, .action_message)
        context: EvaluationContext with patient data

    Returns:
        EvaluationResult indicating whether the rule triggered.
    """
    condition = rule.condition
    if not isinstance(condition, dict):
        logger.warning("Rule %s has invalid condition type: %s", rule.code, type(condition))
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    rule_type = condition.get("type", "")

    evaluator = _EVALUATORS.get(rule_type)
    if evaluator is None:
        logger.warning("Rule %s has unknown type: %s", rule.code, rule_type)
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    try:
        result = evaluator(rule, condition, context)
    except Exception:
        logger.exception("Error evaluating rule %s", rule.code)
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    # Attach suggested_actions from rule metadata when triggered
    if result.triggered:
        metadata = getattr(rule, "metadata", None) or {}
        result.suggested_actions = metadata.get("suggested_actions", [])

    return result


def evaluate_rules(
    rules: QuerySet | list,
    context: EvaluationContext,
) -> list[EvaluationResult]:
    """
    Evaluate multiple CDS rules against the provided context.

    Returns only results where the rule was triggered.
    """
    results: list[EvaluationResult] = []
    for rule in rules:
        result = evaluate_rule(rule, context)
        if result.triggered:
            results.append(result)
    return results


# ──────────────────────────── Evaluators ────────────────────────────


def _evaluate_vital_range(
    rule: Any,
    condition: dict[str, Any],
    context: EvaluationContext,
) -> EvaluationResult:
    """
    Evaluate vital sign range rules.

    Condition format:
    {
        "type": "vital_range",
        "vital": "temperature" | "pulse" | "spo2" | "systolic_bp" | "diastolic_bp" |
                 "respiratory_rate" | "weight" | "height",
        "min": 36.1,    # optional — triggers if value < min
        "max": 37.2,    # optional — triggers if value > max
        "min_label": "Hypothermia",  # optional
        "max_label": "Hyperthermia"  # optional
    }
    """
    vital_name = condition.get("vital", "")
    value = _get_vital_value(vital_name, context)

    if value is None:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    triggered = False
    details: dict[str, Any] = {"vital": vital_name, "value": float(value)}
    label = ""

    min_val = condition.get("min")
    max_val = condition.get("max")

    if min_val is not None:
        try:
            threshold = Decimal(str(min_val))
            if value < threshold:
                triggered = True
                label = condition.get("min_label", f"{vital_name} below {min_val}")
                details["threshold"] = float(threshold)
                details["direction"] = "below"
        except (InvalidOperation, ValueError):
            pass

    if max_val is not None and not triggered:
        try:
            threshold = Decimal(str(max_val))
            if value > threshold:
                triggered = True
                label = condition.get("max_label", f"{vital_name} above {max_val}")
                details["threshold"] = float(threshold)
                details["direction"] = "above"
        except (InvalidOperation, ValueError):
            pass

    message = _render_message(rule.action_message, {
        "vital": vital_name,
        "value": float(value),
        "label": label,
        **details,
    }) if triggered else ""

    return EvaluationResult(
        triggered=triggered,
        rule_id=rule.id,
        rule_code=rule.code,
        message=message,
        details=details,
    )


def _evaluate_drug_allergy(
    rule: Any,
    condition: dict[str, Any],
    context: EvaluationContext,
) -> EvaluationResult:
    """
    Evaluate drug-allergy interaction rules.

    Condition format:
    {
        "type": "drug_allergy",
        "check_mode": "prescribing"  # Check if prescribing drug matches an allergy
    }

    Or substance-specific:
    {
        "type": "drug_allergy",
        "substance": "penicillin",         # Specific substance to check
        "cross_reactive": ["amoxicillin", "ampicillin"]  # Optional cross-reactive drugs
    }
    """
    check_mode = condition.get("check_mode", "")

    if check_mode == "prescribing":
        return _check_prescribing_allergy(rule, condition, context)

    # Substance-specific check
    substance = condition.get("substance", "").lower()
    if not substance:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    cross_reactive = [s.lower() for s in condition.get("cross_reactive", [])]
    all_substances = [substance] + cross_reactive

    # Check if patient has allergy to any of these substances
    matched_allergy = None
    for allergy in context.allergy_substances:
        allergy_lower = allergy.lower()
        for s in all_substances:
            if s in allergy_lower or allergy_lower in s:
                matched_allergy = allergy
                break
        if matched_allergy:
            break

    if not matched_allergy:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    # Check if the drug being prescribed is the allergenic substance
    prescribing = (context.prescribing_drug_name or "").lower()
    if not prescribing:
        # No drug being prescribed — check current medications
        medication_match = None
        for med in context.current_medications:
            med_lower = med.lower()
            for s in all_substances:
                if s in med_lower or med_lower in s:
                    medication_match = med
                    break
            if medication_match:
                break

        if not medication_match:
            return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

        details = {
            "allergy": matched_allergy,
            "medication": medication_match,
            "substance": substance,
        }
        message = _render_message(rule.action_message, details)
        return EvaluationResult(
            triggered=True,
            rule_id=rule.id,
            rule_code=rule.code,
            message=message,
            details=details,
        )

    # Check if prescribing drug matches
    drug_matches = False
    for s in all_substances:
        if s in prescribing or prescribing in s:
            drug_matches = True
            break

    if not drug_matches:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    details = {
        "allergy": matched_allergy,
        "prescribing_drug": context.prescribing_drug_name,
        "substance": substance,
    }
    message = _render_message(rule.action_message, details)
    return EvaluationResult(
        triggered=True,
        rule_id=rule.id,
        rule_code=rule.code,
        message=message,
        details=details,
    )


def _check_prescribing_allergy(
    rule: Any,
    condition: dict[str, Any],
    context: EvaluationContext,
) -> EvaluationResult:
    """Check if the drug being prescribed conflicts with patient allergies."""
    prescribing = (context.prescribing_drug_name or "").lower()
    if not prescribing:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    # Try HPT/ATC-based matching first (deterministic)
    if context.prescribing_drug_hpt_code and context.allergy_substance_codes:
        hpt_match = _check_hpt_allergy_match(
            context.prescribing_drug_hpt_code,
            context.allergy_substance_codes,
            context.allergy_substances,
        )
        if hpt_match:
            details = {
                "allergy": hpt_match["allergy"],
                "prescribing_drug": context.prescribing_drug_name,
                "match_type": "hpt_coded",
                "substance_code": hpt_match.get("substance_code", ""),
            }
            message = _render_message(rule.action_message, details)
            return EvaluationResult(
                triggered=True,
                rule_id=rule.id,
                rule_code=rule.code,
                message=message,
                details=details,
            )

    # Fall back to text matching
    matched_allergy = None
    for allergy in context.allergy_substances:
        allergy_lower = allergy.lower()
        if prescribing in allergy_lower or allergy_lower in prescribing:
            matched_allergy = allergy
            break

    if not matched_allergy:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    details = {
        "allergy": matched_allergy,
        "prescribing_drug": context.prescribing_drug_name,
    }
    message = _render_message(rule.action_message, details)
    return EvaluationResult(
        triggered=True,
        rule_id=rule.id,
        rule_code=rule.code,
        message=message,
        details=details,
    )


def _check_hpt_allergy_match(
    drug_hpt_code: str,
    allergy_substance_codes: list[dict[str, str]],
    allergy_substances: list[str],
) -> dict[str, str] | None:
    """
    Check if a drug's HPT code matches any allergy substance code.

    Uses the generic_concept_id portion of KNHTS codes for grouping.
    E.g., drugs with KNHTS codes "10-03913-01" and "10-03913-02" share
    generic concept 03913 and would match an allergy coded with ATC A10BA02.

    For now, matches are based on the drug's generic name being looked up
    against the allergy's substance_code when both use ATC coding.
    """
    from hmis.apps.pharmacy.models import Drug

    try:
        drug = Drug.objects.filter(hpt_code=drug_hpt_code).first()
        if not drug:
            return None

        drug_generic_lower = drug.generic_name.lower()

        for i, coded in enumerate(allergy_substance_codes):
            substance_code = coded.get("substance_code", "")

            if not substance_code:
                continue

            # Match via substance name associated with the allergy
            allergy_name = (
                allergy_substances[i].lower() if i < len(allergy_substances) else ""
            )
            if allergy_name and (
                drug_generic_lower in allergy_name or allergy_name in drug_generic_lower
            ):
                return {
                    "allergy": allergy_substances[i] if i < len(allergy_substances) else "",
                    "substance_code": substance_code,
                    "match_type": "hpt_coded",
                }
    except Exception:
        logger.debug("HPT allergy matching failed, falling back to text", exc_info=True)

    return None


def _evaluate_drug_drug(
    rule: Any,
    condition: dict[str, Any],
    context: EvaluationContext,
) -> EvaluationResult:
    """
    Evaluate drug-drug interaction rules.

    Condition format:
    {
        "type": "drug_drug",
        "drug_a": "warfarin",
        "drug_b": "aspirin",
        "severity": "major",
        "drug_a_hpt_code": "10-XXXXX-XX",  # Optional HPT code for deterministic matching
        "drug_b_hpt_code": "10-YYYYY-YY"   # Optional HPT code for deterministic matching
    }
    """
    drug_a = condition.get("drug_a", "").lower()
    drug_b = condition.get("drug_b", "").lower()

    if not drug_a or not drug_b:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    # Try HPT code matching first (deterministic)
    drug_a_hpt = condition.get("drug_a_hpt_code", "")
    drug_b_hpt = condition.get("drug_b_hpt_code", "")

    all_hpt_codes = list(context.current_medication_hpt_codes)
    if context.prescribing_drug_hpt_code:
        all_hpt_codes.append(context.prescribing_drug_hpt_code)

    if drug_a_hpt and drug_b_hpt and all_hpt_codes:
        has_a = drug_a_hpt in all_hpt_codes
        has_b = drug_b_hpt in all_hpt_codes
        if has_a and has_b:
            details = {
                "drug_a": drug_a,
                "drug_b": drug_b,
                "severity": condition.get("severity", "unknown"),
                "match_type": "hpt_coded",
            }
            message = _render_message(rule.action_message, details)
            return EvaluationResult(
                triggered=True,
                rule_id=rule.id,
                rule_code=rule.code,
                message=message,
                details=details,
            )

    # Fall back to text matching
    all_drugs = [m.lower() for m in context.current_medications]
    prescribing = (context.prescribing_drug_name or "").lower()
    if prescribing:
        all_drugs.append(prescribing)

    has_a = any(drug_a in d or d in drug_a for d in all_drugs)
    has_b = any(drug_b in d or d in drug_b for d in all_drugs)

    if not (has_a and has_b):
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    details = {
        "drug_a": drug_a,
        "drug_b": drug_b,
        "severity": condition.get("severity", "unknown"),
    }
    message = _render_message(rule.action_message, details)
    return EvaluationResult(
        triggered=True,
        rule_id=rule.id,
        rule_code=rule.code,
        message=message,
        details=details,
    )


def _evaluate_lab_range(
    rule: Any,
    condition: dict[str, Any],
    context: EvaluationContext,
) -> EvaluationResult:
    """
    Evaluate critical lab value rules.

    Condition format:
    {
        "type": "lab_range",
        "test_name": "potassium",
        "critical_low": 2.5,
        "critical_high": 6.5,
        "unit": "mmol/L"
    }
    """
    test_name = condition.get("test_name", "").lower()
    if not test_name:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    # Find matching lab result
    matched_result = None
    for lab in context.lab_results:
        lab_name = str(lab.get("test_name", "")).lower()
        if test_name in lab_name or lab_name in test_name:
            matched_result = lab
            break

    if not matched_result:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    try:
        value = Decimal(str(matched_result.get("value", "")))
    except (InvalidOperation, ValueError):
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    triggered = False
    details: dict[str, Any] = {
        "test_name": test_name,
        "value": float(value),
        "unit": condition.get("unit", ""),
    }

    critical_low = condition.get("critical_low")
    critical_high = condition.get("critical_high")

    if critical_low is not None:
        try:
            threshold = Decimal(str(critical_low))
            if value < threshold:
                triggered = True
                details["threshold"] = float(threshold)
                details["direction"] = "critically_low"
        except (InvalidOperation, ValueError):
            pass

    if critical_high is not None and not triggered:
        try:
            threshold = Decimal(str(critical_high))
            if value > threshold:
                triggered = True
                details["threshold"] = float(threshold)
                details["direction"] = "critically_high"
        except (InvalidOperation, ValueError):
            pass

    message = _render_message(rule.action_message, details) if triggered else ""
    return EvaluationResult(
        triggered=triggered,
        rule_id=rule.id,
        rule_code=rule.code,
        message=message,
        details=details,
    )


def _evaluate_custom(
    rule: Any,
    condition: dict[str, Any],
    context: EvaluationContext,
) -> EvaluationResult:
    """
    Evaluate custom rules using simple boolean logic on context fields.

    Condition format:
    {
        "type": "custom",
        "field": "patient_age_years",
        "operator": "gte",   # eq, ne, gt, gte, lt, lte, in, not_in, contains
        "value": 65,
        "label": "Elderly patient"
    }
    """
    field_name = condition.get("field", "")
    operator = condition.get("operator", "eq")
    expected = condition.get("value")

    if not field_name:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    # Get actual value from context
    actual = getattr(context, field_name, None)
    if actual is None:
        actual = context.extra.get(field_name)

    if actual is None and operator not in ("eq", "ne"):
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    triggered = _compare(actual, operator, expected)

    details = {
        "field": field_name,
        "actual_value": _serializable(actual),
        "operator": operator,
        "expected_value": _serializable(expected),
        "label": condition.get("label", ""),
    }
    message = _render_message(rule.action_message, details) if triggered else ""
    return EvaluationResult(
        triggered=triggered,
        rule_id=rule.id,
        rule_code=rule.code,
        message=message,
        details=details,
    )


def _evaluate_ml_model(
    rule: Any,
    condition: dict[str, Any],
    context: EvaluationContext,
) -> EvaluationResult:
    """
    Evaluate ML model prediction rules.

    These rules integrate with TibaBot AI predictions (ICU risk, sepsis,
    deterioration) that have been cached in the evaluation context's ``extra``
    dict under the key ``"ml_predictions"``.

    The view layer is responsible for calling TibaBot and injecting the
    prediction results into ``context.extra["ml_predictions"]`` before
    calling the engine.  This keeps the engine synchronous and testable.

    Condition format::

        {
            "type": "ml_model",
            "model_name": "sepsis_risk_v2",
            "threshold": 0.75,
            "input_features": ["temperature", "pulse", "respiratory_rate", "spo2", "wbc"],
            "score_field": "sepsis_probability"
        }

    - ``model_name``: Identifies which ML model produced the score.
    - ``threshold``: Minimum score to trigger the alert (0.0–1.0).
    - ``score_field``: Key in the prediction result dict that holds the
      score.  Defaults to ``"risk_score"`` if not specified.
    - ``input_features``: Informational — lists the features fed to the
      model.  Not used for evaluation (the model already ran).
    """
    model_name = condition.get("model_name", "")
    threshold = condition.get("threshold", 0.5)
    score_field = condition.get("score_field", "risk_score")

    if not model_name:
        logger.warning("Rule %s: ml_model condition missing model_name", rule.code)
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    # Look up cached prediction from context.extra
    ml_predictions = context.extra.get("ml_predictions", {})
    prediction = ml_predictions.get(model_name)

    if prediction is None:
        # No prediction available — model wasn't run or is unavailable
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    score = prediction.get(score_field)
    if score is None:
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    try:
        score = float(score)
        threshold = float(threshold)
    except (TypeError, ValueError):
        return EvaluationResult(triggered=False, rule_id=rule.id, rule_code=rule.code)

    triggered = score >= threshold

    details: dict[str, Any] = {
        "model_name": model_name,
        "score_field": score_field,
        "score": score,
        "threshold": threshold,
        "risk_level": prediction.get("risk_level", ""),
        "input_features": condition.get("input_features", []),
    }

    message = _render_message(rule.action_message, details) if triggered else ""

    return EvaluationResult(
        triggered=triggered,
        rule_id=rule.id,
        rule_code=rule.code,
        message=message,
        details=details,
    )


# ──────────────────────────── Helpers ────────────────────────────

_EVALUATORS = {
    "vital_range": _evaluate_vital_range,
    "drug_allergy": _evaluate_drug_allergy,
    "drug_drug": _evaluate_drug_drug,
    "lab_range": _evaluate_lab_range,
    "custom": _evaluate_custom,
    "ml_model": _evaluate_ml_model,
}


def _get_vital_value(vital_name: str, context: EvaluationContext) -> Decimal | None:
    """Get a vital sign value from context by name."""
    mapping: dict[str, Any] = {
        "temperature": context.temperature,
        "pulse": context.pulse,
        "spo2": context.spo2,
        "systolic_bp": context.systolic_bp,
        "diastolic_bp": context.diastolic_bp,
        "respiratory_rate": context.respiratory_rate,
        "weight": context.weight,
        "height": context.height,
    }
    value = mapping.get(vital_name)
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _render_message(template: str, variables: dict[str, Any]) -> str:
    """Render a message template with variable substitution."""
    try:
        return template.format(**variables)
    except (KeyError, IndexError):
        # Fall back — return template with any substitutions that work
        result = template
        for key, val in variables.items():
            result = result.replace(f"{{{key}}}", str(val))
        return result


def _compare(actual: Any, operator: str, expected: Any) -> bool:
    """Compare two values with the given operator."""
    ops: dict[str, Any] = {
        "eq": lambda a, e: a == e,
        "ne": lambda a, e: a != e,
        "gt": lambda a, e: a > e,
        "gte": lambda a, e: a >= e,
        "lt": lambda a, e: a < e,
        "lte": lambda a, e: a <= e,
        "in": lambda a, e: a in (e if isinstance(e, (list, tuple)) else [e]),
        "not_in": lambda a, e: a not in (e if isinstance(e, (list, tuple)) else [e]),
        "contains": lambda a, e: str(e).lower() in str(a).lower(),
    }
    func = ops.get(operator)
    if func is None:
        return False
    try:
        return func(actual, expected)
    except (TypeError, ValueError):
        return False


def _serializable(value: Any) -> Any:
    """Make a value JSON-serializable."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (list, tuple)):
        return [_serializable(v) for v in value]
    return value


# ──────────────────────────── High-level API ────────────────────────────


def build_encounter_context(encounter: Any) -> EvaluationContext:
    """
    Build an EvaluationContext from an Encounter model instance.

    Pulls vitals, patient info, allergies, and current medications.
    """
    from datetime import date as date_type

    patient = encounter.patient
    ctx = EvaluationContext(
        patient_id=patient.id,
        encounter_id=encounter.id,
    )

    # Vitals
    ctx.temperature = encounter.temperature
    ctx.pulse = encounter.pulse
    ctx.respiratory_rate = encounter.respiratory_rate
    ctx.spo2 = getattr(encounter, "spo2", None)
    ctx.weight = encounter.weight
    ctx.height = encounter.height

    # Parse blood pressure "120/80"
    bp = getattr(encounter, "blood_pressure", "") or ""
    if "/" in bp:
        parts = bp.split("/")
        try:
            ctx.systolic_bp = int(parts[0].strip())
            ctx.diastolic_bp = int(parts[1].strip())
        except (ValueError, IndexError):
            pass

    # Patient demographics
    if hasattr(patient, "date_of_birth") and patient.date_of_birth:
        today = date_type.today()
        dob = patient.date_of_birth
        # Handle string DOB (e.g., "1985-05-20")
        if isinstance(dob, str):
            try:
                dob = date_type.fromisoformat(dob)
            except ValueError:
                dob = None
        if dob is not None:
            ctx.patient_age_years = (
                today.year
                - dob.year
                - ((today.month, today.day) < (dob.month, dob.day))
            )
    ctx.patient_gender = getattr(patient, "gender", None)

    # Allergies
    if hasattr(patient, "allergies"):
        active_allergies = patient.allergies.filter(status="active")
        ctx.allergy_substances = [a.substance.lower() for a in active_allergies]
        ctx.allergy_drug_ids = [a.drug_id for a in active_allergies if a.drug_id]

    # Current medications (from encounter)
    medications_text = getattr(encounter, "current_medications", "") or ""
    if medications_text:
        ctx.current_medications = [
            m.strip().lower() for m in medications_text.split(",") if m.strip()
        ]

    return ctx


def evaluate_encounter(encounter: Any) -> list[EvaluationResult]:
    """
    Evaluate all active CDS rules against an encounter.

    Returns list of triggered results.
    """
    from .models import CDSRule, CDSRuleStatus

    context = build_encounter_context(encounter)
    active_rules = CDSRule.objects.filter(status=CDSRuleStatus.ACTIVE)
    return evaluate_rules(active_rules, context)
