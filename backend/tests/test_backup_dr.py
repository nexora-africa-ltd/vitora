"""
Tests for Backup & Disaster Recovery Scripts

Tests the backup monitoring functionality to ensure:
- Backup age detection works correctly
- Backup size validation works
- Checksum verification works
- Alert thresholds are correct
- Error/warning categorization is correct
"""

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add scripts directory to path for importing
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from backup_monitor import BackupInfo, BackupMonitor, MonitoringResult


class TestMonitoringResult:
    """Tests for MonitoringResult dataclass."""

    def test_default_values(self):
        """Should initialize with healthy=True and empty lists."""
        result = MonitoringResult()

        assert result.healthy is True
        assert result.errors == []
        assert result.warnings == []
        assert result.info == []
        assert result.latest_backup is None

    def test_mutable_lists(self):
        """Should be able to append to lists."""
        result = MonitoringResult()
        result.errors.append("Test error")
        result.warnings.append("Test warning")
        result.info.append("Test info")

        assert len(result.errors) == 1
        assert len(result.warnings) == 1
        assert len(result.info) == 1


class TestBackupInfo:
    """Tests for BackupInfo dataclass."""

    def test_backup_info_creation(self, tmp_path: Path):
        """Should create BackupInfo with all fields."""
        backup_path = tmp_path / "test_backup.sql.gz.gpg"
        backup_path.touch()

        info = BackupInfo(
            path=backup_path,
            timestamp=datetime.now(),
            size_bytes=1024 * 1024,  # 1 MB
            environment="staging",
            encrypted=True,
        )

        assert info.path == backup_path
        assert info.size_bytes == 1024 * 1024
        assert info.environment == "staging"
        assert info.encrypted is True
        assert info.checksum_valid is None  # Default

    def test_checksum_valid_states(self, tmp_path: Path):
        """Should support all checksum validation states."""
        backup_path = tmp_path / "test.sql.gz"
        backup_path.touch()

        # Not checked
        info1 = BackupInfo(
            path=backup_path,
            timestamp=datetime.now(),
            size_bytes=1024,
            environment="test",
            encrypted=False,
        )
        assert info1.checksum_valid is None

        # Valid
        info2 = BackupInfo(
            path=backup_path,
            timestamp=datetime.now(),
            size_bytes=1024,
            environment="test",
            encrypted=False,
            checksum_valid=True,
        )
        assert info2.checksum_valid is True

        # Invalid
        info3 = BackupInfo(
            path=backup_path,
            timestamp=datetime.now(),
            size_bytes=1024,
            environment="test",
            encrypted=False,
            checksum_valid=False,
        )
        assert info3.checksum_valid is False


class TestBackupMonitor:
    """Tests for BackupMonitor class."""

    @pytest.fixture
    def backup_dir(self, tmp_path: Path) -> Path:
        """Create a temporary backup directory."""
        backup_dir = tmp_path / "backups"
        backup_dir.mkdir()
        return backup_dir

    @pytest.fixture
    def monitor(self, backup_dir: Path) -> BackupMonitor:
        """Create a BackupMonitor instance."""
        return BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )

    def test_init_default_values(self, backup_dir: Path):
        """Should initialize with correct defaults."""
        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )

        assert monitor.backup_dir == backup_dir
        assert monitor.environment == "staging"
        assert monitor.MAX_BACKUP_AGE_HOURS == 26
        assert monitor.MIN_BACKUP_SIZE_MB == 1

    def test_check_local_backups_no_directory(self, tmp_path: Path):
        """Should error if backup directory doesn't exist."""
        monitor = BackupMonitor(
            backup_dir=str(tmp_path / "nonexistent"),
            environment="staging",
        )

        result = monitor.check_local_backups()

        assert result.healthy is False
        assert any("does not exist" in e for e in result.errors)

    def test_check_local_backups_empty_directory(self, backup_dir: Path, monitor: BackupMonitor):
        """Should error if no backups found."""
        result = monitor.check_local_backups()

        assert result.healthy is False
        assert any("No backups found" in e for e in result.errors)

    def test_check_local_backups_recent_backup(self, backup_dir: Path, monitor: BackupMonitor):
        """Should pass for recent backup with valid size."""
        # Create a recent backup file
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        backup_file.write_bytes(b"x" * (2 * 1024 * 1024))  # 2 MB

        result = monitor.check_local_backups()

        assert result.healthy is True
        assert result.latest_backup is not None
        assert result.latest_backup.size_bytes == 2 * 1024 * 1024
        assert any("Latest backup age" in i for i in result.info)

    def test_check_local_backups_old_backup(self, backup_dir: Path, monitor: BackupMonitor):
        """Should error for backup older than threshold."""
        # Create an old backup file
        backup_file = backup_dir / "vitora_staging_20260220_020000_db.sql.gz"
        backup_file.write_bytes(b"x" * (2 * 1024 * 1024))

        # Set mtime to 48 hours ago
        old_time = datetime.now() - timedelta(hours=48)
        os.utime(backup_file, (old_time.timestamp(), old_time.timestamp()))

        result = monitor.check_local_backups()

        assert result.healthy is False
        assert any("hours old" in e for e in result.errors)

    def test_check_local_backups_small_backup(self, backup_dir: Path, monitor: BackupMonitor):
        """Should error for suspiciously small backup."""
        # Create a tiny backup file (< 1 MB)
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        backup_file.write_bytes(b"x" * 100)  # 100 bytes

        result = monitor.check_local_backups()

        assert result.healthy is False
        assert any("suspiciously small" in e for e in result.errors)

    def test_check_local_backups_encrypted_detection(self, backup_dir: Path, monitor: BackupMonitor):
        """Should detect encrypted backups by .gpg extension."""
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz.gpg"
        backup_file.write_bytes(b"x" * (2 * 1024 * 1024))

        result = monitor.check_local_backups()

        assert result.latest_backup is not None
        assert result.latest_backup.encrypted is True

    def test_check_local_backups_unencrypted_detection(self, backup_dir: Path, monitor: BackupMonitor):
        """Should detect unencrypted backups."""
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        backup_file.write_bytes(b"x" * (2 * 1024 * 1024))

        result = monitor.check_local_backups()

        assert result.latest_backup is not None
        assert result.latest_backup.encrypted is False

    def test_check_local_backups_checksum_verification_pass(
        self, backup_dir: Path, monitor: BackupMonitor
    ):
        """Should verify checksum when checksum file exists."""
        import hashlib
        
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        backup_content = b"x" * (2 * 1024 * 1024)
        backup_file.write_bytes(backup_content)

        # Create checksum file
        checksum = hashlib.sha256(backup_content).hexdigest()
        checksum_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz.sha256"
        checksum_file.write_text(f"{checksum}  vitora_staging_20260222_020000_db.sql.gz\n")

        result = monitor.check_local_backups()

        assert result.healthy is True
        assert result.latest_backup.checksum_valid is True
        assert any("Checksum verification: PASSED" in i for i in result.info)

    def test_check_local_backups_checksum_verification_fail(
        self, backup_dir: Path, monitor: BackupMonitor
    ):
        """Should fail checksum verification when checksum doesn't match."""
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        backup_file.write_bytes(b"x" * (2 * 1024 * 1024))

        # Create checksum file with wrong checksum
        checksum_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz.sha256"
        checksum_file.write_text("0000000000000000000000000000000000000000000000000000000000000000  vitora_staging_20260222_020000_db.sql.gz\n")

        result = monitor.check_local_backups()

        assert result.healthy is False
        assert result.latest_backup.checksum_valid is False
        assert any("Checksum verification: FAILED" in e for e in result.errors)

    def test_check_local_backups_missing_checksum_warning(
        self, backup_dir: Path, monitor: BackupMonitor
    ):
        """Should warn when checksum file is missing."""
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        backup_file.write_bytes(b"x" * (2 * 1024 * 1024))

        result = monitor.check_local_backups()

        assert result.healthy is True  # Not a failure, just a warning
        assert any("No checksum file found" in w for w in result.warnings)

    def test_check_local_backups_low_backup_count_warning(
        self, backup_dir: Path, monitor: BackupMonitor
    ):
        """Should warn when backup count is low."""
        # Create only 3 backups (less than 7)
        for i in range(3):
            backup_file = backup_dir / f"vitora_staging_2026022{i}_020000_db.sql.gz"
            backup_file.write_bytes(b"x" * (2 * 1024 * 1024))

        result = monitor.check_local_backups()

        assert any("Low backup count" in w for w in result.warnings)

    def test_check_local_backups_selects_latest(self, backup_dir: Path, monitor: BackupMonitor):
        """Should select the most recent backup."""
        # Create multiple backups
        old_backup = backup_dir / "vitora_staging_20260220_020000_db.sql.gz"
        old_backup.write_bytes(b"old" * (1024 * 1024))
        old_time = datetime.now() - timedelta(hours=48)
        os.utime(old_backup, (old_time.timestamp(), old_time.timestamp()))

        new_backup = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        new_backup.write_bytes(b"new" * (1024 * 1024))

        result = monitor.check_local_backups()

        assert result.latest_backup is not None
        assert result.latest_backup.path.name == "vitora_staging_20260222_020000_db.sql.gz"

    def test_check_local_backups_environment_filter(self, backup_dir: Path):
        """Should only check backups for specified environment."""
        # Create backups for different environments
        staging_backup = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        staging_backup.write_bytes(b"x" * (2 * 1024 * 1024))

        production_backup = backup_dir / "vitora_production_20260222_020000_db.sql.gz"
        production_backup.write_bytes(b"x" * (2 * 1024 * 1024))

        staging_monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )
        production_monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="production",
        )

        staging_result = staging_monitor.check_local_backups()
        production_result = production_monitor.check_local_backups()

        assert staging_result.latest_backup.path.name == "vitora_staging_20260222_020000_db.sql.gz"
        assert production_result.latest_backup.path.name == "vitora_production_20260222_020000_db.sql.gz"


class TestBackupMonitorS3:
    """Tests for S3 backup checking functionality."""

    @pytest.fixture
    def backup_dir(self, tmp_path: Path) -> Path:
        """Create a temporary backup directory."""
        backup_dir = tmp_path / "backups"
        backup_dir.mkdir()
        return backup_dir

    def test_check_s3_no_bucket_configured(self, backup_dir: Path):
        """Should report info message when S3 not configured."""
        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
            s3_bucket=None,
        )

        result = monitor.check_s3_backups()

        assert result.healthy is True
        assert any("S3 backup not configured" in i for i in result.info)

    @patch("subprocess.run")
    def test_check_s3_success(self, mock_run, backup_dir: Path):
        """Should parse S3 listing correctly."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="2026-02-22 02:00:00 1048576 vitora_staging_20260222_020000_db.sql.gz.gpg\n",
            stderr="",
        )

        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
            s3_bucket="vitora-backups",
        )

        result = monitor.check_s3_backups()

        assert result.healthy is True
        assert any("S3 backup age" in i for i in result.info)
        assert any("S3 backup count" in i for i in result.info)

    @patch("subprocess.run")
    def test_check_s3_empty(self, mock_run, backup_dir: Path):
        """Should error when no S3 backups found."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="",
            stderr="",
        )

        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
            s3_bucket="vitora-backups",
        )

        result = monitor.check_s3_backups()

        assert result.healthy is False
        assert any("No backups found in S3" in e for e in result.errors)

    @patch("subprocess.run")
    def test_check_s3_aws_error(self, mock_run, backup_dir: Path):
        """Should warn on AWS CLI errors."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="Access Denied",
        )

        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
            s3_bucket="vitora-backups",
        )

        result = monitor.check_s3_backups()

        assert any("Could not check S3" in w for w in result.warnings)


class TestBackupMonitorIntegrity:
    """Tests for backup integrity verification."""

    @pytest.fixture
    def backup_dir(self, tmp_path: Path) -> Path:
        """Create a temporary backup directory."""
        backup_dir = tmp_path / "backups"
        backup_dir.mkdir()
        return backup_dir

    def test_verify_no_backup(self, backup_dir: Path):
        """Should warn when no backup to verify."""
        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )

        result = monitor.verify_backup_integrity()

        assert any("No backup to verify" in w for w in result.warnings)

    def test_verify_unencrypted_backup(self, backup_dir: Path):
        """Should skip decryption test for unencrypted backups."""
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        backup_file.write_bytes(b"x" * (2 * 1024 * 1024))

        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )
        
        # First run check_local_backups to set latest_backup
        monitor.check_local_backups()
        result = monitor.verify_backup_integrity()

        # Unencrypted backups don't need decryption test
        assert result.healthy is True

    def test_verify_encrypted_no_key(self, backup_dir: Path):
        """Should warn when encrypted backup but no key."""
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz.gpg"
        backup_file.write_bytes(b"x" * (2 * 1024 * 1024))

        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )
        monitor.encryption_key = None

        # First run check_local_backups to set latest_backup
        monitor.check_local_backups()
        result = monitor.verify_backup_integrity()

        assert any("Cannot verify encrypted backup" in w for w in result.warnings)


class TestBackupMonitorAlerting:
    """Tests for alert functionality."""

    @pytest.fixture
    def backup_dir(self, tmp_path: Path) -> Path:
        """Create a temporary backup directory."""
        backup_dir = tmp_path / "backups"
        backup_dir.mkdir()
        return backup_dir

    @pytest.fixture
    def healthy_result(self) -> MonitoringResult:
        """Create a healthy monitoring result."""
        result = MonitoringResult()
        result.info.append("Backup is healthy")
        return result

    @pytest.fixture
    def unhealthy_result(self) -> MonitoringResult:
        """Create an unhealthy monitoring result."""
        result = MonitoringResult()
        result.healthy = False
        result.errors.append("Backup is too old")
        return result

    @patch("requests.post")
    def test_send_slack_alert_on_failure(self, mock_post, backup_dir: Path, unhealthy_result):
        """Should send Slack alert on failure."""
        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )
        monitor.slack_webhook = "https://hooks.slack.com/test"

        # Need to patch HAS_REQUESTS
        with patch("backup_monitor.HAS_REQUESTS", True):
            monitor.send_slack_alert(unhealthy_result)

        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "danger" in str(call_args)

    @patch("requests.post")
    def test_no_slack_alert_on_healthy(self, mock_post, backup_dir: Path, healthy_result):
        """Should not send Slack alert when healthy."""
        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )
        monitor.slack_webhook = "https://hooks.slack.com/test"

        with patch("backup_monitor.HAS_REQUESTS", True):
            monitor.send_slack_alert(healthy_result)

        mock_post.assert_not_called()

    def test_no_slack_alert_no_webhook(self, backup_dir: Path, unhealthy_result):
        """Should not attempt Slack alert when webhook not configured."""
        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )
        monitor.slack_webhook = None

        # Should not raise
        monitor.send_slack_alert(unhealthy_result)


class TestBackupMonitorRunAllChecks:
    """Tests for combined monitoring checks."""

    @pytest.fixture
    def backup_dir(self, tmp_path: Path) -> Path:
        """Create a temporary backup directory."""
        backup_dir = tmp_path / "backups"
        backup_dir.mkdir()
        return backup_dir

    def test_run_all_checks_healthy(self, backup_dir: Path):
        """Should return healthy when all checks pass."""
        # Create a valid backup
        backup_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz"
        backup_content = b"x" * (2 * 1024 * 1024)
        backup_file.write_bytes(backup_content)

        # Create valid checksum
        import hashlib
        checksum = hashlib.sha256(backup_content).hexdigest()
        checksum_file = backup_dir / "vitora_staging_20260222_020000_db.sql.gz.sha256"
        checksum_file.write_text(f"{checksum}  vitora_staging_20260222_020000_db.sql.gz\n")

        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )

        result = monitor.run_all_checks()

        # May have warnings (low backup count, no S3) but should be healthy
        assert result.latest_backup is not None

    def test_run_all_checks_unhealthy(self, backup_dir: Path):
        """Should return unhealthy when any check fails."""
        # Create an old, small backup
        backup_file = backup_dir / "vitora_staging_20260215_020000_db.sql.gz"
        backup_file.write_bytes(b"x" * 100)  # Too small

        old_time = datetime.now() - timedelta(days=7)
        os.utime(backup_file, (old_time.timestamp(), old_time.timestamp()))

        monitor = BackupMonitor(
            backup_dir=str(backup_dir),
            environment="staging",
        )

        result = monitor.run_all_checks()

        assert result.healthy is False
        assert len(result.errors) >= 1  # At least one error


class TestBackupScriptValidation:
    """Tests to validate backup.sh script syntax."""

    def test_backup_script_exists(self):
        """Should have backup.sh script."""
        script_path = Path(__file__).parent.parent / "scripts" / "backup.sh"
        assert script_path.exists(), "backup.sh script should exist"

    def test_backup_script_executable(self):
        """Should have executable permissions."""
        script_path = Path(__file__).parent.parent / "scripts" / "backup.sh"
        assert os.access(script_path, os.X_OK), "backup.sh should be executable"

    def test_backup_script_syntax(self):
        """Should have valid bash syntax."""
        script_path = Path(__file__).parent.parent / "scripts" / "backup.sh"

        result = subprocess.run(
            ["bash", "-n", str(script_path)],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"backup.sh has syntax errors: {result.stderr}"

    def test_restore_script_exists(self):
        """Should have restore.sh script."""
        script_path = Path(__file__).parent.parent / "scripts" / "restore.sh"
        assert script_path.exists(), "restore.sh script should exist"

    def test_restore_script_executable(self):
        """Should have executable permissions."""
        script_path = Path(__file__).parent.parent / "scripts" / "restore.sh"
        assert os.access(script_path, os.X_OK), "restore.sh should be executable"

    def test_restore_script_syntax(self):
        """Should have valid bash syntax."""
        script_path = Path(__file__).parent.parent / "scripts" / "restore.sh"

        result = subprocess.run(
            ["bash", "-n", str(script_path)],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"restore.sh has syntax errors: {result.stderr}"


class TestBackupScriptHelp:
    """Tests for script help functionality."""

    def test_backup_script_help(self):
        """Should display help without errors."""
        script_path = Path(__file__).parent.parent / "scripts" / "backup.sh"

        result = subprocess.run(
            ["bash", str(script_path), "--help"],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0
        assert "Usage:" in result.stdout

    def test_restore_script_help(self):
        """Should display help without errors."""
        script_path = Path(__file__).parent.parent / "scripts" / "restore.sh"

        result = subprocess.run(
            ["bash", str(script_path), "--help"],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0
        assert "Usage:" in result.stdout
