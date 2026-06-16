"""
Tests for the auto_apply_update Celery task.

Covers:
- Skip when not a hub installation
- Skip when HUB_AUTO_UPDATE is False
- Skip when version is unknown
- Up-to-date when no update available
- Container mode: delegates to apply_container_update
- Native Linux mode: spawns bash update script
- Native Windows mode: spawns PowerShell update script
- Script-not-found error paths
- License token reading (env var + file fallback)
"""

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest  # type: ignore

from hmis.apps.licensing.tasks import _read_license_token, _spawn_native_update, auto_apply_update
from hmis.apps.licensing.update_service import UpdateInfo

MODULE = "hmis.apps.licensing.tasks"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tarball_update():
    """An UpdateInfo representing a native/tarball update."""
    return UpdateInfo(
        version="0.5.5",
        channel="stable",
        url="https://releases.example.com/hub-0.5.5.tar.gz",
        sha256="abc123",
        release_notes_url="https://docs.example.com/0.5.5",
    )


@pytest.fixture
def container_update():
    """An UpdateInfo representing a container/Docker update."""
    return UpdateInfo(
        version="0.5.5",
        channel="stable",
        digest="sha256:deadbeef",
        release_notes_url="https://docs.example.com/0.5.5",
    )


# ---------------------------------------------------------------------------
# Skip conditions
# ---------------------------------------------------------------------------


class TestAutoApplyUpdateSkips:
    """Tests for conditions that skip the auto-update task."""

    @patch.dict(os.environ, {"DJANGO_ENV": "cloud"}, clear=False)
    def test_skips_when_not_hub(self):
        result = auto_apply_update()
        assert result["skipped"] is True
        assert "not a hub" in result["reason"]

    @patch.dict(os.environ, {"DJANGO_ENV": ""}, clear=False)
    def test_skips_when_env_empty(self):
        result = auto_apply_update()
        assert result["skipped"] is True

    @patch.dict(os.environ, {"DJANGO_ENV": "hub"}, clear=False)
    def test_skips_when_auto_update_disabled(self, settings):
        settings.HUB_AUTO_UPDATE = False
        result = auto_apply_update()
        assert result["skipped"] is True
        assert "disabled" in result["reason"]

    @patch.dict(os.environ, {"DJANGO_ENV": "hub"}, clear=False)
    @patch(f"{MODULE}._get_app_version", return_value="unknown")
    def test_skips_when_version_unknown(self, mock_version, settings):
        settings.HUB_AUTO_UPDATE = True
        result = auto_apply_update()
        assert result["skipped"] is True
        assert "unknown" in result["reason"]


# ---------------------------------------------------------------------------
# Up-to-date / no update available
# ---------------------------------------------------------------------------


class TestAutoApplyUpdateUpToDate:
    """Tests when no update is available."""

    @patch.dict(os.environ, {"DJANGO_ENV": "hub"}, clear=False)
    @patch(f"{MODULE}._read_license_token", return_value="test-token")
    @patch(f"{MODULE}._get_app_version", return_value="0.5.4")
    def test_returns_up_to_date(self, mock_version, mock_token, settings):
        settings.HUB_AUTO_UPDATE = True
        with patch(
            "hmis.apps.licensing.update_service.check_for_update",
            return_value=None,
        ):
            result = auto_apply_update()

        assert result["up_to_date"] is True
        assert result["version"] == "0.5.4"


# ---------------------------------------------------------------------------
# Container mode
# ---------------------------------------------------------------------------


class TestAutoApplyContainerUpdate:
    """Tests for container/Docker update path."""

    @patch.dict(os.environ, {"DJANGO_ENV": "hub"}, clear=False)
    @patch(f"{MODULE}._read_license_token", return_value="test-token")
    @patch(f"{MODULE}._get_app_version", return_value="0.5.4")
    def test_applies_container_update(self, mock_version, mock_token, container_update, settings):
        settings.HUB_AUTO_UPDATE = True
        with (
            patch(
                "hmis.apps.licensing.update_service.check_for_update",
                return_value=container_update,
            ),
            patch(
                "hmis.apps.licensing.update_service.apply_container_update",
                return_value=True,
            ) as mock_apply,
        ):
            result = auto_apply_update()

        mock_apply.assert_called_once_with(container_update, license_token="test-token")
        assert result["applied"] is True
        assert result["mode"] == "container"
        assert result["version"] == "0.5.5"

    @patch.dict(os.environ, {"DJANGO_ENV": "hub"}, clear=False)
    @patch(f"{MODULE}._read_license_token", return_value="")
    @patch(f"{MODULE}._get_app_version", return_value="0.5.4")
    def test_container_update_failure(self, mock_version, mock_token, container_update, settings):
        settings.HUB_AUTO_UPDATE = True
        with (
            patch(
                "hmis.apps.licensing.update_service.check_for_update",
                return_value=container_update,
            ),
            patch(
                "hmis.apps.licensing.update_service.apply_container_update",
                return_value=False,
            ),
        ):
            result = auto_apply_update()

        assert result["applied"] is False
        assert result["mode"] == "container"


# ---------------------------------------------------------------------------
# Native mode
# ---------------------------------------------------------------------------


class TestAutoApplyNativeUpdate:
    """Tests for native (tarball) update path — spawns OS update script."""

    @patch.dict(os.environ, {"DJANGO_ENV": "hub"}, clear=False)
    @patch(f"{MODULE}._read_license_token", return_value="test-token")
    @patch(f"{MODULE}._get_app_version", return_value="0.5.4")
    @patch(f"{MODULE}._spawn_native_update")
    def test_spawns_native_update(
        self, mock_spawn, mock_version, mock_token, tarball_update, settings
    ):
        settings.HUB_AUTO_UPDATE = True
        mock_spawn.return_value = {
            "applied": True,
            "mode": "native",
            "version": "0.5.5",
        }
        with patch(
            "hmis.apps.licensing.update_service.check_for_update",
            return_value=tarball_update,
        ):
            result = auto_apply_update()

        mock_spawn.assert_called_once_with("0.5.5")
        assert result["applied"] is True
        assert result["mode"] == "native"


# ---------------------------------------------------------------------------
# _spawn_native_update
# ---------------------------------------------------------------------------


class TestSpawnNativeUpdate:
    """Tests for the _spawn_native_update helper."""

    @patch("platform.system", return_value="Linux")
    @patch("subprocess.Popen")
    def test_linux_spawns_bash_script(self, mock_popen, mock_system, tmp_path, settings):
        scripts_dir = tmp_path / "scripts"
        scripts_dir.mkdir()
        script = scripts_dir / "update-hub.sh"
        script.touch()

        settings.BASE_DIR = tmp_path

        result = _spawn_native_update("0.5.5")

        mock_popen.assert_called_once()
        args = mock_popen.call_args
        cmd = args[0][0]
        assert cmd[0] == "bash"
        assert "update-hub.sh" in cmd[1]
        assert "--version" in cmd
        assert "0.5.5" in cmd
        assert args[1]["start_new_session"] is True
        assert result["applied"] is True
        assert result["mode"] == "native"
        assert result["version"] == "0.5.5"

    @patch("platform.system", return_value="Windows")
    @patch("subprocess.Popen")
    def test_windows_spawns_powershell_script(self, mock_popen, mock_system, tmp_path, settings):
        scripts_dir = tmp_path / "scripts"
        scripts_dir.mkdir()
        script = scripts_dir / "update-hub-windows.ps1"
        script.touch()

        settings.BASE_DIR = tmp_path

        result = _spawn_native_update("0.5.5")

        mock_popen.assert_called_once()
        args = mock_popen.call_args
        cmd = args[0][0]
        assert cmd[0] == "powershell.exe"
        assert "-File" in cmd
        assert any("update-hub-windows.ps1" in str(c) for c in cmd)
        assert "-Version" in cmd
        assert "0.5.5" in cmd
        assert result["applied"] is True

    @patch("platform.system", return_value="Linux")
    def test_linux_script_not_found(self, mock_system, tmp_path, settings):
        settings.BASE_DIR = tmp_path
        # Also patch the fallback path
        with patch.object(Path, "exists", return_value=False):
            result = _spawn_native_update("0.5.5")

        assert "error" in result
        assert result["platform"] == "linux"

    @patch("platform.system", return_value="Windows")
    def test_windows_script_not_found(self, mock_system, tmp_path, settings):
        settings.BASE_DIR = tmp_path
        with patch.object(Path, "exists", return_value=False):
            result = _spawn_native_update("0.5.5")

        assert "error" in result
        assert result["platform"] == "windows"


# ---------------------------------------------------------------------------
# _read_license_token
# ---------------------------------------------------------------------------


class TestReadLicenseToken:
    """Tests for the license token reader."""

    @patch.dict(os.environ, {"LICENSE_TOKEN": "env-token-123"}, clear=False)
    def test_reads_from_env(self):
        assert _read_license_token() == "env-token-123"

    @patch.dict(os.environ, {}, clear=False)
    def test_reads_from_file(self, tmp_path, settings):
        # Remove LICENSE_TOKEN from env if present
        os.environ.pop("LICENSE_TOKEN", None)
        token_file = tmp_path / "license.jwt"
        token_file.write_text("file-token-456\n")
        settings.HUB_LICENSE_TOKEN_PATH = str(token_file)

        assert _read_license_token() == "file-token-456"

    @patch.dict(os.environ, {}, clear=False)
    def test_returns_empty_when_no_token(self, tmp_path, settings):
        os.environ.pop("LICENSE_TOKEN", None)
        settings.HUB_LICENSE_TOKEN_PATH = str(tmp_path / "nonexistent.jwt")

        assert _read_license_token() == ""
