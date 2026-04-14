"""
Django signals for the occupational therapy module.

Handles:
- Billing integration: Auto-create invoice items when sessions are completed
- Clinic queue integration: Auto-route patients to OT clinic
"""

import logging
from decimal import Decimal

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.occupational_therapy.models import OccupationalTherapyOrder, OTSession

logger = logging.getLogger(__name__)


@receiver(post_save, sender=OTSession)
def create_invoice_item_for_completed_session(sender, instance, created, **kwargs):
    """
    Create invoice item when an OT session is completed.

    This signal creates a billing invoice item for completed sessions,
    linking the OT service to the patient's invoice.
    """
    # Only process completed sessions that haven't been billed
    if instance.status != "COMPLETED" or instance.is_billed:
        return

    try:
        from hmis.apps.billing.models import Invoice, InvoiceItem, Service

        order = instance.order

        # Get or create invoice for the encounter/patient
        invoice = order.invoice
        if not invoice:
            # Try to find an existing draft/pending invoice for this patient
            invoice = Invoice.objects.filter(
                patient=order.patient,
                status__in=["draft", "pending", "proforma"],
            ).first()

            if not invoice:
                # No existing invoice - skip billing (will be handled manually)
                logger.info(
                    f"No invoice found for OT session {instance.id}. "
                    f"Billing will need to be done manually."
                )
                return

            # Link invoice to order
            order.invoice = invoice
            order.save(update_fields=["invoice"])

        # Find or create OT service
        service = Service.objects.filter(
            code__icontains="OT",
            is_active=True,
        ).first()

        if not service:
            # Try to find a general occupational therapy service
            service = Service.objects.filter(
                name__icontains="Occupational Therapy",
                is_active=True,
            ).first()

        # Use treatment type cost
        unit_price = (
            order.treatment_type.cost_per_session if order.treatment_type else Decimal("0.00")
        )

        # Create invoice item
        invoice_item = InvoiceItem.objects.create(
            invoice=invoice,
            service=service,
            description=f"OT Session {instance.session_number} - {order.treatment_type.name if order.treatment_type else 'General'}",
            quantity=1,
            unit_price=unit_price,
        )

        # Link invoice item to session
        instance.invoice_item = invoice_item
        instance.is_billed = True
        instance.save(update_fields=["invoice_item", "is_billed"])

        logger.info(
            f"Created invoice item {invoice_item.id} for OT session {instance.id} "
            f"(Order: {order.order_number})"
        )

    except Exception as e:
        logger.error(f"Failed to create invoice item for OT session {instance.id}: {e}")


@receiver(post_save, sender=OccupationalTherapyOrder)
def route_to_ot_clinic_on_approval(sender, instance, created, **kwargs):
    """
    Route patient to OT clinic queue when order is approved.

    This signal creates a ClinicVisit for the OT department
    when an order transitions to APPROVED status.
    """
    # Only process approved orders without an existing clinic visit
    if instance.status != "APPROVED" or instance.clinic_visit:
        return

    try:
        from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit

        # Find the OT clinic - prefer by clinic_type first
        ot_clinic = Clinic.objects.filter(
            clinic_type="OT",
            status="ACTIVE",
        ).first()

        if not ot_clinic:
            # Fall back to name-based lookup
            ot_clinic = Clinic.objects.filter(
                name__icontains="Occupational Therapy",
                status__in=["ACTIVE", "active"],
            ).first()

        if not ot_clinic:
            # Try code-based lookup
            ot_clinic = Clinic.objects.filter(
                code__icontains="OT",
                status__in=["ACTIVE", "active"],
            ).first()

        if not ot_clinic:
            logger.info(
                f"No OT clinic found for order {instance.order_number}. "
                f"Patient will need to be manually queued."
            )
            return

        # Find an active clinic session for today
        from datetime import date

        today = date.today()
        clinic_session = ClinicSession.objects.filter(
            clinic=ot_clinic,
            date=today,
            is_active=True,
        ).first()

        if not clinic_session:
            logger.info(
                f"No active OT clinic session for today. "
                f"Order {instance.order_number} will need manual scheduling."
            )
            return

        # Create clinic visit
        clinic_visit = ClinicVisit.objects.create(
            patient=instance.patient,
            session=clinic_session,
            visit_type="REFERRAL",
            priority="ROUTINE" if instance.priority == "ROUTINE" else "URGENT",
            notes=f"OT Order: {instance.order_number} - {instance.treatment_type.name if instance.treatment_type else 'Assessment'}",
        )

        # Link clinic visit to order
        instance.clinic_visit = clinic_visit
        instance.save(update_fields=["clinic_visit"])

        logger.info(f"Created clinic visit {clinic_visit.id} for OT order {instance.order_number}")

    except Exception as e:
        logger.error(f"Failed to route OT order {instance.order_number} to clinic: {e}")
