"""
WebSocket Broadcast Utilities for Laboratory.

Provides helper functions for broadcasting lab events to connected clients.
"""

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def broadcast_lab_event_sync(
    group_name: str,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Synchronous broadcast of a lab event to a channel group.

    Use this in Django views, signals, and other synchronous code.

    Args:
        group_name: The channel group name
        event_type: Type of event (result_verified, critical_alert, etc.)
        data: Event payload data
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured, skipping broadcast")
        return

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": f"lab.{event_type}",
                "event": event_type,
                "data": data,
            },
        )
        logger.debug(f"Broadcasted lab.{event_type} to {group_name}")
    except Exception as e:
        logger.error(f"Failed to broadcast lab.{event_type} to {group_name}: {e}")


def broadcast_result_entered(result) -> None:
    """
    Broadcast result entered event.

    Args:
        result: LabResult instance
    """
    from hmis.apps.laboratory.models import LabResult

    if not isinstance(result, LabResult):
        return

    lab_order = result.order_item.lab_order
    data = {
        "result_id": result.id,
        "order_id": lab_order.id,
        "order_number": lab_order.order_number,
        "test_name": result.order_item.test.name,
        "test_code": result.order_item.test.code,
        "patient_id": lab_order.patient_id,
        "patient_name": f"{lab_order.patient.first_name} {lab_order.patient.last_name}",
        "patient_mrn": lab_order.patient.mrn,
        "encounter_id": lab_order.encounter_id,
        "entered_by": result.entered_by.get_full_name() if result.entered_by else None,
        "entered_at": result.entered_at.isoformat() if result.entered_at else None,
    }

    # Broadcast to encounter channel
    if lab_order.encounter_id:
        broadcast_lab_event_sync(f"lab_encounter_{lab_order.encounter_id}", "result_entered", data)

    # Broadcast to order channel
    broadcast_lab_event_sync(f"lab_order_{lab_order.id}", "result_entered", data)


def broadcast_result_verified(result) -> None:
    """
    Broadcast result verified event.

    Notifies the ordering clinician that results are ready for review.

    Args:
        result: LabResult instance
    """
    from hmis.apps.laboratory.models import LabResult

    if not isinstance(result, LabResult):
        return

    lab_order = result.order_item.lab_order
    data = {
        "result_id": result.id,
        "order_id": lab_order.id,
        "order_number": lab_order.order_number,
        "test_name": result.order_item.test.name,
        "test_code": result.order_item.test.code,
        "formatted_value": result.get_formatted_value(),
        "result_flag": result.result_flag,
        "is_critical": result.is_critical_result,
        "patient_id": lab_order.patient_id,
        "patient_name": f"{lab_order.patient.first_name} {lab_order.patient.last_name}",
        "patient_mrn": lab_order.patient.mrn,
        "encounter_id": lab_order.encounter_id,
        "verified_by": result.verified_by.get_full_name() if result.verified_by else None,
        "verified_at": result.verified_at.isoformat() if result.verified_at else None,
    }

    # Broadcast to encounter channel
    if lab_order.encounter_id:
        broadcast_lab_event_sync(f"lab_encounter_{lab_order.encounter_id}", "result_verified", data)

    # Broadcast to order channel
    broadcast_lab_event_sync(f"lab_order_{lab_order.id}", "result_verified", data)

    # Broadcast to ordering clinician
    if lab_order.ordered_by_id:
        broadcast_lab_event_sync(
            f"lab_clinician_{lab_order.ordered_by_id}", "result_verified", data
        )


def broadcast_result_rejected(result, reason: str = "") -> None:
    """
    Broadcast result rejected event.

    Args:
        result: LabResult instance
        reason: Rejection reason
    """
    from hmis.apps.laboratory.models import LabResult

    if not isinstance(result, LabResult):
        return

    lab_order = result.order_item.lab_order
    data = {
        "result_id": result.id,
        "order_id": lab_order.id,
        "order_number": lab_order.order_number,
        "test_name": result.order_item.test.name,
        "reason": reason,
        "patient_id": lab_order.patient_id,
        "encounter_id": lab_order.encounter_id,
    }

    # Broadcast to order channel
    broadcast_lab_event_sync(f"lab_order_{lab_order.id}", "result_rejected", data)


def broadcast_critical_alert(result) -> None:
    """
    Broadcast critical value alert.

    This triggers an immediate alert to the ordering clinician.

    Args:
        result: LabResult instance with critical value
    """
    from hmis.apps.laboratory.models import LabResult

    if not isinstance(result, LabResult):
        return

    lab_order = result.order_item.lab_order
    data = {
        "result_id": result.id,
        "order_id": lab_order.id,
        "order_number": lab_order.order_number,
        "test_name": result.order_item.test.name,
        "test_code": result.order_item.test.code,
        "formatted_value": result.get_formatted_value(),
        "result_flag": result.result_flag,
        "patient_id": lab_order.patient_id,
        "patient_name": f"{lab_order.patient.first_name} {lab_order.patient.last_name}",
        "patient_mrn": lab_order.patient.mrn,
        "encounter_id": lab_order.encounter_id,
        "priority": "critical",
        "message": f"CRITICAL: {result.order_item.test.name} = {result.get_formatted_value()}",
    }

    # Broadcast to encounter channel
    if lab_order.encounter_id:
        broadcast_lab_event_sync(f"lab_encounter_{lab_order.encounter_id}", "critical_alert", data)

    # Broadcast to ordering clinician (high priority)
    if lab_order.ordered_by_id:
        broadcast_lab_event_sync(f"lab_clinician_{lab_order.ordered_by_id}", "critical_alert", data)


def broadcast_order_completed(lab_order) -> None:
    """
    Broadcast order completed event (all results verified).

    Args:
        lab_order: LabOrder instance
    """
    from hmis.apps.laboratory.models import LabOrder

    if not isinstance(lab_order, LabOrder):
        return

    data = {
        "order_id": lab_order.id,
        "order_number": lab_order.order_number,
        "patient_id": lab_order.patient_id,
        "patient_name": f"{lab_order.patient.first_name} {lab_order.patient.last_name}",
        "patient_mrn": lab_order.patient.mrn,
        "encounter_id": lab_order.encounter_id,
        "status": lab_order.status,
        "completed_at": lab_order.updated_at.isoformat() if lab_order.updated_at else None,
    }

    # Broadcast to encounter channel
    if lab_order.encounter_id:
        broadcast_lab_event_sync(f"lab_encounter_{lab_order.encounter_id}", "order_completed", data)

    # Broadcast to ordering clinician
    if lab_order.ordered_by_id:
        broadcast_lab_event_sync(
            f"lab_clinician_{lab_order.ordered_by_id}", "order_completed", data
        )
