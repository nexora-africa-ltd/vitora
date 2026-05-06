"""
Signals for Phase L3: Analyzer Interfacing.

Publishes domain events when analyzer messages are processed
and channel status changes.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import LaboratoryEvents, publish_event

from .models import AnalyzerMessage, InstrumentChannel

logger = logging.getLogger(__name__)


@receiver(post_save, sender=AnalyzerMessage)
def publish_analyzer_message_event(sender, instance, created, **kwargs):
    """Publish domain event when an analyzer message is created or status changes."""
    if created:
        event_type = LaboratoryEvents.ANALYZER_MESSAGE_RECEIVED
        publish_event(
            event_type=event_type,
            aggregate_type="AnalyzerMessage",
            aggregate_id=instance.id,
            payload={
                "channel_id": instance.channel_id,
                "instrument_code": instance.channel.instrument.code,
                "direction": instance.direction,
                "message_type": instance.message_type,
                "sample_id": instance.sample_id,
                "status": instance.status,
            },
            facility_id=instance.facility_id,
        )
    elif instance.status == AnalyzerMessage.Status.APPLIED:
        publish_event(
            event_type=LaboratoryEvents.ANALYZER_RESULT_APPLIED,
            aggregate_type="AnalyzerMessage",
            aggregate_id=instance.id,
            payload={
                "channel_id": instance.channel_id,
                "instrument_code": instance.channel.instrument.code,
                "sample_id": instance.sample_id,
                "test_code": instance.test_code,
                "result_value": instance.result_value,
                "specimen_id": instance.specimen_id,
                "lab_order_item_id": instance.lab_order_item_id,
            },
            facility_id=instance.facility_id,
        )
    elif instance.status == AnalyzerMessage.Status.FAILED:
        publish_event(
            event_type=LaboratoryEvents.ANALYZER_MESSAGE_FAILED,
            aggregate_type="AnalyzerMessage",
            aggregate_id=instance.id,
            payload={
                "channel_id": instance.channel_id,
                "instrument_code": instance.channel.instrument.code,
                "direction": instance.direction,
                "sample_id": instance.sample_id,
                "error_message": instance.error_message,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=InstrumentChannel)
def publish_channel_status_event(sender, instance, created, **kwargs):
    """Publish domain event when channel connection status changes."""
    if not created and instance.connection_status in [
        InstrumentChannel.ConnectionStatus.ERROR,
        InstrumentChannel.ConnectionStatus.DISCONNECTED,
    ]:
        publish_event(
            event_type=LaboratoryEvents.ANALYZER_CHANNEL_STATUS_CHANGED,
            aggregate_type="InstrumentChannel",
            aggregate_id=instance.id,
            payload={
                "instrument_code": instance.instrument.code,
                "channel_name": instance.name,
                "connection_status": instance.connection_status,
                "last_error": instance.last_error,
            },
            facility_id=instance.facility_id,
        )
