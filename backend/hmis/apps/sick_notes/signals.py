"""
Signals for the sick_notes module.

Publishes domain events for sick note lifecycle transitions.
"""

from django.db.models.signals import post_init, post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import SickNoteEvents
from hmis.apps.sick_notes.models import SickNote


@receiver(post_init, sender=SickNote)
def track_status_before(sender, instance, **kwargs):
    """Capture the status before any changes."""
    instance._status_before = instance.status


@receiver(post_save, sender=SickNote)
def publish_sick_note_event(sender, instance, created, **kwargs):
    """Publish domain events on sick note creation and status changes."""
    payload = {
        "note_number": instance.note_number,
        "patient_id": instance.patient_id,
        "encounter_id": instance.encounter_id,
        "status": instance.status,
    }

    if created:
        publish_event(SickNoteEvents.CREATED, "SickNote", instance.pk, payload)
        instance._status_before = instance.status
        return

    old_status = getattr(instance, "_status_before", None)
    if old_status and old_status != instance.status:
        event_map = {
            SickNote.Status.ISSUED: SickNoteEvents.ISSUED,
            SickNote.Status.REVOKED: SickNoteEvents.REVOKED,
            SickNote.Status.CANCELLED: SickNoteEvents.CANCELLED,
        }
        event_type = event_map.get(instance.status)
        if event_type:
            publish_event(event_type, "SickNote", instance.pk, payload)
    # Update tracker so subsequent saves don't re-fire
    instance._status_before = instance.status
