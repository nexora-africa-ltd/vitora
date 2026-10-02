"""Run one hub sync cycle or the dedicated long-running hub sync service."""

import os
import signal
import time
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.hub_sync import HubCloudSyncWorker
from hmis.apps.core.models import SyncQueue


class Command(BaseCommand):
    help = "Run one hub-to-cloud sync cycle and report queue status."

    def add_arguments(self, parser):
        parser.add_argument(
            "--retry-failed",
            action="store_true",
            help="Reset failed sync entries that are still below SYNC_MAX_RETRIES before syncing.",
        )
        parser.add_argument(
            "--watch",
            action="store_true",
            help="Run continuously as the dedicated hub sync service.",
        )
        parser.add_argument(
            "--interval",
            type=int,
            default=None,
            help="Seconds between sync cycles in --watch mode (defaults to HUB_CLOUD_SYNC_INTERVAL).",
        )
        parser.add_argument(
            "--full-pull",
            action="store_true",
            help="Force the cloud pull step to request a full downward sync instead of using the saved cursor.",
        )
        parser.add_argument(
            "--pull-only",
            action="store_true",
            help="Skip pushing local pending changes and only pull from the cloud.",
        )
        parser.add_argument(
            "--tables",
            default="",
            help=(
                "Comma-separated model labels to pull (e.g. "
                "'patients.Patient,patients.EmergencyContact'). When set, the "
                "pull is scoped to those tables, a full snapshot of each is "
                "requested, and the regular incremental-sync state is left "
                "untouched. Implies --pull-only."
            ),
        )

    @staticmethod
    def _acquire_watch_lock(worker: HubCloudSyncWorker) -> Path:
        """Acquire the one-per-hub watcher lock, clearing a stale PID file."""
        lock_path = Path(worker._state_file).with_name("hub-sync-watch.lock")
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            try:
                pid = int(lock_path.read_text(encoding="utf-8").strip())
                os.kill(pid, 0)
            except (OSError, ValueError):
                lock_path.unlink(missing_ok=True)
                return Command._acquire_watch_lock(worker)
            raise CommandError(f"Hub sync watcher is already running (PID {pid}).") from exc

        with os.fdopen(fd, "w", encoding="utf-8") as lock_file:
            lock_file.write(str(os.getpid()))
        return lock_path

    def _watch(self, worker: HubCloudSyncWorker, interval: int) -> None:
        """Run one serialized sync loop outside the API server process."""
        lock_path = self._acquire_watch_lock(worker)
        stop_requested = False

        def request_stop(signum, frame):  # noqa: ARG001
            nonlocal stop_requested
            self.stdout.write(f"Hub sync watcher received signal {signum}; stopping.")
            stop_requested = True

        previous_sigterm = signal.signal(signal.SIGTERM, request_stop)
        previous_sigint = signal.signal(signal.SIGINT, request_stop)
        self.stdout.write(self.style.SUCCESS(f"Hub sync watcher started (interval={interval}s)."))
        try:
            while not stop_requested:
                worker.sync_once()
                for _ in range(interval):
                    if stop_requested:
                        break
                    time.sleep(1)
        finally:
            signal.signal(signal.SIGTERM, previous_sigterm)
            signal.signal(signal.SIGINT, previous_sigint)
            lock_path.unlink(missing_ok=True)
            self.stdout.write("Hub sync watcher stopped.")

    def handle(self, *args, **options):
        worker = HubCloudSyncWorker()
        if not worker.is_configured:
            raise CommandError(
                "Hub sync is not configured. Set SYNC_SERVER_URL, HUB_ID, and HUB_FACILITY_ID."
            )

        if not worker.has_license_token:
            raise CommandError(
                "Hub license token is required. Run hub activation or configure "
                "LICENSE_TOKEN/HUB_LICENSE_TOKEN_PATH."
            )

        if options["watch"]:
            if options["full_pull"] or options["pull_only"] or options.get("tables"):
                raise CommandError("--watch cannot be combined with one-shot pull options.")
            interval = options["interval"] or worker.interval
            if interval < 1:
                raise CommandError("--interval must be at least one second.")
            self._watch(worker, interval)
            return

        tables_raw = (options.get("tables") or "").strip()
        tables = [t.strip() for t in tables_raw.split(",") if t.strip()] or None

        reset_count = 0
        if options["retry_failed"]:
            reset_count = worker.reset_failed_for_retry()

        before_pending = SyncQueue.objects.filter(status="PENDING").count()
        before_failed = SyncQueue.objects.filter(status="FAILED").count()
        pushed, pulled = worker.sync_once(
            force_full_pull=options["full_pull"],
            skip_push=options["pull_only"] or bool(tables),
            tables=tables,
        )
        after_pending = SyncQueue.objects.filter(status="PENDING").count()
        after_failed = SyncQueue.objects.filter(status="FAILED").count()

        scope_suffix = f", tables={','.join(tables)}" if tables else ""
        self.stdout.write(
            self.style.SUCCESS(
                "Hub sync complete: "
                f"pushed={pushed}, pulled={pulled}, "
                f"pending={before_pending}->{after_pending}, "
                f"failed={before_failed}->{after_failed}"
                + (f", reset_failed={reset_count}" if options["retry_failed"] else "")
                + scope_suffix
            )
        )
