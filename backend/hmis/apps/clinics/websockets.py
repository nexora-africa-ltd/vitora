"""
WebSocket Broadcast Utilities for Clinic Queue.

Provides helper functions for broadcasting queue events to connected clients.
"""

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


async def broadcast_queue_event(
    clinic_id: int,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Broadcast a queue event to all clients connected to a clinic's queue.

    Args:
        clinic_id: The ID of the clinic
        event_type: Type of event (patient_added, patient_called, etc.)
        data: Event payload data

    Event Types:
        - patient_added: New patient added to queue
        - patient_called: Patient has been called
        - consultation_started: Consultation has started
        - visit_completed: Visit has been completed
        - patient_removed: Patient removed from queue (cancelled, no-show)
        - stats_updated: Queue statistics updated
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured, skipping broadcast")
        return

    group_name = f"clinic_queue_{clinic_id}"

    try:
        await channel_layer.group_send(
            group_name,
            {
                "type": "queue.update",
                "event": event_type,
                "data": data,
            },
        )
        logger.debug(f"Broadcasted {event_type} to {group_name}")
    except Exception as e:
        logger.error(f"Failed to broadcast {event_type} to {group_name}: {e}")


def broadcast_queue_event_sync(
    clinic_id: int,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Synchronous wrapper for broadcast_queue_event.

    Use this in Django views, signals, and other synchronous code.

    Args:
        clinic_id: The ID of the clinic
        event_type: Type of event
        data: Event payload data
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured, skipping broadcast")
        return

    group_name = f"clinic_queue_{clinic_id}"

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "queue.update",
                "event": event_type,
                "data": data,
            },
        )
        logger.debug(f"Broadcasted {event_type} to {group_name}")
    except Exception as e:
        logger.error(f"Failed to broadcast {event_type} to {group_name}: {e}")


def broadcast_patient_added(visit) -> None:
    """
    Broadcast patient added event.

    Args:
        visit: ClinicVisit instance
    """
    broadcast_queue_event_sync(
        clinic_id=visit.session.clinic_id,
        event_type="patient_added",
        data={
            "visit_id": visit.id,
            "patient_id": visit.patient_id,
            "patient_name": visit.patient.full_name,
            "queue_number": visit.queue_number,
            "priority": visit.priority,
            "status": visit.status,
            "chief_complaint": visit.chief_complaint or "",
            "registered_at": visit.registered_at.isoformat() if visit.registered_at else None,
        },
    )


def broadcast_patient_called(visit) -> None:
    """
    Broadcast patient called event.

    Args:
        visit: ClinicVisit instance
    """
    broadcast_queue_event_sync(
        clinic_id=visit.session.clinic_id,
        event_type="patient_called",
        data={
            "visit_id": visit.id,
            "patient_id": visit.patient_id,
            "patient_name": visit.patient.full_name,
            "queue_number": visit.queue_number,
            "called_at": visit.called_at.isoformat() if visit.called_at else None,
        },
    )


def broadcast_consultation_started(visit) -> None:
    """
    Broadcast consultation started event.

    Args:
        visit: ClinicVisit instance
    """
    broadcast_queue_event_sync(
        clinic_id=visit.session.clinic_id,
        event_type="consultation_started",
        data={
            "visit_id": visit.id,
            "patient_id": visit.patient_id,
            "patient_name": visit.patient.full_name,
            "queue_number": visit.queue_number,
            "encounter_id": visit.encounter_id,
            "consultation_start": visit.consultation_start.isoformat()
            if visit.consultation_start
            else None,
        },
    )


def broadcast_visit_completed(visit) -> None:
    """
    Broadcast visit completed event.

    Args:
        visit: ClinicVisit instance
    """
    broadcast_queue_event_sync(
        clinic_id=visit.session.clinic_id,
        event_type="visit_completed",
        data={
            "visit_id": visit.id,
            "patient_id": visit.patient_id,
            "patient_name": visit.patient.full_name,
            "queue_number": visit.queue_number,
            "consultation_end": visit.consultation_end.isoformat()
            if visit.consultation_end
            else None,
        },
    )


def broadcast_patient_removed(visit, reason: str = "") -> None:
    """
    Broadcast patient removed event (cancelled, no-show).

    Args:
        visit: ClinicVisit instance
        reason: Reason for removal
    """
    broadcast_queue_event_sync(
        clinic_id=visit.session.clinic_id,
        event_type="patient_removed",
        data={
            "visit_id": visit.id,
            "patient_id": visit.patient_id,
            "patient_name": visit.patient.full_name,
            "queue_number": visit.queue_number,
            "status": visit.status,
            "reason": reason,
        },
    )


def broadcast_queue_stats(clinic_id: int, stats: dict[str, Any]) -> None:
    """
    Broadcast queue statistics update.

    Args:
        clinic_id: Clinic ID
        stats: Queue statistics dictionary
    """
    broadcast_queue_event_sync(
        clinic_id=clinic_id,
        event_type="stats_updated",
        data=stats,
    )
