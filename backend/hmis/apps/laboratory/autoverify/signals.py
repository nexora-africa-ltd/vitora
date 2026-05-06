"""Domain event signals for Delta Checks & Auto-Verification."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import LaboratoryEvents

from .models import AutoVerifyLog, DeltaCheckResult


@receiver(post_save, sender=DeltaCheckResult)
def publish_delta_check_event(sender, instance, created, **kwargs):
    """Publish event when a delta check fails."""
    if created and instance.outcome == DeltaCheckResult.Outcome.FAIL:
        publish_event(
            LaboratoryEvents.DELTA_CHECK_FAILED,
            "DeltaCheckResult",
            instance.pk,
            payload={
                "result_id": instance.result_id,
                "outcome": instance.outcome,
                "delta_percent": str(instance.delta_percent) if instance.delta_percent else None,
                "delta_absolute": str(instance.delta_absolute) if instance.delta_absolute else None,
                "action_taken": instance.action_taken,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=AutoVerifyLog)
def publish_auto_verify_event(sender, instance, created, **kwargs):
    """Publish event when a result is auto-verified or blocked."""
    if not created:
        return

    if instance.outcome == AutoVerifyLog.Outcome.AUTO_VERIFIED:
        publish_event(
            LaboratoryEvents.AUTO_VERIFY_PASSED,
            "AutoVerifyLog",
            instance.pk,
            payload={
                "result_id": instance.result_id,
                "rules_evaluated_count": len(instance.rules_evaluated or []),
            },
            facility_id=instance.facility_id,
        )
    elif instance.outcome == AutoVerifyLog.Outcome.BLOCKED:
        publish_event(
            LaboratoryEvents.AUTO_VERIFY_BLOCKED,
            "AutoVerifyLog",
            instance.pk,
            payload={
                "result_id": instance.result_id,
                "blocking_rule_id": instance.blocking_rule_id,
                "rules_evaluated": instance.rules_evaluated,
            },
            facility_id=instance.facility_id,
        )
