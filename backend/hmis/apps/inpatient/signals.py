"""
Django signal handlers for Inpatient module.

Provides real-time notifications via WebSocket and email for:
- Ward constraint updates
- Admission constraint violations (with supervisor escalation for CRITICAL)
"""

import logging
from datetime import datetime

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import InpatientEvents, publish_event
from hmis.apps.inpatient.models import Admission, Ward
from hmis.apps.inpatient.tasks import notify_supervisors_critical_violation
from hmis.apps.inpatient.websockets import (
    broadcast_supervisor_alert_sync,
    broadcast_ward_event_sync,
)

logger = logging.getLogger(__name__)


# Fields to track for ward constraint changes
WARD_CONSTRAINT_FIELDS = {
    "gender_restriction",
    "min_age_years",
    "max_age_years",
    "isolation_capable",
    "oxygen_equipped",
    "ventilator_capable",
}


@receiver(post_save, sender=Ward)
def notify_ward_constraints_updated(sender, instance, created, **kwargs):
    """
    Send WebSocket notification when ward constraints change.

    This broadcasts to all clients watching the ward channel so they can
    update their UI to reflect new constraint rules.
    """
    # Skip on creation - constraints are just defaults at that point
    if created:
        return

    # Check if any constraint fields were updated
    update_fields = kwargs.get("update_fields")
    if update_fields is not None and not any(
        field in WARD_CONSTRAINT_FIELDS for field in update_fields
    ):
        return

    try:
        broadcast_ward_event_sync(
            ward_id=instance.id,
            event_type="constraints_updated",
            data={
                "ward_id": instance.id,
                "ward_name": instance.name,
                "gender_restriction": instance.gender_restriction,
                "min_age_years": instance.min_age_years,
                "max_age_years": instance.max_age_years,
                "isolation_capable": instance.isolation_capable,
                "oxygen_equipped": instance.oxygen_equipped,
                "ventilator_capable": instance.ventilator_capable,
                "updated_at": datetime.now().isoformat(),
            },
        )
        logger.info(f"Broadcasted constraint update for ward {instance.id}")
    except Exception as e:
        # Don't fail the save operation if broadcast fails
        logger.exception(f"Failed to broadcast ward constraint update: {e}")

    # Publish domain event
    publish_event(
        event_type=InpatientEvents.WARD_CONSTRAINTS_UPDATED,
        aggregate_type="Ward",
        aggregate_id=instance.id,
        payload={
            "ward_name": instance.name,
            "gender_restriction": instance.gender_restriction,
            "isolation_capable": instance.isolation_capable,
        },
        facility_id=getattr(instance, "facility_id", None),
    )


@receiver(post_save, sender=Admission)
def notify_compatibility_violation(sender, instance, created, **kwargs):
    """
    Send WebSocket notifications when admission has constraint violations.

    For CRITICAL violations, also:
    - Broadcast to supervisor_alerts channel
    - Queue email notification task
    """
    # Only process new admissions with violations
    if not created:
        return

    if not instance.constraint_violations:
        return

    violations = instance.constraint_violations
    if not violations:
        return

    # Check if there are any CRITICAL violations
    has_critical = any(v.get("severity") == "CRITICAL" for v in violations)
    critical_violations = [v for v in violations if v.get("severity") == "CRITICAL"]

    try:
        # Build event data
        patient = instance.patient
        ward = instance.ward
        admitted_by = instance.admitting_officer

        event_data = {
            "admission_id": instance.id,
            "admission_number": instance.admission_number,
            "patient_name": f"{patient.first_name} {patient.last_name}",
            "patient_mrn": patient.mrn,
            "ward_id": ward.id,
            "ward_name": ward.name,
            "bed_number": instance.bed.bed_number,
            "violations": violations,
            "override_reason": instance.constraint_override_reason,
            "admitted_by": admitted_by.get_full_name() if admitted_by else "Unknown",
            "timestamp": datetime.now().isoformat(),
        }

        # Always broadcast to ward channel
        broadcast_ward_event_sync(
            ward_id=ward.id,
            event_type="compatibility_violation",
            data=event_data,
        )
        logger.info(f"Broadcasted violation event for admission {instance.id} to ward {ward.id}")

        # For CRITICAL violations, escalate to supervisors
        if has_critical:
            # Real-time WebSocket alert
            supervisor_data = {
                **event_data,
                "violations": critical_violations,  # Only include critical ones
            }
            broadcast_supervisor_alert_sync(
                event_type="critical_violation",
                data=supervisor_data,
            )
            logger.info(f"Broadcasted CRITICAL violation alert for admission {instance.id}")

            # Queue email notification
            notify_supervisors_critical_violation.delay(instance.id)
            logger.info(f"Queued supervisor email notification for admission {instance.id}")

    except Exception as e:
        # Don't fail admission creation if notifications fail
        logger.exception(f"Failed to send violation notifications: {e}")

    # Publish domain events for admission + violation
    publish_event(
        event_type=InpatientEvents.ADMISSION_CREATED,
        aggregate_type="Admission",
        aggregate_id=instance.id,
        payload={
            "admission_number": instance.admission_number,
            "patient_id": instance.patient_id,
            "ward_id": instance.ward_id,
            "has_violations": bool(violations),
        },
        facility_id=getattr(instance, "facility_id", None),
    )
    if violations:
        publish_event(
            event_type=InpatientEvents.COMPATIBILITY_VIOLATION,
            aggregate_type="Admission",
            aggregate_id=instance.id,
            payload={
                "admission_number": instance.admission_number,
                "violation_count": len(violations),
                "has_critical": has_critical,
            },
            facility_id=getattr(instance, "facility_id", None),
        )
