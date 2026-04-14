"""
Scheduling signals for Vitora HMIS.

Publishes domain events for:
- Appointment status transitions
- Schedule (timetable) changes
- Assignment engine decisions and overrides
- Rule activation/deactivation
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import SchedulingEvents, publish_event
from hmis.apps.scheduling.models import (
    Appointment,
    AssignmentDecision,
    AssignmentOverride,
    AssignmentRule,
    Resource,
    Schedule,
    Shift,
)

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


# ---------------------------------------------------------------------------
# Timetable / Schedule events
# ---------------------------------------------------------------------------


@receiver(post_save, sender=Schedule)
def publish_schedule_event(sender, instance, created, **kwargs):
    """Publish domain event when a schedule (timetable entry) is created or updated."""
    event_type = SchedulingEvents.SCHEDULE_CREATED if created else SchedulingEvents.SCHEDULE_UPDATED
    publish_event(
        event_type=event_type,
        aggregate_type="Schedule",
        aggregate_id=instance.id,
        payload={
            "resource_id": instance.resource_id,
            "schedule_type": getattr(instance, "schedule_type", ""),
            "day_of_week": instance.day_of_week,
            "is_active": instance.is_active,
        },
        facility_id=getattr(instance.resource, "facility_id", None),
    )


# ---------------------------------------------------------------------------
# Assignment engine events
# ---------------------------------------------------------------------------


@receiver(post_save, sender=AssignmentDecision)
def publish_assignment_decision_event(sender, instance, created, **kwargs):
    """Publish domain event when the assignment engine records a decision."""
    if not created:
        return

    publish_event(
        event_type=SchedulingEvents.ASSIGNMENT_DECIDED,
        aggregate_type="AssignmentDecision",
        aggregate_id=instance.id,
        payload={
            "assignment_type": instance.assignment_type,
            "target_type": instance.target_type,
            "target_id": instance.target_id,
            "outcome": instance.decision_outcome,
            "resource_id": instance.assigned_resource_id,
            "rule_id": instance.rule_applied_id,
            "evaluation_time_ms": instance.evaluation_time_ms,
        },
    )


@receiver(post_save, sender=AssignmentOverride)
def publish_override_event(sender, instance, created, **kwargs):
    """Publish domain event when an override is created, approved, or rejected."""
    if created:
        event_type = SchedulingEvents.OVERRIDE_CREATED
    elif instance.approval_status == "APPROVED":
        event_type = SchedulingEvents.OVERRIDE_APPROVED
    elif instance.approval_status == "REJECTED":
        event_type = SchedulingEvents.OVERRIDE_REJECTED
    else:
        return

    publish_event(
        event_type=event_type,
        aggregate_type="AssignmentOverride",
        aggregate_id=instance.id,
        payload={
            "target_type": instance.target_type,
            "target_id": instance.target_id,
            "override_reason": instance.override_reason,
            "approval_status": instance.approval_status,
            "original_resource_id": instance.original_resource_id,
            "new_resource_id": instance.new_resource_id,
        },
    )


@receiver(post_save, sender=AssignmentRule)
def publish_rule_toggle_event(sender, instance, created, **kwargs):
    """Publish domain event when a rule is activated or deactivated."""
    if created:
        return  # Skip initial creation

    update_fields = kwargs.get("update_fields")
    if update_fields is not None and "is_active" not in update_fields:
        return

    event_type = (
        SchedulingEvents.RULE_ACTIVATED if instance.is_active else SchedulingEvents.RULE_DEACTIVATED
    )
    publish_event(
        event_type=event_type,
        aggregate_type="AssignmentRule",
        aggregate_id=instance.id,
        payload={
            "rule_code": instance.rule_code,
            "applies_to": instance.applies_to,
            "priority": instance.priority,
        },
        facility_id=getattr(instance, "facility_id", None),
    )


# ---------------------------------------------------------------------------
# Shift / duty roster events
# ---------------------------------------------------------------------------

_SHIFT_STATUS_EVENT_MAP = {
    "SCHEDULED": SchedulingEvents.SHIFT_CREATED,
    "ACTIVE": SchedulingEvents.SHIFT_STARTED,
    "COMPLETED": SchedulingEvents.SHIFT_COMPLETED,
    "CANCELLED": SchedulingEvents.SHIFT_CANCELLED,
    "ABSENT": SchedulingEvents.SHIFT_ABSENT,
    "ON_BREAK": SchedulingEvents.SHIFT_BREAK_STARTED,
}


@receiver(post_save, sender=Shift)
def publish_shift_event(sender, instance, created, **kwargs):
    """Publish domain event when a shift is created or changes status."""
    if created:
        event_type = SchedulingEvents.SHIFT_CREATED
    else:
        event_type = _SHIFT_STATUS_EVENT_MAP.get(instance.status)
        if not event_type:
            return

    publish_event(
        event_type=event_type,
        aggregate_type="Shift",
        aggregate_id=instance.id,
        payload={
            "staff_resource_id": instance.staff_resource_id,
            "shift_date": str(instance.shift_date),
            "shift_type": instance.shift_type,
            "status": instance.status,
            "department": (
                instance.department.name
                if instance.department
                else (instance.department_legacy or "")
            ),
            "clock_in_method": getattr(instance, "clock_in_method", ""),
            "auto_clocked_out": getattr(instance, "auto_clocked_out", False),
            "late_minutes": instance.late_minutes,
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )


# ---------------------------------------------------------------------------
# Auto-create PLACE resources for Clinics & Wards
# ---------------------------------------------------------------------------


def _auto_create_place_resource(instance, code_prefix, source_field, extra_metadata=None):
    """
    Create a PLACE scheduling resource for a Clinic or Ward if it doesn't have one.

    Skips creation if the instance already has a linked scheduling_resource,
    or if the instance has no facility (can't scope the resource).
    """
    if instance.scheduling_resource_id:
        return  # Already linked

    facility = getattr(instance, "facility", None)
    if not facility:
        return

    code = f"{code_prefix}-{instance.code}"
    if Resource.objects.filter(code=code, facility=facility).exists():
        code = f"{code_prefix}-{instance.pk}"

    metadata = {"synced_from": source_field, "source_code": instance.code}
    if extra_metadata:
        metadata.update(extra_metadata)

    resource = Resource.objects.create(
        name=instance.name,
        resource_type="PLACE",
        code=code,
        is_active=getattr(instance, "is_active", True),
        capacity=getattr(instance, "capacity", 1),
        description=getattr(instance, "description", ""),
        facility=facility,
        organization=getattr(facility, "organization", None),
        metadata=metadata,
    )
    # Link back without triggering another save signal
    type(instance).objects.filter(pk=instance.pk).update(scheduling_resource=resource)
    instance.scheduling_resource = resource
    instance.scheduling_resource_id = resource.pk


@receiver(post_save, sender="clinics.Clinic")
def auto_create_clinic_resource(sender, instance, created, **kwargs):
    """Auto-create a PLACE resource when a Clinic is created.

    Respects ``_skip_resource_sync`` for test fixtures / management commands
    that need to suppress auto-creation.
    """
    if not created:
        return
    if getattr(instance, "_skip_resource_sync", False):
        return
    try:
        _auto_create_place_resource(
            instance,
            code_prefix="CLINIC",
            source_field="clinic",
            extra_metadata={
                "clinic_type": getattr(instance, "clinic_type", ""),
                "location": getattr(instance, "location", ""),
            },
        )
    except Exception:
        logger.exception("Failed to auto-create scheduling resource for Clinic %s", instance.pk)


@receiver(post_save, sender="inpatient.Ward")
def auto_create_ward_resource(sender, instance, created, **kwargs):
    """Auto-create a PLACE resource when a Ward is created."""
    if not created:
        return
    try:
        _auto_create_place_resource(
            instance,
            code_prefix="WARD",
            source_field="ward",
            extra_metadata={
                "ward_type": getattr(instance, "ward_type", ""),
                "floor": getattr(instance, "floor", ""),
            },
        )
    except Exception:
        logger.exception("Failed to auto-create scheduling resource for Ward %s", instance.pk)
