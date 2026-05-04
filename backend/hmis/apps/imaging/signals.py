"""
Imaging signals for Vitora HMIS.

This module contains Django signals for imaging-billing integration:
- Auto-create invoice item when imaging order item is created
- Notify ordering clinician when imaging results are ready
"""

import logging
from decimal import Decimal

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.billing.models import Invoice, InvoiceItem
from hmis.apps.core.events import ImagingEvents, publish_event

from .models import ImagingOrderItem

logger = logging.getLogger(__name__)


@receiver(post_save, sender=ImagingOrderItem)
def create_invoice_item_for_imaging(sender, instance, created, **kwargs):
    """
    Auto-create an invoice item when an imaging order item is created.

    Business Rules:
    1. Only create invoice item for new imaging order items
    2. Use the procedure's cost as the price
    3. Link invoice item to the imaging order's encounter invoice
    4. Skip if encounter has no draft invoice (invoice already finalized)
    """
    if not created:
        return

    imaging_order = instance.order
    procedure = instance.procedure

    # Get the encounter's invoice
    invoice = Invoice.objects.filter(
        encounter=imaging_order.encounter,
        status=Invoice.Status.DRAFT,
    ).first()

    if not invoice:
        logger.warning(
            f"No draft invoice found for imaging order {imaging_order.order_number} - "
            f"imaging item will not be billed automatically"
        )
        return

    # Calculate line total - ensure we have a Decimal
    unit_price = instance.unit_cost or procedure.cost
    if not isinstance(unit_price, Decimal):
        unit_price = Decimal(str(unit_price))
    line_total = unit_price.quantize(Decimal("0.01"))

    # Determine laterality suffix for description
    laterality_display = ""
    if instance.laterality and instance.laterality != "NA":
        laterality_display = f" ({instance.get_laterality_display()})"

    # Create invoice item
    try:
        InvoiceItem.objects.create(
            invoice=invoice,
            item_type=InvoiceItem.ItemType.IMAGING,
            imaging_order=imaging_order,
            description=f"{procedure.name}{laterality_display}",
            quantity=1,
            unit_price=unit_price,
            line_total=line_total,
            sha_code=procedure.sha_intervention_code or "",
        )

        # Recalculate invoice totals
        invoice.calculate_totals()
        invoice.save(
            update_fields=[
                "subtotal",
                "tax_amount",
                "discount_amount",
                "total_amount",
                "balance_due",
                "updated_at",
            ]
        )

        logger.info(
            f"Created invoice item for imaging order item - "
            f"{procedure.name} on order {imaging_order.order_number}"
        )

        # Publish domain event
        publish_event(
            event_type=ImagingEvents.ORDER_ITEM_CREATED,
            aggregate_type="ImagingOrderItem",
            aggregate_id=instance.id,
            payload={
                "order_number": imaging_order.order_number,
                "procedure_name": procedure.name,
                "unit_price": str(unit_price),
            },
            facility_id=getattr(imaging_order, "facility_id", None),
        )
    except Exception as e:
        logger.error(f"Failed to create invoice item for imaging order item {instance.id}: {e}")


# ---------------------------------------------------------------------------
# Imaging Order Status → Notification
# ---------------------------------------------------------------------------


@receiver(post_save, sender="imaging.ImagingOrder")
def notify_imaging_results_ready(sender, instance, created, **kwargs):
    """Notify ordering clinician when imaging results are reported."""
    if created:
        return

    if instance.status != "REPORTED":
        return

    try:
        from hmis.apps.core.services.notification_service import notify_user

        ordered_by = getattr(instance, "ordered_by", None)
        if not ordered_by:
            return

        patient = getattr(instance, "patient", None)
        patient_name = f"{patient.first_name} {patient.last_name}" if patient else "a patient"

        notify_user(
            user=ordered_by,
            notification_type="imaging_result_ready",
            priority="normal",
            title="Imaging Results Ready",
            message=f"Imaging results for {patient_name} ({instance.order_number}) are ready for review.",
            related_model="ImagingOrder",
            related_id=instance.id,
            action_url=f"/imaging/orders/{instance.id}",
            deduplicate=True,
        )
    except Exception:
        logger.exception("Failed to notify imaging results for order %s", instance.id)
