"""Domain event signals for Critical Value Management."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import LaboratoryEvents

from .models import CriticalValueNotification


@receiver(post_save, sender=CriticalValueNotification)
def publish_critical_notification_event(sender, instance, created, **kwargs):
    """Publish event when a critical value notification is created or updated."""
    if created:
        publish_event(
            LaboratoryEvents.CRITICAL_NOTIFICATION_CREATED,
            "CriticalValueNotification",
            instance.pk,
            payload={
                "result_id": instance.result_id,
                "status": instance.status,
                "severity": instance.severity,
                "critical_value": instance.critical_value,
                "test_name": instance.test_name,
                "patient_name": instance.patient_name,
            },
            facility_id=instance.facility_id,
        )
    elif instance.status == CriticalValueNotification.Status.ACKNOWLEDGED:
        publish_event(
            LaboratoryEvents.CRITICAL_NOTIFICATION_ACKNOWLEDGED,
            "CriticalValueNotification",
            instance.pk,
            payload={
                "result_id": instance.result_id,
                "notification_time_minutes": instance.notification_time_minutes,
                "read_back_verified": instance.read_back_verified,
            },
            facility_id=instance.facility_id,
        )
