"""
Pharmacy signals for Vitora HMIS.

This module contains Django signals for pharmacy-billing integration:
- Auto-create invoice item when prescription item is created
- Link dispensing to invoice item or create new for direct dispensing
"""

import logging
from decimal import Decimal

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.billing.models import Invoice, InvoiceItem

from .models import Dispensing, PrescriptionItem

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

    # Skip external prescriptions (filled at outside pharmacy - not billed by us)
    if prescription.dispensing_type == prescription.DispensingType.EXTERNAL:
        logger.debug(
            f"Skipping invoice item for external prescription "
            f"{prescription.prescription_number} - filled at outside pharmacy"
        )
        return

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
        logger.warning(f"Cannot add prescription item to invoice with status '{invoice.status}'")
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
            f"Created invoice item for prescription item {instance.id} - "
            f"{drug.generic_name} x{instance.quantity}"
        )
    except Exception as e:
        logger.error(f"Failed to create invoice item for prescription item {instance.id}: {e}")


@receiver(post_save, sender=Dispensing)
def handle_dispensing_billing(sender, instance, created, **kwargs):
    """
    Handle billing when a dispensing record is created.

    Business Rules:
    1. If dispensing is from prescription: Link to existing invoice item (no duplicate)
    2. If dispensing is direct (OTC): Create new invoice item
    3. Only process new dispensing records (not updates)
    """
    if not created:
        return

    drug = instance.drug

    # Case 1: Dispensing from prescription - link to existing invoice item
    if instance.prescription_item:
        prescription = instance.prescription_item.prescription

        # Find the invoice item created by PrescriptionItem signal
        if prescription.encounter:
            invoice = Invoice.objects.filter(encounter=prescription.encounter).first()
            if invoice:
                # Find the invoice item for this drug (created by prescription signal)
                invoice_item = invoice.items.filter(
                    drug=drug,
                    dispensing__isnull=True,  # Not yet linked to any dispensing
                ).first()

                if invoice_item:
                    # Link the dispensing to the existing invoice item
                    invoice_item.dispensing = instance
                    invoice_item.save(update_fields=["dispensing", "updated_at"])
                    logger.info(
                        f"Linked dispensing {instance.id} to existing invoice item "
                        f"{invoice_item.id} for {drug.generic_name}"
                    )
                else:
                    logger.debug(
                        f"No unlinked invoice item found for drug {drug.generic_name} - "
                        "prescription may not have created one"
                    )
        return

    # Case 2: Direct dispensing (OTC) - create new invoice item
    # Find patient's draft invoice from today
    from datetime import date

    invoice = Invoice.objects.filter(
        patient=instance.patient,
        invoice_date=date.today(),
        status=Invoice.Status.DRAFT,
    ).first()

    if not invoice:
        logger.warning(
            f"No draft invoice found for patient {instance.patient.mrn} - "
            f"direct dispensing {instance.id} will not be billed automatically"
        )
        return

    # Create invoice item for direct dispensing
    try:
        quantity = Decimal(str(instance.quantity_dispensed))
        line_total = (instance.unit_price * quantity).quantize(Decimal("0.01"))

        InvoiceItem.objects.create(
            invoice=invoice,
            item_type=InvoiceItem.ItemType.PHARMACY,
            drug=drug,
            dispensing=instance,
            description=f"{drug.generic_name} {drug.strength} ({drug.get_form_display()})",
            quantity=instance.quantity_dispensed,
            unit_price=instance.unit_price,
            line_total=line_total,
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
            f"Created invoice item for direct dispensing {instance.id} - "
            f"{drug.generic_name} x{instance.quantity_dispensed}"
        )
    except Exception as e:
        logger.error(f"Failed to create invoice item for dispensing {instance.id}: {e}")
