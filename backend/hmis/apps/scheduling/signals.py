"""
Scheduling signals for Vitora HMIS.

Publishes domain events when appointments are created or change status.
Uses post_save on Appointment to detect status transitions.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import SchedulingEvents, publish_event
from hmis.apps.scheduling.models import Appointment

logger = logging.getLogger(__name__)

# Map appointment statuses to domain event types
_STATUS_EVENT_MAP = {
    "CREATED": SchedulingEvents.APPOINTMENT_CREATED,
    "CONFIRMED": SchedulingEvents.APPOINTMENT_CONFIRMED,
    "CHECKED_IN": SchedulingEvents.APPOINTMENT_CHECKED_IN,
    "IN_PROGRESS": SchedulingEvents.APPOINTMENT_STARTED,
    "COMPLETED": SchedulingEvents.APPOINTMENT_COMPLETED,
    "CANCELLED": SchedulingEvents.APPOINTMENT_CANCELLED,
    "NO_SHOW": SchedulingEvents.APPOINTMENT_NO_SHOW,
}


@receiver(post_save, sender=Appointment)
def publish_appointment_event(sender, instance, created, **kwargs):
    """
    Publish domain event when an appointment is created or changes status.
    """
    if created:
        event_type = SchedulingEvents.APPOINTMENT_CREATED
    else:
        event_type = _STATUS_EVENT_MAP.get(instance.status)
        if not event_type:
            return

    publish_event(
        event_type=event_type,
        aggregate_type="Appointment",
        aggregate_id=instance.id,
        payload={
            "appointment_number": instance.appointment_number,
            "status": instance.status,
            "patient_id": instance.patient_id,
            "resource_id": instance.resource_id,
            "appointment_type": getattr(instance, "appointment_type", ""),
            "scheduled_start": str(instance.scheduled_start) if instance.scheduled_start else None,
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )
