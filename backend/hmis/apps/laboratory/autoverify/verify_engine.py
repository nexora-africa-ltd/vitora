"""
Auto-Verification Engine.
Evaluates all active rules for a lab result and auto-verifies if all pass.
"""

from django.db.models import Q
from django.utils import timezone

from .models import AutoVerifyConfig, AutoVerifyLog, AutoVerifyRule, DeltaCheckResult


def evaluate_auto_verify(lab_result) -> AutoVerifyLog:
    """
    Evaluate auto-verification rules for a lab result.

    Checks the facility config, evaluates each active rule for the test,
    and auto-verifies the result if all rules pass.

    Args:
        lab_result: LabResult instance

    Returns:
        AutoVerifyLog instance (saved)
    """

    test = lab_result.order_item.test
    facility = lab_result.order_item.lab_order.facility
    order = lab_result.order_item.lab_order

    # Check facility config
    config = AutoVerifyConfig.objects.filter(facility=facility).first()
    if not config or not config.is_enabled:
        return AutoVerifyLog.objects.create(
            result=lab_result,
            outcome=AutoVerifyLog.Outcome.SKIPPED,
            rules_evaluated=[],
            facility=facility,
            organization=facility.organization if facility else None,
        )

    # Check if priority is excluded
    if order.priority in (config.excluded_priorities or []):
        return AutoVerifyLog.objects.create(
            result=lab_result,
            outcome=AutoVerifyLog.Outcome.SKIPPED,
            rules_evaluated=[{"reason": f"Priority '{order.priority}' excluded"}],
            facility=facility,
            organization=facility.organization if facility else None,
        )

    # Check daily cap
    if _is_cap_exceeded(facility, config):
        return AutoVerifyLog.objects.create(
            result=lab_result,
            outcome=AutoVerifyLog.Outcome.CAP_EXCEEDED,
            rules_evaluated=[{"reason": "Daily auto-verify cap exceeded"}],
            facility=facility,
            organization=facility.organization if facility else None,
        )

    # Get active rules for this test
    rules = AutoVerifyRule.objects.filter(
        Q(test=test) | Q(test__isnull=True),
        facility=facility,
        is_active=True,
    )

    if not rules.exists():
        return AutoVerifyLog.objects.create(
            result=lab_result,
            outcome=AutoVerifyLog.Outcome.SKIPPED,
            rules_evaluated=[{"reason": "No active rules for this test"}],
            facility=facility,
            organization=facility.organization if facility else None,
        )

    # Evaluate each rule
    evaluations = []
    blocking_rule = None

    for rule in rules:
        passed, detail = _evaluate_condition(rule, lab_result, config)
        evaluations.append(
            {
                "rule_id": rule.pk,
                "condition_type": rule.condition_type,
                "passed": passed,
                "detail": detail,
            }
        )
        if not passed and blocking_rule is None:
            blocking_rule = rule

    # Determine outcome
    all_passed = all(e["passed"] for e in evaluations)

    if all_passed:
        # Auto-verify the result
        lab_result.verification_status = "VERIFIED"
        lab_result.verified_at = timezone.now()
        lab_result.save(update_fields=["verification_status", "verified_at", "updated_at"])

        log = AutoVerifyLog.objects.create(
            result=lab_result,
            outcome=AutoVerifyLog.Outcome.AUTO_VERIFIED,
            rules_evaluated=evaluations,
            auto_verified_by_system=True,
            facility=facility,
            organization=facility.organization if facility else None,
        )
    else:
        log = AutoVerifyLog.objects.create(
            result=lab_result,
            outcome=AutoVerifyLog.Outcome.BLOCKED,
            rules_evaluated=evaluations,
            blocking_rule=blocking_rule,
            facility=facility,
            organization=facility.organization if facility else None,
        )

    return log


def _is_cap_exceeded(facility, config: AutoVerifyConfig) -> bool:
    """Check if the daily auto-verify percentage cap has been exceeded."""
    from hmis.apps.laboratory.models import LabResult

    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

    total_results_today = LabResult.objects.filter(
        order_item__lab_order__facility=facility,
        entered_at__gte=today_start,
    ).count()

    if total_results_today == 0:
        return False

    auto_verified_today = AutoVerifyLog.objects.filter(
        facility=facility,
        outcome=AutoVerifyLog.Outcome.AUTO_VERIFIED,
        evaluated_at__gte=today_start,
    ).count()

    current_percent = (auto_verified_today / total_results_today) * 100
    return current_percent >= config.max_auto_verify_percent


def _evaluate_condition(
    rule: AutoVerifyRule, lab_result, config: AutoVerifyConfig
) -> tuple[bool, str]:
    """
    Evaluate a single auto-verify condition.

    Returns:
        (passed: bool, detail: str)
    """
    condition = rule.condition_type
    params = rule.parameters or {}

    if condition == AutoVerifyRule.ConditionType.IN_REFERENCE_RANGE:
        return _check_in_reference_range(lab_result)

    elif condition == AutoVerifyRule.ConditionType.DELTA_CHECK_PASS:
        return _check_delta_pass(lab_result)

    elif condition == AutoVerifyRule.ConditionType.QC_IN_CONTROL:
        return _check_qc_in_control(lab_result)

    elif condition == AutoVerifyRule.ConditionType.NO_CRITICAL_FLAG:
        return _check_no_critical_flag(lab_result)

    elif condition == AutoVerifyRule.ConditionType.SPECIMEN_AGE_OK:
        max_hours = params.get("max_specimen_age_hours", config.max_specimen_age_hours)
        return _check_specimen_age(lab_result, max_hours)

    elif condition == AutoVerifyRule.ConditionType.NUMERIC_RESULT:
        return _check_numeric_result(lab_result)

    elif condition == AutoVerifyRule.ConditionType.NOT_AMENDED:
        return _check_not_amended(lab_result)

    return False, f"Unknown condition type: {condition}"


def _check_in_reference_range(lab_result) -> tuple[bool, str]:
    """Result must be within reference range (not flagged HIGH/LOW/CRITICAL)."""
    if lab_result.numeric_value is None:
        return False, "No numeric value"
    flag = lab_result.result_flag
    if flag in ("LOW", "HIGH", "CRITICAL_LOW", "CRITICAL_HIGH", "ABNORMAL"):
        return False, f"Flagged as {flag}"
    return True, "Within reference range"


def _check_delta_pass(lab_result) -> tuple[bool, str]:
    """Delta check must have passed (or have no prior result)."""
    try:
        delta = lab_result.delta_check
        if delta.outcome == DeltaCheckResult.Outcome.FAIL:
            return False, f"Delta check failed: {delta.delta_percent}% change"
        return True, f"Delta check {delta.outcome}"
    except DeltaCheckResult.DoesNotExist:
        # No delta check evaluated — treat as pass (no rule configured)
        return True, "No delta check rule configured"


def _check_qc_in_control(lab_result) -> tuple[bool, str]:
    """QC must be in control for the instrument that produced this result."""
    from hmis.apps.laboratory.qc.models import QCRuleViolation

    instrument_name = lab_result.equipment
    if not instrument_name:
        return True, "No instrument specified"

    # Check for unacknowledged violations today
    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    violations = QCRuleViolation.objects.filter(
        qc_result__instrument__name__icontains=instrument_name,
        qc_result__facility=lab_result.order_item.lab_order.facility,
        qc_result__run_date__gte=today_start.date(),
        acknowledged=False,
    ).exists()

    if violations:
        return False, "Unacknowledged QC violations for instrument"
    return True, "QC in control"


def _check_no_critical_flag(lab_result) -> tuple[bool, str]:
    """Result must not have critical flags."""
    if lab_result.is_critical_result:
        return False, "Critical result flag set"
    if lab_result.result_flag in ("CRITICAL_LOW", "CRITICAL_HIGH"):
        return False, f"Critical flag: {lab_result.result_flag}"
    return True, "No critical flags"


def _check_specimen_age(lab_result, max_hours: int) -> tuple[bool, str]:
    """Specimen must not be older than max_hours."""
    specimen = lab_result.specimen
    if not specimen:
        return True, "No specimen linked"

    if not hasattr(specimen, "collected_at") or specimen.collected_at is None:
        return True, "No collection time recorded"

    age_hours = (timezone.now() - specimen.collected_at).total_seconds() / 3600
    if age_hours > max_hours:
        return False, f"Specimen age {age_hours:.1f}h exceeds max {max_hours}h"
    return True, f"Specimen age {age_hours:.1f}h within limit"


def _check_numeric_result(lab_result) -> tuple[bool, str]:
    """Result must be a numeric value."""
    if lab_result.numeric_value is not None:
        return True, "Numeric result present"
    return False, "Non-numeric result"


def _check_not_amended(lab_result) -> tuple[bool, str]:
    """Result must not be an amendment."""
    if lab_result.is_amended:
        return False, "Amended result"
    return True, "Not amended"
