"""Regression checks for hub artifact/runtime data directory separation."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_hub_workflow_does_not_copy_backend_data_twice():
    """compile-hub.py already includes backend/data in payload; workflow must not duplicate it."""
    workflow = (REPO_ROOT / ".github" / "workflows" / "build-hub.yml").read_text()

    assert "cp -r backend/data" not in workflow
    assert 'Copy-Item -Recurse "backend\\data"' not in workflow


def test_windows_updater_skips_nested_packaged_data_copy():
    """Old artifacts with data/data should not recreate runtime data/data on update."""
    script = (REPO_ROOT / "backend" / "scripts" / "update-hub-windows.ps1").read_text()

    assert "Remove-NestedPackagedDataCopy" in script
    assert "Skipping nested packaged data directory" in script
    assert "hub.sqlite3-wal" in script
    assert "hub.sqlite3-shm" in script


def test_windows_installer_cleans_nested_packaged_data_copy():
    """Clean installs from older malformed artifacts should remove data/data."""
    script = (REPO_ROOT / "backend" / "scripts" / "install-hub-windows.ps1").read_text()

    assert "Remove-NestedPackagedDataCopy" in script
    assert "Removing nested packaged data directory" in script
    assert "Merge-DirectoryPreservingRuntimeData" in script
    assert "Merging packaged reference data without deleting runtime data" in script
    assert "hub.sqlite3-wal" in script
    assert "hub.sqlite3-shm" in script


def test_hub_shell_wrapper_preserves_single_command_argument():
    """hub-shell.ps1 must pass hub_sync as one argv item, not h/u/b/..."""
    for script_name in ("install-hub-windows.ps1", "update-hub-windows.ps1"):
        script = (REPO_ROOT / "backend" / "scripts" / script_name).read_text()
        assert "ValueFromRemainingArguments" in script
        assert "[string[]]$CommandArgs" in script
        assert "@pyArgs" in script
        assert "@($args)" not in script
        assert script.index("param(") < script.index('$ErrorActionPreference = "Stop"')
        assert "$exitCode = $LASTEXITCODE" in script
        assert "exit $exitCode" in script


def test_windows_hub_service_env_includes_tibabot_and_cloud_auth_flags():
    """Installer/updater must propagate feature env vars into the Windows service."""
    required_vars = [
        "TIBABOT_ENABLED",
        "TIBABOT_API_URL",
        "TIBABOT_API_KEY",
        "TIBABOT_TIMEOUT",
        "TIBABOT_JWT_PRIVATE_KEY",
        "TIBABOT_JWT_SECRET",
        "TIBABOT_JWT_ISSUER",
        "TIBABOT_JWT_AUDIENCE",
        "TIBABOT_JWT_EXPIRY_SECONDS",
        "TIBABOT_JWKS_URL",
        "TIBABOT_ADMIN_KEY",
        "TIBABOT_ENABLE_LAB_ASSIST",
        "TIBABOT_ENABLE_DISCHARGE_ASSIST",
        "TIBABOT_ENABLE_CARE_PLAN",
        "TIBABOT_ENABLE_CLERKING_ASSIST",
        "HUB_CLOUD_AUTH_ENABLED",
        "HUB_CLOUD_AUTH_URL",
    ]

    for script_name in ("install-hub-windows.ps1", "update-hub-windows.ps1"):
        script = (REPO_ROOT / "backend" / "scripts" / script_name).read_text()
        assert "AppEnvironmentExtra" in script
        for var in required_vars:
            assert var in script
