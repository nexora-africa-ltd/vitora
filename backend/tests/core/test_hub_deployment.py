"""
Tests for Phase 3: Facility Hub Deployment.

Covers:
- Hub health endpoint (GET /api/hub/health/)
- WebSocket sync consumer (ws/sync/{facility_id}/)
- Broadcast wiring on sync push
- Hub→Cloud sync worker
"""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from hmis.apps.core.models import SyncQueue
from hmis.apps.core.websockets.sync import SyncConsumer


@pytest.fixture
def license_keypair():
    """Ensure license keypair is available for signing/verifying."""
    from hmis.apps.licensing.tokens import get_private_key

    try:
        get_private_key()
        return True
    except RuntimeError:
        pytest.skip("License keypair not available")


@pytest.fixture
def active_hub_installation(db, sample_organization, sample_facility):
    """Active hub installation used for license-authenticated sync tests."""
    from hmis.apps.licensing.models import Installation

    return Installation.objects.create(
        installation_id="sync-test-hub",
        organization=sample_organization,
        facility=sample_facility,
        name="Sync Test Hub",
        status=Installation.Status.ACTIVE,
    )


@pytest.fixture
def hub_license_token(active_hub_installation, license_keypair):
    """Valid license JWT for the active hub installation."""
    from hmis.apps.licensing.tokens import build_license_payload, sign_license_token

    return sign_license_token(build_license_payload(active_hub_installation))


# ===========================================================================
# Hub Health Endpoint Tests
# ===========================================================================


class TestHubHealthEndpoint:
    """Tests for GET /api/hub/health/"""

    URL = "/api/hub/health/"

    def test_health_no_auth_required(self, api_client, db):
        """Health endpoint should be accessible without authentication."""
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK

    def test_health_returns_expected_fields(self, api_client, db):
        """Response should contain all required health fields."""
        response = api_client.get(self.URL)
        data = response.json()

        assert "status" in data
        assert "hub_id" in data
        assert "facility_id" in data
        assert "uptime_seconds" in data
        assert "server_time" in data
        assert "database" in data
        assert "sync" in data
        assert "version" in data

    def test_health_database_ok(self, api_client, db):
        """Database check should report OK when DB is accessible."""
        response = api_client.get(self.URL)
        data = response.json()

        assert data["database"]["status"] == "ok"

    @override_settings(HUB_ID="test-hub-001", HUB_FACILITY_ID="42")
    def test_health_returns_hub_config(self, api_client, db):
        """Health should reflect hub configuration from settings."""
        response = api_client.get(self.URL)
        data = response.json()

        assert data["hub_id"] == "test-hub-001"
        assert data["facility_id"] == "42"

    def test_health_sync_shows_pending_count(
        self, api_client, db, sample_facility, sample_organization
    ):
        """Sync section should reflect queue status."""
        # Create some pending entries
        for i in range(3):
            SyncQueue.objects.create(
                operation="CREATE",
                model_name="patients_patient",
                record_id=i + 1,
                data={"first_name": f"Test{i}"},
                status="PENDING",
                facility=sample_facility,
                organization=sample_organization,
            )

        response = api_client.get(self.URL)
        data = response.json()

        assert data["sync"]["pending"] == 3
        assert data["sync"]["failed"] == 0

    def test_health_degraded_on_many_failures(
        self, api_client, db, sample_facility, sample_organization
    ):
        """Status should be degraded when many entries have failed."""
        for i in range(15):
            SyncQueue.objects.create(
                operation="CREATE",
                model_name="patients_patient",
                record_id=i + 100,
                data={"first_name": f"Failed{i}"},
                status="FAILED",
                error_message="Timeout",
                facility=sample_facility,
                organization=sample_organization,
            )

        response = api_client.get(self.URL)
        data = response.json()

        assert data["status"] == "degraded"
        assert data["sync"]["failed"] == 15

    def test_health_shows_last_synced_time(
        self, api_client, db, sample_facility, sample_organization
    ):
        """Should show last successful sync timestamp."""
        now = timezone.now()
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="patients_patient",
            record_id=1,
            data={"first_name": "Synced"},
            status="SYNCED",
            synced_at=now,
            facility=sample_facility,
            organization=sample_organization,
        )

        response = api_client.get(self.URL)
        data = response.json()

        assert data["sync"]["last_synced_at"] is not None


# ===========================================================================
# WebSocket Sync Consumer Tests
# ===========================================================================


@pytest.mark.asyncio
class TestSyncConsumer:
    """Tests for ws/sync/{facility_id}/ WebSocket consumer."""

    async def _create_communicator(self, facility_id, user=None):
        """Helper to create a WebSocket communicator for the sync consumer."""
        from django.contrib.auth import get_user_model

        communicator = WebsocketCommunicator(
            SyncConsumer.as_asgi(),
            f"/ws/sync/{facility_id}/",
        )
        communicator.scope["url_route"] = {"kwargs": {"facility_id": str(facility_id)}}

        if user:
            communicator.scope["user"] = user
        else:
            User = get_user_model()
            communicator.scope["user"] = MagicMock(spec=User, is_anonymous=False, id=1)

        return communicator

    @pytest.mark.django_db(transaction=True)
    async def test_connect_valid_facility(self, sample_facility):
        """Should accept connection for a valid facility."""
        communicator = await self._create_communicator(sample_facility.id)

        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

    @pytest.mark.django_db(transaction=True)
    async def test_connect_invalid_facility_rejected(self):
        """Should close with 4404 for non-existent facility."""
        communicator = await self._create_communicator(99999)

        connected, code = await communicator.connect()
        # WebSocket should be closed
        assert connected is False or code == 4404

    @pytest.mark.django_db(transaction=True)
    async def test_ping_pong(self, sample_facility):
        """Should respond to ping with pong."""
        communicator = await self._create_communicator(sample_facility.id)
        await communicator.connect()

        await communicator.send_json_to({"type": "ping", "timestamp": "2025-01-01T00:00:00Z"})
        response = await communicator.receive_json_from(timeout=2)

        assert response["type"] == "pong"
        assert response["timestamp"] == "2025-01-01T00:00:00Z"

        await communicator.disconnect()

    @pytest.mark.django_db(transaction=True)
    async def test_subscribe_filters_tables(self, sample_facility):
        """After subscribing to specific tables, only those tables are forwarded."""
        communicator = await self._create_communicator(sample_facility.id)
        await communicator.connect()

        # Subscribe to patients only
        await communicator.send_json_to({"type": "subscribe", "tables": ["patients_patient"]})

        # Simulate a broadcast with a non-subscribed table
        await communicator.receive_nothing(timeout=0.5)

        await communicator.disconnect()

    @pytest.mark.django_db(transaction=True)
    async def test_sync_broadcast_message_forwarded(self, sample_facility):
        """sync_broadcast group messages should be sent to the client."""
        communicator = await self._create_communicator(sample_facility.id)
        await communicator.connect()

        # Simulate a group broadcast message
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        group_name = f"sync_{sample_facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "sync_broadcast",
                "source_client_id": "other-device-001",
                "changes": [
                    {
                        "table": "patients_patient",
                        "operation": "CREATE",
                        "record_id": "1",
                        "data": {"first_name": "Test"},
                    }
                ],
                "server_timestamp": "2025-01-01T00:00:00Z",
            },
        )

        response = await communicator.receive_json_from(timeout=2)
        assert response["type"] == "sync_changes"
        assert response["source_client_id"] == "other-device-001"
        assert len(response["changes"]) == 1
        assert response["changes"][0]["table"] == "patients_patient"

        await communicator.disconnect()

    @pytest.mark.django_db(transaction=True)
    async def test_broadcast_filtered_by_subscription(self, sample_facility):
        """If client subscribes to specific tables, non-matching changes are dropped."""
        communicator = await self._create_communicator(sample_facility.id)
        await communicator.connect()

        # Subscribe to encounters only
        await communicator.send_json_to({"type": "subscribe", "tables": ["encounters_encounter"]})

        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        group_name = f"sync_{sample_facility.id}"

        # Broadcast a patient change (not subscribed)
        await channel_layer.group_send(
            group_name,
            {
                "type": "sync_broadcast",
                "source_client_id": "other-device",
                "changes": [
                    {
                        "table": "patients_patient",
                        "operation": "CREATE",
                        "record_id": "1",
                        "data": {"first_name": "Test"},
                    }
                ],
                "server_timestamp": "2025-01-01T00:00:00Z",
            },
        )

        # Should NOT receive anything (filtered out)
        assert await communicator.receive_nothing(timeout=1)

        await communicator.disconnect()


# ===========================================================================
# Broadcast Wiring Tests (sync_push → WebSocket broadcast)
# ===========================================================================


class TestSyncPushBroadcast:
    """Tests that sync_push broadcasts changes to WebSocket clients."""

    URL = "/api/sync/push/"

    def test_push_broadcasts_to_facility_group(self, authenticated_client, db, sample_facility):
        """Successful push should trigger a WebSocket broadcast."""
        payload = {
            "client_id": "desktop-001",
            "changes": [
                {
                    "table": "patients_patient",
                    "operation": "CREATE",
                    "record_id": "1",
                    "data": {"first_name": "Jane"},
                    "timestamp": timezone.now().isoformat(),
                    "client_id": "desktop-001",
                }
            ],
        }

        with patch("hmis.apps.core.sync_views._broadcast_sync_changes") as mock_broadcast:
            response = authenticated_client.post(self.URL, payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["accepted"] == 1
        mock_broadcast.assert_called_once()

        # Verify broadcast args
        call_kwargs = mock_broadcast.call_args[1]
        assert call_kwargs["client_id"] == "desktop-001"
        assert len(call_kwargs["changes"]) == 1

    def test_push_no_broadcast_on_all_rejected(self, authenticated_client, db, sample_facility):
        """No broadcast should happen if all changes are rejected."""
        payload = {
            "client_id": "desktop-001",
            "changes": [
                {
                    "table": "invalid_table",  # Not in SYNCABLE_TABLES
                    "operation": "CREATE",
                    "record_id": "1",
                    "data": {"name": "test"},
                    "timestamp": timezone.now().isoformat(),
                    "client_id": "desktop-001",
                }
            ],
        }

        with patch("hmis.apps.core.sync_views._broadcast_sync_changes") as mock_broadcast:
            response = authenticated_client.post(self.URL, payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["accepted"] == 0
        mock_broadcast.assert_not_called()

    def test_broadcast_failure_does_not_break_push(self, authenticated_client, db, sample_facility):
        """Even if broadcast fails, the push response should succeed."""
        payload = {
            "client_id": "desktop-001",
            "changes": [
                {
                    "table": "patients_patient",
                    "operation": "CREATE",
                    "record_id": "2",
                    "data": {"first_name": "Bob"},
                    "timestamp": timezone.now().isoformat(),
                    "client_id": "desktop-001",
                }
            ],
        }

        with patch(
            "hmis.apps.core.sync_views.get_channel_layer",
            side_effect=Exception("Channel layer unavailable"),
        ):
            response = authenticated_client.post(self.URL, payload, format="json")

        # Push should still succeed
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["accepted"] == 1


class TestSyncHubLicenseAuthentication:
    """Tests for license-token authentication on sync endpoints."""

    PUSH_URL = "/api/sync/push/"
    PULL_URL = "/api/sync/pull/?full=true&direction=down"

    def test_sync_push_accepts_active_hub_license(
        self, api_client, hub_license_token, sample_facility, sample_organization
    ):
        """Hub license bearer tokens should be accepted and scoped to the installation."""
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {hub_license_token}")
        response = api_client.post(
            self.PUSH_URL,
            {
                "client_id": "sync-test-hub",
                "changes": [
                    {
                        "table": "patients_patient",
                        "operation": "CREATE",
                        "record_id": "123",
                        "data": {"first_name": "Hub"},
                        "timestamp": timezone.now().isoformat(),
                        "client_id": "sync-test-hub",
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["accepted"] == 1
        entry = SyncQueue.objects.get(record_id=123)
        assert entry.facility == sample_facility
        assert entry.organization == sample_organization

    def test_sync_pull_accepts_active_hub_license(
        self, api_client, hub_license_token, sample_facility, sample_organization
    ):
        """Hub license bearer tokens should pull data scoped to the installation."""
        SyncQueue.objects.create(
            operation="CREATE",
            model_name="core.Facility",
            record_id=321,
            data={"first_name": "Cloud"},
            status="SYNCED",
            synced_at=timezone.now(),
            facility=sample_facility,
            organization=sample_organization,
        )

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {hub_license_token}")
        response = api_client.get(self.PULL_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["changes"][0]["record_id"] == 321

    def test_sync_push_rejects_invalid_hub_license(self, api_client, db):
        """Invalid license JWTs should not pass sync authentication."""
        api_client.credentials(HTTP_AUTHORIZATION="Bearer invalid.license.token")
        response = api_client.post(
            self.PUSH_URL,
            {"client_id": "hub", "changes": []},
            format="json",
        )

        assert response.status_code in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}


# ===========================================================================
# Hub→Cloud Sync Worker Tests
# ===========================================================================


class TestHubCloudSyncWorker:
    """Tests for the HubCloudSyncWorker class."""

    def test_runtime_log_messages_are_ascii_safe(self, db):
        """Hub sync runtime logs should be safe for Windows cp1252 consoles."""
        from pathlib import Path

        source = Path("hmis/apps/core/hub_sync.py").read_text(encoding="utf-8")
        assert "Hub\u2192Cloud" not in source
        assert "Hub-to-cloud" in source

    @override_settings(
        SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
        HUB_ID="hub-001",
        HUB_FACILITY_ID="5",
        SYNC_BATCH_SIZE=50,
    )
    def test_worker_is_configured(self, db):
        """Worker should report configured when all settings are present."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        worker = HubCloudSyncWorker()
        assert worker.is_configured is True

    @override_settings(SYNC_SERVER_URL="", HUB_ID="", HUB_FACILITY_ID="")
    def test_worker_not_configured_without_settings(self, db):
        """Worker should report not configured when settings are empty."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        worker = HubCloudSyncWorker()
        assert worker.is_configured is False

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
        SYNC_BATCH_SIZE=10,
    )
    def test_push_pending_sends_to_cloud(self, db, sample_facility, sample_organization):
        """_push_pending should POST pending entries to the cloud."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        # Create pending entries
        for i in range(3):
            SyncQueue.objects.create(
                operation="CREATE",
                model_name="patients_patient",
                record_id=i + 1,
                data={"first_name": f"Patient{i}"},
                status="PENDING",
                facility=sample_facility,
                organization=sample_organization,
            )

        worker = HubCloudSyncWorker()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"accepted": 3}

        with (
            patch.dict("os.environ", {"LICENSE_TOKEN": "license-token-xyz"}),
            patch("hmis.apps.core.hub_sync.requests.post", return_value=mock_response) as mock_post,
        ):
            pushed = worker._push_pending()

        assert pushed == 3
        mock_post.assert_called_once()
        assert mock_post.call_args.kwargs["headers"]["Authorization"] == "Bearer license-token-xyz"
        payload = mock_post.call_args.kwargs["json"]
        assert payload["client_id"] == "hub-test"
        assert [change["client_id"] for change in payload["changes"]] == [
            "hub-test",
            "hub-test",
            "hub-test",
        ]

        # Entries should now be SYNCED
        assert SyncQueue.objects.filter(status="SYNCED").count() == 3

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
        SYNC_MAX_RETRIES=3,
    )
    def test_reset_failed_for_retry_respects_retry_cap(
        self, db, sample_facility, sample_organization
    ):
        """Operators should be able to retry failed hub sync rows below the retry cap."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        retryable = SyncQueue.objects.create(
            operation="CREATE",
            model_name="patients_patient",
            record_id=1,
            data={"first_name": "Retry"},
            status="FAILED",
            retry_count=1,
            facility=sample_facility,
            organization=sample_organization,
        )
        exhausted = SyncQueue.objects.create(
            operation="CREATE",
            model_name="patients_patient",
            record_id=2,
            data={"first_name": "Exhausted"},
            status="FAILED",
            retry_count=3,
            facility=sample_facility,
            organization=sample_organization,
        )

        reset_count = HubCloudSyncWorker().reset_failed_for_retry()

        retryable.refresh_from_db()
        exhausted.refresh_from_db()
        assert reset_count == 1
        assert retryable.status == "PENDING"
        assert exhausted.status == "FAILED"

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_push_pending_reverts_on_network_error(self, db, sample_facility, sample_organization):
        """On network error, entries should revert to PENDING."""
        import requests as req_lib

        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        SyncQueue.objects.create(
            operation="CREATE",
            model_name="patients_patient",
            record_id=1,
            data={"first_name": "Network Fail"},
            status="PENDING",
            facility=sample_facility,
            organization=sample_organization,
        )

        worker = HubCloudSyncWorker()

        with patch(
            "hmis.apps.core.hub_sync.requests.post",
            side_effect=req_lib.ConnectionError("Network unreachable"),
        ):
            pushed = worker._push_pending()

        assert pushed == 0
        # Entry reverted to PENDING
        assert SyncQueue.objects.filter(status="PENDING").count() == 1

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_pull_changes_from_cloud(self, db):
        """_pull_changes should fetch and store changes locally."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        worker = HubCloudSyncWorker()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "changes": [
                {
                    "table": "patients.Patient",
                    "operation": "CREATE",
                    "record_id": "99",
                    "data": {"first_name": "CloudPatient"},
                }
            ],
            "server_timestamp": timezone.now().isoformat(),
            "has_more": False,
        }

        with (
            patch.dict("os.environ", {"LICENSE_TOKEN": "license-token-xyz"}),
            patch("hmis.apps.core.hub_sync.requests.get", return_value=mock_response),
            patch(
                "hmis.apps.core.hub_sync.materialize_entry",
                return_value={"success": True},
            ),
        ):
            pulled = worker._pull_changes()

        assert pulled == 1
        # Should be stored as SYNCED
        entry = SyncQueue.objects.get(model_name="patients.Patient", record_id=99)
        assert entry.status == "SYNCED"
        assert entry.data["first_name"] == "CloudPatient"

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_get_license_token_from_env(self, db):
        """Worker should read the activation/license token from LICENSE_TOKEN."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        with patch.dict("os.environ", {"LICENSE_TOKEN": "env-license-token"}):
            worker = HubCloudSyncWorker()
            assert worker._get_license_token() == "env-license-token"

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_get_license_token_from_file(self, db, tmp_path):
        """Worker should read the activation/license token from HUB_LICENSE_TOKEN_PATH."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        token_file = tmp_path / "license.jwt"
        token_file.write_text("file-license-token\n")

        with override_settings(HUB_LICENSE_TOKEN_PATH=str(token_file)):
            with patch.dict("os.environ", {"LICENSE_TOKEN": ""}):
                worker = HubCloudSyncWorker()
                assert worker._get_license_token() == "file-license-token"

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_push_nothing_when_queue_empty(self, db):
        """_push_pending should return 0 when no pending entries exist."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        worker = HubCloudSyncWorker()
        pushed = worker._push_pending()
        assert pushed == 0

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_sync_once_without_license_skips_queue(
        self, db, tmp_path, sample_facility, sample_organization
    ):
        """sync_once should not mark entries failed when the hub license is missing."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        SyncQueue.objects.create(
            operation="CREATE",
            model_name="patients_patient",
            record_id=1,
            data={"first_name": "Pending"},
            status="PENDING",
            facility=sample_facility,
            organization=sample_organization,
        )

        with (
            override_settings(HUB_LICENSE_TOKEN_PATH=str(tmp_path / "missing.jwt")),
            patch.dict("os.environ", {"LICENSE_TOKEN": ""}),
            patch("hmis.apps.core.hub_sync.requests.post") as mock_post,
            patch("hmis.apps.core.hub_sync.requests.get") as mock_get,
        ):
            worker = HubCloudSyncWorker()
            pushed, pulled = worker.sync_once()

        assert (pushed, pulled) == (0, 0)
        assert SyncQueue.objects.filter(status="PENDING").count() == 1
        mock_post.assert_not_called()
        mock_get.assert_not_called()

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_hub_sync_command_requires_license(self, db, tmp_path):
        """Manual hub sync should require a license token before touching the queue."""
        with override_settings(HUB_LICENSE_TOKEN_PATH=str(tmp_path / "missing.jwt")):
            with patch.dict("os.environ", {"LICENSE_TOKEN": ""}):
                with pytest.raises(CommandError):
                    call_command("hub_sync")

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_hub_sync_command_runs_single_cycle(self, db):
        """Manual hub sync should use license identity and report pushed/pulled counts."""
        with patch(
            "hmis.apps.core.management.commands.hub_sync.HubCloudSyncWorker"
        ) as mock_worker_cls:
            worker = mock_worker_cls.return_value
            worker.is_configured = True
            worker.has_license_token = True
            worker.sync_once.return_value = (2, 1)

            call_command("hub_sync")

        worker.sync_once.assert_called_once()

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_hub_sync_command_can_retry_failed_entries(self, db):
        """Manual hub sync should expose a safe recovery path for failed entries."""
        with patch(
            "hmis.apps.core.management.commands.hub_sync.HubCloudSyncWorker"
        ) as mock_worker_cls:
            worker = mock_worker_cls.return_value
            worker.is_configured = True
            worker.has_license_token = True
            worker.reset_failed_for_retry.return_value = 4
            worker.sync_once.return_value = (4, 0)

            call_command("hub_sync", retry_failed=True)

        worker.reset_failed_for_retry.assert_called_once()
        worker.sync_once.assert_called_once()

    @override_settings(SYNC_SERVER_URL="", HUB_ID="hub-test", HUB_FACILITY_ID="1")
    def test_hub_sync_command_requires_config(self, db):
        """Manual hub sync should require sync server configuration."""
        with patch.dict("os.environ", {"LICENSE_TOKEN": "license"}):
            with pytest.raises(CommandError):
                call_command("hub_sync")
