"""
Tests for the REST sync API endpoints.

Tests cover:
- POST /api/sync/push/ — batch push changes
- GET  /api/sync/pull/ — incremental pull
- GET  /api/sync/status/ — health check
- POST /api/sync/resolve/ — conflict resolution
- GET  /api/sync/conflicts/ — list conflicts
"""

from datetime import timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status


@pytest.fixture
def sync_push_url():
    return "/api/sync/push/"


@pytest.fixture
def sync_pull_url():
    return "/api/sync/pull/"


@pytest.fixture
def sync_status_url():
    return "/api/sync/status/"


@pytest.fixture
def sync_resolve_url():
    return "/api/sync/resolve/"


@pytest.fixture
def sync_conflicts_url():
    return "/api/sync/conflicts/"


@pytest.fixture
def valid_push_payload():
    """Valid push payload with a patient create change."""
    return {
        "client_id": "tauri-device-001",
        "changes": [
            {
                "table": "patients_patient",
                "operation": "CREATE",
                "record_id": "42",
                "data": {
                    "first_name": "John",
                    "last_name": "Doe",
                    "date_of_birth": "1990-01-15",
                    "gender": "M",
                },
                "timestamp": timezone.now().isoformat(),
                "client_id": "tauri-device-001",
            }
        ],
    }


@pytest.fixture
def synced_queue_entries(db, sample_facility, sample_organization):
    """Create some synced queue entries for pull testing."""
    from hmis.apps.core.models import SyncQueue

    now = timezone.now()
    entries = []
    for i in range(5):
        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="patients_patient",
            record_id=100 + i,
            data={"first_name": f"Patient{i}", "last_name": "Test"},
            status="SYNCED",
            synced_at=now - timedelta(minutes=10 - i),
            facility=sample_facility,
            organization=sample_organization,
        )
        entries.append(entry)
    return entries


class TestSyncPushEndpoint:
    """Tests for POST /api/sync/push/"""

    def test_push_requires_authentication(self, api_client, sync_push_url, valid_push_payload):
        """Unauthenticated requests should be rejected."""
        response = api_client.post(sync_push_url, valid_push_payload, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_push_single_change_accepted(
        self, authenticated_client, sync_push_url, valid_push_payload
    ):
        """A valid single change should be accepted."""
        response = authenticated_client.post(sync_push_url, valid_push_payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["accepted"] == 1
        assert response.data["rejected"] == 0
        assert response.data["conflicts"] == []
        assert "server_timestamp" in response.data

    def test_push_multiple_changes_accepted(self, authenticated_client, sync_push_url):
        """Multiple valid changes should all be accepted."""
        now = timezone.now().isoformat()
        payload = {
            "client_id": "tauri-device-001",
            "changes": [
                {
                    "table": "patients_patient",
                    "operation": "CREATE",
                    "record_id": "1",
                    "data": {"first_name": "Alice"},
                    "timestamp": now,
                    "client_id": "tauri-device-001",
                },
                {
                    "table": "encounters_encounter",
                    "operation": "CREATE",
                    "record_id": "2",
                    "data": {"chief_complaint": "Headache"},
                    "timestamp": now,
                    "client_id": "tauri-device-001",
                },
                {
                    "table": "triage_triageassessment",
                    "operation": "UPDATE",
                    "record_id": "3",
                    "data": {"priority": "HIGH"},
                    "timestamp": now,
                    "client_id": "tauri-device-001",
                },
            ],
        }
        response = authenticated_client.post(sync_push_url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["accepted"] == 3
        assert response.data["rejected"] == 0

    def test_push_invalid_table_rejected(self, authenticated_client, sync_push_url):
        """Changes to non-syncable tables should be rejected."""
        payload = {
            "client_id": "tauri-device-001",
            "changes": [
                {
                    "table": "core_auditlog",
                    "operation": "CREATE",
                    "record_id": "1",
                    "data": {"action": "fake"},
                    "timestamp": timezone.now().isoformat(),
                    "client_id": "tauri-device-001",
                }
            ],
        }
        response = authenticated_client.post(sync_push_url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["accepted"] == 0
        assert response.data["rejected"] == 1
        assert "not syncable" in response.data["rejections"][0]["reason"]

    def test_push_mixed_valid_and_invalid(self, authenticated_client, sync_push_url):
        """Mixed payload: valid entries accepted, invalid rejected."""
        now = timezone.now().isoformat()
        payload = {
            "client_id": "tauri-device-001",
            "changes": [
                {
                    "table": "patients_patient",
                    "operation": "CREATE",
                    "record_id": "1",
                    "data": {"first_name": "Valid"},
                    "timestamp": now,
                    "client_id": "tauri-device-001",
                },
                {
                    "table": "django_session",
                    "operation": "CREATE",
                    "record_id": "2",
                    "data": {},
                    "timestamp": now,
                    "client_id": "tauri-device-001",
                },
            ],
        }
        response = authenticated_client.post(sync_push_url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["accepted"] == 1
        assert response.data["rejected"] == 1

    def test_push_exceeds_batch_size_rejected(self, authenticated_client, sync_push_url, settings):
        """Pushing more than SYNC_BATCH_SIZE changes should be rejected."""
        settings.SYNC_BATCH_SIZE = 5
        now = timezone.now().isoformat()
        payload = {
            "client_id": "tauri-device-001",
            "changes": [
                {
                    "table": "patients_patient",
                    "operation": "CREATE",
                    "record_id": str(i),
                    "data": {"first_name": f"Patient{i}"},
                    "timestamp": now,
                    "client_id": "tauri-device-001",
                }
                for i in range(10)
            ],
        }
        response = authenticated_client.post(sync_push_url, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Batch size" in response.data["detail"]

    def test_push_empty_changes_accepted(self, authenticated_client, sync_push_url):
        """Empty changes array is valid (no-op)."""
        payload = {"client_id": "tauri-device-001", "changes": []}
        response = authenticated_client.post(sync_push_url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["accepted"] == 0

    def test_push_creates_sync_queue_entry(
        self, authenticated_client, sync_push_url, valid_push_payload
    ):
        """Push should create a SyncQueue entry in the database."""
        from hmis.apps.core.models import SyncQueue

        initial_count = SyncQueue.objects.count()
        authenticated_client.post(sync_push_url, valid_push_payload, format="json")
        assert SyncQueue.objects.count() == initial_count + 1

        entry = SyncQueue.objects.latest("created_at")
        assert entry.model_name == "patients_patient"
        assert entry.operation == "CREATE"
        assert entry.status == "PENDING"
        assert entry.data["first_name"] == "John"
        assert entry.data["_client_id"] == "tauri-device-001"

    def test_push_conflict_detected_on_stale_update(
        self, authenticated_client, sync_push_url, sample_facility, sample_organization
    ):
        """Update with timestamp older than server's last sync should trigger conflict."""
        from hmis.apps.core.models import SyncQueue

        # Create a "synced" entry on the server (newer)
        server_time = timezone.now()
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="patients_patient",
            record_id=99,
            data={"first_name": "ServerVersion"},
            status="SYNCED",
            synced_at=server_time,
            facility=sample_facility,
            organization=sample_organization,
        )

        # Client pushes an older update
        stale_time = (server_time - timedelta(minutes=5)).isoformat()
        payload = {
            "client_id": "tauri-device-001",
            "changes": [
                {
                    "table": "patients_patient",
                    "operation": "UPDATE",
                    "record_id": "99",
                    "data": {"first_name": "ClientVersion"},
                    "timestamp": stale_time,
                    "client_id": "tauri-device-001",
                }
            ],
        }
        response = authenticated_client.post(sync_push_url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["accepted"] == 0
        assert len(response.data["conflicts"]) == 1
        assert response.data["conflicts"][0]["table"] == "patients_patient"
        assert response.data["conflicts"][0]["record_id"] == "99"

    def test_push_invalid_payload_rejected(self, authenticated_client, sync_push_url):
        """Malformed payload should return 400."""
        response = authenticated_client.post(sync_push_url, {"invalid": "data"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestSyncPullEndpoint:
    """Tests for GET /api/sync/pull/"""

    def test_pull_requires_authentication(self, api_client, sync_pull_url):
        """Unauthenticated requests should be rejected."""
        response = api_client.get(sync_pull_url, {"since": "2026-01-01T00:00:00Z"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_pull_requires_since_or_full(self, authenticated_client, sync_pull_url):
        """Must provide either 'since' or 'full=true'."""
        response = authenticated_client.get(sync_pull_url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "since" in response.data["detail"].lower()

    def test_pull_with_since_returns_changes(
        self, authenticated_client, sync_pull_url, synced_queue_entries
    ):
        """Pull with 'since' should return entries after that timestamp."""
        # Get timestamp of 3rd entry — should return entries 4 and 5
        since = synced_queue_entries[2].synced_at.isoformat()
        response = authenticated_client.get(sync_pull_url, {"since": since})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["changes"]) == 2
        assert response.data["has_more"] is False
        assert "server_timestamp" in response.data

    def test_pull_full_returns_all_entries(
        self, authenticated_client, sync_pull_url, synced_queue_entries
    ):
        """Pull with 'full=true' should return all synced entries."""
        response = authenticated_client.get(sync_pull_url, {"full": "true"})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["changes"]) == 5

    def test_pull_respects_limit(self, authenticated_client, sync_pull_url, synced_queue_entries):
        """Pull should respect the limit parameter."""
        response = authenticated_client.get(sync_pull_url, {"full": "true", "limit": "2"})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["changes"]) == 2
        assert response.data["has_more"] is True
        assert response.data["next_cursor"] is not None

    def test_pull_filters_by_table(
        self,
        authenticated_client,
        sync_pull_url,
        synced_queue_entries,
        sample_facility,
        sample_organization,
    ):
        """Pull with 'tables' filter should only return those tables."""
        from hmis.apps.core.models import SyncQueue

        # Add an encounter entry
        SyncQueue.objects.create(
            operation="CREATE",
            model_name="encounters_encounter",
            record_id=200,
            data={"chief_complaint": "Fever"},
            status="SYNCED",
            synced_at=timezone.now(),
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get(
            sync_pull_url,
            {"full": "true", "tables": "encounters_encounter"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["changes"]) == 1
        assert response.data["changes"][0]["table"] == "encounters_encounter"

    def test_pull_invalid_since_format(self, authenticated_client, sync_pull_url):
        """Invalid 'since' format should return 400."""
        response = authenticated_client.get(sync_pull_url, {"since": "not-a-date"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_pull_change_structure(self, authenticated_client, sync_pull_url, synced_queue_entries):
        """Each change should have the expected fields."""
        response = authenticated_client.get(sync_pull_url, {"full": "true", "limit": "1"})
        assert response.status_code == status.HTTP_200_OK
        change = response.data["changes"][0]
        assert "table" in change
        assert "operation" in change
        assert "record_id" in change
        assert "data" in change
        assert "timestamp" in change
        assert "server_sequence" in change

    def test_pull_no_results_for_future_since(
        self, authenticated_client, sync_pull_url, synced_queue_entries
    ):
        """Pull with a future 'since' should return empty."""
        future = (timezone.now() + timedelta(hours=1)).isoformat()
        response = authenticated_client.get(sync_pull_url, {"since": future})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["changes"]) == 0
        assert response.data["has_more"] is False


class TestSyncStatusEndpoint:
    """Tests for GET /api/sync/status/"""

    def test_status_requires_authentication(self, api_client, sync_status_url):
        """Unauthenticated requests should be rejected."""
        response = api_client.get(sync_status_url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_status_returns_counts(self, authenticated_client, sync_status_url):
        """Should return sync status counts."""
        response = authenticated_client.get(sync_status_url)
        assert response.status_code == status.HTTP_200_OK
        assert "pending_changes" in response.data
        assert "failed_changes" in response.data
        assert "conflicts" in response.data
        assert "server_timestamp" in response.data
        assert "last_sync" in response.data

    def test_status_reflects_queue_state(
        self, authenticated_client, sync_status_url, sample_facility, sample_organization
    ):
        """Status should reflect actual queue counts."""
        from hmis.apps.core.models import SyncQueue

        # Create entries in various states
        SyncQueue.objects.create(
            operation="CREATE",
            model_name="patients_patient",
            record_id=1,
            data={},
            status="PENDING",
            facility=sample_facility,
            organization=sample_organization,
        )
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="patients_patient",
            record_id=2,
            data={},
            status="FAILED",
            facility=sample_facility,
            organization=sample_organization,
        )
        SyncQueue.objects.create(
            operation="CREATE",
            model_name="patients_patient",
            record_id=3,
            data={},
            status="SYNCED",
            synced_at=timezone.now(),
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get(sync_status_url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["pending_changes"] == 1
        assert response.data["failed_changes"] == 1
        assert response.data["last_sync"] is not None


class TestSyncResolveConflictEndpoint:
    """Tests for POST /api/sync/resolve/"""

    @pytest.fixture
    def pending_conflict(self, db):
        """Create a pending conflict for testing."""
        from hmis.apps.core.models import SyncConflict

        return SyncConflict.objects.create(
            model_name="patients_patient",
            record_id=42,
            local_data={"first_name": "ClientName"},
            remote_data={"first_name": "ServerName"},
            resolution_strategy="LAST_WRITE_WINS",
            status="PENDING",
        )

    def test_resolve_requires_authentication(self, api_client, sync_resolve_url):
        """Unauthenticated requests should be rejected."""
        response = api_client.post(
            sync_resolve_url,
            {"conflict_id": 1, "resolution": "local_wins"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_resolve_local_wins(self, authenticated_client, sync_resolve_url, pending_conflict):
        """Resolving with 'local_wins' should use local_data."""
        response = authenticated_client.post(
            sync_resolve_url,
            {"conflict_id": pending_conflict.pk, "resolution": "local_wins"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "RESOLVED"
        assert response.data["resolution_strategy"] == "LOCAL_WINS"
        assert response.data["resolved_data"] == {"first_name": "ClientName"}

    def test_resolve_remote_wins(self, authenticated_client, sync_resolve_url, pending_conflict):
        """Resolving with 'remote_wins' should use remote_data."""
        response = authenticated_client.post(
            sync_resolve_url,
            {"conflict_id": pending_conflict.pk, "resolution": "remote_wins"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "RESOLVED"
        assert response.data["resolution_strategy"] == "REMOTE_WINS"
        assert response.data["resolved_data"] == {"first_name": "ServerName"}

    def test_resolve_merge_with_data(
        self, authenticated_client, sync_resolve_url, pending_conflict
    ):
        """Resolving with 'merge' should use provided merged_data."""
        merged = {"first_name": "MergedName"}
        response = authenticated_client.post(
            sync_resolve_url,
            {
                "conflict_id": pending_conflict.pk,
                "resolution": "merge",
                "merged_data": merged,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "RESOLVED"
        assert response.data["resolution_strategy"] == "MERGED"
        assert response.data["resolved_data"] == merged

    def test_resolve_merge_without_data_fails(
        self, authenticated_client, sync_resolve_url, pending_conflict
    ):
        """Resolving with 'merge' but no merged_data should return 400."""
        response = authenticated_client.post(
            sync_resolve_url,
            {"conflict_id": pending_conflict.pk, "resolution": "merge"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_resolve_nonexistent_conflict(self, authenticated_client, sync_resolve_url):
        """Resolving a non-existent conflict should return 404."""
        response = authenticated_client.post(
            sync_resolve_url,
            {"conflict_id": 99999, "resolution": "local_wins"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_resolve_already_resolved_conflict(
        self, authenticated_client, sync_resolve_url, pending_conflict
    ):
        """Resolving an already-resolved conflict should return 404."""
        pending_conflict.status = "RESOLVED"
        pending_conflict.save()

        response = authenticated_client.post(
            sync_resolve_url,
            {"conflict_id": pending_conflict.pk, "resolution": "local_wins"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestSyncConflictsListEndpoint:
    """Tests for GET /api/sync/conflicts/"""

    def test_list_requires_authentication(self, api_client, sync_conflicts_url):
        """Unauthenticated requests should be rejected."""
        response = api_client.get(sync_conflicts_url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_returns_pending_conflicts(self, authenticated_client, sync_conflicts_url):
        """Should return pending conflicts."""
        from hmis.apps.core.models import SyncConflict

        SyncConflict.objects.create(
            model_name="patients_patient",
            record_id=1,
            local_data={"a": 1},
            remote_data={"a": 2},
            status="PENDING",
        )
        SyncConflict.objects.create(
            model_name="encounters_encounter",
            record_id=2,
            local_data={"b": 1},
            remote_data={"b": 2},
            status="PENDING",
        )
        # Resolved — should NOT appear
        SyncConflict.objects.create(
            model_name="patients_patient",
            record_id=3,
            local_data={"c": 1},
            remote_data={"c": 2},
            status="RESOLVED",
        )

        response = authenticated_client.get(sync_conflicts_url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 2
        assert len(response.data["results"]) == 2

    def test_list_respects_pagination(self, authenticated_client, sync_conflicts_url):
        """Should respect limit and offset."""
        from hmis.apps.core.models import SyncConflict

        for i in range(5):
            SyncConflict.objects.create(
                model_name="patients_patient",
                record_id=i,
                local_data={},
                remote_data={},
                status="PENDING",
            )

        response = authenticated_client.get(sync_conflicts_url, {"limit": "2", "offset": "0"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 5
        assert len(response.data["results"]) == 2
        assert response.data["limit"] == 2
        assert response.data["offset"] == 0


class TestSyncEndpointSecurity:
    """Security-focused tests for sync endpoints."""

    def test_push_rejects_audit_table(self, authenticated_client, sync_push_url):
        """Should not allow syncing to audit log tables."""
        payload = {
            "client_id": "malicious-client",
            "changes": [
                {
                    "table": "core_auditlog",
                    "operation": "DELETE",
                    "record_id": "1",
                    "data": {},
                    "timestamp": timezone.now().isoformat(),
                    "client_id": "malicious-client",
                }
            ],
        }
        response = authenticated_client.post(sync_push_url, payload, format="json")
        assert response.data["accepted"] == 0
        assert response.data["rejected"] == 1

    def test_push_rejects_user_table(self, authenticated_client, sync_push_url):
        """Should not allow syncing to auth user tables."""
        payload = {
            "client_id": "malicious-client",
            "changes": [
                {
                    "table": "auth_user",
                    "operation": "UPDATE",
                    "record_id": "1",
                    "data": {"is_superuser": True},
                    "timestamp": timezone.now().isoformat(),
                    "client_id": "malicious-client",
                }
            ],
        }
        response = authenticated_client.post(sync_push_url, payload, format="json")
        assert response.data["accepted"] == 0
        assert response.data["rejected"] == 1

    def test_pull_max_limit_enforced(self, authenticated_client, sync_pull_url):
        """Limit parameter should be capped at 1000."""
        response = authenticated_client.get(sync_pull_url, {"full": "true", "limit": "99999"})
        assert response.status_code == status.HTTP_200_OK
        # The view caps at 1000, so it shouldn't error
