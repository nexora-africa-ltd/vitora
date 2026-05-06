"""
Delta Check Engine.
Compares current lab result to patient's most recent prior result
and evaluates against configured thresholds.
"""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from .models import DeltaCheckResult, DeltaCheckRule


def evaluate_delta_check(lab_result) -> DeltaCheckResult | None:
    """
    Evaluate delta check for a lab result.

    Looks up the active DeltaCheckRule for the test at this facility,
    finds the patient's most recent prior result for the same test,
    and computes the delta.

    Args:
        lab_result: LabResult instance (must have order_item.test, order_item.lab_order.patient)

    Returns:
        DeltaCheckResult instance (saved), or None if no rule exists for this test.
    """
    from hmis.apps.laboratory.models import LabResult

    test = lab_result.order_item.test
    patient = lab_result.order_item.lab_order.patient
    facility = lab_result.order_item.lab_order.facility

    # Find active rule for this test at this facility
    rule = DeltaCheckRule.objects.filter(
        test=test,
        facility=facility,
        is_active=True,
    ).first()

    if not rule:
        return None

    # Current result must be numeric
    if lab_result.numeric_value is None:
        return DeltaCheckResult.objects.create(
            result=lab_result,
            rule=rule,
            outcome=DeltaCheckResult.Outcome.SKIPPED,
            facility=facility,
            organization=facility.organization if facility else None,
        )

    # Find previous result for same patient + test within lookback window
    lookback_cutoff = timezone.now() - timedelta(hours=rule.lookback_hours)
    previous = (
        LabResult.objects.filter(
            order_item__test=test,
            order_item__lab_order__patient=patient,
            order_item__lab_order__facility=facility,
            numeric_value__isnull=False,
            entered_at__gte=lookback_cutoff,
        )
        .exclude(pk=lab_result.pk)
        .order_by("-entered_at")
        .first()
    )

    if not previous:
        return DeltaCheckResult.objects.create(
            result=lab_result,
            rule=rule,
            outcome=DeltaCheckResult.Outcome.NO_PRIOR,
            current_value=lab_result.numeric_value,
            facility=facility,
            organization=facility.organization if facility else None,
        )

    # Calculate deltas
    current_val = lab_result.numeric_value
    previous_val = previous.numeric_value
    delta_abs = abs(current_val - previous_val)

    if previous_val != Decimal("0"):
        delta_pct = (delta_abs / abs(previous_val)) * Decimal("100")
    else:
        delta_pct = Decimal("100") if current_val != Decimal("0") else Decimal("0")

    # Evaluate against thresholds
    failed = False
    if rule.check_type == DeltaCheckRule.CheckType.PERCENT:
        failed = delta_pct > rule.threshold_percent
    elif rule.check_type == DeltaCheckRule.CheckType.ABSOLUTE:
        failed = delta_abs > rule.threshold_absolute
    elif rule.check_type == DeltaCheckRule.CheckType.BOTH:
        # Either threshold breach triggers failure
        failed = (rule.threshold_percent is not None and delta_pct > rule.threshold_percent) or (
            rule.threshold_absolute is not None and delta_abs > rule.threshold_absolute
        )

    outcome = DeltaCheckResult.Outcome.FAIL if failed else DeltaCheckResult.Outcome.PASS

    return DeltaCheckResult.objects.create(
        result=lab_result,
        rule=rule,
        previous_result=previous,
        outcome=outcome,
        current_value=current_val,
        previous_value=previous_val,
        delta_percent=delta_pct,
        delta_absolute=delta_abs,
        action_taken=rule.action if failed else "",
        facility=facility,
        organization=facility.organization if facility else None,
    )
