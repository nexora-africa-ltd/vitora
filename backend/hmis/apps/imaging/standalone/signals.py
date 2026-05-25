"""Signals for standalone Imaging module."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import ImagingEvents

from .models import ExternalImagingOrderRequest, WalkInImagingPatient


@receiver(post_save, sender=WalkInImagingPatient)
def publish_walkin_imaging_patient_event(sender, instance, created, **kwargs):
    if created:
        publish_event(
            event_type=ImagingEvents.WALKIN_PATIENT_REGISTERED,
            aggregate_type="WalkInImagingPatient",
            aggregate_id=instance.id,
            payload={
                "registration_number": instance.registration_number,
                "name": instance.full_name,
                "facility_id": instance.facility_id,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=ExternalImagingOrderRequest)
def publish_external_imaging_order_event(sender, instance, created, **kwargs):
    if created:
        publish_event(
            event_type=ImagingEvents.EXTERNAL_ORDER_RECEIVED,
            aggregate_type="ExternalImagingOrderRequest",
            aggregate_id=instance.id,
            payload={
                "placer_order_number": instance.placer_order_number,
                "sending_facility": instance.sending_facility,
                "patient_name": instance.patient_name,
                "procedures_count": len(instance.requested_procedures),
            },
            facility_id=instance.facility_id,
        )
    elif instance.status == ExternalImagingOrderRequest.Status.ACCEPTED:
        publish_event(
            event_type=ImagingEvents.EXTERNAL_ORDER_ACCEPTED,
            aggregate_type="ExternalImagingOrderRequest",
            aggregate_id=instance.id,
            payload={
                "placer_order_number": instance.placer_order_number,
                "imaging_order_id": instance.imaging_order_id,
            },
            facility_id=instance.facility_id,
        )
