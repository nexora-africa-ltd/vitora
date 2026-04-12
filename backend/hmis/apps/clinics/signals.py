"""
Django Signals for Clinic module.

Handles:
- WebSocket broadcasts on ClinicVisit state changes
- Domain event publishing for ClinicVisit lifecycle
- Bidirectional sync between ClinicSchedule and scheduling.Schedule

NOTE: Auto-creation of scheduling.Resource for Clinics is handled in
hmis.apps.scheduling.signals (auto_create_clinic_resource). This module
only handles the ClinicSchedule → scheduling.Schedule sync.
"""

import logging

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from hmis.apps.core.events import ClinicalEvents, publish_event

from .models import Clinic, ClinicSchedule, ClinicVisit
from .websockets import (
    broadcast_consultation_started,
    broadcast_patient_added,
    broadcast_patient_called,
    broadcast_patient_removed,
    broadcast_visit_completed,
)

logger = logging.getLogger(__name__)


@receiver(post_save, sender=ClinicVisit)
def clinic_visit_post_save(sender, instance, created, **kwargs):
    """
    Broadcast WebSocket events when ClinicVisit is created or updated.
    """
    if getattr(instance, "_skip_broadcast", False):
        return

    try:
        if created:
            # New patient added to queue
            broadcast_patient_added(instance)
            logger.debug(f"Broadcasted patient_added for visit {instance.id}")

            publish_event(
                event_type=ClinicalEvents.CLINIC_VISIT_CREATED,
                aggregate_type="ClinicVisit",
                aggregate_id=instance.id,
                payload={
                    "patient_id": getattr(instance, "patient_id", None),
                    "clinic_id": getattr(instance, "clinic_id", None),
                    "status": instance.status,
                },
                facility_id=getattr(instance, "facility_id", None),
            )
    except Exception as e:
        # Don't let WebSocket errors break the save operation
        logger.error(f"Error broadcasting clinic visit event: {e}")


@receiver(pre_save, sender=ClinicVisit)
def clinic_visit_pre_save(sender, instance, **kwargs):
    """
    Track status changes to broadcast appropriate events.
    """
    if getattr(instance, "_skip_broadcast", False):
        return

    if not instance.pk:
        # New instance, will be handled in post_save
        return

    try:
        # Get previous state
        old_instance = ClinicVisit.objects.get(pk=instance.pk)
        instance._old_status = old_instance.status
    except ClinicVisit.DoesNotExist:
        instance._old_status = None


@receiver(post_save, sender=ClinicVisit)
def clinic_visit_status_change(sender, instance, created, **kwargs):
    """
    Broadcast events when visit status changes.
    """
    if getattr(instance, "_skip_broadcast", False):
        return

    if created:
        # Handled by clinic_visit_post_save
        return

    old_status = getattr(instance, "_old_status", None)
    if old_status is None or old_status == instance.status:
        return

    try:
        # Broadcast based on new status
        if instance.status == "CALLED":
            broadcast_patient_called(instance)
            logger.debug(f"Broadcasted patient_called for visit {instance.id}")

        elif instance.status == "IN_CONSULTATION":
            broadcast_consultation_started(instance)
            logger.debug(f"Broadcasted consultation_started for visit {instance.id}")

        elif instance.status == "COMPLETED":
            broadcast_visit_completed(instance)
            logger.debug(f"Broadcasted visit_completed for visit {instance.id}")

        elif instance.status in ("CANCELLED", "NO_SHOW"):
            reason = "cancelled" if instance.status == "CANCELLED" else "no_show"
            broadcast_patient_removed(instance, reason=reason)
            logger.debug(f"Broadcasted patient_removed for visit {instance.id}")

        publish_event(
            event_type=ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED,
            aggregate_type="ClinicVisit",
            aggregate_id=instance.id,
            payload={
                "old_status": old_status,
                "new_status": instance.status,
                "patient_id": getattr(instance, "patient_id", None),
                "clinic_id": getattr(instance, "clinic_id", None),
            },
            facility_id=getattr(instance, "facility_id", None),
        )

    except Exception as e:
        # Don't let WebSocket errors break the save operation
        logger.error(f"Error broadcasting clinic visit status change: {e}")


# =============================================================================
# Clinic update → keep scheduling.Resource in sync
# =============================================================================


@receiver(post_save, sender=Clinic)
def sync_clinic_resource_on_update(sender, instance, created, **kwargs):
    """
    Keep the linked scheduling.Resource name/active status in sync when
    a Clinic is updated. Resource *creation* is handled by
    scheduling.signals.auto_create_clinic_resource.
    """
    if created or not instance.scheduling_resource_id:
        return

    resource = instance.scheduling_resource
    changed = False
    if resource.name != instance.name:
        resource.name = instance.name
        changed = True
    is_active = instance.status == "ACTIVE"
    if resource.is_active != is_active:
        resource.is_active = is_active
        changed = True
    if changed:
        resource.save(update_fields=["name", "is_active", "updated_at"])


# =============================================================================
# ClinicSchedule ↔ scheduling.Schedule sync
# =============================================================================


def _sync_clinic_schedule_to_scheduling(clinic_schedule):
    """
    Create or update a scheduling.Schedule that mirrors this ClinicSchedule.

    Uses metadata={'clinic_schedule_id': <id>} on the Schedule for traceability.
    """
    clinic = clinic_schedule.clinic

    # Ensure the clinic has a scheduling resource
    if not clinic.scheduling_resource_id:
        return

    from hmis.apps.scheduling.models import Schedule

    resource = clinic.scheduling_resource

    # Find existing synced schedule
    schedule = Schedule.objects.filter(
        resource=resource,
        schedule_type="RECURRING",
        day_of_week=clinic_schedule.day_of_week,
        notes__contains=f"clinic_schedule:{clinic_schedule.pk}",
    ).first()

    defaults = {
        "start_time": clinic_schedule.start_time,
        "end_time": clinic_schedule.end_time,
        "is_active": clinic_schedule.is_active,
        "max_appointments": clinic_schedule.max_patients,
        "notes": f"clinic_schedule:{clinic_schedule.pk} — {clinic_schedule.notes}".strip(),
    }

    if schedule:
        for attr, value in defaults.items():
            setattr(schedule, attr, value)
        schedule.save(update_fields=[*defaults.keys(), "updated_at"])
    else:
        Schedule.objects.create(
            resource=resource,
            schedule_type="RECURRING",
            day_of_week=clinic_schedule.day_of_week,
            slot_duration_minutes=30,
            buffer_minutes=0,
            **defaults,
        )

    logger.info(
        f"Synced ClinicSchedule {clinic_schedule.pk} → scheduling.Schedule "
        f"for {clinic.name} ({clinic_schedule.get_day_of_week_display()})"
    )


@receiver(post_save, sender=ClinicSchedule)
def sync_clinic_schedule_on_save(sender, instance, **kwargs):
    """Sync ClinicSchedule to scheduling.Schedule on create/update."""
    if getattr(instance, "_skip_schedule_sync", False):
        return
    try:
        _sync_clinic_schedule_to_scheduling(instance)
    except Exception as e:
        logger.error(f"Error syncing ClinicSchedule {instance.pk}: {e}")


@receiver(post_delete, sender=ClinicSchedule)
def sync_clinic_schedule_on_delete(sender, instance, **kwargs):
    """Deactivate the corresponding scheduling.Schedule when a ClinicSchedule is deleted."""
    if getattr(instance, "_skip_schedule_sync", False):
        return

    clinic = instance.clinic
    if not clinic.scheduling_resource_id:
        return

    from hmis.apps.scheduling.models import Schedule

    updated = Schedule.objects.filter(
        resource=clinic.scheduling_resource,
        notes__contains=f"clinic_schedule:{instance.pk}",
    ).update(is_active=False)

    if updated:
        logger.info(f"Deactivated scheduling.Schedule for deleted ClinicSchedule {instance.pk}")
