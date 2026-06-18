"""
Tests for Phase 5: Hardening.

Covers:
- Remote wipe endpoints (POST /api/hub/wipe/, GET /api/hub/wipe-check/)
- Sync dashboard endpoint (GET /api/sync/dashboard/)
- Sync queue pruning management command
- Hub cloud sync worker license-token authentication
"""

from datetime import timedelta
from io import StringIO
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from hmis.apps.core.hub_sync import HubCloudSyncWorker
from hmis.apps.core.hub_views import _wipe_requested
from hmis.apps.core.models import SyncConflict, SyncQueue


@pytest.fixture()
def admin_user(db):
    """A superuser / admin for admin-only endpoints."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_superuser(
        username="adminuser",
        email="admin@example.com",
        password="adminpass123",
    )


@pytest.fixture()
def admin_client(admin_user):
    """APIClient authenticated as an admin (is_staff=True, is_superuser=True)."""
    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


# ===========================================================================
# Remote Wipe Tests
# ===========================================================================


class TestRemoteWipe:
    """Tests for remote wipe endpoints."""

    WIPE_URL = "/api/hub/wipe/"
    WIPE_CHECK_URL = "/api/hub/wipe-check/"

    def test_wipe_requires_admin(self, authenticated_client, db):
        """POST /api/hub/wipe/ should reject non-admin users."""
        response = authenticated_client.post(self.WIPE_URL, {"hub_id": "test-hub"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_wipe_accepts_admin(self, admin_client, db):
        """POST /api/hub/wipe/ should accept admin users."""
        response = admin_client.post(
            self.WIPE_URL,
            {"hub_id": "test-hub-001", "reason": "Stolen device"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "wipe_requested"
        assert data["hub_id"] == "test-hub-001"
        # Clean up
        _wipe_requested.pop("test-hub-001", None)

    def test_wipe_requires_hub_id(self, admin_client, db):
        """POST /api/hub/wipe/ should reject missing hub_id."""
        response = admin_client.post(self.WIPE_URL, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_wipe_creates_sync_queue_entry(self, admin_client, db):
        """Remote wipe should persist a SyncQueue entry for restart resilience."""
        response = admin_client.post(
            self.WIPE_URL,
            {"hub_id": "persist-hub", "reason": "Lost"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        entry = (
            SyncQueue.objects.filter(
                model_name="__remote_wipe__",
            )
            .filter(data__hub_id="persist-hub")
            .first()
        )
        assert entry is not None
        assert entry.status == "PENDING"
        assert entry.data["reason"] == "Lost"
        # Clean up
        entry.delete()
        _wipe_requested.pop("persist-hub", None)

    @override_settings(HUB_ID="my-hub-123")
    def test_wipe_check_returns_false_when_no_wipe(self, api_client, db):
        """GET /api/hub/wipe-check/ should return false when no wipe requested."""
        response = api_client.get(self.WIPE_CHECK_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["wipe_requested"] is False

    @override_settings(HUB_ID="flagged-hub")
    def test_wipe_check_detects_in_memory_flag(self, api_client, db):
        """GET /api/hub/wipe-check/ should detect in-memory wipe flag."""
        _wipe_requested["flagged-hub"] = "admin"
        try:
            response = api_client.get(self.WIPE_CHECK_URL)
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["wipe_requested"] is True
            assert data["requested_by"] == "admin"
        finally:
            _wipe_requested.pop("flagged-hub", None)

    @override_settings(HUB_ID="persisted-hub")
    def test_wipe_check_detects_persisted_entry(self, api_client, db):
        """GET /api/hub/wipe-check/ should detect SyncQueue wipe entries."""
        entry = SyncQueue.objects.create(
            model_name="__remote_wipe__",
            record_id=None,
            operation="DELETE",
            data={"hub_id": "persisted-hub", "requested_by": "cloud-admin"},
            status="PENDING",
        )
        try:
            response = api_client.get(self.WIPE_CHECK_URL)
            data = response.json()
            assert data["wipe_requested"] is True
            assert data["requested_by"] == "cloud-admin"
        finally:
            entry.delete()

    def test_wipe_check_no_auth_required(self, api_client, db):
        """GET /api/hub/wipe-check/ should be accessible without authentication."""
        response = api_client.get(self.WIPE_CHECK_URL)
        assert response.status_code == status.HTTP_200_OK


# ===========================================================================
# Sync Dashboard Tests
# ===========================================================================


class TestSyncDashboard:
    """Tests for GET /api/sync/dashboard/"""

    URL = "/api/sync/dashboard/"

    def test_dashboard_requires_auth(self, api_client, db):
        """Dashboard endpoint should require authentication."""
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_dashboard_returns_structure(self, authenticated_client, db):
        """Dashboard should return queue_summary, throughput, health, conflicts."""
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert "queue_summary" in data
        assert "throughput" in data
        assert "health" in data
        assert "conflicts" in data

        # Verify queue summary keys
        for key in ["PENDING", "SYNCING", "SYNCED", "FAILED", "CONFLICT"]:
            assert key in data["queue_summary"]

    def test_dashboard_counts_statuses(self, authenticated_client, sample_facility, db):
        """Dashboard should correctly count entries by status."""
        # Create test entries scoped to the test user's facility
        SyncQueue.objects.create(
            model_name="patients_patient",
            operation="CREATE",
            record_id=5001,
            data={},
            status="PENDING",
            facility=sample_facility,
        )
        SyncQueue.objects.create(
            model_name="patients_patient",
            operation="UPDATE",
            record_id=5002,
            data={},
            status="SYNCED",
            synced_at=timezone.now(),
            facility=sample_facility,
        )
        SyncQueue.objects.create(
            model_name="patients_patient",
            operation="UPDATE",
            record_id=5003,
            data={},
            status="FAILED",
            error_message="timeout",
            facility=sample_facility,
        )

        response = authenticated_client.get(self.URL)
        data = response.json()

        assert data["queue_summary"]["PENDING"] >= 1
        assert data["queue_summary"]["SYNCED"] >= 1
        assert data["queue_summary"]["FAILED"] >= 1

    def test_dashboard_throughput_counts(self, authenticated_client, sample_facility, db):
        """Dashboard should count entries synced in last hour."""
        SyncQueue.objects.create(
            model_name="encounters_encounter",
            operation="CREATE",
            record_id=6001,
            data={},
            status="SYNCED",
            synced_at=timezone.now(),
            facility=sample_facility,
        )

        response = authenticated_client.get(self.URL)
        data = response.json()

        assert data["throughput"]["synced_last_hour"] >= 1
        assert data["throughput"]["synced_last_day"] >= 1

    def test_dashboard_stale_entries(self, authenticated_client, sample_facility, db):
        """Dashboard should count stale PENDING entries older than 1 hour."""
        entry = SyncQueue.objects.create(
            model_name="patients_patient",
            operation="CREATE",
            record_id=7001,
            data={},
            status="PENDING",
            facility=sample_facility,
        )
        # Backdate the entry
        SyncQueue.objects.filter(pk=entry.pk).update(created_at=timezone.now() - timedelta(hours=2))

        response = authenticated_client.get(self.URL)
        data = response.json()

        assert data["health"]["stale_entries"] >= 1

    def test_dashboard_conflict_summary(self, authenticated_client, db):
        """Dashboard should include conflict counts and recent conflicts."""
        SyncConflict.objects.create(
            model_name="patients_patient",
            record_id=8001,
            field_name="first_name",
            local_data={"first_name": "John"},
            remote_data={"first_name": "Jane"},
            status="PENDING",
        )

        response = authenticated_client.get(self.URL)
        data = response.json()

        assert data["conflicts"]["total_pending"] >= 1
        assert len(data["conflicts"]["by_model"]) >= 1


# ===========================================================================
# Sync Queue Pruning Tests
# ===========================================================================


class TestPruneSyncQueue:
    """Tests for the prune_sync_queue management command."""

    def test_prune_deletes_old_synced(self, db):
        """Should delete SYNCED entries older than retention period."""
        old = SyncQueue.objects.create(
            model_name="patients_patient",
            operation="CREATE",
            record_id=1001,
            data={},
            status="SYNCED",
            synced_at=timezone.now() - timedelta(hours=48),
        )
        SyncQueue.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(hours=48))

        recent = SyncQueue.objects.create(
            model_name="patients_patient",
            operation="UPDATE",
            record_id=1002,
            data={},
            status="SYNCED",
            synced_at=timezone.now(),
        )

        out = StringIO()
        call_command("prune_sync_queue", "--hours=24", stdout=out)

        assert not SyncQueue.objects.filter(pk=old.pk).exists()
        assert SyncQueue.objects.filter(pk=recent.pk).exists()
        assert "synced" in out.getvalue().lower()

    def test_prune_marks_max_retries_as_failed(self, db):
        """Should mark entries with high retry count as permanently FAILED."""
        entry = SyncQueue.objects.create(
            model_name="encounters_encounter",
            operation="UPDATE",
            record_id=2001,
            data={},
            status="PENDING",
            retry_count=15,
        )

        out = StringIO()
        call_command("prune_sync_queue", stdout=out)

        entry.refresh_from_db()
        assert entry.status == "FAILED"
        assert entry.error_message == "Max retries exceeded"

    def test_prune_dry_run(self, db):
        """Dry run should report but not delete."""
        old = SyncQueue.objects.create(
            model_name="patients_patient",
            operation="CREATE",
            record_id=3001,
            data={},
            status="SYNCED",
            synced_at=timezone.now() - timedelta(hours=48),
        )

        out = StringIO()
        call_command("prune_sync_queue", "--hours=24", "--dry-run", stdout=out)

        # Entry should still exist
        assert SyncQueue.objects.filter(pk=old.pk).exists()
        assert "DRY RUN" in out.getvalue()

    def test_prune_deletes_old_failed(self, db):
        """Should delete FAILED entries older than 7 days."""
        entry = SyncQueue.objects.create(
            model_name="patients_patient",
            operation="UPDATE",
            record_id=4001,
            data={},
            status="FAILED",
            error_message="timeout",
        )
        SyncQueue.objects.filter(pk=entry.pk).update(created_at=timezone.now() - timedelta(days=10))

        out = StringIO()
        call_command("prune_sync_queue", stdout=out)

        assert not SyncQueue.objects.filter(pk=entry.pk).exists()


# ===========================================================================
# Hub Cloud Sync Worker — License Token Auth Tests
# ===========================================================================


class TestHubCloudSyncLicenseAuth:
    """Tests for license-token authentication in HubCloudSyncWorker."""

    def test_get_auth_headers_uses_license_token_env(self):
        """_get_auth_headers() should present the hub license token."""
        worker = HubCloudSyncWorker()

        with patch.dict("os.environ", {"LICENSE_TOKEN": "license-token-123"}):
            headers = worker._get_auth_headers()

        assert headers == {"Authorization": "Bearer license-token-123"}

    def test_get_auth_headers_uses_license_token_file(self, tmp_path):
        """_get_auth_headers() should read the activation token file when env is empty."""
        worker = HubCloudSyncWorker()
        token_file = tmp_path / "license.jwt"
        token_file.write_text("file-license-token")

        with override_settings(HUB_LICENSE_TOKEN_PATH=str(token_file)):
            with patch.dict("os.environ", {"LICENSE_TOKEN": ""}):
                headers = worker._get_auth_headers()

        assert headers == {"Authorization": "Bearer file-license-token"}

    def test_no_auth_headers_without_license_token(self, tmp_path):
        """Missing license token should produce no Authorization header."""
        worker = HubCloudSyncWorker()

        with override_settings(HUB_LICENSE_TOKEN_PATH=str(tmp_path / "missing.jwt")):
            with patch.dict("os.environ", {"LICENSE_TOKEN": ""}):
                assert worker._get_auth_headers() == {}
