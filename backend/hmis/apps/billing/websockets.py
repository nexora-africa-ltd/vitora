"""
WebSocket Broadcast Utilities for Billing.

Provides helper functions for broadcasting billing events to connected clients.
"""

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


# =============================================================================
# Core broadcast functions
# =============================================================================


async def broadcast_billing_event(
    facility_id: int,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Broadcast a billing event to all clients connected to a facility's billing channel.

    Args:
        facility_id: The ID of the facility
        event_type: Type of event (invoice_created, payment_received, etc.)
        data: Event payload data
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured, skipping billing broadcast")
        return

    group_name = f"billing_{facility_id}"

    try:
        await channel_layer.group_send(
            group_name,
            {
                "type": "billing.update",
                "event": event_type,
                "data": data,
            },
        )
        logger.debug(f"Broadcasted {event_type} to {group_name}")
    except Exception as e:
        logger.error(f"Failed to broadcast {event_type} to {group_name}: {e}")


def broadcast_billing_event_sync(
    facility_id: int,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Synchronous wrapper for broadcast_billing_event.

    Use this in Django views, signals, and other synchronous code.
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured, skipping billing broadcast")
        return

    group_name = f"billing_{facility_id}"

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "billing.update",
                "event": event_type,
                "data": data,
            },
        )
        logger.debug(f"Broadcasted {event_type} to {group_name}")
    except Exception as e:
        logger.error(f"Failed to broadcast {event_type} to {group_name}: {e}")


async def broadcast_sha_event(
    facility_id: int,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Broadcast a SHA claim event to all clients connected to a facility's SHA claims channel.

    Args:
        facility_id: The ID of the facility
        event_type: Type of event (claim_submitted, claim_status_changed, etc.)
        data: Event payload data
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured, skipping SHA broadcast")
        return

    group_name = f"sha_claims_{facility_id}"

    try:
        await channel_layer.group_send(
            group_name,
            {
                "type": "sha.update",
                "event": event_type,
                "data": data,
            },
        )
        logger.debug(f"Broadcasted {event_type} to {group_name}")
    except Exception as e:
        logger.error(f"Failed to broadcast {event_type} to {group_name}: {e}")


def broadcast_sha_event_sync(
    facility_id: int,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Synchronous wrapper for broadcast_sha_event.

    Use this in Django views, signals, and other synchronous code.
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured, skipping SHA broadcast")
        return

    group_name = f"sha_claims_{facility_id}"

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "sha.update",
                "event": event_type,
                "data": data,
            },
        )
        logger.debug(f"Broadcasted {event_type} to {group_name}")
    except Exception as e:
        logger.error(f"Failed to broadcast {event_type} to {group_name}: {e}")


# =============================================================================
# Convenience broadcast helpers
# =============================================================================


def broadcast_invoice_created(invoice) -> None:
    """Broadcast invoice created event."""
    facility_id = getattr(invoice, "facility_id", None)
    if not facility_id:
        return

    broadcast_billing_event_sync(
        facility_id=facility_id,
        event_type="invoice_created",
        data={
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "patient_id": invoice.patient_id,
            "patient_name": str(invoice.patient) if invoice.patient else "",
            "total": str(invoice.total) if hasattr(invoice, "total") else "0.00",
            "status": invoice.status,
            "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        },
    )


def broadcast_invoice_updated(invoice) -> None:
    """Broadcast invoice updated event (totals recalculated, status changed)."""
    facility_id = getattr(invoice, "facility_id", None)
    if not facility_id:
        return

    broadcast_billing_event_sync(
        facility_id=facility_id,
        event_type="invoice_updated",
        data={
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "subtotal": str(invoice.subtotal) if hasattr(invoice, "subtotal") else "0.00",
            "tax_amount": str(invoice.tax_amount) if hasattr(invoice, "tax_amount") else "0.00",
            "discount_amount": (
                str(invoice.discount_amount) if hasattr(invoice, "discount_amount") else "0.00"
            ),
            "total": str(invoice.total) if hasattr(invoice, "total") else "0.00",
            "balance": str(invoice.balance) if hasattr(invoice, "balance") else "0.00",
            "status": invoice.status,
        },
    )


def broadcast_payment_received(payment) -> None:
    """Broadcast payment received event."""
    facility_id = getattr(payment.invoice, "facility_id", None)
    if not facility_id:
        return

    broadcast_billing_event_sync(
        facility_id=facility_id,
        event_type="payment_received",
        data={
            "payment_id": payment.id,
            "payment_reference": payment.payment_reference,
            "invoice_id": payment.invoice_id,
            "invoice_number": payment.invoice.invoice_number,
            "amount": str(payment.amount),
            "method": payment.method,
            "new_balance": (
                str(payment.invoice.balance) if hasattr(payment.invoice, "balance") else "0.00"
            ),
            "invoice_status": payment.invoice.status,
            "payment_date": (payment.payment_date.isoformat() if payment.payment_date else None),
        },
    )


def broadcast_payment_reversed(payment) -> None:
    """Broadcast payment reversed event."""
    facility_id = getattr(payment.invoice, "facility_id", None)
    if not facility_id:
        return

    broadcast_billing_event_sync(
        facility_id=facility_id,
        event_type="payment_reversed",
        data={
            "payment_id": payment.id,
            "payment_reference": payment.payment_reference,
            "invoice_id": payment.invoice_id,
            "invoice_number": payment.invoice.invoice_number,
            "amount": str(payment.amount),
            "reason": getattr(payment, "notes", ""),
            "new_balance": (
                str(payment.invoice.balance) if hasattr(payment.invoice, "balance") else "0.00"
            ),
            "invoice_status": payment.invoice.status,
        },
    )


def broadcast_sha_claim_submitted(claim) -> None:
    """Broadcast SHA claim submitted event."""
    facility_id = getattr(claim, "facility_id", None)
    if not facility_id:
        return

    broadcast_sha_event_sync(
        facility_id=facility_id,
        event_type="claim_submitted",
        data={
            "claim_id": claim.id,
            "claim_number": getattr(claim, "claim_number", ""),
            "invoice_id": claim.invoice_id if hasattr(claim, "invoice_id") else None,
            "patient_name": str(claim.patient) if claim.patient else "",
            "total_amount": str(claim.total_amount) if hasattr(claim, "total_amount") else "0.00",
            "sha_reference": getattr(claim, "sha_reference", ""),
            "status": claim.status,
        },
    )


def broadcast_sha_claim_status_changed(claim, old_status: str) -> None:
    """Broadcast SHA claim status changed event."""
    facility_id = getattr(claim, "facility_id", None)
    if not facility_id:
        return

    broadcast_sha_event_sync(
        facility_id=facility_id,
        event_type="claim_status_changed",
        data={
            "claim_id": claim.id,
            "claim_number": getattr(claim, "claim_number", ""),
            "old_status": old_status,
            "new_status": claim.status,
            "sha_reference": getattr(claim, "sha_reference", ""),
            "total_amount": str(claim.total_amount) if hasattr(claim, "total_amount") else "0.00",
        },
    )


def broadcast_billing_stats(facility_id: int, stats: dict[str, Any]) -> None:
    """Broadcast billing statistics update."""
    broadcast_billing_event_sync(
        facility_id=facility_id,
        event_type="stats_updated",
        data=stats,
    )
