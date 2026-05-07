"""
Reflex testing engine.
Evaluates reflex rules when lab results are entered.
"""

import logging

from .models import ReflexExecution, ReflexRule

logger = logging.getLogger(__name__)


def evaluate_reflex_rules(lab_result):
    """
    Evaluate all active reflex rules for a given lab result.

    Args:
        lab_result: LabResult instance (must have order_item.test and order_item.lab_order loaded)

    Returns:
        list[ReflexExecution]: List of triggered reflex executions
    """
    test = lab_result.order_item.test
    facility = lab_result.order_item.lab_order.facility

    rules = ReflexRule.objects.filter(
        trigger_test=test,
        facility=facility,
        is_active=True,
    ).select_related("reflex_test")

    if not rules.exists():
        return []

    # Get the result value
    result_value = (
        lab_result.numeric_value if lab_result.numeric_value is not None else lab_result.text_value
    )

    executions = []
    for rule in rules:
        if rule.evaluate(result_value, lab_result):
            # Check if already triggered for this result
            if ReflexExecution.objects.filter(rule=rule, trigger_result=lab_result).exists():
                continue

            execution = ReflexExecution.objects.create(
                rule=rule,
                trigger_result=lab_result,
                trigger_value=str(result_value or ""),
                status=(
                    ReflexExecution.Status.ORDERED
                    if rule.action == ReflexRule.Action.AUTO_ORDER
                    else ReflexExecution.Status.SUGGESTED
                ),
                facility=facility,
                organization=facility.organization,
            )

            if rule.action == ReflexRule.Action.AUTO_ORDER:
                _create_reflex_order(execution, lab_result, rule)

            executions.append(execution)
            logger.info(
                "Reflex rule %s fired for result %s: %s → %s",
                rule.pk,
                lab_result.pk,
                test.code,
                rule.reflex_test.code,
            )

    return executions


def _create_reflex_order(execution, trigger_result, rule):
    """
    Auto-create a lab order for a reflexed test.
    """
    from hmis.apps.laboratory.models import LabOrder, LabOrderItem

    original_order = trigger_result.order_item.lab_order

    # Create the reflex order
    reflex_order = LabOrder.objects.create(
        patient=original_order.patient,
        encounter=original_order.encounter,
        ordered_by=original_order.ordered_by,
        facility=original_order.facility,
        organization=original_order.organization,
        priority=rule.priority,
        clinical_notes=f"Reflex order: {rule.trigger_test.name} result triggered {rule.reflex_test.name}",
        status="ORDERED",
    )

    # Create the order item
    LabOrderItem.objects.create(
        lab_order=reflex_order,
        test=rule.reflex_test,
        unit_cost=rule.reflex_test.cost,
    )

    # Link the execution to the order
    execution.reflex_order = reflex_order
    execution.save(update_fields=["reflex_order"])

    return reflex_order
