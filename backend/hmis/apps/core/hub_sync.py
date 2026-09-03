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
import re
import threading
import time
from datetime import datetime
from pathlib import Path

import requests
from django.conf import settings
from django.core.management import call_command
from django.utils import timezone

from hmis.apps.core.models import SyncQueue
from hmis.apps.core.sync_materializer import materialize_entry

logger = logging.getLogger(__name__)

# File where last pull timestamp is persisted across restarts
SYNC_STATE_FILENAME = ".hub_sync_state.json"

_RBAC_SYNC_HEALTH: dict[str, object] = {
    "last_status": "never",
    "last_trigger": None,
    "last_started_at": None,
    "last_completed_at": None,
    "roles_checked": 0,
    "role_groups_corrected": 0,
    "profiles_checked": 0,
    "profile_groups_corrected": 0,
    "failures": 0,
}


def get_rbac_sync_health_snapshot() -> dict[str, object]:
    """Return the latest RBAC reconciliation health snapshot."""
    return dict(_RBAC_SYNC_HEALTH)


class HubCloudSyncWorker:
    """
    Manages bidirectional sync between the hub and the cloud server.

    Usage:
        worker = HubCloudSyncWorker()
        worker.start()   # non-blocking (thread mode)
        worker.stop()
    """

    # Maximum seconds the hub will wait on a single 429 before giving up.
    MAX_THROTTLE_WAIT: int = 900  # 15 minutes

    # Cloud push endpoint rejects batches larger than this.
    PUSH_CHUNK_SIZE: int = 100

    def __init__(self):
        self.server_url: str = getattr(settings, "SYNC_SERVER_URL", "")
        self.batch_size: int = getattr(settings, "SYNC_BATCH_SIZE", 100)
        self.max_retries: int = getattr(settings, "SYNC_MAX_RETRIES", 5)
        self.interval: int = getattr(settings, "HUB_CLOUD_SYNC_INTERVAL", 30)
        self.http_timeout_seconds: int = max(
            30,
            int(getattr(settings, "HUB_CLOUD_HTTP_TIMEOUT_SECONDS", 300)),
        )
        self.pull_network_max_retries: int = max(
            0,
            int(getattr(settings, "HUB_CLOUD_PULL_NETWORK_MAX_RETRIES", 2)),
        )
        # Small pause between consecutive pull pages to be friendly to
        # upstream rate limiters (Azure Front Door / WAF). 0 disables.
        self.pull_page_delay: float = float(getattr(settings, "SYNC_PULL_PAGE_DELAY", 0.5))
        self.push_chunk_delay: float = float(
            getattr(settings, "SYNC_PUSH_CHUNK_DELAY", self.pull_page_delay)
        )
        self.hub_id: str = getattr(settings, "HUB_ID", "")
        self.facility_id: str = getattr(settings, "HUB_FACILITY_ID", "")
        self.preflight_strict: bool = bool(getattr(settings, "HUB_SYNC_PREFLIGHT_STRICT", True))
        self.auto_import_icd10_on_preflight: bool = bool(
            getattr(settings, "HUB_SYNC_AUTO_IMPORT_ICD10_ON_PREFLIGHT", True)
        )
        self.rbac_self_heal_enabled: bool = bool(
            getattr(settings, "HUB_RBAC_SELF_HEAL_ENABLED", True)
        )
        self.rbac_self_heal_interval_seconds: int = max(
            300,
            int(getattr(settings, "HUB_RBAC_SELF_HEAL_INTERVAL_SECONDS", 86400)),
        )

        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_pull_timestamp: datetime | None = None
        self._full_pull_cursor: int | None = None  # Resumable full-pull cursor
        self._last_rbac_self_heal_at: datetime | None = None

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
        """Load persisted last_pull_timestamp and full_pull_cursor from disk."""
        if self._state_file.exists():
            try:
                state = json.loads(self._state_file.read_text())
                ts = state.get("last_pull_timestamp")
                if ts:
                    self._last_pull_timestamp = datetime.fromisoformat(ts)
                    logger.info("Restored last_pull_timestamp: %s", ts)
                cursor = state.get("full_pull_cursor")
                if cursor is not None:
                    self._full_pull_cursor = int(cursor)
                    logger.info("Restored full_pull_cursor: %d", self._full_pull_cursor)
                rbac_heal_at = state.get("last_rbac_self_heal_at")
                if rbac_heal_at:
                    self._last_rbac_self_heal_at = datetime.fromisoformat(rbac_heal_at)
            except (json.JSONDecodeError, ValueError, OSError) as exc:
                logger.warning("Could not load sync state: %s", exc)

    def _save_state(self):
        """Persist last_pull_timestamp and full_pull_cursor to disk."""
        state = {
            "last_pull_timestamp": (
                self._last_pull_timestamp.isoformat() if self._last_pull_timestamp else None
            ),
            "full_pull_cursor": self._full_pull_cursor,
            "last_rbac_self_heal_at": (
                self._last_rbac_self_heal_at.isoformat() if self._last_rbac_self_heal_at else None
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
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                logger.exception("Hub-to-cloud sync cycle failed")

            self._stop_event.wait(timeout=self.interval)

    def sync_once(
        self,
        *,
        force_full_pull: bool = False,
        skip_push: bool = False,
        tables: list[str] | None = None,
    ) -> tuple[int, int]:
        """Run one push+pull cycle and return (pushed, pulled).

        ``tables`` restricts the pull phase to the given model labels
        (e.g. ``["patients.Patient"]``). When set, ``force_full_pull`` is
        implied and the persisted full-pull cursor / last-pull timestamp are
        left untouched so the targeted pull does not affect the regular
        incremental sync.
        """
        if not self.has_license_token:
            logger.warning(
                "Hub cloud sync skipped: no license token. Run hub activation or configure "
                "LICENSE_TOKEN/HUB_LICENSE_TOKEN_PATH."
            )
            return 0, 0
        self._maybe_run_startup_rbac_self_heal()
        pushed = 0 if skip_push else self._push_pending()
        if skip_push:
            logger.info("Hub sync push phase skipped by request.")
        pulled = self._pull_changes(force_full=force_full_pull, tables=tables)
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
        """Push PENDING entries to the cloud server in chunks. Returns count pushed."""
        pending = list(
            SyncQueue.objects.filter(status="PENDING").order_by(
                "data__sync_meta__priority", "created_at"
            )[: self.batch_size]
        )
        if not pending:
            return 0

        # Build (change_payload, entry_pk) pairs.
        items = []
        for entry in pending:
            items.append(
                (
                    {
                        "table": entry.model_name,
                        "operation": entry.operation,
                        "record_id": str(entry.record_id) if entry.record_id else None,
                        "data": entry.data,
                        "timestamp": entry.created_at.isoformat(),
                        "client_id": self.hub_id,
                    },
                    entry.pk,
                )
            )

        logger.info(
            "Pushing %d pending sync entr%s to cloud (chunk size %d).",
            len(items),
            "y" if len(items) == 1 else "ies",
            self.PUSH_CHUNK_SIZE,
        )

        total_pushed = 0
        offsets = range(0, len(items), self.PUSH_CHUNK_SIZE)
        for chunk_num, offset in enumerate(offsets, start=1):
            chunk = items[offset : offset + self.PUSH_CHUNK_SIZE]
            chunk_changes = [c for c, _ in chunk]
            chunk_ids = [pk for _, pk in chunk]

            # Mark chunk as SYNCING
            SyncQueue.objects.filter(pk__in=chunk_ids).update(status="SYNCING")

            pushed = self._push_chunk(chunk_changes, chunk_ids, chunk_num)
            if pushed == 0:
                # Chunk failed (429 or error) — stop pushing further chunks this
                # cycle to let the rate-limiter cool down.
                break
            total_pushed += pushed

            # Brief pause between chunks to avoid tripping upstream rate limits.
            if offset + self.PUSH_CHUNK_SIZE < len(items) and self.push_chunk_delay > 0:
                time.sleep(self.push_chunk_delay)

        return total_pushed

    def _push_chunk(self, changes: list[dict], entry_ids: list[int], chunk_num: int) -> int:
        """Push a single chunk of changes. Returns count pushed (0 on failure)."""
        try:
            response = self._post(
                f"{self.server_url}/push/",
                json={
                    "client_id": self.hub_id,
                    "changes": changes,
                },
            )

            if response.status_code == 200:
                try:
                    body = response.json()
                except (ValueError, AttributeError, TypeError):
                    body = {}

                rejections = body.get("rejections") or []
                rejected_indices = {r["index"] for r in rejections if "index" in r}

                if rejected_indices:
                    # Separate accepted vs rejected entry IDs
                    accepted_ids = [
                        eid for idx, eid in enumerate(entry_ids) if idx not in rejected_indices
                    ]
                    rejected_ids = [
                        eid for idx, eid in enumerate(entry_ids) if idx in rejected_indices
                    ]

                    if accepted_ids:
                        SyncQueue.objects.filter(pk__in=accepted_ids).update(
                            status="SYNCED",
                            synced_at=timezone.now(),
                        )
                    if rejected_ids:
                        # Mark individually as FAILED with their specific reason,
                        # except for SOFT failures (e.g. waiting on a parent
                        # identity row) which we keep PENDING so they retry on
                        # the next push cycle.
                        rejection_meta = {r["index"]: r for r in rejections if "index" in r}
                        soft_failure_codes = {"DEPENDENCY_MISSING"}
                        for idx, eid in enumerate(entry_ids):
                            if idx not in rejected_indices:
                                continue
                            meta = rejection_meta.get(idx, {})
                            reason = meta.get("reason", "Rejected by cloud")
                            code = meta.get("code")
                            if code in soft_failure_codes:
                                logger.info(
                                    "Cloud push chunk %d: entry %d deferred (%s) — %s",
                                    chunk_num,
                                    eid,
                                    code,
                                    reason,
                                )
                                SyncQueue.objects.filter(pk=eid).update(status="PENDING")
                            else:
                                logger.warning(
                                    "Cloud push chunk %d: entry %d rejected — %s",
                                    chunk_num,
                                    eid,
                                    reason,
                                )
                                self._mark_failed([eid], reason[:500])

                    logger.info(
                        "Cloud push chunk %d: %d accepted, %d rejected.",
                        chunk_num,
                        len(accepted_ids),
                        len(rejected_ids),
                    )
                    return len(accepted_ids)
                else:
                    logger.info(
                        "Cloud push chunk %d accepted %d entr%s.",
                        chunk_num,
                        len(entry_ids),
                        "y" if len(entry_ids) == 1 else "ies",
                    )
                    SyncQueue.objects.filter(pk__in=entry_ids).update(
                        status="SYNCED",
                        synced_at=timezone.now(),
                    )
                    return len(entry_ids)
            elif response.status_code == 429:
                retry_after = self._retry_after_hint(response)
                retry_suffix = f" Retry after {retry_after}." if retry_after else ""
                logger.warning(
                    "Cloud push chunk %d returned 429:%s %s",
                    chunk_num,
                    retry_suffix,
                    response.text[:200],
                )
                SyncQueue.objects.filter(pk__in=entry_ids).update(status="PENDING")
                return 0
            else:
                retry_after = self._retry_after_hint(response)
                retry_suffix = f" Retry after {retry_after}." if retry_after else ""
                logger.warning(
                    "Cloud push chunk %d returned %d:%s %s",
                    chunk_num,
                    response.status_code,
                    retry_suffix,
                    response.text[:200],
                )
                self._mark_failed(entry_ids, f"HTTP {response.status_code}")
                return 0

        except requests.RequestException as e:
            logger.warning("Cloud push chunk %d network error: %s", chunk_num, e)
            SyncQueue.objects.filter(pk__in=entry_ids).update(status="PENDING")
            return 0

    def _pull_changes(self, *, force_full: bool = False, tables: list[str] | None = None) -> int:
        """Pull changes from cloud since last pull. Returns count received.

        When ``tables`` is provided the pull is scoped to just those model
        labels and a full snapshot of each is requested. The cursor and
        last-pull timestamp are intentionally **not** persisted so a targeted
        pull cannot rewind the regular incremental sync.
        """
        params: dict = {"limit": str(self.batch_size), "direction": "down"}

        scoped = bool(tables)
        if scoped:
            params["tables"] = ",".join(tables)
            params["full"] = "true"
            is_full_pull = True
        elif self._full_pull_cursor is not None:
            # Resume an interrupted full pull from persisted cursor.
            params["full"] = "true"
            params["cursor"] = str(self._full_pull_cursor)
            is_full_pull = True
        elif force_full:
            params["full"] = "true"
            is_full_pull = True
        elif self._last_pull_timestamp:
            params["since"] = self._last_pull_timestamp.isoformat()
            is_full_pull = False
        else:
            params["full"] = "true"
            is_full_pull = True

        total_applied = 0
        deferred_changes = []
        page_number = 1
        network_retries = 0

        logger.info(
            "Starting %s cloud pull (limit=%s%s).",
            "full" if params.get("full") == "true" else "incremental",
            params["limit"],
            f", tables={params['tables']}" if scoped else "",
        )

        preflight_ok = self._run_pull_preflight(
            is_full_pull=is_full_pull,
            scoped=scoped,
            tables=tables,
        )
        if not preflight_ok:
            logger.warning("Pull preflight failed; aborting pull cycle before page fetch.")
            return total_applied

        while True:
            try:
                logger.info(
                    "Requesting cloud pull page %d%s.",
                    page_number,
                    f" (cursor={params['cursor']})" if "cursor" in params else "",
                )
                response = self._get(f"{self.server_url}/pull/", params=params.copy())
                network_retries = 0

                if response.status_code == 429:
                    wait = self._parse_retry_after_seconds(response)
                    if wait and wait <= self.MAX_THROTTLE_WAIT:
                        logger.warning(
                            "Cloud pull throttled (page %d). Waiting %d seconds before retrying.",
                            page_number,
                            wait,
                        )
                        time.sleep(wait)
                        continue  # retry same page/cursor

                if response.status_code != 200:
                    retry_after = self._retry_after_hint(response)
                    retry_suffix = f" Retry after {retry_after}." if retry_after else ""
                    logger.warning(
                        "Cloud pull returned %d:%s %s",
                        response.status_code,
                        retry_suffix,
                        response.text[:200],
                    )
                    return total_applied

                data = response.json()
                changes = data.get("entries") or data.get("changes", [])
                server_ts = data.get("server_timestamp")
                logger.info(
                    "Received cloud pull page %d with %d change%s (has_more=%s).",
                    page_number,
                    len(changes),
                    "" if len(changes) == 1 else "s",
                    bool(data.get("has_more")),
                )

                if server_ts and not is_full_pull:
                    # Only advance the pull timestamp on incremental pulls.
                    # Full pulls must complete before we consider the hub up-to-date.
                    self._last_pull_timestamp = datetime.fromisoformat(server_ts)
                    self._save_state()

                page_deferred_changes = []
                for change in changes:
                    result = materialize_entry(change)
                    if not result.get("success"):
                        if self._is_deferred_materialization_error(result):
                            page_deferred_changes.append(change)
                            continue
                        self._log_materialization_failure(change, result)
                        continue

                    self._record_pulled_change(change)
                    total_applied += 1

                retry_deferred_changes = [*deferred_changes, *page_deferred_changes]
                deferred_changes = []
                for change in retry_deferred_changes:
                    result = materialize_entry(change)
                    if not result.get("success"):
                        if self._is_deferred_materialization_error(result):
                            deferred_changes.append(change)
                        else:
                            self._log_materialization_failure(change, result)
                        continue

                    self._record_pulled_change(change)
                    total_applied += 1

                next_cursor = data.get("next_cursor")
                if not data.get("has_more") or not next_cursor:
                    # Pull completed naturally — apply remaining deferred changes.
                    for change in deferred_changes:
                        result = materialize_entry(change)
                        if result.get("success"):
                            self._record_pulled_change(change)
                            total_applied += 1
                        else:
                            self._log_materialization_failure(change, result)

                    # Full pull finished: advance timestamp and clear cursor.
                    # Skip state persistence for scoped/targeted pulls so they
                    # don't disturb the regular incremental sync baseline.
                    if not scoped:
                        if is_full_pull and server_ts:
                            self._last_pull_timestamp = datetime.fromisoformat(server_ts)
                        self._full_pull_cursor = None
                        self._save_state()
                        if is_full_pull:
                            self._run_rbac_reconciliation(trigger="post_full_pull")
                    return total_applied

                # Persist cursor so an interrupted full pull can resume.
                # Scoped pulls don't share state with the regular sync.
                if is_full_pull and not scoped:
                    self._full_pull_cursor = int(next_cursor)
                    self._save_state()

                params["cursor"] = str(next_cursor)
                page_number += 1

                # Brief inter-page pause to avoid tripping upstream rate limits
                # (Azure Front Door / WAF) when full-pulling thousands of rows.
                if self.pull_page_delay > 0:
                    time.sleep(self.pull_page_delay)

            except requests.RequestException as e:
                if network_retries < self.pull_network_max_retries:
                    network_retries += 1
                    backoff_seconds = min(5 * network_retries, 30)
                    logger.warning(
                        "Cloud pull network error (attempt %d/%d): %s. Retrying page %d in %ds.",
                        network_retries,
                        self.pull_network_max_retries,
                        e,
                        page_number,
                        backoff_seconds,
                    )
                    time.sleep(backoff_seconds)
                    continue

                logger.warning("Cloud pull network error: %s", e)
                return total_applied

    def _run_pull_preflight(
        self,
        *,
        is_full_pull: bool,
        scoped: bool,
        tables: list[str] | None,
    ) -> bool:
        """Validate/prepare critical reference data before pull materialization."""
        if getattr(settings, "ENVIRONMENT", "") != "hub":
            return True
        del scoped
        needs_icd10 = (not tables) or ("encounters.Diagnosis" in tables)
        if not (is_full_pull and needs_icd10):
            return True

        from hmis.apps.encounters.models import ICD10Code

        if ICD10Code.objects.exists():
            return True

        logger.warning(
            "Pull preflight: ICD-10 catalogue is empty on hub; diagnosis rows may fail without references."
        )

        if self.auto_import_icd10_on_preflight:
            try:
                logger.info("Pull preflight: attempting automatic ICD-10 import.")
                call_command("import_icd10", "data/icd10_kenya_common.csv", verbosity=0)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Pull preflight: automatic ICD-10 import failed: %s", exc)

        if ICD10Code.objects.exists():
            logger.info("Pull preflight: ICD-10 catalogue available.")
            return True

        guidance = (
            "ICD-10 catalogue is missing. Run 'python manage.py initialize_hub --only import_icd10' "
            "or full 'python manage.py initialize_hub', then retry hub_sync."
        )
        if self.preflight_strict:
            logger.error("Pull preflight failed: %s", guidance)
            return False

        logger.warning("Pull preflight warning (non-strict): %s", guidance)
        return True

    @staticmethod
    def _is_deferred_materialization_error(result: dict) -> bool:
        """Return True for errors likely caused by parent rows arriving later."""
        if str(result.get("code") or "").upper() == "DEPENDENCY_MISSING":
            return True
        error = str(result.get("error") or "").lower()
        return any(
            marker in error
            for marker in (
                "matching query does not exist",
                "foreign key constraint failed",
                "is not a valid choice",
                "instance with id",
            )
        )

    @staticmethod
    def _log_materialization_failure(change: dict, result: dict):
        """Log a pulled-change materialization failure consistently."""
        logger.warning(
            "Failed to apply pulled change %s:%s: %s",
            change.get("table"),
            change.get("record_id"),
            result.get("error"),
        )

    @staticmethod
    def _retry_after_hint(response: requests.Response) -> str:
        """Return a human-readable retry hint from a throttled cloud response."""
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            return f"{retry_after} seconds"

        match = re.search(r"available in (\d+) seconds", response.text or "")
        if match:
            return f"{match.group(1)} seconds"
        return ""

    @staticmethod
    def _parse_retry_after_seconds(response: requests.Response) -> int | None:
        """Extract integer seconds from a Retry-After header or DRF response body."""
        header = response.headers.get("Retry-After", "")
        if header.isdigit():
            return int(header)
        match = re.search(r"available in (\d+) seconds", response.text or "")
        if match:
            return int(match.group(1))
        return None

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
            SyncQueue.objects.filter(
                model_name=change["table"],
                record_id=record_id,
                status="SYNCED",
            )
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

    def _maybe_run_startup_rbac_self_heal(self) -> None:
        """Run periodic RBAC drift self-heal on hub nodes."""
        if not self.rbac_self_heal_enabled:
            return
        if getattr(settings, "ENVIRONMENT", "") != "hub":
            return

        now = timezone.now()
        if self._last_rbac_self_heal_at is not None:
            elapsed = (now - self._last_rbac_self_heal_at).total_seconds()
            if elapsed < self.rbac_self_heal_interval_seconds:
                return

        if self._run_rbac_reconciliation(trigger="startup_self_heal"):
            self._last_rbac_self_heal_at = now
            self._save_state()

    def _run_rbac_reconciliation(self, *, trigger: str) -> bool:
        """Reconcile role/group and user/group RBAC state and update health metrics."""
        _RBAC_SYNC_HEALTH["last_trigger"] = trigger
        _RBAC_SYNC_HEALTH["last_started_at"] = timezone.now().isoformat()

        try:
            from hmis.apps.core.role_permissions_sync import reconcile_hub_rbac_state

            summary = reconcile_hub_rbac_state()
            _RBAC_SYNC_HEALTH.update(summary)
            _RBAC_SYNC_HEALTH["last_status"] = "ok"
            _RBAC_SYNC_HEALTH["last_completed_at"] = timezone.now().isoformat()
            logger.info(
                "RBAC reconciliation (%s) complete: roles_checked=%s corrected_roles=%s "
                "profiles_checked=%s corrected_profiles=%s",
                trigger,
                summary.get("roles_checked", 0),
                summary.get("role_groups_corrected", 0),
                summary.get("profiles_checked", 0),
                summary.get("profile_groups_corrected", 0),
            )
            return True
        except Exception:  # noqa: BLE001 - best-effort RBAC healing must not break sync cycles
            _RBAC_SYNC_HEALTH["last_status"] = "failed"
            _RBAC_SYNC_HEALTH["last_completed_at"] = timezone.now().isoformat()
            _RBAC_SYNC_HEALTH["failures"] = int(_RBAC_SYNC_HEALTH.get("failures", 0)) + 1
            logger.exception("RBAC reconciliation (%s) failed", trigger)
            return False

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
        timeout = kwargs.pop("timeout", self.http_timeout_seconds)
        return requests.post(url, headers=headers, timeout=timeout, **kwargs)

    def _get(self, url: str, **kwargs) -> requests.Response:
        """Make authenticated GET request to cloud."""
        headers = self._get_auth_headers()
        timeout = kwargs.pop("timeout", self.http_timeout_seconds)
        return requests.get(url, headers=headers, timeout=timeout, **kwargs)


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
