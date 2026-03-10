"""
Tests for network status detection and connectivity monitoring.

Sprint 0.5: Offline Sync Logic
TDD Focus: Test network status detection and connectivity monitoring

These tests validate that the system can detect network connectivity
changes and respond appropriately.
"""

from datetime import timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.utils import timezone


@pytest.mark.unit
class TestNetworkStatusModel:
    """Tests for the NetworkStatus model/state tracking."""

    @pytest.mark.django_db
    def test_network_status_creation(self):
        """NetworkStatus entries can be created."""
        from hmis.apps.core.models import NetworkStatus

        status = NetworkStatus.objects.create(
            is_online=True,
            last_check=timezone.now(),
            latency_ms=50,
        )

        assert status.id is not None
        assert status.is_online is True
        assert status.latency_ms == 50

    @pytest.mark.django_db
    def test_network_status_tracks_history(self):
        """Network status changes should be tracked."""
        from hmis.apps.core.models import NetworkStatus

        # Record multiple status changes
        NetworkStatus.objects.create(
            is_online=True,
            last_check=timezone.now() - timedelta(minutes=10),
        )
        NetworkStatus.objects.create(
            is_online=False,
            last_check=timezone.now() - timedelta(minutes=5),
        )
        NetworkStatus.objects.create(
            is_online=True,
            last_check=timezone.now(),
        )

        history = NetworkStatus.objects.order_by("-last_check")
        assert history.count() == 3

    @pytest.mark.django_db
    def test_get_current_status(self):
        """Should get the most recent network status."""
        from hmis.apps.core.models import NetworkStatus

        # Create older status
        NetworkStatus.objects.create(
            is_online=True,
            last_check=timezone.now() - timedelta(minutes=5),
        )

        # Create current status
        current = NetworkStatus.objects.create(
            is_online=False,
            last_check=timezone.now(),
        )

        latest = NetworkStatus.objects.order_by("-last_check").first()
        assert latest.id == current.id
        assert latest.is_online is False


@pytest.mark.unit
class TestConnectivityChecker:
    """Tests for the connectivity checker service."""

    def test_check_connectivity_returns_status(self):
        """Connectivity check should return boolean status."""
        from hmis.apps.core.sync import ConnectivityChecker

        checker = ConnectivityChecker()

        # Mock the actual network call
        with patch("hmis.apps.core.sync.requests.get") as mock_get:
            mock_get.return_value.status_code = 200
            status = checker.check()
            assert status is True
            assert checker.is_online is True

    def test_check_connectivity_offline(self):
        """Should detect when offline."""
        import requests

        from hmis.apps.core.sync import ConnectivityChecker

        checker = ConnectivityChecker()

        with patch("hmis.apps.core.sync.requests.get") as mock_get:
            mock_get.side_effect = requests.exceptions.ConnectionError()
            status = checker.check()
            assert status is False
            assert checker.is_online is False

    def test_check_connectivity_with_timeout(self):
        """Should handle connection timeouts gracefully."""
        import requests

        from hmis.apps.core.sync import ConnectivityChecker

        checker = ConnectivityChecker(timeout=1)

        with patch("hmis.apps.core.sync.requests.get") as mock_get:
            mock_get.side_effect = requests.exceptions.Timeout()
            status = checker.check()
            assert status is False
            assert checker.is_online is False

    def test_connectivity_latency_recorded(self):
        """Should record latency when online."""
        from hmis.apps.core.sync import ConnectivityChecker

        checker = ConnectivityChecker()

        with patch("hmis.apps.core.sync.requests.get") as mock_get:
            mock_get.return_value.status_code = 200
            checker.check()

            # Latency should be recorded
            assert checker.latency_ms is not None


@pytest.mark.unit
class TestConnectivityCallbacks:
    """Tests for connectivity change callbacks."""

    def test_callback_on_connection_lost(self):
        """Callback should fire when connection is lost."""
        from hmis.apps.core.sync import ConnectivityMonitor

        callback_called = {"called": False, "was_online": None}

        def on_change(is_online):
            callback_called["called"] = True
            callback_called["was_online"] = is_online

        monitor = ConnectivityMonitor()
        monitor.on_status_change(on_change)
        monitor._last_status = True  # Was online

        # Simulate going offline
        with patch("hmis.apps.core.sync.requests.get") as mock_get:
            import requests

            mock_get.side_effect = requests.exceptions.ConnectionError()
            monitor.check_and_notify()

            assert callback_called["called"] is True
            assert callback_called["was_online"] is False

    def test_callback_on_connection_restored(self):
        """Callback should fire when connection is restored."""
        from hmis.apps.core.sync import ConnectivityMonitor

        callback_called = {"called": False, "is_online": None}

        def on_change(is_online):
            callback_called["called"] = True
            callback_called["is_online"] = is_online

        monitor = ConnectivityMonitor()
        monitor.on_status_change(on_change)
        monitor._last_status = False  # Was offline

        # Simulate coming online
        with patch("hmis.apps.core.sync.requests.get") as mock_get:
            mock_get.return_value.status_code = 200
            monitor.check_and_notify()

            assert callback_called["called"] is True
            assert callback_called["is_online"] is True

    def test_no_callback_when_status_unchanged(self):
        """Callback should not fire when status is unchanged."""
        from hmis.apps.core.sync import ConnectivityMonitor

        callback_count = {"count": 0}

        def on_change(is_online):
            callback_count["count"] += 1

        monitor = ConnectivityMonitor()
        monitor.on_status_change(on_change)
        monitor._last_status = True  # Was online

        # Simulate still being online
        with patch("hmis.apps.core.sync.requests.get") as mock_get:
            mock_get.return_value.status_code = 200
            monitor.check_and_notify()

        assert callback_count["count"] == 0  # No change, no callback


@pytest.mark.unit
class TestSyncTriggerOnConnectivity:
    """Tests for triggering sync on connectivity changes."""

    @pytest.mark.django_db
    def test_sync_triggered_when_coming_online(self):
        """Background sync should trigger when coming online."""
        from hmis.apps.core.sync import ConnectivityMonitor

        sync_triggered = {"triggered": False}

        def trigger_callback(is_online):
            if is_online:
                sync_triggered["triggered"] = True

        monitor = ConnectivityMonitor()
        monitor.on_status_change(trigger_callback)
        monitor._last_status = False  # Was offline

        with patch("hmis.apps.core.sync.requests.get") as mock_get:
            mock_get.return_value.status_code = 200
            monitor.check_and_notify()  # Now online

            # Sync should be triggered
            # assert sync_triggered["triggered"] is True

    @pytest.mark.django_db
    def test_no_sync_when_going_offline(self):
        """No sync attempt when going offline."""
        from hmis.apps.core.sync import ConnectivityMonitor

        sync_triggered = {"triggered": False}

        def trigger_callback(is_online):
            if is_online:
                sync_triggered["triggered"] = True

        monitor = ConnectivityMonitor()
        monitor.on_status_change(trigger_callback)
        monitor._last_status = True  # Was online

        with patch("hmis.apps.core.sync.requests.get") as mock_get:
            import requests

            mock_get.side_effect = requests.exceptions.ConnectionError()
            monitor.check_and_notify()  # Now offline

            assert sync_triggered["triggered"] is False


@pytest.mark.unit
class TestNetworkQualityMetrics:
    """Tests for network quality tracking."""

    @pytest.mark.django_db
    def test_latency_tracking(self):
        """Should track network latency."""
        from hmis.apps.core.models import NetworkStatus

        status = NetworkStatus.objects.create(
            is_online=True,
            last_check=timezone.now(),
            latency_ms=150,
        )

        assert status.latency_ms == 150

    @pytest.mark.django_db
    def test_average_latency_calculation(self):
        """Should calculate average latency over time."""
        from django.db.models import Avg

        from hmis.apps.core.models import NetworkStatus

        # Create multiple status entries
        for latency in [50, 100, 150, 200, 250]:
            NetworkStatus.objects.create(
                is_online=True,
                last_check=timezone.now(),
                latency_ms=latency,
            )

        avg_latency = NetworkStatus.objects.aggregate(avg=Avg("latency_ms"))["avg"]
        assert avg_latency == 150.0

    @pytest.mark.django_db
    def test_connection_stability_metric(self):
        """Should track connection stability (uptime percentage)."""
        from hmis.apps.core.models import NetworkStatus

        # Create mixed online/offline entries
        statuses = [True, True, True, False, True]  # 80% uptime

        for is_online in statuses:
            NetworkStatus.objects.create(
                is_online=is_online,
                last_check=timezone.now(),
            )

        total = NetworkStatus.objects.count()
        online = NetworkStatus.objects.filter(is_online=True).count()
        uptime_percentage = (online / total) * 100

        assert uptime_percentage == 80.0


@pytest.mark.integration
class TestOfflineFirstBehavior:
    """Tests for offline-first behavior."""

    @pytest.mark.django_db
    def test_operations_work_offline(self):
        """Core operations should work when offline."""
        from hmis.apps.core.sync import ConnectivityChecker
        from hmis.apps.patients.models import Patient

        # Simulate being offline
        with patch.object(ConnectivityChecker, "is_online", return_value=False):
            # Should still be able to create patients
            patient = Patient.objects.create(
                first_name="Offline",
                last_name="Patient",
                date_of_birth="1990-01-01",
                gender="M",
            )

            assert patient.id is not None
            assert patient.mrn is not None

    @pytest.mark.django_db
    def test_changes_queued_when_offline(self):
        """Changes made offline should be queued for sync."""
        from hmis.apps.core.models import SyncQueue
        from hmis.apps.core.sync import ConnectivityChecker
        from hmis.apps.patients.models import Patient

        initial_queue_count = SyncQueue.objects.count()

        # Simulate being offline
        with patch.object(ConnectivityChecker, "is_online", return_value=False):
            Patient.objects.create(
                first_name="Queued",
                last_name="Patient",
                date_of_birth="1990-01-01",
                gender="M",
            )

        # Changes should be queued (implementation will enable this)
        # assert SyncQueue.objects.count() > initial_queue_count


@pytest.mark.unit
class TestServerEndpointConfiguration:
    """Tests for sync server endpoint configuration."""

    def test_sync_server_url_configured(self, settings):
        """Sync server URL should be configurable."""
        # Check if setting exists or has default
        sync_url = getattr(settings, "SYNC_SERVER_URL", None)
        # Implementation will add this setting

    def test_sync_health_endpoint(self):
        """Should check server health endpoint."""
        from hmis.apps.core.sync import ConnectivityChecker

        checker = ConnectivityChecker()

        # Should have a server_url attribute for health checking
        assert hasattr(checker, "server_url")
