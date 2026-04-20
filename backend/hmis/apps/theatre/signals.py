"""
Django signal handlers for the Theatre module.

Publishes domain events for surgery case status changes via publish_event().
"""

import logging
from datetime import date

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import TheatreEvents, publish_event
from hmis.apps.scheduling.models import Resource, Schedule
from hmis.apps.theatre.models import (
    OperatingTheatre,
    PACURecord,
    SurgeryCase,
    SurgicalTeamMember,
    TheatreConsumable,
    WHOSafetyChecklist,
)

logger = logging.getLogger(__name__)

# Map specific statuses to dedicated event types
_STATUS_EVENT_MAP: dict[str, str] = {
    "SCHEDULED": TheatreEvents.CASE_SCHEDULED,
    "CANCELLED": TheatreEvents.CASE_CANCELLED,
    "POSTPONED": TheatreEvents.CASE_POSTPONED,
    "IN_SURGERY": TheatreEvents.SURGERY_STARTED,
    "IN_PACU": TheatreEvents.SURGERY_COMPLETED,
    "DISCHARGED": TheatreEvents.PACU_DISCHARGED,
}


def _auto_create_theatre_resource(instance: OperatingTheatre) -> None:
    if instance.scheduling_resource_id or not instance.facility_id:
        return

    code = f"THEATRE-{instance.code}"
    if Resource.objects.filter(code=code, facility=instance.facility).exists():
        code = f"THEATRE-{instance.pk}"

    resource = Resource.objects.create(
        name=instance.name,
        resource_type="PLACE",
        code=code,
        is_active=instance.is_active,
        capacity=1,
        description=instance.maintenance_notes or instance.equipment_notes or instance.location,
        facility=instance.facility,
        organization=instance.organization,
        metadata={
            "synced_from": "operating_theatre",
            "source_code": instance.code,
            "theatre_type": instance.theatre_type,
            "location": instance.location,
        },
    )
    OperatingTheatre.objects.filter(pk=instance.pk).update(scheduling_resource=resource)
    instance.scheduling_resource = resource
    instance.scheduling_resource_id = resource.pk


def _sync_theatre_resource(instance: OperatingTheatre) -> None:
    if not instance.facility_id:
        return

    if not instance.scheduling_resource_id:
        _auto_create_theatre_resource(instance)

    resource = instance.scheduling_resource
    if not resource:
        return

    metadata = dict(resource.metadata or {})
    metadata.update(
        {
            "synced_from": "operating_theatre",
            "source_code": instance.code,
            "theatre_type": instance.theatre_type,
            "location": instance.location,
        }
    )
    resource.name = instance.name
    resource.is_active = instance.is_active
    resource.description = (
        instance.maintenance_notes or instance.equipment_notes or instance.location
    )
    resource.metadata = metadata
    resource.save(update_fields=["name", "is_active", "description", "metadata", "updated_at"])


def _sync_theatre_schedules(instance: OperatingTheatre) -> None:
    if not instance.scheduling_resource_id:
        return

    for day_of_week in range(7):
        tag = f"operating_theatre:{instance.pk}:day:{day_of_week}"
        schedule = Schedule.objects.filter(
            resource=instance.scheduling_resource,
            schedule_type="RECURRING",
            day_of_week=day_of_week,
            notes__contains=tag,
        ).first()

        defaults = {
            "start_time": instance.operating_hours_start,
            "end_time": instance.operating_hours_end,
            "slot_duration_minutes": instance.slot_duration_minutes,
            "buffer_minutes": 0,
            "is_active": instance.is_active,
            "notes": (f"{tag} — synced from operating theatre {instance.code}"),
        }

        if schedule:
            for attr, value in defaults.items():
                setattr(schedule, attr, value)
            schedule.save(update_fields=[*defaults.keys(), "updated_at"])
        else:
            Schedule.objects.create(
                resource=instance.scheduling_resource,
                schedule_type="RECURRING",
                day_of_week=day_of_week,
                effective_from=date.today(),
                **defaults,
            )


@receiver(post_save, sender=OperatingTheatre)
def auto_create_theatre_resource(sender, instance, created, **kwargs):
    if getattr(instance, "_skip_resource_sync", False):
        return
    try:
        _sync_theatre_resource(instance)
        _sync_theatre_schedules(instance)
    except Exception:
        logger.exception("Failed to sync scheduling bridge for OperatingTheatre %s", instance.pk)


@receiver(post_save, sender=SurgeryCase)
def publish_surgery_case_event(sender, instance, created, **kwargs):
    """Publish domain event when a surgery case is created or its status changes."""
    if created:
        event_type = TheatreEvents.CASE_CREATED
    else:
        event_type = _STATUS_EVENT_MAP.get(instance.status, TheatreEvents.CASE_STATUS_CHANGED)

    publish_event(
        event_type=event_type,
        aggregate_type="SurgeryCase",
        aggregate_id=instance.pk,
        payload={
            "case_number": instance.case_number,
            "status": instance.status,
            "patient_id": instance.patient_id,
            "theatre_id": instance.theatre_id,
            "scheduled_date": str(instance.scheduled_date),
            "priority": instance.priority,
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )

    if not created and instance.status == SurgeryCase.CaseStatus.DISCHARGED:
        try:
            from hmis.apps.billing.agent import BillingAgentService

            BillingAgentService.sync_theatre_case_billing(instance)
        except Exception:
            logger.exception("Failed to sync billing for discharged surgery case %s", instance.pk)


@receiver(post_save, sender=TheatreConsumable)
def sync_theatre_consumable_billing(sender, instance, created, **kwargs):
    if not instance.surgery_case_id:
        return
    try:
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.sync_theatre_case_billing(instance.surgery_case)
    except Exception:
        logger.exception("Failed to sync billing for theatre consumable %s", instance.pk)


@receiver(post_save, sender=SurgicalTeamMember)
def publish_team_assigned_event(sender, instance, created, **kwargs):
    """Publish domain event when a team member is assigned."""
    if not created:
        return
    publish_event(
        event_type=TheatreEvents.TEAM_ASSIGNED,
        aggregate_type="SurgeryCase",
        aggregate_id=instance.surgery_case_id,
        payload={
            "staff_member_id": instance.staff_member_id,
            "role": instance.role,
        },
        facility_id=getattr(instance.surgery_case, "facility_id", None),
    )


@receiver(post_save, sender=WHOSafetyChecklist)
def publish_checklist_event(sender, instance, created, **kwargs):
    """Publish domain event when a WHO checklist phase is completed."""
    if created:
        return  # Initial creation is just the blank checklist

    update_fields = kwargs.get("update_fields") or []

    if "sign_in_completed_at" in update_fields and instance.sign_in_completed_at:
        event_type = TheatreEvents.CHECKLIST_SIGN_IN
    elif "time_out_completed_at" in update_fields and instance.time_out_completed_at:
        event_type = TheatreEvents.CHECKLIST_TIME_OUT
    elif "sign_out_completed_at" in update_fields and instance.sign_out_completed_at:
        event_type = TheatreEvents.CHECKLIST_SIGN_OUT
    else:
        return  # Regular field update, no phase completed

    publish_event(
        event_type=event_type,
        aggregate_type="SurgeryCase",
        aggregate_id=instance.surgery_case_id,
        payload={"case_number": instance.surgery_case.case_number},
        facility_id=getattr(instance.surgery_case, "facility_id", None),
    )


@receiver(post_save, sender=PACURecord)
def publish_pacu_event(sender, instance, created, **kwargs):
    """Publish domain event when patient arrives or is discharged from PACU."""
    if created:
        publish_event(
            event_type=TheatreEvents.PACU_ARRIVED,
            aggregate_type="SurgeryCase",
            aggregate_id=instance.surgery_case_id,
            payload={
                "initial_aldrete_score": instance.initial_aldrete_score,
            },
            facility_id=getattr(instance.surgery_case, "facility_id", None),
        )
