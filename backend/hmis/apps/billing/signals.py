# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Billing signals for Vitora HMIS.

This module contains Django signals for billing integration:
- Auto-create draft invoice when encounter is created
- Auto-bill admission fee and create SHA claim on inpatient admission
- Finalize invoice and update SHA claim with discharge data on discharge
- Update invoice totals when items are added/modified
- Broadcast real-time WebSocket events for billing updates
- Publish domain events for cross-cutting observability
"""

import logging
from datetime import date, timedelta

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.models import Invoice, Payment, SupplierBill, SupplierPayment
from hmis.apps.core.events import BillingEvents, publish_event
from hmis.apps.core.sync_context import is_sync_materialization_active
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

    if is_sync_materialization_active():
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
        from hmis.apps.core.utils import get_system_user

        system_user = get_system_user()
        if not system_user:
            # Fallback (should never happen)
            from django.contrib.auth import get_user_model

            User = get_user_model()
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

    # Auto-create PHC draft claim for outpatient encounters at Level 2-3 facilities
    _maybe_create_phc_claim(instance)


def _maybe_create_phc_claim(encounter):
    """
    Auto-create a draft SHA claim for outpatient encounters at SHA-eligible
    facilities when the patient has active SHA membership.

    Uses the DHA HIE flow router (determine_flow) to set the correct claim_flow
    (phc, shif, or eccif) based on encounter type, eligibility scheme, and
    facility KEPH level.

    This closes the gap where outpatient visits don't go through a discharge event,
    so the existing discharge-triggered claim creation never fires for them.
    """
    from hmis.apps.billing.models import SHAClaim, SHAMember
    from hmis.apps.billing.services.sha_flow_router import determine_flow

    # Only for outpatient encounters (IPD goes through handle_admission_created)
    if getattr(encounter, "encounter_type", None) not in ("OPD", "EMERGENCY", "FOLLOW_UP"):
        return

    facility = getattr(encounter, "facility", None)
    if not facility:
        return

    level_num = str(facility.level or "").strip()
    normalized_level = f"L{level_num}" if level_num else ""

    # Check if patient has active SHA membership
    try:
        sha_member = SHAMember.objects.filter(
            patient=encounter.patient,
            status=SHAMember.MembershipStatus.ACTIVE,
        ).first()
    except Exception:
        return

    if not sha_member:
        return

    # Determine the claim flow via the DHA HIE flow router
    eligibility_data = getattr(sha_member, "eligibility_response", None) or None
    claim_flow = determine_flow(encounter, facility, eligibility_data=eligibility_data)
    is_emergency = claim_flow == SHAClaim.ClaimFlow.ECCIF

    # Avoid duplicate: check if any SHA claim already exists for this encounter
    existing = SHAClaim.objects.filter(encounter=encounter).exists()
    if existing:
        return

    # Get or create invoice for this encounter
    invoice = Invoice.objects.filter(encounter=encounter).first()

    try:
        from hmis.apps.core.utils import get_system_user

        system_user = get_system_user()

        fr_code = resolve_fr_code(facility, allow_settings_fallback=False).value
        facility_code = (
            fr_code
            or getattr(settings, "SHA_FACILITY_FR_CODE", "")
            or getattr(settings, "FACILITY_MFL_CODE", "")
        )

        claim = SHAClaim.objects.create(
            patient=encounter.patient,
            sha_member=sha_member,
            encounter=encounter,
            invoice=invoice,
            claim_type=SHAClaim.ClaimType.OUTPATIENT,
            claim_flow=claim_flow,
            is_emergency_claim=is_emergency,
            status=SHAClaim.ClaimStatus.DRAFT,
            service_date=encounter.encounter_date,
            facility_code=facility_code,
            facility_level=normalized_level,
            primary_diagnosis_code="PENDING",
            primary_diagnosis_description="Awaiting diagnosis",
            created_by=system_user,
            facility=getattr(encounter, "facility", None),
            organization=getattr(encounter, "organization", None),
        )

        logger.info(
            "Auto-created draft claim %s (flow=%s) for encounter %s",
            claim.claim_number,
            claim_flow,
            encounter.id,
        )

        publish_event(
            event_type=BillingEvents.SHA_CLAIM_CREATED,
            aggregate_type="SHAClaim",
            aggregate_id=claim.id,
            payload={
                "claim_number": claim.claim_number,
                "encounter_id": encounter.id,
                "patient_id": encounter.patient_id,
                "claim_flow": claim_flow,
                "trigger": "outpatient_encounter_created",
            },
            facility_id=getattr(encounter, "facility_id", None),
            organization_id=getattr(encounter, "organization_id", None),
        )
    except Exception:
        logger.exception(
            "Auto claim creation failed for encounter %s — queuing retry",
            encounter.id,
        )
        # Queue async retry so transient failures (e.g. SQLite locking) are recovered
        try:
            from hmis.apps.billing.tasks import retry_phc_claim_creation

            retry_phc_claim_creation.apply_async(args=[encounter.id], countdown=10)
        except Exception:
            logger.debug("retry_phc_claim_creation task not queued (Celery may be unavailable)")


def handle_discharge_billing(sender, instance, created, **kwargs):
    """Auto-finalize invoice and create SHA claim on patient discharge."""
    if not created:
        return

    if is_sync_materialization_active():
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
    """Auto-bill admission fee, first bed night, and create SHA claim on admission."""
    if not created:
        return

    if is_sync_materialization_active():
        return

    try:
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_admission_created(instance)

        # Verify SHA eligibility for inpatient admissions with SHA payer
        if getattr(instance, "payer_type", "") == "SHA":
            trigger_sha_eligibility_verification(
                instance.patient_id,
                getattr(instance, "facility_id", None),
            )

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

    if is_sync_materialization_active():
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


# ---------------------------------------------------------------------------
# Supplier Bill & Payment domain events
# ---------------------------------------------------------------------------


@receiver(post_save, sender=SupplierBill)
def publish_supplier_bill_event(sender, instance, created, **kwargs):
    """Publish domain event when a supplier bill is created or updated."""
    if created:
        event_type = BillingEvents.SUPPLIER_BILL_CREATED
    else:
        event_type = BillingEvents.SUPPLIER_BILL_UPDATED

    publish_event(
        event_type=event_type,
        aggregate_type="SupplierBill",
        aggregate_id=instance.id,
        payload={
            "bill_number": instance.bill_number,
            "supplier_id": instance.supplier_id,
            "status": instance.status,
            "total_amount": str(instance.total_amount),
            "amount_paid": str(instance.amount_paid),
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )


@receiver(post_save, sender=SupplierPayment)
def publish_supplier_payment_event(sender, instance, created, **kwargs):
    """Publish domain event when a supplier payment is recorded."""
    if not created:
        return

    publish_event(
        event_type=BillingEvents.SUPPLIER_PAYMENT_RECEIVED,
        aggregate_type="SupplierPayment",
        aggregate_id=instance.id,
        payload={
            "bill_id": instance.bill_id,
            "amount": str(instance.amount),
            "payment_method": instance.method,
            "reference_number": instance.transaction_reference or "",
        },
        facility_id=getattr(instance.bill, "facility_id", None),
        organization_id=getattr(instance.bill, "organization_id", None),
    )


# =============================================================================
# SHA Claims Workflow Automation Signals
# =============================================================================


@receiver(post_save, sender=Encounter)
def trigger_sha_automation_on_encounter(sender, instance, created, **kwargs):
    """
    Trigger SHA automation when a new encounter is created.

    Actions:
    - Auto-start DHA visit (if consent available)
    - Auto-suggest interventions (deferred to allow clinical data entry)
    """
    if not created:
        return

    if is_sync_materialization_active():
        return

    # Only trigger for facilities with SHA integration
    facility = getattr(instance, "facility", None)
    if not facility or not getattr(facility, "mfl_code", ""):
        return

    # Defer auto-start visit (gives time for consent OTP to be validated)
    try:
        from hmis.apps.billing.tasks import auto_start_visit

        # Delay by 30 seconds to allow consent validation to complete
        auto_start_visit.apply_async(args=[instance.pk], countdown=30)
    except Exception:
        logger.debug("SHA auto-start visit task not queued (Celery may be unavailable)")


def trigger_phc_claim_on_queue(patient_id: int, facility_id: int):
    """
    Public function called by clinic queue signal to ensure a PHC claim exists
    for any same-day OPD/EMERGENCY encounter that is missing one.

    Covers the case where the encounter was created before the clinic visit
    and the original _maybe_create_phc_claim failed silently.
    """
    from hmis.apps.billing.models import SHAClaim, SHAMember
    from hmis.apps.encounters.models import Encounter

    try:
        sha_member = SHAMember.objects.filter(
            patient_id=patient_id,
            status=SHAMember.MembershipStatus.ACTIVE,
        ).first()
        if not sha_member:
            return

        # Find today's OPD/EMERGENCY encounters for this patient without any SHA claim
        encounters = Encounter.objects.filter(
            patient_id=patient_id,
            facility_id=facility_id,
            encounter_date=date.today(),
            encounter_type__in=("OPD", "EMERGENCY"),
        ).exclude(id__in=SHAClaim.objects.values_list("encounter_id", flat=True))

        for enc in encounters:
            _maybe_create_phc_claim(enc)
    except Exception:
        logger.debug("trigger_phc_claim_on_queue failed for patient %s", patient_id)


def trigger_sha_consent_on_queue(patient_id: int, facility_id: int):
    """
    Public function called by clinic queue signal to auto-trigger SHA consent.

    This is called from the clinics app signal when a patient is added to
    a clinic queue, avoiding a direct import of billing into clinics.
    """
    try:
        from hmis.apps.billing.tasks import auto_trigger_consent

        auto_trigger_consent.delay(patient_id, facility_id)
    except Exception:
        logger.debug("SHA auto-consent task not queued (Celery may be unavailable)")


def trigger_sha_document_attachment(claim_id: int):
    """
    Public function called when lab results are verified or documents finalized.

    Triggers automatic attachment of digital documents to SHA claims.
    """
    try:
        from hmis.apps.billing.tasks import auto_attach_documents

        auto_attach_documents.apply_async(args=[claim_id], countdown=5)
    except Exception:
        logger.debug("SHA auto-attach docs task not queued (Celery may be unavailable)")


def trigger_sha_eligibility_verification(patient_id: int, facility_id: int | None = None):
    """
    Verify or refresh SHA eligibility for a patient.

    Called on patient registration and on every check-in to ensure SHA
    membership status is never stale across visits.

    - If the patient already has a SHAMember, calls check_eligibility()
      with force_refresh=True, which updates SHAMember.status via the DHA API.
    - If no SHAMember exists yet, calls check_eligibility_direct() using
      national_id and auto-creates an active SHAMember if eligible.
    """
    try:
        from hmis.apps.billing.tasks import verify_patient_sha_eligibility

        verify_patient_sha_eligibility.delay(patient_id, facility_id)
    except Exception:
        logger.debug("SHA eligibility verification task not queued (Celery may be unavailable)")


# Backward-compat alias
trigger_sha_eligibility_cache = trigger_sha_eligibility_verification
