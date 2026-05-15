"""Signals for the insurance app — domain event publishing."""

import contextlib
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import InsuranceEvents, publish_event
from hmis.apps.insurance.models import (
    InsuranceClaim,
    InsurancePreauth,
    InsuranceProvider,
    InsuranceRemittance,
    PatientInsurance,
)

logger = logging.getLogger(__name__)


def _safe_publish(event_type: str, payload: dict) -> None:
    """Publish event, swallowing exceptions so save() is never broken."""
    with contextlib.suppress(Exception):
        publish_event(event_type, payload)


# ---------------------------------------------------------------------------
# InsuranceProvider
# ---------------------------------------------------------------------------
@receiver(post_save, sender=InsuranceProvider)
def publish_provider_event(sender, instance, created, **kwargs):
    event_type = InsuranceEvents.PROVIDER_CREATED if created else InsuranceEvents.PROVIDER_UPDATED
    _safe_publish(
        event_type,
        {
            "id": instance.pk,
            "name": instance.name,
            "code": instance.code,
            "status": instance.status,
        },
    )


# ---------------------------------------------------------------------------
# PatientInsurance
# ---------------------------------------------------------------------------
@receiver(post_save, sender=PatientInsurance)
def publish_enrollment_event(sender, instance, created, **kwargs):
    if created:
        _safe_publish(
            InsuranceEvents.ENROLLMENT_CREATED,
            {
                "id": instance.pk,
                "patient_id": instance.patient_id,
                "provider_id": instance.provider_id,
                "member_number": instance.member_number,
                "status": instance.status,
            },
        )
    elif instance.status == PatientInsurance.Status.ACTIVE and instance.verified_at:
        _safe_publish(
            InsuranceEvents.ENROLLMENT_VERIFIED,
            {
                "id": instance.pk,
                "patient_id": instance.patient_id,
            },
        )


# ---------------------------------------------------------------------------
# InsuranceClaim
# ---------------------------------------------------------------------------
_CLAIM_STATUS_EVENT_MAP = {
    InsuranceClaim.Status.SUBMITTED: InsuranceEvents.CLAIM_SUBMITTED,
    InsuranceClaim.Status.ACKNOWLEDGED: InsuranceEvents.CLAIM_ACKNOWLEDGED,
    InsuranceClaim.Status.APPROVED: InsuranceEvents.CLAIM_APPROVED,
    InsuranceClaim.Status.PARTIALLY_APPROVED: InsuranceEvents.CLAIM_PARTIALLY_APPROVED,
    InsuranceClaim.Status.REJECTED: InsuranceEvents.CLAIM_REJECTED,
    InsuranceClaim.Status.QUERY: InsuranceEvents.CLAIM_QUERIED,
    InsuranceClaim.Status.PAID: InsuranceEvents.CLAIM_PAID,
    InsuranceClaim.Status.PARTIALLY_PAID: InsuranceEvents.CLAIM_PAID,
    InsuranceClaim.Status.APPEALED: InsuranceEvents.CLAIM_APPEALED,
    InsuranceClaim.Status.CANCELLED: InsuranceEvents.CLAIM_CANCELLED,
}


@receiver(post_save, sender=InsuranceClaim)
def publish_claim_event(sender, instance, created, **kwargs):
    if created:
        _safe_publish(
            InsuranceEvents.CLAIM_CREATED,
            {
                "id": instance.pk,
                "claim_number": instance.claim_number,
                "provider_id": instance.provider_id,
                "patient_id": instance.patient_id,
                "status": instance.status,
                "total_amount": str(instance.total_amount),
            },
        )
    else:
        event_type = _CLAIM_STATUS_EVENT_MAP.get(instance.status)
        if event_type:
            _safe_publish(
                event_type,
                {
                    "id": instance.pk,
                    "claim_number": instance.claim_number,
                    "status": instance.status,
                    "approved_amount": str(instance.approved_amount),
                    "paid_amount": str(instance.paid_amount),
                },
            )


# ---------------------------------------------------------------------------
# InsurancePreauth
# ---------------------------------------------------------------------------
_PREAUTH_STATUS_EVENT_MAP = {
    InsurancePreauth.Status.SUBMITTED: InsuranceEvents.PREAUTH_SUBMITTED,
    InsurancePreauth.Status.APPROVED: InsuranceEvents.PREAUTH_APPROVED,
    InsurancePreauth.Status.DENIED: InsuranceEvents.PREAUTH_DENIED,
    InsurancePreauth.Status.EXPIRED: InsuranceEvents.PREAUTH_EXPIRED,
    InsurancePreauth.Status.CANCELLED: InsuranceEvents.PREAUTH_CANCELLED,
}


@receiver(post_save, sender=InsurancePreauth)
def publish_preauth_event(sender, instance, created, **kwargs):
    if created:
        _safe_publish(
            InsuranceEvents.PREAUTH_CREATED,
            {
                "id": instance.pk,
                "preauth_number": instance.preauth_number,
                "provider_id": instance.provider_id,
                "patient_id": instance.patient_id,
                "status": instance.status,
                "estimated_cost": str(instance.estimated_cost),
            },
        )
    else:
        event_type = _PREAUTH_STATUS_EVENT_MAP.get(instance.status)
        if event_type:
            _safe_publish(
                event_type,
                {
                    "id": instance.pk,
                    "preauth_number": instance.preauth_number,
                    "status": instance.status,
                },
            )


# ---------------------------------------------------------------------------
# InsuranceRemittance
# ---------------------------------------------------------------------------
@receiver(post_save, sender=InsuranceRemittance)
def publish_remittance_event(sender, instance, created, **kwargs):
    if created:
        _safe_publish(
            InsuranceEvents.REMITTANCE_RECEIVED,
            {
                "id": instance.pk,
                "remittance_number": instance.remittance_number,
                "provider_id": instance.provider_id,
                "total_amount": str(instance.total_amount),
            },
        )
    elif instance.status in {
        InsuranceRemittance.Status.RECONCILED,
        InsuranceRemittance.Status.PARTIAL,
    }:
        _safe_publish(
            InsuranceEvents.REMITTANCE_RECONCILED,
            {
                "id": instance.pk,
                "remittance_number": instance.remittance_number,
                "status": instance.status,
                "reconciled_amount": str(instance.reconciled_amount),
            },
        )
