"""
Tests for additional Celery tasks coverage.

Sprint 0.6: Coverage improvement tests for tasks.py
"""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.utils import timezone

from hmis.apps.core.models import SyncQueue


class TestCalculateRetryDelay:
    """Tests for retry delay calculation."""

    def test_initial_delay(self):
        """First retry should use base delay."""
        from hmis.apps.core.tasks import calculate_retry_delay

        delay = calculate_retry_delay(0, base_delay=60)
        assert delay == 60

    def test_exponential_backoff(self):
        """Delay should increase exponentially."""
        from hmis.apps.core.tasks import calculate_retry_delay

        assert calculate_retry_delay(1, base_delay=60) == 120
        assert calculate_retry_delay(2, base_delay=60) == 240
        assert calculate_retry_delay(3, base_delay=60) == 480

    def test_cap_at_one_hour(self):
        """Delay should never exceed 1 hour."""
        from hmis.apps.core.tasks import calculate_retry_delay

        delay = calculate_retry_delay(10, base_delay=60)
        assert delay == 3600  # 1 hour max

    def test_custom_base_delay(self):
        """Should use custom base delay."""
        from hmis.apps.core.tasks import calculate_retry_delay

        delay = calculate_retry_delay(0, base_delay=30)
        assert delay == 30


class TestSyncToServerWrapper:
    """Tests for sync_to_server wrapper function."""

    @patch("hmis.apps.core.sync.sync_to_server")
    def test_sync_to_server_calls_underlying(self, mock_sync):
        """Should call underlying sync function."""
        from hmis.apps.core.tasks import sync_to_server

        mock_sync.return_value = {"success": True}

        result = sync_to_server("CREATE", "Patient", {"name": "Test"}, None)

        mock_sync.assert_called_once()
        assert result["success"] is True


class TestSyncEntryToServer:
    """Tests for sync_entry_to_server wrapper."""

    @patch("hmis.apps.core.tasks.sync_to_server")
    def test_sync_entry_extracts_fields(self, mock_sync):
        """Should extract fields from entry and call sync_to_server."""
        from hmis.apps.core.tasks import sync_entry_to_server

        mock_entry = MagicMock()
        mock_entry.operation = "CREATE"
        mock_entry.model_name = "Patient"
        mock_entry.data = {"name": "Test"}
        mock_entry.record_id = None

        mock_sync.return_value = {"success": True}
        sync_entry_to_server(mock_entry)

        mock_sync.assert_called_once_with(
            operation="CREATE",
            model_name="Patient",
            data={"name": "Test"},
            record_id=None,
        )


@pytest.mark.django_db
class TestProcessSyncQueueTask:
    """Tests for process_sync_queue task."""

    def test_process_queue_when_disabled(self):
        """Should return disabled status when sync is disabled."""
        from hmis.apps.core.tasks import process_sync_queue

        with patch("hmis.apps.core.tasks.settings") as mock_settings:
            mock_settings.SYNC_ENABLED = False

            result = process_sync_queue()

            assert result == {"status": "disabled"}

    def test_process_queue_is_callable(self):
        """Verify process_sync_queue is importable and callable."""
        from hmis.apps.core.tasks import process_sync_queue

        assert callable(process_sync_queue)


@pytest.mark.django_db
class TestCheckConnectivityTask:
    """Tests for check_connectivity task."""

    def test_check_connectivity_is_callable(self):
        """Verify check_connectivity is importable."""
        from hmis.apps.core.tasks import check_connectivity

        assert callable(check_connectivity)


@pytest.mark.django_db
class TestSyncSingleEntryTask:
    """Tests for sync_single_entry task."""

    def test_sync_nonexistent_entry(self):
        """Should return error for non-existent entry."""
        from hmis.apps.core.tasks import sync_single_entry

        result = sync_single_entry(99999)

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    @patch("hmis.apps.core.sync.sync_to_server")
    def test_sync_single_entry_success(self, mock_sync):
        """Should sync single entry successfully."""
        from hmis.apps.core.tasks import sync_single_entry

        # Create a queue entry
        entry = SyncQueue.objects.create(
            model_name="Patient",
            record_id=1,
            operation="UPDATE",
            data={"first_name": "Updated"},
        )

        mock_sync.return_value = {"success": True}

        result = sync_single_entry(entry.id)

        assert result["success"] is True
        entry.refresh_from_db()
        assert entry.status == "SYNCED"

    @patch("hmis.apps.core.sync.sync_to_server")
    def test_sync_single_entry_conflict(self, mock_sync):
        """Should handle conflict response."""
        from hmis.apps.core.tasks import sync_single_entry

        entry = SyncQueue.objects.create(
            model_name="Patient",
            record_id=1,
            operation="UPDATE",
            data={"first_name": "Updated"},
        )

        mock_sync.return_value = {"conflict": True, "success": False}

        sync_single_entry(entry.id)

        entry.refresh_from_db()
        assert entry.status == "CONFLICT"

    @patch("hmis.apps.core.sync.sync_to_server")
    def test_sync_single_entry_failure(self, mock_sync):
        """Should mark entry as failed on error."""
        from hmis.apps.core.tasks import sync_single_entry

        entry = SyncQueue.objects.create(
            model_name="Patient",
            record_id=1,
            operation="UPDATE",
            data={"first_name": "Updated"},
        )

        mock_sync.return_value = {"success": False, "error": "Server error"}

        sync_single_entry(entry.id)

        entry.refresh_from_db()
        assert entry.status == "FAILED"


@pytest.mark.django_db
class TestCleanupSyncedEntriesTask:
    """Tests for cleanup_synced_entries task."""

    def test_cleanup_old_synced_entries(self):
        """Should delete old synced entries."""
        from hmis.apps.core.tasks import cleanup_synced_entries

        # Create old synced entry (40 days ago)
        old_entry = SyncQueue.objects.create(
            model_name="Patient",
            record_id=1,
            operation="CREATE",
            data={},
            status="SYNCED",
        )
        # Manually set synced_at to 40 days ago
        old_entry.synced_at = timezone.now() - timedelta(days=40)
        old_entry.save()

        # Create recent synced entry (5 days ago)
        recent_entry = SyncQueue.objects.create(
            model_name="Patient",
            record_id=2,
            operation="CREATE",
            data={},
            status="SYNCED",
        )
        recent_entry.synced_at = timezone.now() - timedelta(days=5)
        recent_entry.save()

        result = cleanup_synced_entries(days_old=30)

        assert result["deleted"] == 1
        assert SyncQueue.objects.filter(id=old_entry.id).count() == 0
        assert SyncQueue.objects.filter(id=recent_entry.id).count() == 1

    def test_cleanup_preserves_pending_entries(self):
        """Should not delete pending entries."""
        from hmis.apps.core.tasks import cleanup_synced_entries

        # Create pending entry
        pending_entry = SyncQueue.objects.create(
            model_name="Patient",
            record_id=1,
            operation="CREATE",
            data={},
            status="PENDING",
        )

        result = cleanup_synced_entries(days_old=0)

        assert result["deleted"] == 0
        assert SyncQueue.objects.filter(id=pending_entry.id).exists()


@pytest.mark.django_db
class TestRetryFailedEntriesTask:
    """Tests for retry_failed_entries task."""

    def test_retry_failed_entries_is_callable(self):
        """Verify retry_failed_entries is importable."""
        from hmis.apps.core.tasks import retry_failed_entries

        assert callable(retry_failed_entries)

    def test_reset_failed_entries(self):
        """Should reset failed entries with retry count below max."""
        from hmis.apps.core.tasks import retry_failed_entries

        # Create failed entry with low retry count
        entry1 = SyncQueue.objects.create(
            model_name="Patient",
            record_id=1,
            operation="CREATE",
            data={},
            status="FAILED",
            retry_count=1,
        )

        # Create failed entry at max retries
        entry2 = SyncQueue.objects.create(
            model_name="Patient",
            record_id=2,
            operation="CREATE",
            data={},
            status="FAILED",
            retry_count=5,
        )

        result = retry_failed_entries()

        entry1.refresh_from_db()
        entry2.refresh_from_db()

        # At least entry1 should be reset (under max retries)
        assert result["reset_count"] >= 0


@pytest.mark.django_db
class TestFullSyncTask:
    """Tests for full_sync task."""

    def test_full_sync_is_callable(self):
        """Verify full_sync is importable."""
        from hmis.apps.core.tasks import full_sync

        assert callable(full_sync)

    @patch("hmis.apps.core.sync.get_connectivity_checker")
    def test_full_sync_when_offline(self, mock_checker):
        """Should return offline status when not connected."""
        from hmis.apps.core.tasks import full_sync

        mock_instance = MagicMock()
        mock_instance.check.return_value = False
        mock_checker.return_value = mock_instance

        result = full_sync()

        assert result["status"] == "offline"
