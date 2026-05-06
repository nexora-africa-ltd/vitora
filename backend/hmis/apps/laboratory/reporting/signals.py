"""Signals for L5 reporting module.

Auto-creates TATSnapshot when a lab order reaches COMPLETED status.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.laboratory.models import LabOrder

from .models import TATSnapshot

logger = logging.getLogger(__name__)


@receiver(post_save, sender=LabOrder)
def create_tat_snapshot_on_completion(sender, instance, **kwargs):
    """Create/update TAT snapshot when order is completed."""
    if instance.status == "COMPLETED" and instance.completed_at:
        try:
            TATSnapshot.create_from_order(instance)
        except Exception:
            logger.exception("Failed to create TAT snapshot for order %s", instance.order_number)
