"""Dialysis domain event signals."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event

from .models import DialysisOrder, DialysisSession


@receiver(post_save, sender=DialysisSession)
def publish_dialysis_session_event(sender, instance, created, **kwargs):
    event_type = "dialysis.session.created" if created else "dialysis.session.updated"
    publish_event(
        event_type,
        "DialysisSession",
        instance.pk,
        {
            "session_number": instance.session_number,
            "patient_id": instance.patient_id,
            "status": instance.status,
        },
    )


@receiver(post_save, sender=DialysisOrder)
def publish_dialysis_order_event(sender, instance, created, **kwargs):
    event_type = "dialysis.order.created" if created else "dialysis.order.updated"
    publish_event(
        event_type,
        "DialysisOrder",
        instance.pk,
        {
            "patient_id": instance.patient_id,
            "status": instance.status,
            "dialysis_type": instance.dialysis_type,
        },
    )
