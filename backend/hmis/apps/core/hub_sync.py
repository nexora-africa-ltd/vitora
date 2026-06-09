"""
Hub-to-Cloud sync worker.

Periodically pushes PENDING SyncQueue entries from the local hub to the cloud
server and pulls any cloud changes back. Works in two modes:

1. Celery mode: If CELERY_BROKER_URL is configured, runs as a periodic task.
2. Thread mode: If no Celery, runs in a background daemon thread (started via
   management command or AppConfig.ready()).

The cloud server exposes the same /api/sync/push/ and /api/sync/pull/ endpoints.
"""

import logging
import threading
import time
from datetime import datetime

import requests
from django.conf import settings
from django.utils import timezone

from hmis.apps.core.models import SyncQueue

logger = logging.getLogger(__name__)

# Token refresh buffer: refresh 60s before expiry
TOKEN_REFRESH_BUFFER_SECS = 60


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
        self._auth_token: str = ""
        self._refresh_token: str = ""
        self._token_expiry: float = 0  # unix timestamp when access token expires
        self._auth_username: str = ""
        self._auth_password: str = ""

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
        logger.info("Hub→Cloud sync worker started (interval=%ds)", self.interval)

    def stop(self):
        """Signal the thread to stop and wait for it."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=10)
        logger.info("Hub→Cloud sync worker stopped.")

    def _run_loop(self):
        """Main loop: push then pull, then sleep."""
        while not self._stop_event.is_set():
            try:
                self._sync_cycle()
            except Exception:
                logger.exception("Hub→Cloud sync cycle failed")

            self._stop_event.wait(timeout=self.interval)

    def _sync_cycle(self):
        """One push+pull cycle."""
        pushed = self._push_pending()
        pulled = self._pull_changes()
        if pushed or pulled:
            logger.info("Hub→Cloud sync: pushed=%d, pulled=%d", pushed, pulled)

    def _push_pending(self) -> int:
        """Push PENDING entries to the cloud server. Returns count pushed."""
        pending = SyncQueue.objects.filter(status="PENDING").order_by("created_at")[
            : self.batch_size
        ]
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

    def _pull_changes(self) -> int:
        """Pull changes from cloud since last pull. Returns count received."""
        params: dict = {"limit": str(self.batch_size)}

        if self._last_pull_timestamp:
            params["since"] = self._last_pull_timestamp.isoformat()
        else:
            params["full"] = "true"

        try:
            response = self._get(f"{self.server_url}/pull/", params=params)

            if response.status_code != 200:
                logger.warning(
                    "Cloud pull returned %d: %s",
                    response.status_code,
                    response.text[:200],
                )
                return 0

            data = response.json()
            changes = data.get("changes", [])
            server_ts = data.get("server_timestamp")

            if server_ts:
                self._last_pull_timestamp = datetime.fromisoformat(server_ts)

            # Queue pulled changes locally as SYNCED (they came from cloud)
            for change in changes:
                SyncQueue.objects.update_or_create(
                    model_name=change["table"],
                    record_id=change.get("record_id"),
                    defaults={
                        "operation": change["operation"],
                        "data": change.get("data", {}),
                        "status": "SYNCED",
                        "synced_at": timezone.now(),
                    },
                )

            return len(changes)

        except requests.RequestException as e:
            logger.warning("Cloud pull network error: %s", e)
            return 0

    def _mark_failed(self, entry_ids: list, error: str):
        """Mark entries as FAILED and increment retry count."""
        from django.db.models import F

        SyncQueue.objects.filter(pk__in=entry_ids).update(
            status="FAILED",
            error_message=error,
            retry_count=F("retry_count") + 1,
        )

    def _get_auth_headers(self) -> dict:
        """Return authorization headers, refreshing the token if needed."""
        self._ensure_valid_token()
        if self._auth_token:
            return {"Authorization": f"Bearer {self._auth_token}"}
        return {}

    def _ensure_valid_token(self):
        """Refresh the access token if it's expired or about to expire."""
        if not self._auth_token:
            return

        if time.time() < (self._token_expiry - TOKEN_REFRESH_BUFFER_SECS):
            return  # Still valid

        # Try refresh token first
        if self._refresh_token and self._refresh_access_token():
            return

        # Refresh failed or no refresh token — re-authenticate
        if self._auth_username and self._auth_password:
            self.authenticate(self._auth_username, self._auth_password)

    def _refresh_access_token(self) -> bool:
        """Use the refresh token to get a new access token. Returns True on success."""
        try:
            base_url = self.server_url.rstrip("/").rsplit("/sync", 1)[0]
            response = requests.post(
                f"{base_url}/token/refresh/",
                json={"refresh": self._refresh_token},
                timeout=15,
            )
            if response.status_code == 200:
                data = response.json()
                self._auth_token = data.get("access", "")
                # JWT access tokens default to 5 minutes in SimpleJWT
                self._token_expiry = time.time() + 300
                logger.debug("Hub access token refreshed via refresh token")
                return True
            logger.warning("Hub token refresh returned %d", response.status_code)
            return False
        except requests.RequestException as e:
            logger.warning("Hub token refresh network error: %s", e)
            return False

    def _post(self, url: str, **kwargs) -> requests.Response:
        """Make authenticated POST request to cloud."""
        headers = self._get_auth_headers()
        headers["Content-Type"] = "application/json"
        return requests.post(url, headers=headers, timeout=30, **kwargs)

    def _get(self, url: str, **kwargs) -> requests.Response:
        """Make authenticated GET request to cloud."""
        headers = self._get_auth_headers()
        return requests.get(url, headers=headers, timeout=30, **kwargs)

    def authenticate(self, username: str, password: str) -> bool:
        """
        Authenticate the hub with the cloud server.

        Call this once at startup with hub service account credentials.
        Stores refresh token for automatic re-authentication.
        """
        try:
            response = requests.post(
                f"{self.server_url.rstrip('/').rsplit('/sync', 1)[0]}/token/",
                json={"username": username, "password": password},
                timeout=15,
            )
            if response.status_code == 200:
                data = response.json()
                self._auth_token = data.get("access", "")
                self._refresh_token = data.get("refresh", "")
                # JWT access tokens default to 5 minutes in SimpleJWT
                self._token_expiry = time.time() + 300
                self._auth_username = username
                self._auth_password = password
                return True
            logger.warning("Hub auth failed: %d", response.status_code)
            return False
        except requests.RequestException as e:
            logger.warning("Hub auth network error: %s", e)
            return False


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
