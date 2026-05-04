"""
Pharmacy signals for Vitora HMIS.

This module contains Django signals for pharmacy-billing integration:
- Auto-create invoice item when prescription item is created
- Link dispensing to invoice item or create new for direct dispensing
- Broadcast real-time WebSocket events for pharmacy queue updates
- Publish domain events for cross-cutting observability
"""

import logging
from decimal import Decimal

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.billing.models import Invoice, InvoiceItem
from hmis.apps.core.events import PharmacyEvents, publish_event

from .models import Dispensing, Prescription, PrescriptionItem, StockBatch

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

        publish_event(
            event_type=PharmacyEvents.PRESCRIPTION_ITEM_CREATED,
            aggregate_type="PrescriptionItem",
            aggregate_id=instance.id,
            payload={
                "prescription_id": prescription.id,
                "drug_id": drug.id,
                "drug_name": drug.generic_name,
                "quantity": instance.quantity,
                "unit_price": str(unit_price),
            },
            facility_id=getattr(prescription, "facility_id", None),
            organization_id=getattr(prescription, "organization_id", None),
        )
    except Exception as e:
        logger.error(f"Failed to create invoice item for prescription item {instance.id}: {e}")


@receiver(post_save, sender=Prescription)
def broadcast_prescription_on_create(sender, instance, created, **kwargs):
    """
    Broadcast WebSocket event and publish domain event when a prescription is created.
    Also notifies pharmacy staff (via notification) about new prescriptions.
    """
    if not created:
        return

    publish_event(
        event_type=PharmacyEvents.PRESCRIPTION_CREATED,
        aggregate_type="Prescription",
        aggregate_id=instance.id,
        payload={
            "prescription_number": getattr(instance, "prescription_number", ""),
            "patient_id": getattr(instance, "patient_id", None),
            "encounter_id": getattr(instance, "encounter_id", None),
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )

    # Notify pharmacy staff about new prescription
    _notify_prescription_created(instance)

    try:
        from hmis.apps.pharmacy.websockets import broadcast_prescription_created

        broadcast_prescription_created(instance)
    except Exception as e:
        logger.error(f"Failed to broadcast prescription created for {instance.id}: {e}")


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


@receiver(post_save, sender=Dispensing)
def broadcast_dispensing_on_create(sender, instance, created, **kwargs):
    """
    Broadcast WebSocket event and publish domain event when dispensing is completed.
    """
    if not created:
        return

    publish_event(
        event_type=PharmacyEvents.DISPENSING_COMPLETED,
        aggregate_type="Dispensing",
        aggregate_id=instance.id,
        payload={
            "drug_id": getattr(instance.drug, "id", None) if instance.drug else None,
            "drug_name": getattr(instance.drug, "generic_name", "") if instance.drug else "",
            "quantity_dispensed": getattr(instance, "quantity_dispensed", 0),
            "patient_id": getattr(instance, "patient_id", None),
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )

    try:
        from hmis.apps.pharmacy.websockets import broadcast_dispensing_completed

        broadcast_dispensing_completed(instance)
    except Exception as e:
        logger.error(f"Failed to broadcast dispensing completed for {instance.id}: {e}")


@receiver(post_save, sender=StockBatch)
def broadcast_stock_level_change(sender, instance, **kwargs):
    """
    Broadcast WebSocket event and publish domain event when stock levels change.

    Emits stock_critical when quantity reaches 0, or stock_low_warning
    when quantity drops below the drug's reorder level.
    """
    facility_id = getattr(instance, "facility_id", None)
    if not facility_id:
        return

    try:
        from hmis.apps.pharmacy.websockets import (
            broadcast_stock_critical,
            broadcast_stock_low_warning,
        )

        if instance.quantity_available == 0 and instance.status != "EXPIRED":
            publish_event(
                event_type=PharmacyEvents.STOCK_CRITICAL,
                aggregate_type="StockBatch",
                aggregate_id=instance.id,
                payload={
                    "drug_name": (
                        getattr(instance.drug, "generic_name", "") if instance.drug else ""
                    ),
                    "remaining_quantity": 0,
                },
                facility_id=facility_id,
            )
            broadcast_stock_critical(instance, facility_id)
            _notify_stock_alert(instance, critical=True)
        elif (
            instance.quantity_available > 0
            and instance.drug
            and instance.quantity_available < instance.drug.default_reorder_level
        ):
            publish_event(
                event_type=PharmacyEvents.STOCK_LOW_WARNING,
                aggregate_type="StockBatch",
                aggregate_id=instance.id,
                payload={
                    "drug_name": instance.drug.generic_name,
                    "remaining_quantity": instance.quantity_available,
                    "reorder_level": instance.drug.default_reorder_level,
                },
                facility_id=facility_id,
            )
            broadcast_stock_low_warning(instance, facility_id)
            _notify_stock_alert(instance, critical=False)
    except Exception as e:
        logger.error(f"Failed to broadcast stock level change for batch {instance.id}: {e}")


# ---------------------------------------------------------------------------
# Notification helpers
# ---------------------------------------------------------------------------


def _notify_prescription_created(instance):
    """Notify pharmacists about a new prescription requiring dispensing."""
    try:
        from django.contrib.auth import get_user_model

        from hmis.apps.core.services.notification_service import notify_users

        User = get_user_model()

        # Find pharmacists in the same facility
        facility_id = getattr(instance, "facility_id", None)
        if not facility_id:
            return

        pharmacists = User.objects.filter(
            staff_profile__facilities__id=facility_id,
            staff_profile__primary_role__code__in=["PHARMACIST", "PHARMACY_TECH"],
            is_active=True,
        ).distinct()

        if not pharmacists.exists():
            return

        patient_name = ""
        if instance.patient:
            patient_name = f"{instance.patient.first_name} {instance.patient.last_name}"

        notify_users(
            users=pharmacists,
            notification_type="prescription_ready",
            priority="normal",
            title="New Prescription",
            message=f"New prescription for {patient_name} is ready for dispensing.",
            related_model="Prescription",
            related_id=instance.id,
            action_url=f"/pharmacy/prescriptions/{instance.id}",
        )
    except Exception:
        logger.exception("Failed to notify pharmacists for prescription %s", instance.id)


def _notify_stock_alert(instance, critical: bool):
    """Notify pharmacy managers about stock level alerts."""
    try:
        from django.contrib.auth import get_user_model

        from hmis.apps.core.services.notification_service import notify_users

        User = get_user_model()

        facility_id = getattr(instance, "facility_id", None) or getattr(
            instance.drug, "facility_id", None
        )
        if not facility_id:
            return

        # Notify pharmacists and managers
        staff = User.objects.filter(
            staff_profile__facilities__id=facility_id,
            staff_profile__primary_role__code__in=[
                "PHARMACIST",
                "PHARMACY_TECH",
                "ADMIN",
                "ORG-ADMIN",
            ],
            is_active=True,
        ).distinct()

        if not staff.exists():
            return

        drug_name = instance.drug.generic_name if instance.drug else "Unknown"
        priority = "critical" if critical else "high"
        title = f"{'CRITICAL: ' if critical else ''}Low Stock Alert"
        message = (
            f"{drug_name} is {'out of stock' if critical else 'running low'} "
            f"(remaining: {instance.quantity_available})."
        )

        notify_users(
            users=staff,
            notification_type="low_stock",
            priority=priority,
            title=title,
            message=message,
            related_model="StockBatch",
            related_id=instance.id,
            action_url="/pharmacy/inventory",
        )
    except Exception:
        logger.exception("Failed to notify about stock alert for batch %s", instance.id)
