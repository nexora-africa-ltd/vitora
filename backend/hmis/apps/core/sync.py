"""
Sync utilities for offline-first functionality.

This module provides connectivity checking, sync queue management,
and conflict resolution for the Vitora HMIS offline-first architecture.

Sprint 0.5: Offline Sync Logic
"""

import logging
import time
from collections.abc import Callable
from typing import TYPE_CHECKING

import requests
from django.conf import settings
from django.utils import timezone

if TYPE_CHECKING:
    from hmis.apps.core.models import SyncConflict, SyncQueue

logger = logging.getLogger(__name__)


class ConnectivityChecker:
    """
    Check network connectivity to the sync server.

    This class provides methods to check if the system can
    reach the remote sync server and measures latency.
    """

    def __init__(self, server_url: str = None, timeout: int = 5):
        """
        Initialize the connectivity checker.

        Args:
            server_url: URL of the sync server to check
            timeout: Connection timeout in seconds
        """
        self.server_url = server_url or getattr(settings, "SYNC_SERVER_URL", "")
        self.timeout = timeout
        self._is_online = False
        self._last_check = None
        self._latency_ms = None

    def check(self) -> bool:
        """
        Check connectivity to the sync server.

        Returns:
            bool: True if server is reachable, False otherwise
        """
        if not self.server_url:
            logger.warning("No SYNC_SERVER_URL configured")
            self._is_online = False
            self._last_check = timezone.now()
            return False

        try:
            start_time = time.time()
            response = requests.get(
                f"{self.server_url}/health/",
                timeout=self.timeout,
            )
            elapsed_ms = int((time.time() - start_time) * 1000)

            self._is_online = response.status_code == 200
            self._latency_ms = elapsed_ms
            self._last_check = timezone.now()

            logger.debug(
                f"Connectivity check: {'online' if self._is_online else 'offline'}, "
                f"latency={elapsed_ms}ms"
            )

            return self._is_online

        except requests.exceptions.RequestException as e:
            logger.debug(f"Connectivity check failed: {e}")
            self._is_online = False
            self._latency_ms = None
            self._last_check = timezone.now()
            return False

    def _ping_server(self) -> tuple[bool, int | None]:
        """
        Ping the server and return status and latency.

        Returns:
            tuple: (is_online, latency_ms)
        """
        self.check()
        return self._is_online, self._latency_ms

    @property
    def is_online(self) -> bool:
        """Return the last known online status."""
        return self._is_online

    @property
    def latency_ms(self) -> int | None:
        """Return the last measured latency in milliseconds."""
        return self._latency_ms


class ConnectivityMonitor:
    """
    Monitor network connectivity and notify on status changes.

    This class periodically checks connectivity and calls
    registered callbacks when the status changes.
    """

    def __init__(self, checker: ConnectivityChecker = None):
        """
        Initialize the connectivity monitor.

        Args:
            checker: ConnectivityChecker instance to use
        """
        self.checker = checker or ConnectivityChecker()
        self._callbacks: list[Callable[[bool], None]] = []
        self._last_status: bool | None = None

    @property
    def is_online(self) -> bool:
        """Return current online status from the checker."""
        return self.checker.is_online

    def on_status_change(self, callback: Callable[[bool], None]):
        """
        Register a callback for connectivity status changes.

        Args:
            callback: Function to call with new status (True/False)
        """
        self._callbacks.append(callback)

    def _handle_status_change(self, new_status: bool) -> None:
        """
        Handle a connectivity status change.

        Args:
            new_status: The new connectivity status
        """
        logger.info(
            f"Connectivity changed: {'online' if new_status else 'offline'}"
        )
        for callback in self._callbacks:
            try:
                callback(new_status)
            except Exception as e:
                logger.error(f"Callback error: {e}")

    def check_and_notify(self) -> bool:
        """
        Check connectivity and notify if status changed.

        Returns:
            bool: Current online status
        """
        current_status = self.checker.check()

        if self._last_status is not None and current_status != self._last_status:
            self._handle_status_change(current_status)

        self._last_status = current_status
        return current_status

    def record_status(self) -> None:
        """Record current status to the database."""
        from hmis.apps.core.models import NetworkStatus

        NetworkStatus.objects.create(
            is_online=self.checker.is_online,
            last_check=timezone.now(),
            latency_ms=self.checker.latency_ms,
            server_url=self.checker.server_url,
        )


class SyncManager:
    """
    Manage the offline sync queue and synchronization process.

    This class handles queuing local changes, processing the queue,
    and coordinating with the remote server.
    """

    def __init__(self, connectivity_checker: ConnectivityChecker = None):
        """
        Initialize the sync manager.

        Args:
            connectivity_checker: ConnectivityChecker instance to use
        """
        self.checker = connectivity_checker or ConnectivityChecker()
        self.batch_size = getattr(settings, "SYNC_BATCH_SIZE", 50)
        self.max_retries = getattr(settings, "SYNC_MAX_RETRIES", 3)

    def queue_change(
        self,
        operation: str,
        model_name: str,
        record_id: int | None,
        data: dict,
    ) -> "SyncQueue":
        """
        Queue a local change for synchronization.

        Args:
            operation: CREATE, UPDATE, or DELETE
            model_name: Name of the model being changed
            record_id: ID of the record (None for new records)
            data: Serialized data for the change

        Returns:
            SyncQueue: The created queue entry
        """
        from hmis.apps.core.models import SyncQueue

        entry = SyncQueue.objects.create(
            operation=operation,
            model_name=model_name,
            record_id=record_id,
            data=data,
            status="PENDING",
        )

        logger.debug(
            f"Queued {operation} for {model_name}:{record_id}"
        )

        return entry

    @classmethod
    def process_pending_entries(cls, batch_size: int = None, connectivity_checker: "ConnectivityChecker" = None) -> dict:
        """
        Process pending entries in the sync queue.

        This is a class method that creates an instance and processes entries.
        Can be called as SyncManager.process_pending_entries() or on an instance.

        Args:
            batch_size: Optional batch size override
            connectivity_checker: Optional connectivity checker

        Returns:
            dict: Summary of processed entries
                {
                    'processed': int,
                    'succeeded': int,
                    'failed': int,
                    'conflicts': int
                }
        """
        manager = cls(connectivity_checker=connectivity_checker)
        if batch_size:
            manager.batch_size = batch_size
        return manager._process_entries()

    def _process_entries(self) -> dict:
        """
        Internal method to process pending entries.

        Returns:
            dict: Summary of processed entries
        """
        from hmis.apps.core.models import SyncQueue

        # Check connectivity first
        if not self.checker.check():
            logger.info("Offline - skipping sync queue processing")
            return {
                "processed": 0,
                "succeeded": 0,
                "failed": 0,
                "conflicts": 0,
            }

        pending_entries = SyncQueue.objects.filter(
            status__in=["PENDING", "FAILED"],
            retry_count__lt=self.max_retries,
        ).order_by("created_at")[:self.batch_size]

        results = {
            "processed": 0,
            "succeeded": 0,
            "failed": 0,
            "conflicts": 0,
        }

        for entry in pending_entries:
            results["processed"] += 1

            try:
                sync_result = self._sync_entry(entry)

                if sync_result.get("conflict"):
                    entry.mark_conflict()
                    results["conflicts"] += 1
                elif sync_result.get("success"):
                    entry.mark_synced()
                    results["succeeded"] += 1
                else:
                    entry.mark_failed(sync_result.get("error", "Unknown error"))
                    results["failed"] += 1

            except Exception as e:
                logger.error(f"Error syncing entry {entry.id}: {e}")
                entry.mark_failed(str(e))
                results["failed"] += 1

        return results

    def _sync_entry(self, entry: "SyncQueue") -> dict:
        """
        Sync a single queue entry to the server.

        Args:
            entry: SyncQueue entry to sync

        Returns:
            dict: Result with 'success', 'conflict', or 'error'
        """
        entry.mark_syncing()

        try:
            response = sync_to_server(
                operation=entry.operation,
                model_name=entry.model_name,
                record_id=entry.record_id,
                data=entry.data,
            )

            return response

        except Exception as e:
            return {"success": False, "error": str(e)}

    def trigger_background_sync(self) -> None:
        """Trigger a background sync task via Celery."""
        try:
            from hmis.apps.core.tasks import process_sync_queue

            process_sync_queue.delay()
            logger.info("Background sync task triggered")
        except ImportError:
            logger.warning("Celery tasks not available - running sync synchronously")
            self._process_entries()

    def get_queue_status(self) -> dict:
        """
        Get summary of the current sync queue status.

        Returns:
            dict: Queue status summary
        """
        from django.db.models import Count

        from hmis.apps.core.models import SyncQueue

        status_counts = (
            SyncQueue.objects
            .values("status")
            .annotate(count=Count("id"))
        )

        return {
            item["status"]: item["count"]
            for item in status_counts
        }


def detect_conflict(local_data: dict, remote_data: dict) -> bool:
    """
    Detect if there's a conflict between local and remote data.

    A conflict exists when:
    - Both have the same version but different content
    - Or both have diverged from a common base (checked via base_version)

    Args:
        local_data: Local version of the data
        remote_data: Remote version of the data

    Returns:
        bool: True if there's a conflict
    """
    # Exclude metadata fields when comparing content
    exclude_fields = ("version", "updated_at", "created_at", "base_version")

    local_copy = {k: v for k, v in local_data.items() if k not in exclude_fields}
    remote_copy = {k: v for k, v in remote_data.items() if k not in exclude_fields}

    # Check version numbers if present
    local_version = local_data.get("version", 0)
    remote_version = remote_data.get("version", 0)
    base_version = local_data.get("base_version")

    # Same version but different content = conflict
    if local_version == remote_version and local_copy != remote_copy:
        return True

    # If local has base_version, check if remote diverged
    if base_version is not None:
        # Local was modified from base_version
        # If remote version is also higher than base, both diverged
        if remote_version > base_version and local_version > base_version:
            # Both modified - check if content differs
            return local_copy != remote_copy
        # Local is newer than base, remote is at base level = no conflict
        elif remote_version == base_version:
            return False

    # Different versions - check if content actually differs
    if local_version != remote_version:
        # If local is newer and content differs, no conflict (local wins)
        if local_version > remote_version:
            return False
        # Remote is newer - also no conflict (remote should be applied)
        return False

    return False


def resolve_conflict_last_write_wins(
    local_data: dict,
    remote_data: dict,
) -> dict:
    """
    Resolve conflict using last-write-wins strategy.

    The record with the most recent updated_at timestamp wins.

    Args:
        local_data: Local version of the data
        remote_data: Remote version of the data

    Returns:
        dict: The winning data
    """
    local_updated = local_data.get("updated_at", "")
    remote_updated = remote_data.get("updated_at", "")

    # Compare timestamps - most recent wins
    if local_updated >= remote_updated:
        return local_data.copy()
    else:
        return remote_data.copy()


def merge_changes_field_level(
    base_data: dict,
    local_data: dict,
    remote_data: dict,
) -> dict:
    """
    Merge changes at field level using three-way merge.

    For each field:
    - If only local changed from base: use local
    - If only remote changed from base: use remote
    - If both changed: use most recent (by updated_at)

    Args:
        base_data: Original data before changes
        local_data: Local version of the data
        remote_data: Remote version of the data

    Returns:
        dict: Merged data
    """
    merged = base_data.copy()

    all_keys = set(local_data.keys()) | set(remote_data.keys())

    for key in all_keys:
        if key in ("version", "updated_at", "created_at"):
            continue

        base_value = base_data.get(key)
        local_value = local_data.get(key)
        remote_value = remote_data.get(key)

        local_changed = local_value != base_value
        remote_changed = remote_value != base_value

        if local_changed and not remote_changed:
            merged[key] = local_value
        elif remote_changed and not local_changed:
            merged[key] = remote_value
        elif local_changed and remote_changed:
            # Both changed - use last-write-wins for this field
            local_updated = local_data.get("updated_at", "")
            remote_updated = remote_data.get("updated_at", "")

            if local_updated >= remote_updated:
                merged[key] = local_value
            else:
                merged[key] = remote_value

    # Update version to be higher than both
    local_version = local_data.get("version", 1)
    remote_version = remote_data.get("version", 1)
    merged["version"] = max(local_version, remote_version) + 1

    return merged


def sync_to_server(
    operation: str,
    model_name: str,
    data: dict | None = None,
    record_id: int | None = None,
) -> dict:
    """
    Sync a change to the remote server.

    Args:
        operation: CREATE, UPDATE, or DELETE
        model_name: Name of the model
        data: Data to sync (optional for DELETE)
        record_id: ID of the record (optional for CREATE)

    Returns:
        dict: Result with 'success', 'conflict', or 'error'
    """
    server_url = getattr(settings, "SYNC_SERVER_URL", "")

    if not server_url:
        logger.warning("No SYNC_SERVER_URL configured")
        return {"success": False, "error": "No sync server configured"}

    try:
        url = f"{server_url}/api/sync/{model_name.lower()}/"

        if operation == "CREATE":
            response = requests.post(url, json=data, timeout=30)
        elif operation == "UPDATE":
            response = requests.put(
                f"{url}{record_id}/",
                json=data,
                timeout=30,
            )
        elif operation == "DELETE":
            response = requests.delete(
                f"{url}{record_id}/",
                timeout=30,
            )
        else:
            return {"success": False, "error": f"Unknown operation: {operation}"}

        if response.status_code == 409:
            # Conflict detected
            return {
                "success": False,
                "conflict": True,
                "remote_data": response.json(),
            }
        elif response.status_code in (200, 201, 204):
            return {"success": True}
        else:
            return {
                "success": False,
                "error": f"Server returned {response.status_code}",
            }

    except requests.exceptions.RequestException as e:
        logger.error(f"Sync request failed: {e}")
        return {"success": False, "error": str(e)}


def record_conflict(
    model_name: str,
    record_id: int | None,
    local_data: dict,
    remote_data: dict,
    field_name: str = "",
) -> "SyncConflict":
    """
    Record a sync conflict for later resolution.

    Args:
        model_name: Name of the model with conflict
        record_id: ID of the record
        local_data: Local version of the data
        remote_data: Remote version of the data
        field_name: Specific field with conflict (optional)

    Returns:
        SyncConflict: The created conflict record
    """
    from hmis.apps.core.models import SyncConflict

    conflict = SyncConflict.objects.create(
        model_name=model_name,
        record_id=record_id,
        field_name=field_name,
        local_data=local_data,
        remote_data=remote_data,
        status="PENDING",
    )

    logger.warning(
        f"Conflict recorded for {model_name}:{record_id}"
    )

    return conflict


def resolve_sync_conflict(
    queue_entry: "SyncQueue",
    remote_data: dict,
    strategy: str = "LAST_WRITE_WINS",
) -> dict:
    """
    Resolve a sync conflict between queue entry and remote data.

    Args:
        queue_entry: SyncQueue entry with local changes
        remote_data: Remote data that conflicts
        strategy: Resolution strategy to use

    Returns:
        dict: Resolved data
    """
    local_data = queue_entry.data

    if strategy == "LAST_WRITE_WINS":
        resolved = resolve_conflict_last_write_wins(local_data, remote_data)
    elif strategy == "LOCAL_WINS":
        resolved = local_data.copy()
    elif strategy == "REMOTE_WINS":
        resolved = remote_data.copy()
    else:
        # Default to last-write-wins
        resolved = resolve_conflict_last_write_wins(local_data, remote_data)

    # Record the conflict for audit
    from hmis.apps.core.models import SyncConflict
    SyncConflict.objects.create(
        model_name=queue_entry.model_name,
        record_id=queue_entry.record_id,
        local_data=local_data,
        remote_data=remote_data,
        resolved_data=resolved,
        resolution_strategy=strategy,
        status="RESOLVED",
        resolved_at=timezone.now(),
    )

    return resolved


def detect_and_resolve_conflict(
    local_data: dict,
    remote_data: dict,
    base_data: dict = None,
    strategy: str = "LAST_WRITE_WINS",
) -> dict:
    """
    Detect and resolve a conflict between local and remote data.

    Args:
        local_data: Local version of the data
        remote_data: Remote version of the data
        base_data: Original base data (for three-way merge)
        strategy: Resolution strategy to use

    Returns:
        dict: Resolved data with conflict info
    """
    has_conflict = detect_conflict(local_data, remote_data)

    if not has_conflict:
        # No conflict - use whichever has higher version
        local_version = local_data.get("version", 0)
        remote_version = remote_data.get("version", 0)

        return {
            "has_conflict": False,
            "resolved_data": local_data if local_version >= remote_version else remote_data,
        }

    # Resolve the conflict
    if strategy == "MERGED" and base_data:
        resolved = merge_changes_field_level(base_data, local_data, remote_data)
    elif strategy == "LAST_WRITE_WINS":
        resolved = resolve_conflict_last_write_wins(local_data, remote_data)
    elif strategy == "LOCAL_WINS":
        resolved = local_data.copy()
    elif strategy == "REMOTE_WINS":
        resolved = remote_data.copy()
    else:
        resolved = resolve_conflict_last_write_wins(local_data, remote_data)

    return {
        "has_conflict": True,
        "resolved_data": resolved,
        "resolution_strategy": strategy,
    }


# Global instances for convenience
_connectivity_checker: ConnectivityChecker | None = None
_sync_manager: SyncManager | None = None


def get_connectivity_checker() -> ConnectivityChecker:
    """Get the global connectivity checker instance."""
    global _connectivity_checker
    if _connectivity_checker is None:
        _connectivity_checker = ConnectivityChecker()
    return _connectivity_checker


def get_sync_manager() -> SyncManager:
    """Get the global sync manager instance."""
    global _sync_manager
    if _sync_manager is None:
        _sync_manager = SyncManager()
    return _sync_manager


def is_online() -> bool:
    """Check if the system is currently online."""
    return get_connectivity_checker().check()


def queue_for_sync(
    operation: str,
    model_name: str,
    record_id: int | None,
    data: dict,
) -> "SyncQueue":
    """
    Convenience function to queue a change for sync.

    Args:
        operation: CREATE, UPDATE, or DELETE
        model_name: Name of the model
        record_id: ID of the record
        data: Data to sync

    Returns:
        SyncQueue: The created queue entry
    """
    return get_sync_manager().queue_change(
        operation=operation,
        model_name=model_name,
        record_id=record_id,
        data=data,
    )


def process_queue_entry(entry: "SyncQueue") -> dict:
    """
    Process a single sync queue entry.

    Args:
        entry: SyncQueue entry to process

    Returns:
        dict: Result with 'success', 'conflict', or 'error'
    """
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
        logger.error(f"Error processing queue entry {entry.id}: {e}")
        entry.mark_failed(str(e))
        return {"success": False, "error": str(e)}
