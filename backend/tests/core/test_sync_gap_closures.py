"""Tests for gap-closure features: persistent pull state, priority push, migration command."""

import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest  # type: ignore
from django.test import override_settings
from django.utils import timezone

from hmis.apps.core.models import SyncQueue

pytestmark = pytest.mark.django_db


class TestPersistentPullTimestamp:
    """Hub sync worker should persist last_pull_timestamp across restarts."""

    def test_state_file_written_after_pull(self, tmp_path):
        """After a successful pull, state file should contain last_pull_timestamp."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        with override_settings(
            SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
            HUB_ID="test-hub-1",
            HUB_FACILITY_ID="1",
            HUB_DATA_DIR=str(tmp_path),
        ):
            worker = HubCloudSyncWorker()

            # Simulate a successful pull timestamp update
            ts = datetime(2026, 6, 12, 10, 30, 0)
            worker._last_pull_timestamp = ts
            worker._save_state()

            # Verify file written
            state_file = tmp_path / ".hub_sync_state.json"
            assert state_file.exists()
            state = json.loads(state_file.read_text())
            assert state["last_pull_timestamp"] == ts.isoformat()

    def test_state_file_restored_on_init(self, tmp_path):
        """Worker should restore last_pull_timestamp from disk on initialization."""
        from hmis.apps.core.hub_sync import SYNC_STATE_FILENAME

        # Write a state file
        ts = "2026-06-12T09:00:00"
        state_file = tmp_path / SYNC_STATE_FILENAME
        state_file.write_text(json.dumps({"last_pull_timestamp": ts}))

        with override_settings(
            SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
            HUB_ID="test-hub-1",
            HUB_FACILITY_ID="1",
            HUB_DATA_DIR=str(tmp_path),
        ):
            from hmis.apps.core.hub_sync import HubCloudSyncWorker

            worker = HubCloudSyncWorker()
            assert worker._last_pull_timestamp == datetime.fromisoformat(ts)

    def test_missing_state_file_does_not_crash(self, tmp_path):
        """Worker should handle missing state file gracefully (first run)."""
        with override_settings(
            SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
            HUB_ID="test-hub-1",
            HUB_FACILITY_ID="1",
            HUB_DATA_DIR=str(tmp_path),
        ):
            from hmis.apps.core.hub_sync import HubCloudSyncWorker

            worker = HubCloudSyncWorker()
            assert worker._last_pull_timestamp is None

    def test_corrupted_state_file_handled_gracefully(self, tmp_path):
        """Worker should handle corrupted state file without crashing."""
        from hmis.apps.core.hub_sync import SYNC_STATE_FILENAME

        state_file = tmp_path / SYNC_STATE_FILENAME
        state_file.write_text("NOT VALID JSON {{{")

        with override_settings(
            SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
            HUB_ID="test-hub-1",
            HUB_FACILITY_ID="1",
            HUB_DATA_DIR=str(tmp_path),
        ):
            from hmis.apps.core.hub_sync import HubCloudSyncWorker

            worker = HubCloudSyncWorker()
            assert worker._last_pull_timestamp is None


class TestPriorityBasedPush:
    """Push should order entries by priority (lower first) then created_at."""

    @override_settings(
        SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
        HUB_ID="test-hub",
        HUB_FACILITY_ID="1",
        SYNC_BATCH_SIZE=10,
    )
    def test_push_orders_by_priority_then_created_at(self, sample_organization, sample_facility):
        """Lower-priority entries should be pushed first."""
        from hmis.apps.core.hub_sync import HubCloudSyncWorker

        SyncQueue.objects.all().delete()

        # Create entries with different priorities (lower = more important)
        now = timezone.now()
        entry_low_priority = SyncQueue.objects.create(
            operation="CREATE",
            model_name="core.AuditLog",
            record_id=1,
            data={"id": 1, "sync_meta": {"priority": 5, "direction": "up"}},
            status="PENDING",
            organization=sample_organization,
            facility=sample_facility,
            created_at=now - timedelta(minutes=1),
        )
        entry_high_priority = SyncQueue.objects.create(
            operation="CREATE",
            model_name="patients.Patient",
            record_id=2,
            data={"id": 2, "sync_meta": {"priority": 3, "direction": "up"}},
            status="PENDING",
            organization=sample_organization,
            facility=sample_facility,
            created_at=now,
        )
        entry_highest_priority = SyncQueue.objects.create(
            operation="UPDATE",
            model_name="core.Organization",
            record_id=3,
            data={"id": 3, "sync_meta": {"priority": 1, "direction": "both"}},
            status="PENDING",
            organization=sample_organization,
            facility=sample_facility,
            created_at=now + timedelta(minutes=1),
        )

        worker = HubCloudSyncWorker()

        # Mock the HTTP call to capture what gets sent
        with patch.object(worker, "_post") as mock_post:
            mock_response = type("Response", (), {"status_code": 200, "json": lambda: {}})()
            mock_post.return_value = mock_response
            pushed = worker._push_pending()

        assert pushed == 3
        # Verify the call was made with entries ordered by priority
        call_args = mock_post.call_args
        changes = call_args[1]["json"]["changes"]
        priorities = [c["data"].get("sync_meta", {}).get("priority", 99) for c in changes]
        assert priorities == sorted(priorities), f"Expected sorted priorities, got {priorities}"


class TestEncryptionKeyInActivation:
    """Activation bootstrap response should include encryption_key."""

    def test_activation_response_includes_encryption_key(self):
        """build_activation_bootstrap_payload should include encryption_key."""
        from unittest.mock import MagicMock, patch

        from hmis.apps.licensing.bootstrap import build_activation_bootstrap_payload

        installation = MagicMock()
        installation.installation_id = "test-hub-123"
        installation.organization.name = "Test Org"
        installation.organization.slug = "test-org"
        installation.organization.contact_email = ""
        installation.organization.contact_phone = ""
        installation.organization.id = 1
        installation.facility = None

        decoded = {"features": {}, "exp": 9999999999, "check_in_by": None}

        with (
            override_settings(
                SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
                ENCRYPTION_KEY="test-key-abc123",
            ),
            patch("hmis.apps.licensing.bootstrap.serialize_departments", return_value=[]),
            patch("hmis.apps.licensing.bootstrap.serialize_roles", return_value=[]),
            patch("hmis.apps.licensing.bootstrap.serialize_users_summary", return_value=[]),
        ):
            payload = build_activation_bootstrap_payload(installation, "token123", decoded)

        assert "encryption_key" in payload
        assert payload["encryption_key"] == "test-key-abc123"


class TestMigrateToActivationCommand:
    """Tests for the migrate_to_activation management command."""

    def test_command_writes_env_file(self, tmp_path):
        """Command should write LICENSE_TOKEN and SYNC_SERVER_URL to .env."""
        from django.core.management import call_command

        env_file = tmp_path / ".env"
        env_file.write_text("DJANGO_ENV=hub\nHUB_ID=old-hub-1\n")

        with patch("requests.post") as mock_post:
            mock_post.return_value = type(
                "Response", (), {"status_code": 200, "json": lambda: {}}
            )()

            call_command(
                "migrate_to_activation",
                hub_id="old-hub-1",
                license_token="jwt-token-xyz",
                sync_url="https://api.vitora.digital/api/sync",
                env_file=str(env_file),
            )

        content = env_file.read_text()
        assert "LICENSE_TOKEN=jwt-token-xyz" in content
        assert "SYNC_SERVER_URL=https://api.vitora.digital/api/sync" in content
        # Original content preserved
        assert "DJANGO_ENV=hub" in content
        assert "HUB_ID=old-hub-1" in content

    def test_command_replaces_existing_sync_url(self, tmp_path):
        """If SYNC_SERVER_URL already exists in .env, it should be updated."""
        from django.core.management import call_command

        env_file = tmp_path / ".env"
        env_file.write_text("DJANGO_ENV=hub\nSYNC_SERVER_URL=https://old.url/api/sync\n")

        with patch("requests.post") as mock_post:
            mock_post.return_value = type(
                "Response", (), {"status_code": 200, "json": lambda: {}}
            )()

            call_command(
                "migrate_to_activation",
                hub_id="hub-1",
                license_token="new-token",
                sync_url="https://new.url/api/sync",
                env_file=str(env_file),
            )

        content = env_file.read_text()
        assert "SYNC_SERVER_URL=https://new.url/api/sync" in content
        assert "https://old.url" not in content

    def test_command_fails_on_invalid_token(self, tmp_path):
        """Command should fail if cloud rejects the token."""
        from django.core.management import call_command
        from django.core.management.base import CommandError

        env_file = tmp_path / ".env"
        env_file.write_text("DJANGO_ENV=hub\n")

        with patch("requests.post") as mock_post:
            mock_post.return_value = type(
                "Response", (), {"status_code": 401, "json": lambda: {}}
            )()

            with pytest.raises(CommandError, match="invalid or expired"):
                call_command(
                    "migrate_to_activation",
                    hub_id="hub-1",
                    license_token="bad-token",
                    env_file=str(env_file),
                )

    def test_command_handles_network_error(self, tmp_path):
        """Command should fail gracefully on network errors."""
        import requests as req
        from django.core.management import call_command
        from django.core.management.base import CommandError

        env_file = tmp_path / ".env"
        env_file.write_text("DJANGO_ENV=hub\n")

        with patch("requests.post") as mock_post:
            mock_post.side_effect = req.ConnectionError("DNS resolution failed")

            with pytest.raises(CommandError, match="Cannot reach cloud"):
                call_command(
                    "migrate_to_activation",
                    hub_id="hub-1",
                    license_token="some-token",
                    env_file=str(env_file),
                )
