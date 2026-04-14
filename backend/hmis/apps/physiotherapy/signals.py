"""
Django signals for the physiotherapy module.

Handles:
- Billing integration: Auto-create invoice items when sessions are completed
- Clinic queue integration: Auto-route patients to physiotherapy clinic
"""

import logging
from decimal import Decimal

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.physiotherapy.models import PhysiotherapyOrder, PhysiotherapySession

logger = logging.getLogger(__name__)


@receiver(post_save, sender=PhysiotherapySession)
def create_invoice_item_for_completed_session(sender, instance, created, **kwargs):
    """
    Create invoice item when a physiotherapy session is completed.

    This signal creates a billing invoice item for completed sessions,
    linking the physiotherapy service to the patient's invoice.
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
                    f"No invoice found for physiotherapy session {instance.id}. "
                    f"Billing will need to be done manually."
                )
                return

            # Link invoice to order
            order.invoice = invoice
            order.save(update_fields=["invoice"])

        # Find or create physiotherapy service
        service = Service.objects.filter(
            code__icontains="PHYSIO",
            is_active=True,
        ).first()

        if not service:
            # Try to find a general physiotherapy service
            service = Service.objects.filter(
                name__icontains="Physiotherapy",
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
            description=f"Physiotherapy Session {instance.session_number} - {order.treatment_type.name if order.treatment_type else 'General'}",
            quantity=1,
            unit_price=unit_price,
        )

        # Link invoice item to session
        instance.is_billed = True
        instance.invoice_item = invoice_item
        instance.save(update_fields=["is_billed", "invoice_item"])

        # Recalculate invoice totals
        invoice.calculate_totals()

        logger.info(
            f"Created invoice item {invoice_item.id} for physiotherapy session "
            f"{instance.order.order_number} - Session {instance.session_number}"
        )

    except ImportError:
        logger.warning("Billing module not available. Skipping invoice item creation.")
    except Exception as e:
        logger.error(f"Error creating invoice item for physiotherapy session: {e}")


@receiver(post_save, sender=PhysiotherapyOrder)
def handle_order_status_change(sender, instance, created, **kwargs):
    """
    Handle order status changes for clinic queue integration.

    When an order is approved, the patient can be routed to the
    physiotherapy clinic queue.
    """
    if created:
        return  # Skip on creation

    # Check if this is a status change to APPROVED
    if instance.status == "APPROVED" and not instance.clinic_visit:
        try:
            from hmis.apps.clinics.models import Clinic

            # Find physiotherapy clinic
            physio_clinic = Clinic.objects.filter(
                clinic_type="PHYSIO",
                status="ACTIVE",
            ).first()

            if physio_clinic:
                # Get or create today's session
                session = physio_clinic.get_current_session()

                # Create clinic visit for routing
                from hmis.apps.clinics.models import ClinicVisit

                visit = ClinicVisit.objects.create(
                    session=session,
                    patient=instance.patient,
                    visit_type="REFERRAL",
                    source="REFERRAL",
                    priority="STANDARD",
                    referral_reason=f"Physiotherapy: {instance.treatment_type.name if instance.treatment_type else 'General'}",
                    queue_number=session.visits.count() + 1,
                )

                instance.clinic_visit = visit
                instance.save(update_fields=["clinic_visit"])

                logger.info(
                    f"Created clinic visit {visit.id} for physiotherapy order {instance.order_number}"
                )

        except ImportError:
            logger.warning("Clinics module not available. Skipping queue integration.")
        except Exception as e:
            logger.error(f"Error creating clinic visit for physiotherapy order: {e}")


@receiver(post_save, sender=PhysiotherapyOrder)
def update_order_payment_status(sender, instance, created, **kwargs):
    """
    Update order payment status when invoice is paid.

    This checks if the linked invoice is paid and updates the order accordingly.
    """
    if created or not instance.invoice:
        return

    try:
        if instance.invoice.status == "paid" and not instance.is_paid:
            instance.is_paid = True
            instance.save(update_fields=["is_paid"])
            logger.info(f"Marked physiotherapy order {instance.order_number} as paid")
    except Exception as e:
        logger.error(f"Error updating payment status for physiotherapy order: {e}")
