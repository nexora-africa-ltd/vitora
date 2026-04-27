"""
Domain event signals for AI models.

Publishes events when AI results are created, enabling
WebSocket consumers and read-model projections to react.

Auto-matching: when order items are created, attempts to link them
to existing AI advisory suggestions via fuzzy text matching.
"""

import logging
import re

from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import AIEvents

from .models import (
    AIAdvisoryOrderLink,
    AIAdvisoryOrderLinkStatus,
    AIInvestigationSuggestResult,
    AISurgicalPostOpCarePlanResult,
    AISurgicalPreOpAssessResult,
)

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


# =============================================================================
# Auto-matching: order items → AI advisory suggestion links
# =============================================================================

# Categories that correspond to each order type
_LAB_CATEGORIES = {"pre_op_checklist.investigations"}
_IMAGING_CATEGORIES = {"pre_op_checklist.investigations"}
_MED_CATEGORIES = {"medications", "post_op_care.medications"}

# Minimum word length to consider for overlap matching
_MIN_WORD_LEN = 3
# Minimum overlap ratio to consider a match
_MIN_OVERLAP = 0.4


def _tokenize(text: str) -> set[str]:
    """Lowercase, strip non-alphanumeric, return set of words >= _MIN_WORD_LEN."""
    return {w for w in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split() if len(w) >= _MIN_WORD_LEN}


def _fuzzy_match(order_text: str, suggestion_text: str) -> bool:
    """Check if order_text and suggestion_text are a fuzzy match.

    Matches if:
    - One is a case-insensitive substring of the other, OR
    - Word overlap ratio >= _MIN_OVERLAP
    """
    a = order_text.lower().strip()
    b = suggestion_text.lower().strip()

    # Substring match
    if a in b or b in a:
        return True

    # Word overlap
    words_a = _tokenize(a)
    words_b = _tokenize(b)
    if not words_a or not words_b:
        return False

    overlap = len(words_a & words_b)
    smaller = min(len(words_a), len(words_b))
    return (overlap / smaller) >= _MIN_OVERLAP


def _get_suggested_links_for_encounter(encounter_id: int, categories: set[str]):
    """Find SUGGESTED advisory links for AI results tied to a given encounter."""
    from hmis.apps.theatre.models import SurgeryCase

    case_ids = SurgeryCase.objects.filter(encounter_id=encounter_id).values_list("pk", flat=True)
    if not case_ids:
        return AIAdvisoryOrderLink.objects.none()

    # Collect content type IDs and AI result IDs for pre-op and post-op results
    ct_result_pairs: list[tuple[int, str]] = []
    for model_cls in (AISurgicalPreOpAssessResult, AISurgicalPostOpCarePlanResult):
        ct = ContentType.objects.get_for_model(model_cls)
        result_ids = model_cls.objects.filter(surgery_case_id__in=case_ids).values_list(
            "pk", flat=True
        )
        for rid in result_ids:
            ct_result_pairs.append((ct.pk, str(rid)))

    if not ct_result_pairs:
        return AIAdvisoryOrderLink.objects.none()

    from django.db.models import Q

    q = Q()
    for ct_id, rid in ct_result_pairs:
        q |= Q(ai_result_content_type_id=ct_id, ai_result_id=rid)

    return AIAdvisoryOrderLink.objects.filter(
        q,
        status=AIAdvisoryOrderLinkStatus.SUGGESTED,
        suggestion_category__in=categories,
    )


def _attempt_auto_match_lab_item(instance):
    """Auto-match a LabOrderItem to advisory suggestions."""
    try:
        lab_order = instance.lab_order
        encounter_id = lab_order.encounter_id
        if not encounter_id:
            return

        test_name = instance.test.name if instance.test_id else ""
        if not test_name:
            return

        links = _get_suggested_links_for_encounter(encounter_id, _LAB_CATEGORIES)
        for link in links:
            if _fuzzy_match(test_name, link.suggestion_text):
                link.status = AIAdvisoryOrderLinkStatus.ORDERED
                link.lab_order = lab_order
                link.actioned_at = timezone.now()
                link.save(update_fields=["status", "lab_order", "actioned_at"])
                logger.info(
                    "Auto-matched lab order %s to advisory link %s",
                    lab_order.pk,
                    link.pk,
                )
                break  # One match per item
    except Exception:
        logger.exception("Auto-match failed for LabOrderItem %s", instance.pk)


def _attempt_auto_match_imaging_item(instance):
    """Auto-match an ImagingOrderItem to advisory suggestions."""
    try:
        order = instance.order
        encounter_id = order.encounter_id
        if not encounter_id:
            return

        proc_name = instance.procedure.name if instance.procedure_id else ""
        if not proc_name:
            return

        links = _get_suggested_links_for_encounter(encounter_id, _IMAGING_CATEGORIES)
        for link in links:
            if _fuzzy_match(proc_name, link.suggestion_text):
                link.status = AIAdvisoryOrderLinkStatus.ORDERED
                link.imaging_order = order
                link.actioned_at = timezone.now()
                link.save(
                    update_fields=[
                        "status",
                        "imaging_order",
                        "actioned_at",
                    ]
                )
                logger.info(
                    "Auto-matched imaging order %s to advisory link %s",
                    order.pk,
                    link.pk,
                )
                break
    except Exception:
        logger.exception("Auto-match failed for ImagingOrderItem %s", instance.pk)


def _attempt_auto_match_prescription_item(instance):
    """Auto-match a PrescriptionItem to advisory suggestions."""
    try:
        prescription = instance.prescription
        encounter_id = prescription.encounter_id
        if not encounter_id:
            return

        drug_name = instance.drug.generic_name if instance.drug_id else ""
        if not drug_name:
            return

        links = _get_suggested_links_for_encounter(encounter_id, _MED_CATEGORIES)
        for link in links:
            if _fuzzy_match(drug_name, link.suggestion_text):
                link.status = AIAdvisoryOrderLinkStatus.ORDERED
                link.prescription = prescription
                link.actioned_at = timezone.now()
                link.save(
                    update_fields=[
                        "status",
                        "prescription",
                        "actioned_at",
                    ]
                )
                logger.info(
                    "Auto-matched prescription %s to advisory link %s",
                    prescription.pk,
                    link.pk,
                )
                break
    except Exception:
        logger.exception("Auto-match failed for PrescriptionItem %s", instance.pk)


@receiver(post_save, sender="laboratory.LabOrderItem")
def auto_match_lab_order_item(sender, instance, created, **kwargs):
    """When a LabOrderItem is created, try to auto-match to advisory suggestions."""
    if not created:
        return
    _attempt_auto_match_lab_item(instance)


@receiver(post_save, sender="imaging.ImagingOrderItem")
def auto_match_imaging_order_item(sender, instance, created, **kwargs):
    """When an ImagingOrderItem is created, try to auto-match to advisory suggestions."""
    if not created:
        return
    _attempt_auto_match_imaging_item(instance)


@receiver(post_save, sender="pharmacy.PrescriptionItem")
def auto_match_prescription_item(sender, instance, created, **kwargs):
    """When a PrescriptionItem is created, try to auto-match to advisory suggestions."""
    if not created:
        return
    _attempt_auto_match_prescription_item(instance)
