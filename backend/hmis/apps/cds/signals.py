"""
CDS Signals — Auto-evaluate CDS rules on encounter save.
"""

from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender="encounters.Encounter")
def evaluate_cds_on_encounter_save(sender: type, instance: object, created: bool, **kwargs: object) -> None:
    """
    Evaluate CDS rules when an encounter is created or updated.

    Only generates new alerts for triggered rules that don't already
    have a pending alert for the same patient + rule combination.
    """
    from .engine import build_encounter_context, evaluate_rules
    from .models import CDSAlert, CDSAlertStatus, CDSRule, CDSRuleStatus

    try:
        active_rules = CDSRule.objects.filter(status=CDSRuleStatus.ACTIVE)
        if not active_rules.exists():
            return

        context = build_encounter_context(instance)
        results = evaluate_rules(active_rules, context)

        for result in results:
            # Skip if there's already a pending alert for this rule + patient
            existing = CDSAlert.objects.filter(
                rule_id=result.rule_id,
                patient_id=context.patient_id,
                status=CDSAlertStatus.PENDING,
            ).exists()

            if not existing:
                rule = CDSRule.objects.get(id=result.rule_id)
                details = result.details.copy() if result.details else {}
                if result.suggested_actions:
                    details["suggested_actions"] = result.suggested_actions
                CDSAlert.objects.create(
                    rule=rule,
                    patient_id=context.patient_id,
                    encounter=instance,  # type: ignore[misc]
                    priority=rule.priority,
                    message=result.message,
                    suggestion=rule.suggestion,
                    details=details,
                )
                logger.info(
                    "CDS alert created: rule=%s patient=%s",
                    rule.code,
                    context.patient_id,
                )
    except Exception:
        logger.exception("Error in CDS encounter signal")
