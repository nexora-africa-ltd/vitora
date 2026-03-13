"""
Celery tasks for HL7 message queue processing.

Runs periodically to process pending/failed outbound HL7 messages
with retry logic and dead-letter handling.
"""

import logging

from celery import shared_task  # type: ignore

logger = logging.getLogger(__name__)


@shared_task(name="hl7.process_outbound_queue")
def process_outbound_queue(batch_size: int = 50) -> dict:
    """
    Process pending and retryable HL7 outbound messages.

    Scheduled via Celery beat to run every 30 seconds.

    Returns:
        dict with counts: sent, failed, dead_letter
    """
    from hmis.apps.hl7.services.queue_service import HL7QueueService

    results = HL7QueueService.retry_pending(batch_size=batch_size)
    if any(v > 0 for v in results.values()):
        logger.info("HL7 queue processed: %s", results)
    return results
