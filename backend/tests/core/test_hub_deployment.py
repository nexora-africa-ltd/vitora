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
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from hmis.apps.core.models import SyncQueue
from hmis.apps.core.websockets.sync import SyncConsumer

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


# ===========================================================================
# Hub→Cloud Sync Worker Tests
# ===========================================================================


class TestHubCloudSyncWorker:
    """Tests for the HubCloudSyncWorker class."""

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
        worker._auth_token = "test-token"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"accepted": 3}

        with patch(
            "hmis.apps.core.hub_sync.requests.post", return_value=mock_response
        ) as mock_post:
            pushed = worker._push_pending()

        assert pushed == 3
        mock_post.assert_called_once()

        # Entries should now be SYNCED
        assert SyncQueue.objects.filter(status="SYNCED").count() == 3

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
        worker._auth_token = "test-token"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "changes": [
                {
                    "table": "patients_patient",
                    "operation": "CREATE",
                    "record_id": "99",
                    "data": {"first_name": "CloudPatient"},
                }
            ],
            "server_timestamp": timezone.now().isoformat(),
            "has_more": False,
        }

        with patch("hmis.apps.core.hub_sync.requests.get", return_value=mock_response):
            pulled = worker._pull_changes()

        assert pulled == 1
        # Should be stored as SYNCED
        entry = SyncQueue.objects.get(model_name="patients_patient", record_id=99)
        assert entry.status == "SYNCED"
        assert entry.data["first_name"] == "CloudPatient"

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_authenticate_success(self, db):
        """authenticate() should store the access token on success."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        worker = HubCloudSyncWorker()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"access": "jwt-token-xyz", "refresh": "ref-123"}

        with patch("hmis.apps.core.hub_sync.requests.post", return_value=mock_response):
            result = worker.authenticate("hub-user", "hub-pass")

        assert result is True
        assert worker._auth_token == "jwt-token-xyz"

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com/api/sync",
        HUB_ID="hub-test",
        HUB_FACILITY_ID="1",
    )
    def test_authenticate_failure(self, db):
        """authenticate() should return False on 401."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        worker = HubCloudSyncWorker()

        mock_response = MagicMock()
        mock_response.status_code = 401

        with patch("hmis.apps.core.hub_sync.requests.post", return_value=mock_response):
            result = worker.authenticate("bad-user", "bad-pass")

        assert result is False
        assert worker._auth_token == ""

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
