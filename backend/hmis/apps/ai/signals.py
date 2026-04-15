"""
Domain event signals for AI models.

Publishes events when AI results are created, enabling
WebSocket consumers and read-model projections to react.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import AIEvents

from .models import AIInvestigationSuggestResult

logger = logging.getLogger(__name__)


@receiver(post_save, sender=AIInvestigationSuggestResult)
def publish_investigation_suggest_event(sender, instance, created, **kwargs):
    """Publish domain event when investigation suggestion result is created."""
    if not created:
        return
    try:
        publish_event(
            event_type=AIEvents.INVESTIGATION_SUGGEST_CREATED,
            aggregate_type="AIInvestigationSuggestResult",
            aggregate_id=str(instance.pk),
            payload={
                "id": str(instance.pk),
                "encounter_id": instance.encounter_id,
                "suggestion_count": instance.suggestion_count,
                "matched_conditions": instance.matched_conditions,
                "created_by_id": instance.created_by_id,
            },
        )
    except Exception:
        logger.exception("Failed to publish investigation suggest event")
