"""Domain event signals for Reflexive Testing."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import LaboratoryEvents

from .models import ReflexExecution


@receiver(post_save, sender=ReflexExecution)
def publish_reflex_event(sender, instance, created, **kwargs):
    """Publish event when a reflex rule fires."""
    if not created:
        return

    event_type = (
        LaboratoryEvents.REFLEX_ORDERED
        if instance.status == ReflexExecution.Status.ORDERED
        else LaboratoryEvents.REFLEX_SUGGESTED
    )

    publish_event(
        event_type,
        "ReflexExecution",
        instance.pk,
        payload={
            "rule_id": instance.rule_id,
            "trigger_result_id": instance.trigger_result_id,
            "reflex_order_id": instance.reflex_order_id,
            "status": instance.status,
            "trigger_value": instance.trigger_value,
        },
        facility_id=instance.facility_id,
    )
