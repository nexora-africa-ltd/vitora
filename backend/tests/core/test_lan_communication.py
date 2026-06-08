"""
Tests for Phase 4: Real-Time LAN Communication.

Covers:
- Hub discovery service (mDNS + UDP responder)
- WebSocket sync consumer message filtering
- Short-polling integration via sync_pull
"""

import json
import socket
import threading
import time
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from channels.testing import WebsocketCommunicator
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from hmis.apps.core.hub_discovery import DISCOVERY_MAGIC, DISCOVERY_UDP_PORT, HubDiscoveryService
from hmis.apps.core.websockets.sync import SyncConsumer

# ===========================================================================
# UDP Discovery Responder Tests
# ===========================================================================


class TestUDPDiscoveryResponder:
    """Tests for the UDP broadcast discovery responder."""

    @override_settings(
        HUB_ID="test-hub-udp",
        HUB_FACILITY_ID="42",
        HUB_FACILITY_NAME="Test Clinic",
        HUB_PORT=19999,
    )
    def test_udp_responds_to_discovery_probe(self, db):
        """Hub should respond to VITORA_DISCOVER probes with JSON info."""
        service = HubDiscoveryService()
        # Override port for test to avoid conflicts
        test_port = _find_free_udp_port()

        # Patch the constant for the test
        with patch("hmis.apps.core.hub_discovery.DISCOVERY_UDP_PORT", test_port):
            service._udp_stop.clear()
            # Start responder on test port
            thread = threading.Thread(target=service._udp_listen_loop, daemon=True)
            thread.start()

            # Wait for responder to bind
            time.sleep(0.3)

            try:
                # Send discovery probe
                client_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                client_sock.settimeout(3.0)
                client_sock.sendto(DISCOVERY_MAGIC, ("127.0.0.1", test_port))

                # Receive response
                data, _ = client_sock.recvfrom(4096)
                response = json.loads(data.decode("utf-8"))

                assert "url" in response
                assert response["hub_id"] == "test-hub-udp"
                assert response["facility_id"] == "42"
                assert response["facility_name"] == "Test Clinic"
                assert response["version"] == "0.3.0"

                client_sock.close()
            finally:
                service._udp_stop.set()
                thread.join(timeout=3)

    @override_settings(HUB_ID="test-hub", HUB_FACILITY_ID="1", HUB_PORT=9088)
    def test_udp_ignores_non_discovery_messages(self, db):
        """Hub should ignore messages that don't match the magic string."""
        service = HubDiscoveryService()
        test_port = _find_free_udp_port()

        with patch("hmis.apps.core.hub_discovery.DISCOVERY_UDP_PORT", test_port):
            service._udp_stop.clear()
            thread = threading.Thread(target=service._udp_listen_loop, daemon=True)
            thread.start()
            time.sleep(0.3)

            try:
                client_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                client_sock.settimeout(1.5)
                client_sock.sendto(b"RANDOM_JUNK", ("127.0.0.1", test_port))

                # Should NOT receive any response
                with pytest.raises(TimeoutError):
                    client_sock.recvfrom(4096)

                client_sock.close()
            finally:
                service._udp_stop.set()
                thread.join(timeout=3)

    @override_settings(HUB_ID="test-hub", HUB_FACILITY_ID="1", HUB_PORT=9088)
    def test_service_start_stop(self, db):
        """Service should start and stop cleanly."""
        with patch("hmis.apps.core.hub_discovery.DISCOVERY_UDP_PORT", _find_free_udp_port()):
            service = HubDiscoveryService()
            # Mock zeroconf to avoid real network registration
            with patch.dict("sys.modules", {"zeroconf": MagicMock()}):
                service.start()
                assert service._udp_thread is not None
                assert service._udp_thread.is_alive()

                service.stop()
                time.sleep(0.5)
                assert not service._udp_thread.is_alive()


# ===========================================================================
# mDNS Advertisement Tests
# ===========================================================================


class TestMDNSAdvertisement:
    """Tests for mDNS/zeroconf service advertisement."""

    @override_settings(
        HUB_ID="mdns-hub",
        HUB_FACILITY_ID="99",
        HUB_FACILITY_NAME="mDNS Clinic",
        HUB_PORT=9088,
    )
    def test_mdns_registers_service_when_zeroconf_available(self, db):
        """Should register _vitora._tcp.local when zeroconf is importable."""
        mock_zeroconf_module = MagicMock()
        mock_zc_instance = MagicMock()
        mock_zeroconf_module.Zeroconf.return_value = mock_zc_instance
        mock_zeroconf_module.ServiceInfo = MagicMock()

        service = HubDiscoveryService()

        with patch.dict("sys.modules", {"zeroconf": mock_zeroconf_module}):
            with patch.object(service, "_get_local_ip", return_value="192.168.1.50"):
                service._start_mdns()

        # Verify registration was called
        mock_zc_instance.register_service.assert_called_once()

    @override_settings(HUB_ID="no-zc-hub", HUB_FACILITY_ID="1", HUB_PORT=9088)
    def test_mdns_graceful_when_zeroconf_not_installed(self, db):
        """Should not crash when zeroconf is not installed."""
        service = HubDiscoveryService()
        # Simulate ImportError
        with patch.dict("sys.modules", {"zeroconf": None}):
            # This should not raise
            service._start_mdns()
            assert service._zeroconf is None

    @override_settings(HUB_ID="no-ip-hub", HUB_FACILITY_ID="1", HUB_PORT=9088)
    def test_mdns_skips_when_no_local_ip(self, db):
        """Should skip mDNS when local IP cannot be determined."""
        service = HubDiscoveryService()
        with patch.object(service, "_get_local_ip", return_value=None):
            service._start_mdns()
            assert service._zeroconf is None


# ===========================================================================
# WebSocket Message Routing Tests
# ===========================================================================


@pytest.mark.asyncio
class TestSyncConsumerMessageRouting:
    """Tests for sync consumer message types and filtering."""

    async def _create_communicator(self, facility_id, user=None):
        """Create a WebSocket communicator for the sync consumer."""
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
    async def test_multiple_tables_broadcast(self, sample_facility):
        """Broadcast with multiple table changes should forward all."""
        communicator = await self._create_communicator(sample_facility.id)
        await communicator.connect()

        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        group_name = f"sync_{sample_facility.id}"

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
                        "data": {},
                    },
                    {
                        "table": "encounters_encounter",
                        "operation": "UPDATE",
                        "record_id": "5",
                        "data": {},
                    },
                    {
                        "table": "pharmacy_prescription",
                        "operation": "CREATE",
                        "record_id": "3",
                        "data": {},
                    },
                ],
                "server_timestamp": "2025-01-01T00:00:00Z",
            },
        )

        response = await communicator.receive_json_from(timeout=2)
        assert response["type"] == "sync_changes"
        assert len(response["changes"]) == 3
        assert response["changes"][0]["table"] == "patients_patient"
        assert response["changes"][1]["table"] == "encounters_encounter"
        assert response["changes"][2]["table"] == "pharmacy_prescription"

        await communicator.disconnect()

    @pytest.mark.django_db(transaction=True)
    async def test_subscribe_then_receive_only_subscribed(self, sample_facility):
        """After subscribe, only subscribed table changes come through."""
        communicator = await self._create_communicator(sample_facility.id)
        await communicator.connect()

        # Subscribe to only lab results
        await communicator.send_json_to({"type": "subscribe", "tables": ["laboratory_labresult"]})

        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        group_name = f"sync_{sample_facility.id}"

        # Send mix of tables
        await channel_layer.group_send(
            group_name,
            {
                "type": "sync_broadcast",
                "source_client_id": "other",
                "changes": [
                    {
                        "table": "patients_patient",
                        "operation": "CREATE",
                        "record_id": "1",
                        "data": {},
                    },
                    {
                        "table": "laboratory_labresult",
                        "operation": "CREATE",
                        "record_id": "10",
                        "data": {},
                    },
                ],
                "server_timestamp": "2025-01-01T00:00:00Z",
            },
        )

        response = await communicator.receive_json_from(timeout=2)
        # Only the lab result should come through
        assert len(response["changes"]) == 1
        assert response["changes"][0]["table"] == "laboratory_labresult"

        await communicator.disconnect()

    @pytest.mark.django_db(transaction=True)
    async def test_reset_subscription_to_all(self, sample_facility):
        """Sending subscribe with null tables resets to all tables."""
        import asyncio

        communicator = await self._create_communicator(sample_facility.id)
        await communicator.connect()

        # Subscribe to specific
        await communicator.send_json_to({"type": "subscribe", "tables": ["patients_patient"]})

        # Wait for subscribe to be processed
        await asyncio.sleep(0.1)

        # Reset to all
        await communicator.send_json_to({"type": "subscribe", "tables": None})

        # Wait for reset to be processed
        await asyncio.sleep(0.1)

        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        group_name = f"sync_{sample_facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "sync_broadcast",
                "source_client_id": "other",
                "changes": [
                    {
                        "table": "encounters_encounter",
                        "operation": "CREATE",
                        "record_id": "1",
                        "data": {},
                    },
                ],
                "server_timestamp": "2025-01-01T00:00:00Z",
            },
        )

        response = await communicator.receive_json_from(timeout=2)
        assert len(response["changes"]) == 1
        assert response["changes"][0]["table"] == "encounters_encounter"

        await communicator.disconnect()


# ===========================================================================
# Short-Polling Integration Tests
# ===========================================================================


class TestShortPollingFallback:
    """Tests that the sync pull endpoint works for short-polling clients."""

    def test_pull_with_short_interval_returns_fast(
        self, authenticated_client, db, synced_queue_entries
    ):
        """Pull endpoint should respond quickly for polling clients."""
        import time

        start = time.time()
        response = authenticated_client.get("/api/sync/pull/?since=2020-01-01T00:00:00Z&limit=50")
        elapsed = time.time() - start

        assert response.status_code == status.HTTP_200_OK
        # Should respond in under 5s (generous for CI; LAN is <100ms)
        assert elapsed < 5.0
        assert "changes" in response.json()

    def test_pull_empty_when_no_new_changes(self, authenticated_client, db):
        """Pull with future timestamp should return empty changes."""
        future = "2099-01-01T00:00:00Z"
        response = authenticated_client.get(f"/api/sync/pull/?since={future}&limit=50")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["changes"]) == 0


# ===========================================================================
# Helpers
# ===========================================================================


@pytest.fixture
def synced_queue_entries(db, sample_facility, sample_organization):
    """Create synced queue entries for pull testing."""
    from datetime import timedelta

    from hmis.apps.core.models import SyncQueue

    now = timezone.now()
    entries = []
    for i in range(5):
        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="patients_patient",
            record_id=200 + i,
            data={"first_name": f"PollPatient{i}", "last_name": "Test"},
            status="SYNCED",
            synced_at=now - timedelta(minutes=10 - i),
            facility=sample_facility,
            organization=sample_organization,
        )
        entries.append(entry)
    return entries


def _find_free_udp_port() -> int:
    """Find a free UDP port for testing."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port
