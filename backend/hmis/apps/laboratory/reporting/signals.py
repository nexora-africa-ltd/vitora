# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Signals for L5 reporting module.

Auto-creates TATSnapshot when a lab order reaches COMPLETED status.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.sync_context import is_sync_materialization_active
from hmis.apps.laboratory.models import LabOrder

from .models import TATSnapshot

logger = logging.getLogger(__name__)


@receiver(post_save, sender=LabOrder)
def create_tat_snapshot_on_completion(sender, instance, **kwargs):
    """Create/update TAT snapshot when order is completed."""
    if is_sync_materialization_active():
        return

    if instance.status == "COMPLETED" and instance.completed_at:
        try:
            TATSnapshot.create_from_order(instance)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.exception("Failed to create TAT snapshot for order %s", instance.order_number)
