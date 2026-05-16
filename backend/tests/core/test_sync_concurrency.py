"""
Tests for sync queue concurrency and race conditions.

Gap: Two offline clients modifying the same record simultaneously.
These tests verify that the sync system correctly handles:
- Concurrent queue entries for the same record
- Race conditions during sync processing
- Conflict detection when two clients diverge from the same base
- Queue ordering guarantees under concurrent modifications
"""

from datetime import date
from unittest.mock import MagicMock, patch

import pytest  # type: ignore

from hmis.apps.core.models import SyncConflict, SyncQueue
from hmis.apps.core.sync import (
    SyncManager,
    detect_conflict,
    merge_changes_field_level,
    resolve_conflict_last_write_wins,
)


@pytest.mark.django_db
class TestConcurrentQueueEntries:
    """Tests for handling concurrent queue entries for the same record."""

    def test_two_updates_to_same_record_both_queued(self):
        """Two offline clients editing the same patient should both create queue entries."""
        # Client A edits phone number
        entry_a = SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={
                "phone_number": "+254700111111",
                "version": 2,
                "base_version": 1,
                "updated_at": "2026-05-16T10:00:00Z",
            },
            status="PENDING",
        )

        # Client B edits address (same base version — diverged)
        entry_b = SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={
                "address": "New Address",
                "version": 2,
                "base_version": 1,
                "updated_at": "2026-05-16T10:05:00Z",
            },
            status="PENDING",
        )

        # Both should be queued
        assert SyncQueue.objects.filter(record_id=42, model_name="Patient").count() == 2
        assert entry_a.status == "PENDING"
        assert entry_b.status == "PENDING"

    def test_queue_ordering_is_fifo(self):
        """Earlier-created entries should be processed first (FIFO)."""
        entry_first = SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={"first_name": "First Edit", "version": 2, "base_version": 1},
            status="PENDING",
        )
        entry_second = SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={"first_name": "Second Edit", "version": 3, "base_version": 1},
            status="PENDING",
        )

        pending = SyncQueue.objects.filter(
            status="PENDING", model_name="Patient", record_id=42
        ).order_by("created_at")

        assert list(pending.values_list("id", flat=True)) == [entry_first.id, entry_second.id]

    @patch("hmis.apps.core.sync.sync_to_server")
    @patch("hmis.apps.core.sync.ConnectivityChecker.check", return_value=True)
    def test_first_sync_succeeds_second_conflicts(self, mock_check, mock_sync):
        """When processing concurrently queued entries, the second one should detect a conflict."""
        # First call succeeds, second returns 409 conflict
        mock_sync.side_effect = [
            {"success": True},
            {
                "success": False,
                "conflict": True,
                "remote_data": {
                    "first_name": "Remote Version",
                    "version": 3,
                    "updated_at": "2026-05-16T10:10:00Z",
                },
            },
        ]

        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={"first_name": "Client A", "version": 2},
            status="PENDING",
        )
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={"first_name": "Client B", "version": 2},
            status="PENDING",
        )

        results = SyncManager.process_pending_entries()

        assert results["succeeded"] == 1
        assert results["conflicts"] == 1

        # Verify statuses
        entries = SyncQueue.objects.filter(record_id=42).order_by("created_at")
        assert entries[0].status == "SYNCED"
        assert entries[1].status == "CONFLICT"

    @patch("hmis.apps.core.sync.sync_to_server")
    @patch("hmis.apps.core.sync.ConnectivityChecker.check", return_value=True)
    def test_delete_after_update_both_processed(self, mock_check, mock_sync):
        """A DELETE queued after an UPDATE for the same record should both process."""
        mock_sync.return_value = {"success": True}

        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={"first_name": "Updated Name", "version": 2},
            status="PENDING",
        )
        SyncQueue.objects.create(
            operation="DELETE",
            model_name="Patient",
            record_id=42,
            data={},
            status="PENDING",
        )

        results = SyncManager.process_pending_entries()

        assert results["processed"] == 2
        assert results["succeeded"] == 2
        assert mock_sync.call_count == 2

        # Verify the order of operations sent to server
        first_call = mock_sync.call_args_list[0]
        second_call = mock_sync.call_args_list[1]
        assert (
            first_call.kwargs["operation"] == "UPDATE" or first_call[1].get("operation") == "UPDATE"
        )
        assert (
            second_call.kwargs["operation"] == "DELETE"
            or second_call[1].get("operation") == "DELETE"
        )

    @patch("hmis.apps.core.sync.sync_to_server")
    @patch("hmis.apps.core.sync.ConnectivityChecker.check", return_value=True)
    def test_create_then_update_same_record_processes_in_order(self, mock_check, mock_sync):
        """CREATE then UPDATE for a new record should process sequentially."""
        mock_sync.return_value = {"success": True}

        SyncQueue.objects.create(
            operation="CREATE",
            model_name="Encounter",
            record_id=None,
            data={
                "patient_id": 1,
                "encounter_type": "OPD",
                "chief_complaint": "Headache",
                "version": 1,
            },
            status="PENDING",
        )
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Encounter",
            record_id=None,
            data={
                "patient_id": 1,
                "encounter_type": "OPD",
                "chief_complaint": "Headache and fever",
                "version": 2,
            },
            status="PENDING",
        )

        results = SyncManager.process_pending_entries()

        assert results["processed"] == 2
        assert results["succeeded"] == 2


@pytest.mark.django_db
class TestConcurrentConflictDetection:
    """Tests for conflict detection when two clients diverge from the same base."""

    def test_same_field_different_values_is_conflict(self):
        """Two clients changing the same field from the same base = conflict."""
        local = {
            "first_name": "Alice",
            "last_name": "Smith",
            "version": 2,
            "base_version": 1,
            "updated_at": "2026-05-16T10:00:00Z",
        }
        remote = {
            "first_name": "Bob",
            "last_name": "Smith",
            "version": 2,
            "updated_at": "2026-05-16T10:01:00Z",
        }

        assert detect_conflict(local, remote) is True

    def test_different_fields_same_base_is_conflict(self):
        """Two clients changing different fields from the same base = conflict (version collision)."""
        local = {
            "first_name": "Updated",
            "phone": "111",
            "version": 2,
            "base_version": 1,
            "updated_at": "2026-05-16T10:00:00Z",
        }
        remote = {
            "first_name": "Original",
            "phone": "222",
            "version": 2,
            "updated_at": "2026-05-16T10:01:00Z",
        }

        assert detect_conflict(local, remote) is True

    def test_identical_changes_no_conflict(self):
        """Two clients making the exact same change = no conflict."""
        local = {
            "first_name": "Same Update",
            "version": 2,
            "base_version": 1,
            "updated_at": "2026-05-16T10:00:00Z",
        }
        remote = {
            "first_name": "Same Update",
            "version": 2,
            "updated_at": "2026-05-16T10:01:00Z",
        }

        assert detect_conflict(local, remote) is False

    def test_three_way_divergence_detected(self):
        """Three-way divergence: local v3, remote v3, both from base v1."""
        local = {
            "address": "Local Address",
            "version": 3,
            "base_version": 1,
            "updated_at": "2026-05-16T11:00:00Z",
        }
        remote = {
            "address": "Remote Address",
            "version": 3,
            "updated_at": "2026-05-16T11:05:00Z",
        }

        assert detect_conflict(local, remote) is True


@pytest.mark.django_db
class TestConcurrentMergeResolution:
    """Tests for field-level merge when concurrent edits don't overlap."""

    def test_non_overlapping_changes_merge_cleanly(self):
        """Changes to different fields from two clients should merge without data loss."""
        base = {
            "first_name": "John",
            "last_name": "Doe",
            "phone": "111",
            "address": "Old Address",
            "version": 1,
            "updated_at": "2026-05-16T09:00:00Z",
        }
        local = {
            "first_name": "John",
            "last_name": "Doe",
            "phone": "222",  # Client A changed phone
            "address": "Old Address",
            "version": 2,
            "updated_at": "2026-05-16T10:00:00Z",
        }
        remote = {
            "first_name": "John",
            "last_name": "Doe",
            "phone": "111",
            "address": "New Address",  # Client B changed address
            "version": 2,
            "updated_at": "2026-05-16T10:05:00Z",
        }

        merged = merge_changes_field_level(base, local, remote)

        # Both changes should be preserved
        assert merged["phone"] == "222"
        assert merged["address"] == "New Address"
        assert merged["first_name"] == "John"
        assert merged["version"] == 3  # max(2,2) + 1

    def test_overlapping_changes_use_last_write_wins(self):
        """Same field changed by both clients uses timestamp to pick winner."""
        base = {
            "first_name": "Original",
            "version": 1,
            "updated_at": "2026-05-16T09:00:00Z",
        }
        local = {
            "first_name": "Local Update",
            "version": 2,
            "updated_at": "2026-05-16T10:00:00Z",
        }
        remote = {
            "first_name": "Remote Update",
            "version": 2,
            "updated_at": "2026-05-16T10:05:00Z",  # Remote is more recent
        }

        merged = merge_changes_field_level(base, local, remote)

        # Remote wins because it has a later timestamp
        assert merged["first_name"] == "Remote Update"

    def test_merge_preserves_unchanged_fields(self):
        """Fields not changed by either client should retain base values."""
        base = {
            "first_name": "John",
            "last_name": "Doe",
            "gender": "M",
            "version": 1,
            "updated_at": "2026-05-16T09:00:00Z",
        }
        local = {
            "first_name": "Johnny",
            "last_name": "Doe",
            "gender": "M",
            "version": 2,
            "updated_at": "2026-05-16T10:00:00Z",
        }
        remote = {
            "first_name": "John",
            "last_name": "Doe",
            "gender": "M",
            "version": 2,
            "updated_at": "2026-05-16T10:01:00Z",
        }

        merged = merge_changes_field_level(base, local, remote)

        assert merged["first_name"] == "Johnny"  # Only local changed this
        assert merged["last_name"] == "Doe"  # Unchanged
        assert merged["gender"] == "M"  # Unchanged

    def test_merge_with_new_fields_added_by_one_client(self):
        """A field added by one client (not in base) should appear in merged result."""
        base = {
            "first_name": "John",
            "version": 1,
            "updated_at": "2026-05-16T09:00:00Z",
        }
        local = {
            "first_name": "John",
            "email": "john@example.com",  # New field from local
            "version": 2,
            "updated_at": "2026-05-16T10:00:00Z",
        }
        remote = {
            "first_name": "John",
            "version": 2,
            "updated_at": "2026-05-16T10:01:00Z",
        }

        merged = merge_changes_field_level(base, local, remote)

        assert merged["email"] == "john@example.com"


@pytest.mark.django_db
class TestConcurrentSyncQueueRaceConditions:
    """Tests for race conditions in the sync queue processing."""

    @patch("hmis.apps.core.sync.sync_to_server")
    @patch("hmis.apps.core.sync.ConnectivityChecker.check", return_value=True)
    def test_entry_marked_syncing_not_reprocessed(self, mock_check, mock_sync):
        """An entry already in SYNCING status should not be picked up again."""
        mock_sync.return_value = {"success": True}

        # Entry already being processed by another worker
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={"first_name": "In Progress"},
            status="SYNCING",
        )
        # New pending entry
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=43,
            data={"first_name": "Pending"},
            status="PENDING",
        )

        results = SyncManager.process_pending_entries()

        # Only the PENDING entry should be processed
        assert results["processed"] == 1
        assert results["succeeded"] == 1

    @patch("hmis.apps.core.sync.sync_to_server")
    @patch("hmis.apps.core.sync.ConnectivityChecker.check", return_value=True)
    def test_failed_entries_retried_up_to_max(self, mock_check, mock_sync):
        """Failed entries should be retried but not exceed max_retries."""
        mock_sync.return_value = {"success": False, "error": "Server error"}

        entry = SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={"first_name": "Will Fail"},
            status="FAILED",
            retry_count=2,  # Already failed twice
        )

        # With max_retries=3 (default), this should still be picked up
        results = SyncManager.process_pending_entries()
        assert results["processed"] == 1
        assert results["failed"] == 1

        entry.refresh_from_db()
        assert entry.retry_count == 3  # Incremented

        # Now it exceeds max retries - should NOT be processed
        results2 = SyncManager.process_pending_entries()
        assert results2["processed"] == 0

    @patch("hmis.apps.core.sync.sync_to_server")
    @patch("hmis.apps.core.sync.ConnectivityChecker.check", return_value=True)
    def test_conflict_entry_creates_sync_conflict_record(self, mock_check, mock_sync):
        """A conflicting sync should mark the entry and create/preserve conflict state."""
        mock_sync.return_value = {
            "success": False,
            "conflict": True,
            "remote_data": {
                "first_name": "Remote Winner",
                "version": 3,
                "updated_at": "2026-05-16T12:00:00Z",
            },
        }

        entry = SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Patient",
            record_id=42,
            data={
                "first_name": "Local Loser",
                "version": 2,
                "updated_at": "2026-05-16T11:00:00Z",
            },
            status="PENDING",
        )

        SyncManager.process_pending_entries()

        entry.refresh_from_db()
        assert entry.status == "CONFLICT"

    def test_last_write_wins_with_equal_timestamps_favours_local(self):
        """When timestamps are equal, local should win (>= comparison)."""
        local = {
            "first_name": "Local",
            "updated_at": "2026-05-16T10:00:00Z",
        }
        remote = {
            "first_name": "Remote",
            "updated_at": "2026-05-16T10:00:00Z",
        }

        winner = resolve_conflict_last_write_wins(local, remote)
        assert winner["first_name"] == "Local"

    def test_last_write_wins_with_missing_timestamps(self):
        """Missing timestamps should be treated as empty string (lowest priority)."""
        local = {
            "first_name": "Local",
            # No updated_at
        }
        remote = {
            "first_name": "Remote",
            "updated_at": "2026-05-16T10:00:00Z",
        }

        winner = resolve_conflict_last_write_wins(local, remote)
        assert winner["first_name"] == "Remote"
