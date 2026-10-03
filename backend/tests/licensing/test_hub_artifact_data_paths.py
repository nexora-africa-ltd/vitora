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
    """hub-shell.ps1 must pass hub_sync as one argv item, not h/u/b/...

    PowerShell unwraps a single-element array on assignment to a new variable,
    which then makes `@var` splat the string as individual characters. The
    wrapper must splat $CommandArgs directly (no intermediate $pyArgs) so a
    one-element $CommandArgs array stays an array at the splat site.
    """
    for script_name in ("install-hub-windows.ps1", "update-hub-windows.ps1"):
        script = (REPO_ROOT / "backend" / "scripts" / script_name).read_text()
        assert "ValueFromRemainingArguments" in script
        assert "[string[]]$CommandArgs" in script
        assert "@CommandArgs" in script
        # Buggy intermediate-variable patterns must not return.
        assert "@pyArgs" not in script
        assert "$pyArgs = if" not in script
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
        "HUB_CLOUD_AUTH_ENABLED",
        "HUB_CLOUD_AUTH_URL",
    ]

    for script_name in ("install-hub-windows.ps1", "update-hub-windows.ps1"):
        script = (REPO_ROOT / "backend" / "scripts" / script_name).read_text()
        assert "AppEnvironmentExtra" in script
        for var in required_vars:
            assert var in script


def test_windows_hub_installer_opens_udp_discovery_port():
    """LAN discovery needs a private-profile inbound UDP rule in addition to HTTP."""
    script = (REPO_ROOT / "backend" / "scripts" / "install-hub-windows.ps1").read_text()

    assert '"Vitora Hub Discovery (UDP 19088)"' in script
    assert "-Protocol UDP -LocalPort 19088" in script
    assert "-Direction Inbound" in script
    assert "-Action Allow -Profile Private" in script


def test_hub_updates_and_linux_installers_preserve_udp_discovery_access():
    """Existing hubs and Linux container deployments must expose UDP discovery too."""
    windows_updater = (REPO_ROOT / "backend" / "scripts" / "update-hub-windows.ps1").read_text()
    linux_installer = (REPO_ROOT / "backend" / "scripts" / "install-hub.sh").read_text()
    linux_updater = (REPO_ROOT / "backend" / "scripts" / "update-hub.sh").read_text()

    assert '"Vitora Hub Discovery (UDP 19088)"' in windows_updater
    assert "-Protocol UDP -LocalPort 19088" in windows_updater
    assert '"19088:19088/udp"' in linux_installer
    assert 'ufw allow 19088/udp comment "Vitora Hub Discovery"' in linux_installer
    assert 'ufw allow 19088/udp comment "Vitora Hub Discovery"' in linux_updater


def test_hub_installers_use_protected_secret_stores():
    """Hub runtime secrets must not regress to plaintext env files."""
    windows_installer = (REPO_ROOT / "backend" / "scripts" / "install-hub-windows.ps1").read_text()
    windows_updater = (REPO_ROOT / "backend" / "scripts" / "update-hub-windows.ps1").read_text()
    windows_launcher = (REPO_ROOT / "backend" / "scripts" / "start-hub-windows.ps1").read_text()
    linux_installer = (REPO_ROOT / "backend" / "scripts" / "install-hub.sh").read_text()
    linux_updater = (REPO_ROOT / "backend" / "scripts" / "update-hub.sh").read_text()
    linux_launcher = (REPO_ROOT / "backend" / "scripts" / "start-hub-linux.sh").read_text()

    assert "DJANGO_SECRET_KEY=$secretKey" not in windows_installer
    assert "LICENSE_TOKEN=$LicenseToken" not in windows_installer
    assert "TIBABOT_API_KEY=$TibaBotApiKey" not in windows_installer
    assert "Load-DpapiSecretsBundle -Path $hubSecretsFile" in windows_updater
    assert "Protected hub secret bundle is missing" in windows_installer
    assert "DPAPI secret bundle has no protected ciphertext." in windows_launcher
    assert "plain JSON fallback" not in windows_launcher
    assert "systemd-creds encrypt --with-key=host" in linux_installer
    assert "LoadCredentialEncrypted=hub-secrets:" in linux_installer
    assert "EnvironmentFile=${HUB_SECRETS_FILE}" not in linux_installer
    assert "systemd-creds decrypt" in linux_updater
    assert "CREDENTIALS_DIRECTORY" in linux_launcher
    assert "hub-secrets" in linux_launcher
