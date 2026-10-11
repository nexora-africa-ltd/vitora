# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Static regression checks for protected scheduled hub backup jobs."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_linux_backup_jobs_use_the_hub_credential_context_and_expected_schedules():
    """Systemd jobs must load encrypted credentials, never plaintext secret files."""
    installer = (REPO_ROOT / "backend/scripts/install-hub.sh").read_text()
    updater = (REPO_ROOT / "backend/scripts/update-hub.sh").read_text()

    for script in (installer, updater):
        assert '"/etc/systemd/system/${unit_name}.service"' in script
        assert '"/etc/systemd/system/${unit_name}.timer"' in script
        assert 'install_backup_schedule "vitora-hub-backup"' in script
        assert 'install_backup_schedule "vitora-hub-backup-upload"' in script
        assert 'install_backup_schedule "vitora-hub-backup-verify"' in script
        assert "LoadCredentialEncrypted=hub-secrets:${HUB_SECRETS_FILE}" in script
        assert "ExecStart=${APP_DIR}/scripts/start-hub-linux.sh ${launcher_mode}" in script
        assert '"vitora-hub-backup" "backup"' in script
        assert '"vitora-hub-backup-upload" "backup-upload"' in script
        assert '"vitora-hub-backup-verify" "backup-verify"' in script
        assert "OnCalendar=daily" in script
        assert "OnUnitActiveSec=30min" in script
        assert "OnCalendar=weekly" in script
        assert "EnvironmentFile=${HUB_SECRETS_FILE}" not in script

    launcher = (REPO_ROOT / "backend/scripts/start-hub-linux.sh").read_text()
    assert '"$APP_DIR/manage.py" hub_backup' in launcher
    assert '"$APP_DIR/manage.py" hub_backup_upload' in launcher

    for script in (installer, updater):
        assert "hub_backup_encryption_key" in script
        assert "Fernet.generate_key" in script


def test_windows_backup_tasks_run_via_the_dpapi_launcher_without_secret_arguments():
    """Tasks execute the launcher as SYSTEM and do not persist key material in task args."""
    installer = (REPO_ROOT / "backend/scripts/install-hub-windows.ps1").read_text()
    updater = (REPO_ROOT / "backend/scripts/update-hub-windows.ps1").read_text()
    launcher = (REPO_ROOT / "backend/scripts/start-hub-windows.ps1").read_text()

    for script in (installer, updater):
        assert "Register-HubBackupTasks" in script
        assert "VitoraHubDailyBackup" in script
        assert "VitoraHubBackupUpload" in script
        assert "VitoraHubWeeklyBackupVerify" in script
        assert '$LauncherPath`" -Mode backup' in script
        assert '$LauncherPath`" -Mode backup-upload' in script
        assert '$LauncherPath`" -Mode backup-verify' in script
        assert "New-ScheduledTaskTrigger -Daily" in script
        assert "New-ScheduledTaskTrigger -Once -At" in script
        assert "New-TimeSpan -Minutes 30" in script
        assert "New-ScheduledTaskTrigger -Weekly" in script
        assert '-UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount' in script
        assert "HUB_BACKUP_ENCRYPTION_KEY=" not in script

    assert '[ValidateSet("api", "sync", "backup", "backup-upload", "backup-verify")]' in launcher
    assert '$managePy = Join-Path $InstallDir "manage.py"' in launcher
    assert "& $pythonExe $managePy hub_backup --verify" in launcher
    assert "& $pythonExe $managePy hub_backup_upload" in launcher

    for script in (installer, updater):
        assert "HUB_BACKUP_ENCRYPTION_KEY" in script
        assert "Fernet.generate_key" in script

    rotator = (REPO_ROOT / "backend/scripts/rotate-hub-secrets.ps1").read_text()
    assert "HUB_DATABASE_ENCRYPTION_KEY" in rotator
    assert "HUB_BACKUP_ENCRYPTION_KEY" in rotator


def test_hub_backup_command_supports_post_snapshot_verification():
    """The weekly schedule must be able to create and verify one encrypted bundle."""
    command = (REPO_ROOT / "backend/hmis/apps/core/management/commands/hub_backup.py").read_text()

    assert '"--verify"' in command
    assert "verify_backup(bundle)" in command
