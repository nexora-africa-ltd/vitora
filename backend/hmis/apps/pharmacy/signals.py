"""
Pharmacy signals for Vitora HMIS.

This module contains Django signals for pharmacy-billing integration:
- Auto-create invoice item when prescription item is created
"""

import logging
from decimal import Decimal

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.billing.models import Invoice, InvoiceItem

from .models import PrescriptionItem

logger = logging.getLogger(__name__)


@receiver(post_save, sender=PrescriptionItem)
def create_invoice_item_for_prescription(sender, instance, created, **kwargs):
    """
    Auto-create an invoice item when a prescription item is created.

    Business Rules:
    1. Only create invoice item for new prescription items
    2. Use the drug's reference_price or batch selling_price
    3. Link invoice item to the prescription's encounter invoice
    4. Skip if prescription has no encounter (walk-in pharmacy)
    """
    if not created:
        return

    prescription = instance.prescription

    # Skip walk-in prescriptions (no encounter)
    if not prescription.encounter:
        logger.debug(
            f"Skipping invoice item for prescription {prescription.prescription_number} - no encounter"
        )
        return

    # Get the encounter's invoice
    invoice = Invoice.objects.filter(encounter=prescription.encounter).first()
    if not invoice:
        logger.warning(
            f"No invoice found for encounter {prescription.encounter.id} - "
            f"prescription item {instance.id} will not be billed"
        )
        return

    # Check if invoice is editable
    if invoice.status != Invoice.Status.DRAFT:
        logger.warning(
            f"Cannot add prescription item to invoice with status '{invoice.status}'"
        )
        return

    # Determine unit price (use reference price or get from available batch)
    drug = instance.drug
    unit_price = drug.reference_price

    if not unit_price:
        # Try to get price from available batch
        batch = drug.batches.filter(status="AVAILABLE", quantity_available__gt=0).first()
        if batch:
            unit_price = batch.selling_price
        else:
            unit_price = Decimal("0.00")
            logger.warning(f"No price found for drug {drug.generic_name} - using 0.00")

    # Calculate line total
    quantity = Decimal(str(instance.quantity))
    line_total = (unit_price * quantity).quantize(Decimal("0.01"))

    # Create invoice item
    try:
        InvoiceItem.objects.create(
            invoice=invoice,
            item_type=InvoiceItem.ItemType.PHARMACY,
            drug=drug,
            description=f"{drug.generic_name} {drug.strength} ({drug.get_form_display()})",
            quantity=instance.quantity,
            unit_price=unit_price,
            line_total=line_total,
        )

        # Recalculate invoice totals
        invoice.calculate_totals()
        invoice.save(update_fields=[
            "subtotal", "tax_amount", "discount_amount",
            "total_amount", "balance_due", "updated_at"
        ])

        logger.info(
            f"Created invoice item for prescription item {instance.id} - "
            f"{drug.generic_name} x{instance.quantity}"
        )
    except Exception as e:
        logger.error(f"Failed to create invoice item for prescription item {instance.id}: {e}")
