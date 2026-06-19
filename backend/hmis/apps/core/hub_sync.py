# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Hub-to-Cloud sync worker.

Periodically pushes PENDING SyncQueue entries from the local hub to the cloud
server and pulls any cloud changes back. Works in two modes:

1. Celery mode: If CELERY_BROKER_URL is configured, runs as a periodic task.
2. Thread mode: If no Celery, runs in a background daemon thread (started via
   management command or AppConfig.ready()).

The cloud server exposes the same /api/sync/push/ and /api/sync/pull/ endpoints.
"""

import json
import logging
import os
import threading
from datetime import datetime
from pathlib import Path

import requests
from django.conf import settings
from django.utils import timezone

from hmis.apps.core.models import SyncQueue
from hmis.apps.core.sync_materializer import materialize_entry

logger = logging.getLogger(__name__)

# File where last pull timestamp is persisted across restarts
SYNC_STATE_FILENAME = ".hub_sync_state.json"


class HubCloudSyncWorker:
    """
    Manages bidirectional sync between the hub and the cloud server.

    Usage:
        worker = HubCloudSyncWorker()
        worker.start()   # non-blocking (thread mode)
        worker.stop()
    """

    def __init__(self):
        self.server_url: str = getattr(settings, "SYNC_SERVER_URL", "")
        self.batch_size: int = getattr(settings, "SYNC_BATCH_SIZE", 100)
        self.max_retries: int = getattr(settings, "SYNC_MAX_RETRIES", 5)
        self.interval: int = getattr(settings, "HUB_CLOUD_SYNC_INTERVAL", 30)
        self.hub_id: str = getattr(settings, "HUB_ID", "")
        self.facility_id: str = getattr(settings, "HUB_FACILITY_ID", "")

        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_pull_timestamp: datetime | None = None

        # Restore persisted sync state
        self._state_file = self._resolve_state_file()
        self._load_state()

    def _resolve_state_file(self) -> Path:
        """Determine the path for persisted sync state."""
        data_dir = getattr(settings, "HUB_DATA_DIR", "")
        if data_dir:
            return Path(data_dir) / SYNC_STATE_FILENAME
        return Path(settings.BASE_DIR) / SYNC_STATE_FILENAME

    def _load_state(self):
        """Load persisted last_pull_timestamp from disk."""
        if self._state_file.exists():
            try:
                state = json.loads(self._state_file.read_text())
                ts = state.get("last_pull_timestamp")
                if ts:
                    self._last_pull_timestamp = datetime.fromisoformat(ts)
                    logger.info("Restored last_pull_timestamp: %s", ts)
            except (json.JSONDecodeError, ValueError, OSError) as exc:
                logger.warning("Could not load sync state: %s", exc)

    def _save_state(self):
        """Persist last_pull_timestamp to disk."""
        state = {
            "last_pull_timestamp": (
                self._last_pull_timestamp.isoformat() if self._last_pull_timestamp else None
            ),
        }
        try:
            self._state_file.write_text(json.dumps(state))
        except OSError as exc:
            logger.warning("Could not save sync state: %s", exc)

    @property
    def is_configured(self) -> bool:
        """Check if cloud sync is properly configured."""
        return bool(self.server_url and self.hub_id and self.facility_id)

    def start(self):
        """Start the background sync thread."""
        if not self.is_configured:
            logger.warning(
                "Hub cloud sync not configured (SYNC_SERVER_URL=%s, HUB_ID=%s). Skipping.",
                self.server_url,
                self.hub_id,
            )
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_loop,
            name="hub-cloud-sync",
            daemon=True,
        )
        self._thread.start()
        logger.info("Hub-to-cloud sync worker started (interval=%ds)", self.interval)

    def stop(self):
        """Signal the thread to stop and wait for it."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=10)
        logger.info("Hub-to-cloud sync worker stopped.")

    def _run_loop(self):
        """Main loop: push then pull, then sleep."""
        while not self._stop_event.is_set():
            try:
                self._sync_cycle()
            except Exception:
                logger.exception("Hub-to-cloud sync cycle failed")

            self._stop_event.wait(timeout=self.interval)

    def sync_once(self, *, force_full_pull: bool = False) -> tuple[int, int]:
        """Run one push+pull cycle and return (pushed, pulled)."""
        if not self.has_license_token:
            logger.warning(
                "Hub cloud sync skipped: no license token. Run hub activation or configure "
                "LICENSE_TOKEN/HUB_LICENSE_TOKEN_PATH."
            )
            return 0, 0
        pushed = self._push_pending()
        pulled = self._pull_changes(force_full=force_full_pull)
        if pushed or pulled:
            logger.info("Hub-to-cloud sync: pushed=%d, pulled=%d", pushed, pulled)
        return pushed, pulled

    def _sync_cycle(self):
        """One push+pull cycle."""
        self.sync_once()

    @property
    def has_license_token(self) -> bool:
        """Return True when a hub license JWT is available for cloud auth."""
        return bool(self._get_license_token())

    def _get_license_token(self) -> str:
        """Read the hub's cached license JWT from env or activation token file."""
        token = os.getenv("LICENSE_TOKEN", "")
        if token:
            return token.strip()

        token_path = getattr(
            settings,
            "HUB_LICENSE_TOKEN_PATH",
            "/var/lib/vitora-hub/license.jwt",
        )
        try:
            return Path(token_path).read_text().strip()
        except (FileNotFoundError, PermissionError, OSError):
            return ""

    def _push_pending(self) -> int:
        """Push PENDING entries to the cloud server. Returns count pushed."""
        pending = SyncQueue.objects.filter(status="PENDING").order_by(
            "data__sync_meta__priority", "created_at"
        )[: self.batch_size]
        if not pending:
            return 0

        changes = []
        entry_ids = []
        for entry in pending:
            changes.append(
                {
                    "table": entry.model_name,
                    "operation": entry.operation,
                    "record_id": str(entry.record_id) if entry.record_id else None,
                    "data": entry.data,
                    "timestamp": entry.created_at.isoformat(),
                    "client_id": self.hub_id,
                }
            )
            entry_ids.append(entry.pk)

        # Mark as SYNCING
        SyncQueue.objects.filter(pk__in=entry_ids).update(status="SYNCING")

        try:
            response = self._post(
                f"{self.server_url}/push/",
                json={
                    "client_id": self.hub_id,
                    "changes": changes,
                },
            )

            if response.status_code == 200:
                # Mark as SYNCED
                SyncQueue.objects.filter(pk__in=entry_ids).update(
                    status="SYNCED",
                    synced_at=timezone.now(),
                )
                return len(entry_ids)
            else:
                logger.warning(
                    "Cloud push returned %d: %s",
                    response.status_code,
                    response.text[:200],
                )
                self._mark_failed(entry_ids, f"HTTP {response.status_code}")
                return 0

        except requests.RequestException as e:
            logger.warning("Cloud push network error: %s", e)
            # Revert to PENDING for retry
            SyncQueue.objects.filter(pk__in=entry_ids).update(status="PENDING")
            return 0

    def _pull_changes(self, *, force_full: bool = False) -> int:
        """Pull changes from cloud since last pull. Returns count received."""
        params: dict = {"limit": str(self.batch_size), "direction": "down"}

        if force_full:
            params["full"] = "true"
        elif self._last_pull_timestamp:
            params["since"] = self._last_pull_timestamp.isoformat()
        else:
            params["full"] = "true"

        total_applied = 0

        while True:
            try:
                response = self._get(f"{self.server_url}/pull/", params=params.copy())

                if response.status_code != 200:
                    logger.warning(
                        "Cloud pull returned %d: %s",
                        response.status_code,
                        response.text[:200],
                    )
                    return total_applied

                data = response.json()
                changes = data.get("entries") or data.get("changes", [])
                server_ts = data.get("server_timestamp")

                if server_ts:
                    self._last_pull_timestamp = datetime.fromisoformat(server_ts)
                    self._save_state()

                for change in changes:
                    result = materialize_entry(change)
                    if not result.get("success"):
                        logger.warning(
                            "Failed to apply pulled change %s:%s: %s",
                            change.get("table"),
                            change.get("record_id"),
                            result.get("error"),
                        )
                        continue

                    self._record_pulled_change(change)
                    total_applied += 1

                next_cursor = data.get("next_cursor")
                if not data.get("has_more") or not next_cursor:
                    return total_applied

                params["cursor"] = str(next_cursor)

            except requests.RequestException as e:
                logger.warning("Cloud pull network error: %s", e)
                return total_applied

    def _record_pulled_change(self, change: dict):
        """Record a pulled cloud change without assuming SyncQueue uniqueness."""
        record_id = change.get("record_id")
        if isinstance(record_id, str) and record_id.isdigit():
            record_id = int(record_id)

        defaults = {
            "operation": change["operation"],
            "data": change.get("data", {}),
            "status": "SYNCED",
            "synced_at": timezone.now(),
        }
        existing = (
            SyncQueue.objects.filter(model_name=change["table"], record_id=record_id)
            .order_by("-synced_at", "-created_at", "-pk")
            .first()
        )
        if existing:
            for field, value in defaults.items():
                setattr(existing, field, value)
            existing.save(update_fields=[*defaults.keys()])
            return existing

        return SyncQueue.objects.create(
            model_name=change["table"],
            record_id=record_id,
            **defaults,
        )

    def _mark_failed(self, entry_ids: list, error: str):
        """Mark entries as FAILED and increment retry count."""
        from django.db.models import F

        SyncQueue.objects.filter(pk__in=entry_ids).update(
            status="FAILED",
            error_message=error,
            retry_count=F("retry_count") + 1,
        )

    def reset_failed_for_retry(self) -> int:
        """Reset failed entries that have not exceeded the retry cap."""
        return SyncQueue.objects.filter(
            status="FAILED",
            retry_count__lt=self.max_retries,
        ).update(status="PENDING")

    def _get_auth_headers(self) -> dict:
        """Return hub license authorization headers."""
        license_token = self._get_license_token()
        if license_token:
            return {"Authorization": f"Bearer {license_token}"}
        return {}

    def _post(self, url: str, **kwargs) -> requests.Response:
        """Make authenticated POST request to cloud."""
        headers = self._get_auth_headers()
        headers["Content-Type"] = "application/json"
        return requests.post(url, headers=headers, timeout=30, **kwargs)

    def _get(self, url: str, **kwargs) -> requests.Response:
        """Make authenticated GET request to cloud."""
        headers = self._get_auth_headers()
        return requests.get(url, headers=headers, timeout=30, **kwargs)


# Celery task (only used if Celery is configured)
try:
    from celery import shared_task

    @shared_task(name="hmis.hub_cloud_sync")
    def hub_cloud_sync_task():
        """Celery periodic task for hub→cloud sync."""
        worker = HubCloudSyncWorker()
        if worker.is_configured:
            worker._sync_cycle()

except ImportError:
    pass
