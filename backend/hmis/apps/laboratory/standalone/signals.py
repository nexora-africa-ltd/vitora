# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Signals for standalone LIS module."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import LaboratoryEvents
from hmis.apps.core.sync_context import is_sync_materialization_active

from .models import (
    ExternalOrderRequest,
    ExternalPatientIdentifierCrosswalk,
    InboundIngestionEvent,
    ResultDeliveryLog,
    WalkInPatient,
)


@receiver(post_save, sender=WalkInPatient)
def publish_walkin_patient_event(sender, instance, created, **kwargs):
    """Publish event when walk-in patient is created or updated."""
    if is_sync_materialization_active():
        return

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
    if is_sync_materialization_active():
        return

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


@receiver(post_save, sender=InboundIngestionEvent)
def publish_inbound_ingestion_event(sender, instance, created, **kwargs):
    """Publish event when standalone inbound ingestion is created/updated."""
    if is_sync_materialization_active():
        return

    if created:
        publish_event(
            event_type=LaboratoryEvents.STANDALONE_INGESTION_RECEIVED,
            aggregate_type="InboundIngestionEvent",
            aggregate_id=instance.id,
            payload={
                "trace_id": str(instance.trace_id),
                "source_system": instance.source_system,
                "channel": instance.channel,
                "status": instance.status,
            },
            facility_id=instance.facility_id,
        )
    elif instance.status == InboundIngestionEvent.Status.FAILED:
        publish_event(
            event_type=LaboratoryEvents.STANDALONE_INGESTION_FAILED,
            aggregate_type="InboundIngestionEvent",
            aggregate_id=instance.id,
            payload={
                "trace_id": str(instance.trace_id),
                "error_message": instance.error_message,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=ResultDeliveryLog)
def publish_result_delivery_event(sender, instance, created, **kwargs):
    """Publish event when standalone result delivery status changes."""
    if is_sync_materialization_active():
        return

    if instance.status == ResultDeliveryLog.Status.DELIVERED:
        publish_event(
            event_type=LaboratoryEvents.STANDALONE_RESULT_DELIVERED,
            aggregate_type="ResultDeliveryLog",
            aggregate_id=instance.id,
            payload={
                "trace_id": str(instance.trace_id),
                "channel": instance.channel,
                "destination": instance.destination,
                "lab_order_id": instance.lab_order_id,
            },
            facility_id=instance.facility_id,
        )
    elif instance.status == ResultDeliveryLog.Status.FAILED:
        publish_event(
            event_type=LaboratoryEvents.STANDALONE_RESULT_DELIVERY_FAILED,
            aggregate_type="ResultDeliveryLog",
            aggregate_id=instance.id,
            payload={
                "trace_id": str(instance.trace_id),
                "channel": instance.channel,
                "error_message": instance.error_message,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=ExternalPatientIdentifierCrosswalk)
def publish_identifier_crosswalk_event(sender, instance, created, **kwargs):
    """Publish event when external identifier crosswalk is created."""
    if is_sync_materialization_active() or not created:
        return

    publish_event(
        event_type=LaboratoryEvents.STANDALONE_IDENTIFIER_CROSSWALKED,
        aggregate_type="ExternalPatientIdentifierCrosswalk",
        aggregate_id=instance.id,
        payload={
            "source_system": instance.source_system,
            "external_patient_id": instance.external_patient_id,
            "walkin_patient_id": instance.walkin_patient_id,
            "patient_id": instance.patient_id,
        },
        facility_id=instance.facility_id,
    )
