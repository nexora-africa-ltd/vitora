"""
WebSocket Broadcast Utilities for Pharmacy Queue.

Provides helper functions for broadcasting pharmacy events to connected clients.
"""

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


async def broadcast_pharmacy_event(
    facility_id: int,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Broadcast a pharmacy event to all clients connected to a facility's pharmacy queue.

    Args:
        facility_id: The ID of the facility
        event_type: Type of event (prescription_created, dispensing_completed, etc.)
        data: Event payload data

    Event Types:
        - prescription_created: New prescription received from clinician
        - dispensing_completed: Medication dispensed to patient
        - stock_critical: Drug stock critically low or out of stock
        - stock_low_warning: Drug stock below reorder level
        - prescription_expired: Prescription has expired
        - stats_updated: Pharmacy queue statistics updated
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured, skipping pharmacy broadcast")
        return

    group_name = f"pharmacy_queue_{facility_id}"

    try:
        await channel_layer.group_send(
            group_name,
            {
                "type": "pharmacy.update",
                "event": event_type,
                "data": data,
            },
        )
        logger.debug(f"Broadcasted {event_type} to {group_name}")
    except Exception as e:
        logger.error(f"Failed to broadcast {event_type} to {group_name}: {e}")


def broadcast_pharmacy_event_sync(
    facility_id: int,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Synchronous wrapper for broadcast_pharmacy_event.

    Use this in Django views, signals, and other synchronous code.

    Args:
        facility_id: The ID of the facility
        event_type: Type of event
        data: Event payload data
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured, skipping pharmacy broadcast")
        return

    group_name = f"pharmacy_queue_{facility_id}"

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "pharmacy.update",
                "event": event_type,
                "data": data,
            },
        )
        logger.debug(f"Broadcasted {event_type} to {group_name}")
    except Exception as e:
        logger.error(f"Failed to broadcast {event_type} to {group_name}: {e}")


def broadcast_prescription_created(prescription) -> None:
    """
    Broadcast prescription created event.

    Args:
        prescription: Prescription instance
    """
    facility_id = getattr(prescription, "facility_id", None)
    if not facility_id:
        return

    items = prescription.items.select_related("drug").all()
    item_names = [item.drug.generic_name for item in items[:5]]

    broadcast_pharmacy_event_sync(
        facility_id=facility_id,
        event_type="prescription_created",
        data={
            "prescription_id": prescription.id,
            "prescription_number": prescription.prescription_number,
            "patient_id": prescription.patient_id,
            "patient_name": str(prescription.patient) if prescription.patient else "",
            "item_count": prescription.items.count(),
            "item_names": item_names,
            "status": prescription.status,
            "priority": getattr(prescription, "priority", "ROUTINE"),
            "created_at": (
                prescription.created_at.isoformat() if prescription.created_at else None
            ),
        },
    )


def broadcast_dispensing_completed(dispensing) -> None:
    """
    Broadcast dispensing completed event.

    Args:
        dispensing: Dispensing instance
    """
    facility_id = getattr(dispensing, "facility_id", None)
    if not facility_id:
        return

    broadcast_pharmacy_event_sync(
        facility_id=facility_id,
        event_type="dispensing_completed",
        data={
            "dispensing_id": dispensing.id,
            "prescription_item_id": (
                dispensing.prescription_item_id if dispensing.prescription_item else None
            ),
            "patient_id": dispensing.patient_id,
            "patient_name": str(dispensing.patient) if dispensing.patient else "",
            "drug_name": dispensing.drug.generic_name if dispensing.drug else "",
            "quantity_dispensed": dispensing.quantity_dispensed,
            "dispensed_by": str(dispensing.dispensed_by) if dispensing.dispensed_by else "",
            "dispensed_at": (
                dispensing.dispensed_at.isoformat()
                if hasattr(dispensing, "dispensed_at") and dispensing.dispensed_at
                else None
            ),
        },
    )


def broadcast_stock_critical(stock_batch, facility_id: int) -> None:
    """
    Broadcast stock critical event (out of stock or critically low).

    Args:
        stock_batch: StockBatch instance
        facility_id: The facility ID
    """
    broadcast_pharmacy_event_sync(
        facility_id=facility_id,
        event_type="stock_critical",
        data={
            "stock_batch_id": stock_batch.id,
            "drug_id": stock_batch.drug_id,
            "drug_name": stock_batch.drug.generic_name if stock_batch.drug else "",
            "batch_number": stock_batch.batch_number,
            "remaining_quantity": stock_batch.quantity_available,
            "status": stock_batch.status,
            "facility_id": facility_id,
        },
    )


def broadcast_stock_low_warning(stock_batch, facility_id: int) -> None:
    """
    Broadcast stock low warning event.

    Args:
        stock_batch: StockBatch instance
        facility_id: The facility ID
    """
    broadcast_pharmacy_event_sync(
        facility_id=facility_id,
        event_type="stock_low_warning",
        data={
            "stock_batch_id": stock_batch.id,
            "drug_id": stock_batch.drug_id,
            "drug_name": stock_batch.drug.generic_name if stock_batch.drug else "",
            "batch_number": stock_batch.batch_number,
            "remaining_quantity": stock_batch.quantity_available,
            "reorder_level": stock_batch.drug.reorder_level if stock_batch.drug else 0,
            "facility_id": facility_id,
        },
    )


def broadcast_prescription_expired(prescription) -> None:
    """
    Broadcast prescription expired event.

    Args:
        prescription: Prescription instance
    """
    facility_id = getattr(prescription, "facility_id", None)
    if not facility_id:
        return

    broadcast_pharmacy_event_sync(
        facility_id=facility_id,
        event_type="prescription_expired",
        data={
            "prescription_id": prescription.id,
            "prescription_number": prescription.prescription_number,
            "patient_id": prescription.patient_id,
            "patient_name": str(prescription.patient) if prescription.patient else "",
            "expired_at": (
                prescription.valid_until.isoformat() if prescription.valid_until else None
            ),
        },
    )


def broadcast_pharmacy_stats(facility_id: int, stats: dict[str, Any]) -> None:
    """
    Broadcast pharmacy queue statistics update.

    Args:
        facility_id: The facility ID
        stats: Statistics data dict
    """
    broadcast_pharmacy_event_sync(
        facility_id=facility_id,
        event_type="stats_updated",
        data=stats,
    )
