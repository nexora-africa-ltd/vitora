"""
Celery tasks for analyzer interfacing.

Handles:
- Connection health monitoring (periodic check)
- Message retry for failed/timeout messages
- Work order broadcasting to instruments

TODO: [AFTER PILOT] Add TCP listener tasks that accept incoming connections
from analyzers. Currently, analyzers must push data via the REST API endpoint.
Real bidirectional communication requires a persistent TCP server per channel,
which needs:
- asyncio TCP server per active channel
- Auto-restart on disconnect
- Connection pooling for high-volume analyzers
- NAK/timeout recovery with exponential backoff
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="laboratory.analyzers.check_channel_health")
def check_all_channel_health() -> dict:
    """
    Periodic task to check connection health of all active channels.

    Updates status to IDLE/DISCONNECTED for channels with no recent activity.
    Runs every 5 minutes via Celery Beat.
    """
    from .models import InstrumentChannel
    from .services import check_channel_health

    active_channels = InstrumentChannel.objects.filter(is_active=True).select_related("instrument")

    results = {"checked": 0, "idle": 0, "disconnected": 0, "errors": 0}

    for channel in active_channels:
        try:
            health = check_channel_health(channel)
            results["checked"] += 1

            if health["connection_status"] == InstrumentChannel.ConnectionStatus.IDLE:
                results["idle"] += 1
            elif health["connection_status"] == InstrumentChannel.ConnectionStatus.ERROR:
                results["errors"] += 1
        except Exception as e:
            logger.error(f"Error checking channel {channel.id} health: {e}")
            results["errors"] += 1

    logger.info(f"Channel health check complete: {results}")
    return results


@shared_task(name="laboratory.analyzers.retry_failed_messages")
def retry_failed_messages(max_retries: int = 3, batch_size: int = 50) -> dict:
    """
    Retry failed outbound messages that haven't exceeded max retries.

    TODO: [AFTER PILOT] Implement actual TCP send for retries.
    Currently just marks messages for manual retry via the dashboard.
    Real retry requires:
    - TCP connection to analyzer
    - Protocol-specific handshake (ENQ→ACK for ASTM)
    - Timeout handling per analyzer model
    """
    from .models import AnalyzerMessage

    failed_messages = AnalyzerMessage.objects.filter(
        direction=AnalyzerMessage.Direction.OUTBOUND,
        status__in=[
            AnalyzerMessage.Status.FAILED,
            AnalyzerMessage.Status.TIMEOUT,
        ],
        retry_count__lt=max_retries,
    ).order_by("timestamp")[:batch_size]

    results = {"attempted": 0, "success": 0, "failed": 0}

    for msg in failed_messages:
        results["attempted"] += 1
        msg.retry_count += 1
        # TODO: [AFTER PILOT] Actually resend via TCP connection
        # For now, mark as pending for manual dashboard action
        msg.status = AnalyzerMessage.Status.PENDING
        msg.save(update_fields=["retry_count", "status"])
        results["success"] += 1

    logger.info(f"Message retry complete: {results}")
    return results


@shared_task(name="laboratory.analyzers.broadcast_work_orders")
def broadcast_work_orders(facility_id: int = None) -> dict:
    """
    Generate and queue work order messages for all active channels.

    Finds specimens with pending tests and generates protocol-specific
    order download messages for relevant instruments.

    TODO: [AFTER PILOT] Actually transmit work orders via TCP.
    Currently creates AnalyzerMessage records in PENDING state.
    Facility staff can manually trigger send from the dashboard.
    """
    from hmis.apps.laboratory.models import Specimen

    from .models import InstrumentChannel
    from .services import build_work_order, get_pending_work_orders

    channels = InstrumentChannel.objects.filter(
        is_active=True,
        direction__in=[
            InstrumentChannel.Direction.BIDIRECTIONAL,
            InstrumentChannel.Direction.HOST_TO_INSTRUMENT,
        ],
    ).select_related("instrument")

    if facility_id:
        channels = channels.filter(facility_id=facility_id)

    results = {"channels_checked": 0, "orders_created": 0}

    for channel in channels:
        results["channels_checked"] += 1
        pending = get_pending_work_orders(channel)

        for order_info in pending:
            specimen = Specimen.objects.filter(id=order_info["specimen_id"]).first()
            if specimen:
                msg = build_work_order(channel, specimen)
                if msg:
                    results["orders_created"] += 1

    logger.info(f"Work order broadcast complete: {results}")
    return results
