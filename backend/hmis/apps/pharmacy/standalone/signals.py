"""Signals for standalone Pharmacy module."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import PharmacyEvents

from .models import ExternalPrescriptionRequest, WalkInCustomer


@receiver(post_save, sender=WalkInCustomer)
def publish_walkin_customer_event(sender, instance, created, **kwargs):
    """Publish event when walk-in pharmacy customer is registered."""
    if created:
        publish_event(
            event_type=PharmacyEvents.WALKIN_CUSTOMER_REGISTERED,
            aggregate_type="WalkInCustomer",
            aggregate_id=instance.id,
            payload={
                "registration_number": instance.registration_number,
                "name": instance.full_name,
                "facility_id": instance.facility_id,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=ExternalPrescriptionRequest)
def publish_external_prescription_event(sender, instance, created, **kwargs):
    """Publish event when external prescription is received or accepted."""
    if created:
        publish_event(
            event_type=PharmacyEvents.EXTERNAL_PRESCRIPTION_RECEIVED,
            aggregate_type="ExternalPrescriptionRequest",
            aggregate_id=instance.id,
            payload={
                "external_prescription_number": instance.external_prescription_number,
                "sending_facility": instance.sending_facility,
                "patient_name": instance.patient_name,
                "items_count": len(instance.requested_items),
            },
            facility_id=instance.facility_id,
        )
    elif instance.status == ExternalPrescriptionRequest.Status.ACCEPTED:
        publish_event(
            event_type=PharmacyEvents.EXTERNAL_PRESCRIPTION_ACCEPTED,
            aggregate_type="ExternalPrescriptionRequest",
            aggregate_id=instance.id,
            payload={
                "external_prescription_number": instance.external_prescription_number,
                "prescription_id": instance.prescription_id,
            },
            facility_id=instance.facility_id,
        )
