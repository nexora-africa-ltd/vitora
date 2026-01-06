"""
Django signals for laboratory app.

This module handles automatic creation of LabQueue entries when LabOrders are created.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import LabOrder, LabQueue, LabOrderItem

logger = logging.getLogger(__name__)


@receiver(post_save, sender=LabOrder)
def create_lab_queue_entry(sender, instance, created, **kwargs):
    """
    Automatically create a LabQueue entry when a LabOrder is created.
    
    Only creates queue entries for in-house orders (not external lab referrals).
    Queue entry is created when order status is ORDERED or when initially created.
    """
    # Only process for in-house orders
    if instance.order_type != "IN_HOUSE":
        return
    
    # Check if queue entry already exists
    if LabQueue.objects.filter(lab_order=instance).exists():
        return
    
    # Create queue entry when order is placed (status = ORDERED or DRAFT for new orders)
    if instance.status in ["ORDERED", "DRAFT"]:
        try:
            # Get specimen type from first order item
            first_item = instance.items.first()
            specimen_type = first_item.test.specimen_type if first_item else "BLOOD"
            
            LabQueue.objects.create(
                lab_order=instance,
                priority=instance.priority,
                sample_type=specimen_type,
                queue_status="PENDING",
            )
            logger.info(f"Created LabQueue entry for order {instance.order_number}")
        except Exception as e:
            logger.error(f"Failed to create LabQueue entry for order {instance.order_number}: {e}")


@receiver(post_save, sender=LabOrderItem)
def create_lab_queue_on_item_add(sender, instance, created, **kwargs):
    """
    Create LabQueue entry when first item is added to an in-house order.
    
    This handles the case where items are added after the order is created,
    and the signal needs the specimen type from the test catalog.
    """
    if not created:
        return
    
    lab_order = instance.lab_order
    
    # Only process for in-house orders
    if lab_order.order_type != "IN_HOUSE":
        return
    
    # Check if queue entry already exists
    if LabQueue.objects.filter(lab_order=lab_order).exists():
        return
    
    # Create queue entry with specimen type from this item
    try:
        LabQueue.objects.create(
            lab_order=lab_order,
            priority=lab_order.priority,
            sample_type=instance.test.specimen_type or "BLOOD",
            queue_status="PENDING",
        )
        logger.info(f"Created LabQueue entry for order {lab_order.order_number} (on item add)")
    except Exception as e:
        logger.error(f"Failed to create LabQueue entry for order {lab_order.order_number}: {e}")


@receiver(post_save, sender=LabOrder)
def sync_lab_queue_priority(sender, instance, created, **kwargs):
    """
    Sync priority changes from LabOrder to LabQueue.
    """
    if created:
        return
    
    try:
        queue_entry = LabQueue.objects.filter(lab_order=instance).first()
        if queue_entry and queue_entry.priority != instance.priority:
            queue_entry.priority = instance.priority
            queue_entry.save(update_fields=["priority", "priority_order"])
            logger.info(f"Synced priority for queue entry {queue_entry.queue_number}")
    except Exception as e:
        logger.error(f"Failed to sync priority for order {instance.order_number}: {e}")
