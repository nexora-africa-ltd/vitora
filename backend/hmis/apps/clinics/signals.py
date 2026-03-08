"""
Django Signals for Clinic WebSocket Broadcasts.

Automatically broadcasts WebSocket events when clinic models change.
"""

import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import ClinicVisit
from .websockets import (
    broadcast_consultation_started,
    broadcast_patient_added,
    broadcast_patient_called,
    broadcast_patient_removed,
    broadcast_visit_completed,
)

logger = logging.getLogger(__name__)


@receiver(post_save, sender=ClinicVisit)
def clinic_visit_post_save(sender, instance, created, **kwargs):
    """
    Broadcast WebSocket events when ClinicVisit is created or updated.
    """
    if getattr(instance, "_skip_broadcast", False):
        return

    try:
        if created:
            # New patient added to queue
            broadcast_patient_added(instance)
            logger.debug(f"Broadcasted patient_added for visit {instance.id}")
    except Exception as e:
        # Don't let WebSocket errors break the save operation
        logger.error(f"Error broadcasting clinic visit event: {e}")


@receiver(pre_save, sender=ClinicVisit)
def clinic_visit_pre_save(sender, instance, **kwargs):
    """
    Track status changes to broadcast appropriate events.
    """
    if getattr(instance, "_skip_broadcast", False):
        return

    if not instance.pk:
        # New instance, will be handled in post_save
        return

    try:
        # Get previous state
        old_instance = ClinicVisit.objects.get(pk=instance.pk)
        instance._old_status = old_instance.status
    except ClinicVisit.DoesNotExist:
        instance._old_status = None


@receiver(post_save, sender=ClinicVisit)
def clinic_visit_status_change(sender, instance, created, **kwargs):
    """
    Broadcast events when visit status changes.
    """
    if getattr(instance, "_skip_broadcast", False):
        return

    if created:
        # Handled by clinic_visit_post_save
        return

    old_status = getattr(instance, "_old_status", None)
    if old_status is None or old_status == instance.status:
        return

    try:
        # Broadcast based on new status
        if instance.status == "CALLED":
            broadcast_patient_called(instance)
            logger.debug(f"Broadcasted patient_called for visit {instance.id}")

        elif instance.status == "IN_CONSULTATION":
            broadcast_consultation_started(instance)
            logger.debug(f"Broadcasted consultation_started for visit {instance.id}")

        elif instance.status == "COMPLETED":
            broadcast_visit_completed(instance)
            logger.debug(f"Broadcasted visit_completed for visit {instance.id}")

        elif instance.status in ("CANCELLED", "NO_SHOW"):
            reason = "cancelled" if instance.status == "CANCELLED" else "no_show"
            broadcast_patient_removed(instance, reason=reason)
            logger.debug(f"Broadcasted patient_removed for visit {instance.id}")

    except Exception as e:
        # Don't let WebSocket errors break the save operation
        logger.error(f"Error broadcasting clinic visit status change: {e}")
