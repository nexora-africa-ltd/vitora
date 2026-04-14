"""
Billing signals for Vitora HMIS.

This module contains Django signals for billing integration:
- Auto-create draft invoice when encounter is created
- Auto-finalize invoice and create SHA claim on discharge
- Auto-bill admission fee on inpatient admission
- Update invoice totals when items are added/modified
- Broadcast real-time WebSocket events for billing updates
- Publish domain events for cross-cutting observability
"""

import logging
from datetime import date, timedelta

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.billing.models import Invoice, Payment
from hmis.apps.core.events import BillingEvents, publish_event
from hmis.apps.encounters.models import Encounter

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Encounter)
def create_invoice_for_encounter(sender, instance, created, **kwargs):
    """
    Auto-create a draft invoice when an encounter is created.

    Business Rules:
    1. Only create invoice for new encounters
    2. Reuse existing draft invoice for the same patient from today
    3. Link the invoice to the encounter
    """
    if not created:
        return

    # Check if patient already has a draft invoice from today
    existing_invoice = Invoice.objects.filter(
        patient=instance.patient,
        invoice_date=date.today(),
        status=Invoice.Status.DRAFT,
        encounter__isnull=True,  # Not linked to another encounter
    ).first()

    if existing_invoice:
        # Link existing invoice to this encounter
        existing_invoice.encounter = instance
        existing_invoice.save(update_fields=["encounter", "updated_at"])
    else:
        # Create new draft invoice for the encounter
        # Get or create a system user for auto-created invoices
        from django.contrib.auth import get_user_model

        User = get_user_model()

        # Try to get the system user or first superuser
        system_user, _ = User.objects.get_or_create(
            username="system",
            defaults={
                "email": "system@vitora.local",
                "is_active": True,
            },
        )
        if not system_user:
            # Create a system user if none exists
            system_user = User.objects.create_user(
                username="system",
                email="system@vitora.local",
                is_active=True,
            )

        Invoice.objects.create(
            patient=instance.patient,
            encounter=instance,
            invoice_date=date.today(),
            due_date=date.today()
            + timedelta(days=getattr(settings, "BILLING_DEFAULT_DUE_DAYS", 30)),
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            created_by=system_user,
            facility=getattr(instance, "facility", None),
            organization=getattr(instance, "organization", None),
        )

    # Publish domain event for encounter-triggered invoice creation
    publish_event(
        event_type=BillingEvents.INVOICE_CREATED,
        aggregate_type="Invoice",
        aggregate_id=instance.id,
        payload={
            "encounter_id": instance.id,
            "patient_id": instance.patient_id,
            "trigger": "encounter_created",
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )


def handle_discharge_billing(sender, instance, created, **kwargs):
    """Auto-finalize invoice and create SHA claim on patient discharge."""
    if not created:
        return

    try:
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_discharge(instance)

        publish_event(
            event_type=BillingEvents.DISCHARGE_BILLING,
            aggregate_type="Discharge",
            aggregate_id=instance.id,
            payload={"admission_id": getattr(instance, "admission_id", None)},
            facility_id=getattr(instance, "facility_id", None),
        )
    except Exception:
        logger.exception(
            "Billing agent: discharge billing failed for discharge %s", instance.id
        )


def handle_admission_billing(sender, instance, created, **kwargs):
    """Auto-bill admission fee and first bed night on admission."""
    if not created:
        return

    try:
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_admission_created(instance)

        publish_event(
            event_type=BillingEvents.ADMISSION_BILLING,
            aggregate_type="Admission",
            aggregate_id=instance.id,
            payload={"patient_id": getattr(instance, "patient_id", None)},
            facility_id=getattr(instance, "facility_id", None),
        )
    except Exception:
        logger.exception(
            "Billing agent: admission billing failed for admission %s", instance.id
        )


def handle_immunization_billing(sender, instance, created, **kwargs):
    """Auto-bill vaccine administration when ImmunizationRecord.status is ADMINISTERED."""
    # Trigger on both create (direct ADMINISTERED) and update (SCHEDULED → ADMINISTERED)
    if instance.status != "ADMINISTERED":
        return

    try:
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_immunization_administered(instance)

        publish_event(
            event_type=BillingEvents.IMMUNIZATION_BILLING,
            aggregate_type="ImmunizationRecord",
            aggregate_id=instance.id,
            payload={"patient_id": getattr(instance, "patient_id", None)},
            facility_id=getattr(instance, "facility_id", None),
        )
    except Exception:
        logger.exception(
            "Billing agent: immunization billing failed for record %s", instance.id
        )


# =============================================================================
# WebSocket broadcast signals
# =============================================================================


@receiver(post_save, sender=Invoice)
def broadcast_invoice_change(sender, instance, created, **kwargs):
    """
    Broadcast WebSocket event and publish domain event when an invoice changes.
    """
    event_type = BillingEvents.INVOICE_CREATED if created else BillingEvents.INVOICE_UPDATED
    publish_event(
        event_type=event_type,
        aggregate_type="Invoice",
        aggregate_id=instance.id,
        payload={
            "invoice_number": getattr(instance, "invoice_number", ""),
            "status": getattr(instance, "status", ""),
            "total_amount": str(getattr(instance, "total_amount", 0)),
            "patient_id": getattr(instance, "patient_id", None),
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )

    try:
        from hmis.apps.billing.websockets import (
            broadcast_invoice_created,
            broadcast_invoice_updated,
        )

        if created:
            broadcast_invoice_created(instance)
        else:
            broadcast_invoice_updated(instance)
    except Exception as e:
        logger.error(f"Failed to broadcast invoice change for {instance.id}: {e}")


@receiver(post_save, sender=Payment)
def broadcast_payment_change(sender, instance, created, **kwargs):
    """
    Broadcast WebSocket event and publish domain event when a payment is recorded.
    """
    if not created:
        return

    publish_event(
        event_type=BillingEvents.PAYMENT_RECEIVED,
        aggregate_type="Payment",
        aggregate_id=instance.id,
        payload={
            "amount": str(getattr(instance, "amount", 0)),
            "payment_method": getattr(instance, "payment_method", ""),
            "invoice_id": getattr(instance, "invoice_id", None),
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )

    try:
        from hmis.apps.billing.websockets import broadcast_payment_received

        broadcast_payment_received(instance)
    except Exception as e:
        logger.error(f"Failed to broadcast payment received for {instance.id}: {e}")
