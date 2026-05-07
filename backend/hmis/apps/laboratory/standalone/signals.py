"""Signals for standalone LIS module."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import LaboratoryEvents

from .models import ExternalOrderRequest, WalkInPatient


@receiver(post_save, sender=WalkInPatient)
def publish_walkin_patient_event(sender, instance, created, **kwargs):
    """Publish event when walk-in patient is created or updated."""
    if created:
        publish_event(
            event_type=LaboratoryEvents.WALKIN_PATIENT_REGISTERED,
            aggregate_type="WalkInPatient",
            aggregate_id=instance.id,
            payload={
                "registration_number": instance.registration_number,
                "name": instance.full_name,
                "facility_id": instance.facility_id,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=ExternalOrderRequest)
def publish_external_order_event(sender, instance, created, **kwargs):
    """Publish event when external order is received or status changes."""
    if created:
        publish_event(
            event_type=LaboratoryEvents.EXTERNAL_ORDER_RECEIVED,
            aggregate_type="ExternalOrderRequest",
            aggregate_id=instance.id,
            payload={
                "placer_order_number": instance.placer_order_number,
                "sending_facility": instance.sending_facility,
                "patient_name": instance.patient_name,
                "tests_count": len(instance.requested_tests),
            },
            facility_id=instance.facility_id,
        )
    elif instance.status == ExternalOrderRequest.Status.ACCEPTED:
        publish_event(
            event_type=LaboratoryEvents.EXTERNAL_ORDER_ACCEPTED,
            aggregate_type="ExternalOrderRequest",
            aggregate_id=instance.id,
            payload={
                "placer_order_number": instance.placer_order_number,
                "lab_order_id": instance.lab_order_id,
            },
            facility_id=instance.facility_id,
        )
