"""
Django signals for laboratory app.

This module handles automatic creation of LabQueue entries when LabOrders are created,
and status synchronization between LabOrder, LabQueue, and LabResult.
Publishes domain events for cross-cutting observability.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import LaboratoryEvents, publish_event

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

            publish_event(
                event_type=LaboratoryEvents.QUEUE_CREATED,
                aggregate_type="LabQueue",
                aggregate_id=instance.id,
                payload={
                    "order_number": instance.order_number,
                    "priority": instance.priority,
                },
                facility_id=getattr(instance, "facility_id", None),
            )
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

        publish_event(
            event_type=LaboratoryEvents.RESULT_ENTERED,
            aggregate_type="LabResult",
            aggregate_id=instance.id,
            payload={
                "order_number": lab_order.order_number,
                "items_with_results": items_with_results,
                "total_items": total_items,
            },
            user_id=getattr(user, "id", None),
            facility_id=getattr(lab_order, "facility_id", None),
        )

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
            logger.info(f"Broadcasted verification notification for result {instance.id}")

            publish_event(
                event_type=LaboratoryEvents.RESULT_VERIFIED,
                aggregate_type="LabResult",
                aggregate_id=instance.id,
                payload={
                    "order_number": instance.order_item.lab_order.order_number,
                    "is_critical": getattr(instance, "is_critical_result", False),
                },
                user_id=getattr(instance.verified_by, "id", None) if instance.verified_by else None,
                facility_id=getattr(instance.order_item.lab_order, "facility_id", None),
            )

            # If critical, also send critical alert
            if instance.is_critical_result:
                broadcast_critical_alert(instance)
                logger.info(f"Broadcasted critical alert for result {instance.id}")

            # Check if all results for this order are now verified
            lab_order = instance.order_item.lab_order
            total_items = lab_order.items.count()
            verified_count = lab_order.items.filter(result__verification_status="VERIFIED").count()

            if verified_count == total_items:
                # All results verified - update order status and notify
                lab_order.update_status("COMPLETED", instance.verified_by)
                broadcast_order_completed(lab_order)
                logger.info(f"Order {lab_order.order_number} completed - all results verified")

                publish_event(
                    event_type=LaboratoryEvents.ORDER_COMPLETED,
                    aggregate_type="LabOrder",
                    aggregate_id=lab_order.id,
                    payload={
                        "order_number": lab_order.order_number,
                        "total_items": total_items,
                    },
                    facility_id=getattr(lab_order, "facility_id", None),
                )

                # Create in-app notification for the ordering clinician
                from hmis.apps.laboratory.services.notifications import LabNotificationService

                try:
                    LabNotificationService().send_result_notification(lab_order)
                except Exception as notif_error:
                    logger.error(f"Failed to send in-app notification: {notif_error}")

    except Exception as e:
        logger.error(f"Failed to send verification notification for result {instance.id}: {e}")


@receiver(post_save, sender=LabOrder)
def handle_lab_order_billing(sender, instance, **kwargs):
    """Auto-bill lab tests when order status transitions to ORDERED.

    Delegates to BillingAgentService to add lab test line items
    to the patient's draft invoice. Skipped when bill_patient is False
    (default for external lab orders).
    """
    if instance.status != "ORDERED":
        return

    if not instance.bill_patient:
        logger.info(
            "Billing agent: skipping billing for lab order %s (bill_patient=False)",
            instance.order_number,
        )
        return

    # Skip billing for standalone/walk-in orders (no encounter)
    if not instance.encounter_id:
        logger.info(
            "Billing agent: skipping standalone order %s (no encounter)",
            instance.order_number,
        )
        return

    try:
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_lab_order_confirmed(instance)

        publish_event(
            event_type=LaboratoryEvents.ORDER_BILLING,
            aggregate_type="LabOrder",
            aggregate_id=instance.id,
            payload={"order_number": instance.order_number},
            facility_id=getattr(instance, "facility_id", None),
        )
    except Exception as e:
        logger.error(
            "Billing agent: failed to bill lab order %s: %s",
            instance.order_number,
            e,
        )


# =============================================================================
# Auto-trigger eGFR calculation when a creatinine result is filed
# =============================================================================

# LOINC codes for serum/plasma creatinine
CREATININE_LOINC_CODES = {"2160-0", "38483-4", "14682-9", "21232-4"}

# Fallback name matching (case-insensitive partial match)
CREATININE_NAME_KEYWORDS = {"creatinine"}


def _is_creatinine_result(lab_result: LabResult) -> bool:
    """Check if a LabResult is a creatinine measurement by LOINC or name."""
    test_catalog = lab_result.order_item.test
    if test_catalog.loinc_code and test_catalog.loinc_code in CREATININE_LOINC_CODES:
        return True
    # Fallback: match by test name
    test_name_lower = test_catalog.name.lower()
    return any(kw in test_name_lower for kw in CREATININE_NAME_KEYWORDS)


def _map_unit_to_fallback(result_unit: str) -> str:
    """Map LabResult unit choices to the eGFR fallback expected unit string."""
    if result_unit in ("µmol/L", "umol/L", "µmol/l"):
        return "umol/L"
    # mg/dL and variants
    return "mg/dL"


@receiver(post_save, sender=LabResult)
def auto_trigger_egfr_on_creatinine(sender, instance, created, **kwargs):
    """
    Automatically compute and persist eGFR when a creatinine LabResult is created.

    Requirements:
    - The result must be a creatinine measurement (detected by LOINC or name)
    - The result must have a numeric value
    - The lab order must be linked to a patient with DOB and gender
    """
    if not created:
        return

    # Only process numeric creatinine results
    if instance.numeric_value is None:
        return

    if not _is_creatinine_result(instance):
        return

    try:
        lab_order = instance.order_item.lab_order
        patient = lab_order.patient

        if not patient or not patient.date_of_birth or not patient.gender:
            logger.debug(
                "eGFR auto-trigger skipped: missing patient demographics for result %s",
                instance.id,
            )
            return

        # Calculate age
        from datetime import date

        today = date.today()
        dob = patient.date_of_birth
        if isinstance(dob, str):
            dob = date.fromisoformat(dob)
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

        if age < 18:
            logger.debug("eGFR auto-trigger skipped: patient age %d < 18", age)
            return

        # Map gender to eGFR parameter
        sex = "female" if patient.gender == "F" else "male"

        # Get weight from the encounter (if available)
        encounter = lab_order.encounter
        weight_kg = None
        if encounter and encounter.weight:
            weight_kg = float(encounter.weight)

        # Determine unit
        unit = _map_unit_to_fallback(instance.result_unit)

        # Calculate eGFR using local fallback (fast, no network dependency)
        from hmis.apps.ai.services.egfr_fallback import calculate_egfr_fallback

        result_data = calculate_egfr_fallback(
            {
                "creatinine": float(instance.numeric_value),
                "creatinine_unit": unit,
                "age": age,
                "sex": sex,
                "weight_kg": weight_kg,
            }
        )

        # Persist the eGFR result
        from hmis.apps.ai.models import AIEGFRResult

        AIEGFRResult.objects.create(
            encounter=encounter,
            patient=patient,
            facility=lab_order.facility,
            ckd_stage=result_data["ckd_stage"],
            egfr_ckd_epi=result_data["egfr_ckd_epi"],
            dose_adjustment_band=result_data["dose_adjustment_band"],
            request_data={
                "creatinine": float(instance.numeric_value),
                "creatinine_unit": unit,
                "age": age,
                "sex": sex,
                "weight_kg": weight_kg,
            },
            result_data=result_data,
            service_mode="auto",
        )

        logger.info(
            "eGFR auto-calculated for patient %s: %s mL/min (CKD %s)",
            patient.id,
            result_data["egfr_ckd_epi"],
            result_data["ckd_stage"],
        )

    except Exception as e:
        logger.error("eGFR auto-trigger failed for result %s: %s", instance.id, e)
