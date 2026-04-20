"""
Django signal handlers for the Theatre module.

Publishes domain events for surgery case status changes via publish_event().
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import TheatreEvents, publish_event
from hmis.apps.theatre.models import (
    PACURecord,
    SurgeryCase,
    SurgicalTeamMember,
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


@receiver(post_save, sender=SurgeryCase)
def publish_surgery_case_event(sender, instance, created, **kwargs):
    """Publish domain event when a surgery case is created or its status changes."""
    if created:
        event_type = TheatreEvents.CASE_CREATED
    else:
        event_type = _STATUS_EVENT_MAP.get(
            instance.status, TheatreEvents.CASE_STATUS_CHANGED
        )

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
