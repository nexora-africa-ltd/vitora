"""
Django signals for laboratory app.

This module handles automatic creation of LabQueue entries when LabOrders are created,
and status synchronization between LabOrder, LabQueue, and LabResult.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import LabOrder, LabOrderItem, LabQueue, LabResult, Specimen

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

    queue_entry = LabQueue.objects.filter(lab_order=lab_order).first()
    if queue_entry:
        if not queue_entry.specimen:
            queue_entry._ensure_specimen()
        if queue_entry.specimen:
            queue_entry.specimen.order_items.add(instance)


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


@receiver(post_save, sender=LabQueue)
def create_specimen_for_queue(sender, instance, created, **kwargs):
    """
    Auto-create a Specimen when a LabQueue entry is created.
    """
    if not created or instance.specimen_id:
        return

    try:
        first_item = instance.lab_order.items.first()
        specimen_type = instance.sample_type or (
            first_item.test.specimen_type if first_item else "BLOOD"
        )
        barcode = instance.sample_id or instance.queue_number

        status_map = {
            "PENDING": "PENDING",
            "COLLECTED": "COLLECTED",
            "PROCESSING": "PROCESSING",
            "REVIEW": "PROCESSING",
            "RELEASED": "PROCESSING",
        }

        specimen = Specimen.objects.create(
            barcode=barcode,
            specimen_type=specimen_type,
            lab_order=instance.lab_order,
            collected_by=instance.collected_by,
            collected_at=instance.collected_at,
            status=status_map.get(instance.queue_status, "PENDING"),
        )
        specimen.order_items.add(*instance.lab_order.items.all())
        instance.specimen = specimen
        instance.save(update_fields=["specimen"])
        logger.info("Created Specimen %s for queue %s", specimen.barcode, instance.queue_number)
    except Exception as e:
        logger.error("Failed to create Specimen for queue %s: %s", instance.queue_number, e)


@receiver(post_save, sender=LabResult)
def update_order_status_on_result(sender, instance, created, **kwargs):
    """
    Update LabOrder and LabQueue status when results are entered.

    - First result: Order -> IN_PROGRESS, Queue -> PROCESSING
    - All results entered: Order -> COMPLETED, Queue -> REVIEW
    """
    if not created:
        return

    try:
        lab_order = instance.order_item.lab_order

        # Count total items and items with results
        total_items = lab_order.items.count()
        items_with_results = lab_order.items.filter(result__isnull=False).count()

        # Get the user who entered the result for status update
        user = instance.entered_by

        if items_with_results == 1:
            # First result - transition to IN_PROGRESS
            if lab_order.status == "SPECIMEN_COLLECTED":
                lab_order.update_status("IN_PROGRESS", user)
                logger.info(f"Order {lab_order.order_number} transitioned to IN_PROGRESS")

                # Also update queue to PROCESSING
                queue_entry = LabQueue.objects.filter(lab_order=lab_order).first()
                if queue_entry and queue_entry.queue_status in ["COLLECTED", "PENDING"]:
                    queue_entry.queue_status = "PROCESSING"
                    queue_entry.processing_started_at = instance.entered_at
                    queue_entry.save(
                        update_fields=["queue_status", "processing_started_at", "updated_at"]
                    )
                    logger.info(f"Queue {queue_entry.queue_number} transitioned to PROCESSING")

        if items_with_results == total_items:
            # All results entered - keep in IN_PROGRESS but queue goes to REVIEW
            queue_entry = LabQueue.objects.filter(lab_order=lab_order).first()
            if queue_entry and queue_entry.queue_status == "PROCESSING":
                queue_entry.queue_status = "REVIEW"
                queue_entry.processing_completed_at = instance.entered_at
                queue_entry.save(
                    update_fields=["queue_status", "processing_completed_at", "updated_at"]
                )
                logger.info(
                    f"Queue {queue_entry.queue_number} transitioned to REVIEW (all results entered)"
                )

    except Exception as e:
        logger.error(f"Failed to update order status after result entry: {e}")


@receiver(post_save, sender=LabResult)
def notify_on_result_verification(sender, instance, created, **kwargs):
    """
    Send WebSocket notifications when a lab result is verified or has critical values.

    This signal:
    1. Broadcasts verified result to encounter/order channels
    2. Notifies the ordering clinician via their personal channel
    3. Sends critical alerts for abnormal values
    4. Triggers in-app notification creation

    The WebSocket notification provides instant feedback to clinicians,
    while PowerSync will handle data synchronization.
    """
    if created:
        return  # Only handle updates, not creation

    # Import WebSocket broadcast utilities
    from hmis.apps.laboratory.websockets import (
        broadcast_critical_alert,
        broadcast_order_completed,
        broadcast_result_verified,
    )

    try:
        # Check if this is a verification status change
        if instance.verification_status == "VERIFIED":
            # Broadcast verified result
            broadcast_result_verified(instance)
            logger.info(
                f"Broadcasted verification notification for result {instance.id}"
            )

            # If critical, also send critical alert
            if instance.is_critical_result:
                broadcast_critical_alert(instance)
                logger.info(f"Broadcasted critical alert for result {instance.id}")

            # Check if all results for this order are now verified
            lab_order = instance.order_item.lab_order
            total_items = lab_order.items.count()
            verified_count = lab_order.items.filter(
                result__verification_status="VERIFIED"
            ).count()

            if verified_count == total_items:
                # All results verified - update order status and notify
                lab_order.update_status("COMPLETED", instance.verified_by)
                broadcast_order_completed(lab_order)
                logger.info(
                    f"Order {lab_order.order_number} completed - all results verified"
                )

                # Create in-app notification for the ordering clinician
                from hmis.apps.laboratory.services.notifications import (
                    LabNotificationService,
                )

                try:
                    LabNotificationService().send_result_notification(lab_order)
                except Exception as notif_error:
                    logger.error(f"Failed to send in-app notification: {notif_error}")

    except Exception as e:
        logger.error(f"Failed to send verification notification for result {instance.id}: {e}")

