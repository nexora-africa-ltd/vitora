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
        logger.exception("Billing agent: discharge billing failed for discharge %s", instance.id)


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
        logger.exception("Billing agent: admission billing failed for admission %s", instance.id)


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
        logger.exception("Billing agent: immunization billing failed for record %s", instance.id)


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

    # Notify billing staff about new payment
    _notify_payment_received(instance)

    try:
        from hmis.apps.billing.websockets import broadcast_payment_received

        broadcast_payment_received(instance)
    except Exception as e:
        logger.error(f"Failed to broadcast payment received for {instance.id}: {e}")


# ---------------------------------------------------------------------------
# DHA HIE Consent & Preauth domain events
# ---------------------------------------------------------------------------


@receiver(post_save, sender="billing.ConsentToken")
def publish_consent_event(sender, instance, created, **kwargs):
    """Publish domain event when consent token status changes."""
    if created:
        event_type = BillingEvents.CONSENT_OTP_SENT
    elif instance.status == "VALIDATED":
        event_type = BillingEvents.CONSENT_VALIDATED
    elif instance.status == "EXPIRED":
        event_type = BillingEvents.CONSENT_EXPIRED
    elif instance.status == "FAILED":
        event_type = BillingEvents.CONSENT_FAILED
    else:
        return

    publish_event(
        event_type=event_type,
        aggregate_type="ConsentToken",
        aggregate_id=instance.id,
        payload={
            "patient_id": instance.patient_id,
            "sha_member_id": instance.sha_member_id,
            "consent_method": instance.consent_method,
            "status": instance.status,
        },
        facility_id=instance.facility_id,
        organization_id=instance.organization_id,
    )


@receiver(post_save, sender="billing.PreauthRequest")
def publish_preauth_event(sender, instance, created, **kwargs):
    """Publish domain event when preauth status changes."""
    if created:
        event_type = BillingEvents.PREAUTH_SUBMITTED
    elif instance.decision == "APPROVED":
        event_type = BillingEvents.PREAUTH_APPROVED
    elif instance.decision == "DENIED":
        event_type = BillingEvents.PREAUTH_DENIED
    elif instance.decision == "EXPIRED":
        event_type = BillingEvents.PREAUTH_EXPIRED
    else:
        return

    publish_event(
        event_type=event_type,
        aggregate_type="PreauthRequest",
        aggregate_id=instance.id,
        payload={
            "patient_id": instance.patient_id,
            "claim_id": instance.claim_id,
            "preauth_reference": instance.preauth_reference,
            "procedure_code": instance.procedure_code,
            "decision": instance.decision,
            "approved_amount": str(instance.approved_amount) if instance.approved_amount else None,
        },
        facility_id=instance.facility_id,
        organization_id=instance.organization_id,
    )

    # Notify relevant staff about preauth decisions
    if not created and instance.decision in ("APPROVED", "DENIED"):
        _notify_preauth_decision(instance)


# ---------------------------------------------------------------------------
# Notification helpers
# ---------------------------------------------------------------------------


def _notify_payment_received(instance):
    """Notify billing staff about a payment received."""
    try:
        from hmis.apps.core.services.notification_service import notify_user

        invoice = getattr(instance, "invoice", None)
        if not invoice:
            return

        # Notify the user who created the invoice (cashier/billing staff)
        created_by = getattr(invoice, "created_by", None)
        if not created_by:
            return

        amount = getattr(instance, "amount", 0)
        patient_name = ""
        if invoice.patient:
            patient_name = f"{invoice.patient.first_name} {invoice.patient.last_name}"

        notify_user(
            user=created_by,
            notification_type="payment_received",
            priority="normal",
            title="Payment Received",
            message=f"Payment of KES {amount} received for {patient_name} ({invoice.invoice_number}).",
            related_model="Invoice",
            related_id=invoice.id,
            action_url=f"/billing/invoices/{invoice.id}",
            deduplicate=True,
        )
    except Exception:
        logger.exception("Failed to notify payment for %s", instance.id)


def _notify_preauth_decision(instance):
    """Notify staff about SHA preauthorization decision."""
    try:
        from hmis.apps.core.services.notification_service import notify_user

        # Find the clinician or staff who submitted the preauth
        claim = getattr(instance, "claim", None)
        if not claim:
            return

        submitted_by = getattr(claim, "submitted_by", None) or getattr(claim, "created_by", None)
        if not submitted_by:
            return

        status = instance.decision.lower()
        priority = "high" if instance.decision == "DENIED" else "normal"

        notify_user(
            user=submitted_by,
            notification_type="sha_claim_update",
            priority=priority,
            title=f"Preauthorization {instance.decision.title()}",
            message=f"Preauth {instance.preauth_reference} has been {status}.",
            related_model="PreauthRequest",
            related_id=instance.id,
            action_url="/billing/sha-claims",
        )
    except Exception:
        logger.exception("Failed to notify preauth decision for %s", instance.id)
