"""
Celery tasks for background sync operations.

This module provides Celery tasks for processing the sync queue
and handling background synchronization.

Sprint 0.5: Offline Sync Logic
"""

import logging

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


def calculate_retry_delay(retry_count: int, base_delay: int = 60) -> int:
    """
    Calculate exponential backoff delay for retries.

    Args:
        retry_count: Number of retries already attempted
        base_delay: Base delay in seconds (default: 60)

    Returns:
        int: Delay in seconds before next retry
    """
    # Exponential backoff: 60s, 120s, 240s, 480s...
    # Cap at 1 hour (3600 seconds)
    delay = base_delay * (2 ** retry_count)
    return min(delay, 3600)


def sync_to_server(operation: str, model_name: str, data: dict | None = None, record_id: int | None = None) -> dict:
    """
    Wrapper to sync data to the server.

    This function is importable from tasks for mocking in tests.

    Args:
        operation: CREATE, UPDATE, or DELETE
        model_name: Name of the model
        data: Data to sync (optional for DELETE)
        record_id: ID of the record (optional for CREATE)

    Returns:
        dict: Sync result
    """
    from hmis.apps.core.sync import sync_to_server as _sync_to_server
    return _sync_to_server(
        operation=operation,
        model_name=model_name,
        data=data,
        record_id=record_id,
    )


def sync_entry_to_server(entry) -> dict:
    """
    Sync a SyncQueue entry to the server.

    This function is used for batch processing and is importable
    from tasks for mocking in tests.

    Args:
        entry: SyncQueue entry to sync

    Returns:
        dict: Sync result
    """
    return sync_to_server(
        operation=entry.operation,
        model_name=entry.model_name,
        data=entry.data,
        record_id=entry.record_id,
    )


@shared_task(
    bind=True,
    name="hmis.apps.core.tasks.process_sync_queue",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=3600,
    retry_jitter=True,
    max_retries=5,
)
def process_sync_queue(self, batch_size: int | None = None):
    """
    Process pending entries in the sync queue.

    This task fetches pending sync queue entries and attempts
    to sync them with the remote server.

    Args:
        batch_size: Number of entries to process (default from settings)

    Returns:
        dict: Summary of processed entries
    """
    from hmis.apps.core.sync import SyncManager, get_connectivity_checker

    logger.info("Starting sync queue processing task")

    # Check if sync is enabled
    if not getattr(settings, "SYNC_ENABLED", True):
        logger.info("Sync is disabled - skipping")
        return {"status": "disabled"}

    # Check connectivity
    checker = get_connectivity_checker()
    if not checker.check():
        logger.info("System is offline - rescheduling task")
        # Retry in 5 minutes
        raise self.retry(countdown=300)

    # Process the queue
    manager = SyncManager(connectivity_checker=checker)
    if batch_size:
        manager.batch_size = batch_size

    results = manager._process_entries()

    logger.info(
        f"Sync queue processing complete: "
        f"processed={results['processed']}, "
        f"succeeded={results['succeeded']}, "
        f"failed={results['failed']}, "
        f"conflicts={results['conflicts']}"
    )

    return results


@shared_task(
    name="hmis.apps.core.tasks.check_connectivity",
)
def check_connectivity():
    """
    Periodic task to check and record connectivity status.

    This task should be scheduled to run periodically
    (e.g., every minute) to track connectivity over time.

    Returns:
        dict: Current connectivity status
    """
    from hmis.apps.core.sync import ConnectivityChecker, ConnectivityMonitor

    logger.debug("Running connectivity check")

    monitor = ConnectivityMonitor(ConnectivityChecker())
    is_online = monitor.check_and_notify()
    monitor.record_status()

    return {
        "is_online": is_online,
        "latency_ms": monitor.checker.latency_ms,
    }


@shared_task(
    bind=True,
    name="hmis.apps.core.tasks.sync_single_entry",
    autoretry_for=(Exception,),
    max_retries=3,
)
def sync_single_entry(self, entry_id: int):
    """
    Sync a single queue entry.

    This task can be used to sync a specific entry,
    for example after manual conflict resolution.

    Args:
        entry_id: ID of the SyncQueue entry to sync

    Returns:
        dict: Sync result
    """
    from hmis.apps.core.models import SyncQueue
    from hmis.apps.core.sync import sync_to_server

    logger.info(f"Syncing single entry: {entry_id}")

    try:
        entry = SyncQueue.objects.get(id=entry_id)
    except SyncQueue.DoesNotExist:
        logger.error(f"SyncQueue entry {entry_id} not found")
        return {"success": False, "error": "Entry not found"}

    entry.mark_syncing()

    try:
        result = sync_to_server(
            operation=entry.operation,
            model_name=entry.model_name,
            record_id=entry.record_id,
            data=entry.data,
        )

        if result.get("conflict"):
            entry.mark_conflict()
        elif result.get("success"):
            entry.mark_synced()
        else:
            entry.mark_failed(result.get("error", "Unknown error"))

        return result

    except Exception as e:
        logger.error(f"Error syncing entry {entry_id}: {e}")
        entry.mark_failed(str(e))
        raise self.retry(countdown=calculate_retry_delay(self.request.retries)) from e


@shared_task(
    name="hmis.apps.core.tasks.cleanup_synced_entries",
)
def cleanup_synced_entries(days_old: int = 30):
    """
    Clean up old synced entries from the queue.

    This task removes sync queue entries that have been
    successfully synced more than `days_old` days ago.

    Args:
        days_old: Delete entries older than this many days

    Returns:
        dict: Cleanup summary
    """
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.core.models import SyncQueue

    logger.info(f"Cleaning up synced entries older than {days_old} days")

    cutoff_date = timezone.now() - timedelta(days=days_old)

    deleted_count, _ = SyncQueue.objects.filter(
        status="SYNCED",
        synced_at__lt=cutoff_date,
    ).delete()

    logger.info(f"Deleted {deleted_count} old synced entries")

    return {
        "deleted": deleted_count,
        "cutoff_date": cutoff_date.isoformat(),
    }


@shared_task(
    name="hmis.apps.core.tasks.retry_failed_entries",
)
def retry_failed_entries():
    """
    Reset failed entries for retry.

    This task resets entries that have failed but haven't
    exceeded the maximum retry count.

    Returns:
        dict: Retry summary
    """
    from hmis.apps.core.models import SyncQueue

    max_retries = getattr(settings, "SYNC_MAX_RETRIES", 3)

    logger.info("Resetting failed entries for retry")

    updated_count = SyncQueue.objects.filter(
        status="FAILED",
        retry_count__lt=max_retries,
    ).update(status="PENDING")

    logger.info(f"Reset {updated_count} failed entries for retry")

    return {"reset_count": updated_count}


@shared_task(
    name="hmis.apps.core.tasks.full_sync",
)
def full_sync():
    """
    Perform a full sync of all pending changes.

    This task processes all pending entries without batch limits.
    Use sparingly as it can be resource-intensive.

    Returns:
        dict: Full sync summary
    """
    from hmis.apps.core.models import SyncQueue
    from hmis.apps.core.sync import SyncManager, get_connectivity_checker

    logger.info("Starting full sync")

    checker = get_connectivity_checker()
    if not checker.check():
        logger.warning("Cannot perform full sync while offline")
        return {"status": "offline"}

    SyncQueue.objects.filter(
        status__in=["PENDING", "FAILED"]
    ).count()

    # Process in batches but don't limit total
    manager = SyncManager(connectivity_checker=checker)
    total_results = {
        "processed": 0,
        "succeeded": 0,
        "failed": 0,
        "conflicts": 0,
    }

    while True:
        results = manager.process_pending_entries()

        if results["processed"] == 0:
            break

        for key in total_results:
            total_results[key] += results[key]

    logger.info(
        f"Full sync complete: {total_results['processed']} processed, "
        f"{total_results['succeeded']} succeeded"
    )

    return total_results
