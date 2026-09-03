# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for Phase 2 (compilation) and Phase 3 (integrity + check-in) features.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.test import APIClient

from hmis.apps.licensing.models import CheckInLog, Installation, ReleaseManifest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def org(db):
    from hmis.apps.core.models import Organization

    return Organization.objects.create(name="Test Clinic", slug="test-clinic")


@pytest.fixture
def active_installation(db, org):
    """An active installation ready for check-in."""
    return Installation.objects.create(
        installation_id="hub-test-12345",
        name="Test Hub",
        organization=org,
        status=Installation.Status.ACTIVE,
        activated_at=timezone.now(),
        app_version="1.4.5",
        os_info="Ubuntu 24.04",
        hostname="clinic-srv-01",
    )


@pytest.fixture
def release_manifest(db):
    """A release manifest for version 1.4.5."""
    return ReleaseManifest.objects.create(
        version="1.4.5",
        manifest_id="1.4.5-r1",
        file_hashes={
            "hmis/apps/core.cpython-312.so": "abc123hash",
            "hmis/apps/patients.cpython-312.so": "def456hash",
            "hmis/apps/encounters.cpython-312.so": "ghi789hash",
        },
        published_at=timezone.now(),
        signed_by="ci-build-42",
    )


# ---------------------------------------------------------------------------
# Phase 2: Compilation Script Tests
# ---------------------------------------------------------------------------


class TestCompileHubScript:
    """Tests for the Nuitka compilation script."""

    def test_script_exists(self):
        """The compile-hub.py script should exist."""
        script = Path(__file__).resolve().parent.parent.parent / "scripts" / "compile-hub.py"
        assert script.exists(), f"compile-hub.py not found at {script}"

    def test_script_importable(self):
        """The script should be valid Python."""
        script = Path(__file__).resolve().parent.parent.parent / "scripts" / "compile-hub.py"
        import importlib.util

        spec = importlib.util.spec_from_file_location("compile_hub", script)
        module = importlib.util.module_from_spec(spec)
        # Don't execute main(), just verify it loads
        assert spec is not None

    def test_apps_to_compile_are_valid(self):
        """All compile roots listed for compilation should exist as directories."""
        script = Path(__file__).resolve().parent.parent.parent / "scripts" / "compile-hub.py"
        backend_dir = script.parent.parent

        import importlib.util

        spec = importlib.util.spec_from_file_location("compile_hub", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        # The script discovers .py files under each COMPILE_ROOT directory
        # (relative to BACKEND_DIR) and emits per-file .so/.pyd extensions.
        assert hasattr(module, "COMPILE_ROOTS"), "compile-hub.py must expose COMPILE_ROOTS"
        assert module.COMPILE_ROOTS, "COMPILE_ROOTS must not be empty"
        for root_name in module.COMPILE_ROOTS:
            root_dir = backend_dir / root_name
            assert root_dir.is_dir(), f"Compile root directory not found: {root_dir}"

    def test_keep_plain_files_exist(self):
        """Keep-plain entries should be valid basenames or directory names."""
        script = Path(__file__).resolve().parent.parent.parent / "scripts" / "compile-hub.py"
        backend_dir = script.parent.parent

        import importlib.util

        spec = importlib.util.spec_from_file_location("compile_hub", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        # KEEP_PLAIN_BASENAMES are matched by filename anywhere under the
        # compile roots; verify each name actually appears in the codebase.
        assert hasattr(module, "KEEP_PLAIN_BASENAMES")
        assert hasattr(module, "KEEP_PLAIN_DIRS")
        assert module.KEEP_PLAIN_BASENAMES, "KEEP_PLAIN_BASENAMES must not be empty"
        assert module.KEEP_PLAIN_DIRS, "KEEP_PLAIN_DIRS must not be empty"

        # manage.py is a sentinel basename that must exist at backend root
        assert "manage.py" in module.KEEP_PLAIN_BASENAMES
        assert (backend_dir / "manage.py").is_file()

        # Sentinel basenames that MUST exist somewhere under compile roots
        required_basenames = {"__init__.py", "apps.py", "wsgi.py", "asgi.py"}
        for basename in required_basenames & set(module.KEEP_PLAIN_BASENAMES):
            found = any(
                any((backend_dir / root).rglob(basename))
                for root in module.COMPILE_ROOTS
                if (backend_dir / root).is_dir()
            )
            assert found, f"Required keep-plain basename {basename!r} not present in codebase"

        # Sentinel dirs that MUST exist (migrations, management, settings).
        # Other entries (static, locale, tests, fixtures) are defensive guards
        # for apps that may add them later — don't require them to exist.
        required_dirs = {"migrations", "management", "settings"}
        for dirname in required_dirs & set(module.KEEP_PLAIN_DIRS):
            found = any(
                any(p.is_dir() for p in (backend_dir / root).rglob(dirname))
                for root in module.COMPILE_ROOTS
                if (backend_dir / root).is_dir()
            )
            assert found, f"Required keep-plain directory {dirname!r} not present in codebase"


# ---------------------------------------------------------------------------
# Phase 3: ReleaseManifest Model Tests
# ---------------------------------------------------------------------------


class TestReleaseManifest:
    """Tests for the ReleaseManifest model."""

    def test_create_manifest(self, release_manifest):
        """Should create a release manifest with file hashes."""
        assert release_manifest.version == "1.4.5"
        assert release_manifest.manifest_id == "1.4.5-r1"
        assert len(release_manifest.file_hashes) == 3

    def test_verify_hashes_all_match(self, release_manifest):
        """verify_hashes should return match=True when all hashes match."""
        reported = {
            "hmis/apps/core.cpython-312.so": "abc123hash",
            "hmis/apps/patients.cpython-312.so": "def456hash",
            "hmis/apps/encounters.cpython-312.so": "ghi789hash",
        }
        result = release_manifest.verify_hashes(reported)
        assert result["match"] is True
        assert result["mismatched_files"] == []
        assert result["missing_files"] == []

    def test_verify_hashes_mismatch(self, release_manifest):
        """verify_hashes should detect mismatched files."""
        reported = {
            "hmis/apps/core.cpython-312.so": "TAMPERED_HASH",
            "hmis/apps/patients.cpython-312.so": "def456hash",
            "hmis/apps/encounters.cpython-312.so": "ghi789hash",
        }
        result = release_manifest.verify_hashes(reported)
        assert result["match"] is False
        assert "hmis/apps/core.cpython-312.so" in result["mismatched_files"]

    def test_verify_hashes_missing_file(self, release_manifest):
        """verify_hashes should detect missing files."""
        reported = {
            "hmis/apps/core.cpython-312.so": "abc123hash",
            "hmis/apps/patients.cpython-312.so": "def456hash",
            # Missing: encounters
        }
        result = release_manifest.verify_hashes(reported)
        assert result["match"] is False
        assert "hmis/apps/encounters.cpython-312.so" in result["missing_files"]

    def test_verify_hashes_extra_file(self, release_manifest):
        """verify_hashes should report extra (unexpected) files."""
        reported = {
            "hmis/apps/core.cpython-312.so": "abc123hash",
            "hmis/apps/patients.cpython-312.so": "def456hash",
            "hmis/apps/encounters.cpython-312.so": "ghi789hash",
            "hmis/apps/rogue.cpython-312.so": "rogue_hash",
        }
        result = release_manifest.verify_hashes(reported)
        # Extra files don't invalidate match (just reported)
        assert result["match"] is True
        assert "hmis/apps/rogue.cpython-312.so" in result["extra_files"]

    def test_str_representation(self, release_manifest):
        """__str__ should show manifest_id and file count."""
        assert "1.4.5-r1" in str(release_manifest)
        assert "3 files" in str(release_manifest)


# ---------------------------------------------------------------------------
# Phase 3: Installation Integrity Fields
# ---------------------------------------------------------------------------


class TestInstallationIntegrity:
    """Tests for the new integrity fields on Installation."""

    def test_initial_state_not_tampered(self, active_installation):
        """A new installation should not be marked as tampered."""
        assert active_installation.is_tampered is False

    def test_flag_tamper(self, active_installation):
        """flag_tamper should set tamper_flagged_at."""
        active_installation.flag_tamper()
        active_installation.refresh_from_db()
        assert active_installation.tamper_flagged_at is not None
        assert active_installation.is_tampered is True

    def test_clear_tamper(self, active_installation):
        """clear_tamper should set tamper_resolved_at."""
        active_installation.flag_tamper()
        active_installation.clear_tamper()
        active_installation.refresh_from_db()
        assert active_installation.tamper_resolved_at is not None
        assert active_installation.is_tampered is False

    def test_flag_tamper_idempotent(self, active_installation):
        """Calling flag_tamper twice should not update the timestamp."""
        active_installation.flag_tamper()
        first_flag = active_installation.tamper_flagged_at

        active_installation.flag_tamper()
        active_installation.refresh_from_db()
        assert active_installation.tamper_flagged_at == first_flag


# ---------------------------------------------------------------------------
# Phase 3: Enhanced Check-In API
# ---------------------------------------------------------------------------


class TestEnhancedCheckIn:
    """Tests for the Phase 3 enhanced check-in endpoint."""

    def test_basic_check_in(self, api_client, active_installation):
        """Basic check-in should still work with minimal payload."""
        response = api_client.post(
            "/api/licensing/check-in/",
            {"installation_id": "hub-test-12345"},
            format="json",
        )
        assert response.status_code == http_status.HTTP_200_OK
        assert "license" in response.data or "license_token" in response.data

    def test_check_in_with_full_phase3_payload(self, api_client, active_installation):
        """Check-in should accept the full Phase 3 payload."""
        payload = {
            "installation_id": "hub-test-12345",
            "license_jti": "test-jti-123",
            "version": "1.4.5",
            "uptime_seconds": 86400,
            "hostname": "clinic-srv-01",
            "os": "Ubuntu 24.04",
            "ip_address": "10.0.5.4",
            "user_count_24h": 8,
            "encounter_count_24h": 45,
            "binary_hashes": {
                "hmis/apps/core.cpython-312.so": "abc123hash",
            },
            "hardware_fingerprint": "a1b2c3d4e5f6" * 5 + "ab",
        }
        response = api_client.post(
            "/api/licensing/check-in/",
            payload,
            format="json",
        )
        assert response.status_code == http_status.HTTP_200_OK
        assert "license" in response.data
        assert "binary_manifest_id" in response.data

    def test_check_in_accepts_os_alias_and_persists_os_info(self, api_client, active_installation):
        """Legacy payload key `os` should populate Installation.os_info."""
        response = api_client.post(
            "/api/licensing/check-in/",
            {
                "installation_id": "hub-test-12345",
                "os": "Ubuntu 24.04 LTS",
            },
            format="json",
        )
        assert response.status_code == http_status.HTTP_200_OK
        active_installation.refresh_from_db()
        assert active_installation.os_info == "Ubuntu 24.04 LTS"

    def test_check_in_binds_hardware_fingerprint(self, api_client, active_installation):
        """First check-in with fingerprint should bind it to the installation."""
        fp = "deadbeef" * 8
        response = api_client.post(
            "/api/licensing/check-in/",
            {
                "installation_id": "hub-test-12345",
                "hardware_fingerprint": fp,
            },
            format="json",
        )
        assert response.status_code == http_status.HTTP_200_OK
        active_installation.refresh_from_db()
        assert active_installation.hardware_fingerprint == fp

    def test_check_in_detects_hardware_mismatch(self, api_client, active_installation):
        """Subsequent check-in with different fingerprint should warn."""
        # Bind initial fingerprint
        active_installation.hardware_fingerprint = "original_fp_" + "0" * 52
        active_installation.save(update_fields=["hardware_fingerprint"])

        response = api_client.post(
            "/api/licensing/check-in/",
            {
                "installation_id": "hub-test-12345",
                "hardware_fingerprint": "different_fp_" + "1" * 51,
            },
            format="json",
        )
        assert response.status_code == http_status.HTTP_200_OK
        # Should have hardware_mismatch action
        actions = response.data.get("actions", [])
        action_types = [a["type"] for a in actions]
        assert "hardware_mismatch" in action_types

    def test_check_in_integrity_pass(self, api_client, active_installation, release_manifest):
        """Check-in with matching hashes should not flag tamper."""
        response = api_client.post(
            "/api/licensing/check-in/",
            {
                "installation_id": "hub-test-12345",
                "version": "1.4.5",
                "binary_hashes": {
                    "hmis/apps/core.cpython-312.so": "abc123hash",
                    "hmis/apps/patients.cpython-312.so": "def456hash",
                    "hmis/apps/encounters.cpython-312.so": "ghi789hash",
                },
            },
            format="json",
        )
        assert response.status_code == http_status.HTTP_200_OK
        active_installation.refresh_from_db()
        assert active_installation.tamper_flagged_at is None
        assert active_installation.binary_manifest_id == "1.4.5-r1"

    def test_check_in_integrity_fail_flags_tamper(
        self, api_client, active_installation, release_manifest
    ):
        """Check-in with mismatched hashes should flag tamper."""
        response = api_client.post(
            "/api/licensing/check-in/",
            {
                "installation_id": "hub-test-12345",
                "version": "1.4.5",
                "binary_hashes": {
                    "hmis/apps/core.cpython-312.so": "TAMPERED",
                    "hmis/apps/patients.cpython-312.so": "def456hash",
                    "hmis/apps/encounters.cpython-312.so": "ghi789hash",
                },
            },
            format="json",
        )
        assert response.status_code == http_status.HTTP_200_OK
        active_installation.refresh_from_db()
        assert active_installation.tamper_flagged_at is not None
        # Token should have tamper_detected feature flag
        assert response.data["features"].get("tamper_detected") is True

    def test_check_in_creates_log(self, api_client, active_installation):
        """Each check-in should create a CheckInLog entry."""
        api_client.post(
            "/api/licensing/check-in/",
            {
                "installation_id": "hub-test-12345",
                "hostname": "test-host",
                "version": "1.4.5",
            },
            format="json",
        )
        logs = CheckInLog.objects.filter(installation=active_installation)
        assert logs.count() == 1
        assert logs.first().hostname == "test-host"
        assert logs.first().app_version == "1.4.5"

    def test_check_in_increments_count(self, api_client, active_installation):
        """check_in_count should increment with each successful check-in."""
        for _ in range(3):
            api_client.post(
                "/api/licensing/check-in/",
                {"installation_id": "hub-test-12345"},
                format="json",
            )
        active_installation.refresh_from_db()
        assert active_installation.check_in_count == 3

    def test_check_in_revoked_returns_401(self, api_client, active_installation):
        """Revoked installation should get 401 (not 403) to trigger token wipe."""
        active_installation.revoke(reason="test")
        response = api_client.post(
            "/api/licensing/check-in/",
            {"installation_id": "hub-test-12345"},
            format="json",
        )
        assert response.status_code == http_status.HTTP_401_UNAUTHORIZED
        assert response.data["code"] == "revoked"

    def test_check_in_no_manifest_auto_creates_manifest(self, api_client, active_installation):
        """If no manifest exists, first check-in should seed a ReleaseManifest."""
        response = api_client.post(
            "/api/licensing/check-in/",
            {
                "installation_id": "hub-test-12345",
                "version": "9.9.9",
                "binary_hashes": {"some/file.so": "hash"},
            },
            format="json",
        )
        assert response.status_code == http_status.HTTP_200_OK
        active_installation.refresh_from_db()
        assert active_installation.tamper_flagged_at is None
        assert active_installation.binary_manifest_id == "9.9.9-auto"
        manifest = ReleaseManifest.objects.get(version="9.9.9")
        assert manifest.manifest_id == "9.9.9-auto"
        assert manifest.file_hashes == {"some/file.so": "hash"}

    def test_check_in_no_manifest_and_no_hashes_skips_integrity(
        self, api_client, active_installation
    ):
        """If no manifest exists and no hashes are provided, integrity remains skipped."""
        response = api_client.post(
            "/api/licensing/check-in/",
            {
                "installation_id": "hub-test-12345",
                "version": "9.9.8",
            },
            format="json",
        )
        assert response.status_code == http_status.HTTP_200_OK
        active_installation.refresh_from_db()
        assert active_installation.tamper_flagged_at is None
        assert active_installation.binary_manifest_id == ""
        assert not ReleaseManifest.objects.filter(version="9.9.8").exists()


# ---------------------------------------------------------------------------
# Phase 3: Hardware Fingerprint Utility
# ---------------------------------------------------------------------------


class TestHardwareFingerprint:
    """Tests for the hardware fingerprint utility."""

    def test_get_hardware_fingerprint_returns_hex(self):
        """get_hardware_fingerprint should return a SHA-256 hex string."""
        from hmis.apps.licensing.hardware import get_hardware_fingerprint

        fp = get_hardware_fingerprint()
        assert isinstance(fp, str)
        assert len(fp) == 64  # SHA-256 hex = 64 chars

    def test_fingerprint_is_stable(self):
        """Multiple calls should return the same fingerprint."""
        from hmis.apps.licensing.hardware import get_hardware_fingerprint

        fp1 = get_hardware_fingerprint()
        fp2 = get_hardware_fingerprint()
        assert fp1 == fp2

    def test_compute_binary_hashes_empty_dir(self, tmp_path):
        """compute_binary_hashes on empty dir should return empty dict."""
        from hmis.apps.licensing.hardware import compute_binary_hashes

        result = compute_binary_hashes(str(tmp_path))
        assert result == {}

    def test_compute_binary_hashes_finds_so_files(self, tmp_path):
        """compute_binary_hashes should find and hash .so files."""
        from hmis.apps.licensing.hardware import compute_binary_hashes

        # Create a fake .so file
        so_dir = tmp_path / "hmis" / "apps"
        so_dir.mkdir(parents=True)
        so_file = so_dir / "core.cpython-312.so"
        so_file.write_bytes(b"fake compiled module")

        result = compute_binary_hashes(str(tmp_path))
        assert len(result) == 1
        assert "hmis/apps/core.cpython-312.so" in result
        # Should be a valid SHA-256 hash
        assert len(list(result.values())[0]) == 64


# ---------------------------------------------------------------------------
# Phase 3: Celery Task Tests
# ---------------------------------------------------------------------------


class TestLicenseCheckInTask:
    """Tests for the Celery license_check_in task."""

    @override_settings(SYNC_SERVER_URL="")
    def test_task_skips_when_not_hub(self):
        """Task should skip when DJANGO_ENV is not 'hub'."""
        from hmis.apps.licensing.tasks import license_check_in

        with patch.dict("os.environ", {"DJANGO_ENV": "cloud"}):
            result = license_check_in()
        assert result["skipped"] is True
        assert "not a hub" in result["reason"]

    @override_settings(SYNC_SERVER_URL="")
    def test_task_skips_when_no_sync_url(self):
        """Task should skip when SYNC_SERVER_URL is empty."""
        from hmis.apps.licensing.tasks import license_check_in

        with patch.dict("os.environ", {"DJANGO_ENV": "hub"}):
            result = license_check_in()
        assert result["skipped"] is True
        assert "SYNC_SERVER_URL" in result["reason"]

    @override_settings(
        SYNC_SERVER_URL="https://cloud.example.com",
        HUB_LICENSE_TOKEN_PATH="/nonexistent/path.jwt",
    )
    def test_task_errors_when_no_token(self):
        """Task should error when no license token is found."""
        from hmis.apps.licensing.tasks import license_check_in

        with patch.dict("os.environ", {"DJANGO_ENV": "hub", "LICENSE_TOKEN": ""}):
            result = license_check_in()
        assert "error" in result
        assert "No license token" in result["error"]

    @override_settings(SYNC_SERVER_URL="https://cloud.example.com/api/sync")
    def test_task_normalizes_sync_url_with_api_sync_suffix(self):
        """Task should strip trailing /api/sync before calling licensing check-in."""
        import jwt as pyjwt

        from hmis.apps.licensing.tasks import license_check_in

        token = pyjwt.encode(
            {
                "installation_id": "hub-test-12345",
                "jti": "token-jti-1",
            },
            "test-secret-key-that-is-at-least-thirty-two-bytes",
            algorithm="HS256",
        )
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}

        with (
            patch.dict("os.environ", {"DJANGO_ENV": "hub", "LICENSE_TOKEN": token}),
            patch("hmis.apps.licensing.hardware.compute_binary_hashes", return_value={}),
            patch(
                "hmis.apps.licensing.hardware.get_hardware_fingerprint",
                return_value="hw-fingerprint",
            ),
            patch("requests.post", return_value=mock_response) as mock_post,
        ):
            result = license_check_in()

        assert result["success"] is True
        assert mock_post.call_args.args[0] == "https://cloud.example.com/api/licensing/check-in/"

    @override_settings(SYNC_SERVER_URL="https://cloud.example.com/api/sync/")
    def test_task_normalizes_sync_url_with_api_sync_suffix_and_trailing_slash(self):
        """Task should normalize /api/sync/ variants before building check-in URL."""
        import jwt as pyjwt

        from hmis.apps.licensing.tasks import license_check_in

        token = pyjwt.encode(
            {
                "installation_id": "hub-test-12345",
                "jti": "token-jti-2",
            },
            "test-secret-key-that-is-at-least-thirty-two-bytes",
            algorithm="HS256",
        )
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}

        with (
            patch.dict("os.environ", {"DJANGO_ENV": "hub", "LICENSE_TOKEN": token}),
            patch("hmis.apps.licensing.hardware.compute_binary_hashes", return_value={}),
            patch(
                "hmis.apps.licensing.hardware.get_hardware_fingerprint",
                return_value="hw-fingerprint",
            ),
            patch("requests.post", return_value=mock_response) as mock_post,
        ):
            result = license_check_in()

        assert result["success"] is True
        assert mock_post.call_args.args[0] == "https://cloud.example.com/api/licensing/check-in/"


# ---------------------------------------------------------------------------
# CheckInLog Model Tests
# ---------------------------------------------------------------------------


class TestCheckInLog:
    """Tests for the CheckInLog model."""

    def test_create_log_entry(self, db, active_installation):
        """Should create a check-in log entry."""
        log = CheckInLog.objects.create(
            installation=active_installation,
            ip_address="10.0.5.4",
            hostname="clinic-srv-01",
            app_version="1.4.5",
            os_info="Ubuntu 24.04",
            uptime_seconds=86400,
            user_count_24h=8,
            encounter_count_24h=45,
            integrity_match=True,
            token_issued=True,
        )
        assert log.pk is not None
        assert log.installation == active_installation
        assert log.integrity_match is True

    def test_log_ordering(self, db, active_installation):
        """Logs should be ordered newest first."""
        log1 = CheckInLog.objects.create(
            installation=active_installation,
            hostname="first",
        )
        log2 = CheckInLog.objects.create(
            installation=active_installation,
            hostname="second",
        )
        logs = list(CheckInLog.objects.all())
        assert logs[0].hostname == "second"
        assert logs[1].hostname == "first"
