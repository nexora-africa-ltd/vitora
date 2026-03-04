"""
Signals for Encounters app.

Auto-releases ER beds when an encounter is closed or cancelled.
"""

import logging

from django.db.models.signals import pre_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(pre_save, sender="encounters.Encounter")
def auto_release_er_bed_on_close(sender, instance, **kwargs):
    """
    Auto-release ER beds when an encounter transitions to CLOSED or CANCELLED.

    Finds any ERBed currently occupied by the encounter's patient (via the
    triage assessment linked to the bed) and releases it.

    This ensures bed board stays accurate without manual nurse action when
    the clinician closes/cancels the encounter.
    """
    if not instance.pk:
        # New encounter being created — nothing to release
        return

    terminal_statuses = {"CLOSED", "CANCELLED"}
    if instance.status not in terminal_statuses:
        return

    # Check if status actually changed (avoid releasing on unrelated saves)
    try:
        previous = sender.objects.only("status").get(pk=instance.pk)
    except sender.DoesNotExist:
        return

    if previous.status == instance.status:
        # Status didn't change — this is an unrelated field update
        return

    if previous.status in terminal_statuses:
        # Was already closed/cancelled — nothing to do
        return

    # Find occupied ER beds for this patient
    from hmis.apps.triage.models import ERBed

    occupied_beds = ERBed.objects.filter(
        current_patient_id=instance.patient_id,
        status="OCCUPIED",
    )

    released_count = 0
    for bed in occupied_beds:
        try:
            bed.release(user=None, mark_cleaning=True)
            released_count += 1
            logger.info(
                "Auto-released ER bed %s (zone=%s) for patient %s — "
                "encounter %s moved to %s",
                bed.bed_number,
                bed.zone,
                instance.patient_id,
                instance.pk,
                instance.status,
            )

            # Broadcast via WebSocket
            _broadcast_bed_auto_release(bed, instance)
        except ValueError:
            # Bed wasn't actually occupied (race condition) — safe to ignore
            logger.warning(
                "Attempted auto-release of bed %s but it was not occupied",
                bed.bed_number,
            )

    if released_count:
        from hmis.apps.core.models import AuditLog

        AuditLog.log(
            action="er_bed_auto_release",
            user=None,
            resource_type="Encounter",
            resource_id=instance.pk,
            details={
                "encounter_status": instance.status,
                "patient_id": instance.patient_id,
                "beds_released": released_count,
            },
            patient_id=instance.patient_id,
        )


def _broadcast_bed_auto_release(bed, encounter) -> None:
    """Broadcast auto-release event to emergency WebSocket clients."""
    try:
        import asyncio

        from channels.layers import get_channel_layer

        from hmis.apps.triage.serializers import ERBedSerializer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        bed_data = ERBedSerializer(bed).data
        message = {
            "type": "emergency.bed.update",
            "event_type": "bed_update",
            "data": {
                "action": "auto_release",
                "bed": bed_data,
                "reason": f"Encounter {encounter.pk} {encounter.status.lower()}",
            },
        }

        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        if loop and loop.is_running():
            asyncio.ensure_future(
                channel_layer.group_send("emergency_queue", message)
            )
        else:
            new_loop = asyncio.new_event_loop()
            try:
                new_loop.run_until_complete(
                    channel_layer.group_send("emergency_queue", message)
                )
            finally:
                new_loop.close()
    except Exception:
        logger.exception("Failed to broadcast bed auto-release")
