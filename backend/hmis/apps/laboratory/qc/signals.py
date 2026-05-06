"""
Django signals for QC module.

Publishes domain events for QC results and rule violations.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import LaboratoryEvents, publish_event

from .models import EQASubmission, QCResult, QCRuleViolation

logger = logging.getLogger(__name__)


@receiver(post_save, sender=QCResult)
def publish_qc_result_event(sender, instance, created, **kwargs):
    """Publish event when a QC result is entered."""
    if created:
        publish_event(
            LaboratoryEvents.QC_RESULT_ENTERED,
            "QCResult",
            instance.pk,
            payload={
                "lot_id": instance.lot_id,
                "test_id": instance.test_id,
                "value": str(instance.value),
                "accepted": instance.accepted,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=QCRuleViolation)
def publish_qc_violation_event(sender, instance, created, **kwargs):
    """Publish event when a QC rule violation is recorded."""
    if created:
        publish_event(
            LaboratoryEvents.QC_RULE_VIOLATED,
            "QCRuleViolation",
            instance.pk,
            payload={
                "qc_result_id": instance.qc_result_id,
                "rule_id": instance.rule_id,
                "severity": instance.severity,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=EQASubmission)
def publish_eqa_unacceptable_event(sender, instance, created, **kwargs):
    """Publish event when an EQA submission is scored as unacceptable."""
    if not created and instance.performance == EQASubmission.Performance.UNACCEPTABLE:
        publish_event(
            LaboratoryEvents.EQA_SUBMISSION_UNACCEPTABLE,
            "EQASubmission",
            instance.pk,
            payload={
                "sample_id": instance.sample_id,
                "z_score": str(instance.z_score) if instance.z_score else None,
            },
            facility_id=instance.facility_id,
        )
