#!/usr/bin/env python3
"""
Vitora HMIS - Backup Monitoring Script

Monitors backup health and sends alerts when:
- No backup exists within the expected window
- Backup size is suspiciously small
- Backup verification fails
- S3 sync is out of date

Usage:
    ./backup_monitor.py                     # Check all backups
    ./backup_monitor.py --env production    # Check specific environment
    ./backup_monitor.py --alert-only        # Only alert on failures

Environment Variables:
    BACKUP_DIR             - Local backup directory
    S3_BUCKET              - S3 bucket name (optional)
    SLACK_WEBHOOK_URL      - Slack notifications (optional)
    ALERT_EMAIL            - Email for alerts (optional)
    BACKUP_ENCRYPTION_KEY  - For verifying encrypted backups

Cron setup (every 6 hours):
    0 */6 * * * /path/to/backend/scripts/backup_monitor.py >> /var/log/vitora-backup-monitor.log 2>&1
"""

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# Try to import requests for alerting
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


@dataclass
class BackupInfo:
    """Information about a backup file."""
    path: Path
    timestamp: datetime
    size_bytes: int
    environment: str
    encrypted: bool
    checksum_valid: Optional[bool] = None


@dataclass
class MonitoringResult:
    """Result of backup monitoring checks."""
    healthy: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    info: list[str] = field(default_factory=list)
    latest_backup: Optional[BackupInfo] = None


class BackupMonitor:
    """Monitors backup health and sends alerts."""

    # Thresholds
    MAX_BACKUP_AGE_HOURS = 26  # Allow for daily backup + 2 hour buffer
    MIN_BACKUP_SIZE_MB = 1     # Minimum expected backup size
    MAX_BACKUP_SIZE_GB = 50    # Maximum reasonable backup size

    def __init__(
        self,
        backup_dir: str = "/var/backups/vitora",
        environment: str = "staging",
        s3_bucket: Optional[str] = None,
    ):
        self.backup_dir = Path(backup_dir)
        self.environment = environment
        self.s3_bucket = s3_bucket or os.environ.get("S3_BUCKET")
        self.encryption_key = os.environ.get("BACKUP_ENCRYPTION_KEY")
        self.slack_webhook = os.environ.get("SLACK_WEBHOOK_URL")
        self.alert_email = os.environ.get("ALERT_EMAIL")

    def check_local_backups(self) -> MonitoringResult:
        """Check local backup health."""
        result = MonitoringResult()

        if not self.backup_dir.exists():
            result.healthy = False
            result.errors.append(f"Backup directory does not exist: {self.backup_dir}")
            return result

        # Find backup files for this environment (excluding checksum/manifest files)
        pattern = f"vitora_{self.environment}_*_db.*"
        backup_files = sorted(
            [f for f in self.backup_dir.glob(pattern) 
             if not f.suffix in (".sha256", ".json") and "_manifest" not in f.name],
            key=lambda f: f.stat().st_mtime,
            reverse=True
        )

        if not backup_files:
            result.healthy = False
            result.errors.append(f"No backups found for environment: {self.environment}")
            return result

        # Check latest backup
        latest_file = backup_files[0]
        latest_stat = latest_file.stat()
        latest_time = datetime.fromtimestamp(latest_stat.st_mtime)
        age_hours = (datetime.now() - latest_time).total_seconds() / 3600

        latest_backup = BackupInfo(
            path=latest_file,
            timestamp=latest_time,
            size_bytes=latest_stat.st_size,
            environment=self.environment,
            encrypted=latest_file.suffix == ".gpg",
        )
        result.latest_backup = latest_backup

        # Check age
        if age_hours > self.MAX_BACKUP_AGE_HOURS:
            result.healthy = False
            result.errors.append(
                f"Latest backup is {age_hours:.1f} hours old (threshold: {self.MAX_BACKUP_AGE_HOURS}h)"
            )
        else:
            result.info.append(f"Latest backup age: {age_hours:.1f} hours")

        # Check size
        size_mb = latest_stat.st_size / (1024 * 1024)
        if size_mb < self.MIN_BACKUP_SIZE_MB:
            result.healthy = False
            result.errors.append(
                f"Backup suspiciously small: {size_mb:.2f} MB (minimum: {self.MIN_BACKUP_SIZE_MB} MB)"
            )
        elif size_mb > self.MAX_BACKUP_SIZE_GB * 1024:
            result.warnings.append(
                f"Backup unusually large: {size_mb:.2f} MB"
            )
        else:
            result.info.append(f"Backup size: {size_mb:.2f} MB")

        # Check checksum
        checksum_file = latest_file.with_suffix(latest_file.suffix + ".sha256")
        if checksum_file.exists():
            try:
                subprocess.run(
                    ["sha256sum", "-c", str(checksum_file)],
                    cwd=str(self.backup_dir),
                    check=True,
                    capture_output=True,
                )
                latest_backup.checksum_valid = True
                result.info.append("Checksum verification: PASSED")
            except subprocess.CalledProcessError:
                latest_backup.checksum_valid = False
                result.healthy = False
                result.errors.append("Checksum verification: FAILED")
        else:
            result.warnings.append("No checksum file found for latest backup")

        # Check backup count (retention)
        backup_count = len(backup_files)
        result.info.append(f"Total local backups: {backup_count}")

        if backup_count < 7:
            result.warnings.append(f"Low backup count: {backup_count} (expected at least 7 for weekly coverage)")

        return result

    def check_s3_backups(self) -> MonitoringResult:
        """Check S3 backup sync status."""
        result = MonitoringResult()

        if not self.s3_bucket:
            result.info.append("S3 backup not configured")
            return result

        try:
            # List S3 objects
            s3_endpoint = os.environ.get("S3_ENDPOINT", "")
            cmd = [
                "aws", "s3", "ls",
                f"s3://{self.s3_bucket}/backups/{self.environment}/",
                "--recursive",
            ]
            if s3_endpoint:
                cmd.extend(["--endpoint-url", s3_endpoint])

            proc = subprocess.run(cmd, capture_output=True, text=True)

            if proc.returncode != 0:
                result.warnings.append(f"Could not check S3: {proc.stderr}")
                return result

            # Parse output
            lines = [l for l in proc.stdout.strip().split("\n") if l.strip()]
            if not lines:
                result.healthy = False
                result.errors.append("No backups found in S3")
                return result

            # Check latest S3 backup
            latest_line = lines[-1]  # Last line is most recent
            parts = latest_line.split()
            if len(parts) >= 3:
                date_str = f"{parts[0]} {parts[1]}"
                try:
                    s3_latest_time = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
                    age_hours = (datetime.now() - s3_latest_time).total_seconds() / 3600

                    if age_hours > self.MAX_BACKUP_AGE_HOURS:
                        result.healthy = False
                        result.errors.append(
                            f"S3 backup is {age_hours:.1f} hours old (threshold: {self.MAX_BACKUP_AGE_HOURS}h)"
                        )
                    else:
                        result.info.append(f"S3 backup age: {age_hours:.1f} hours")
                except ValueError:
                    result.warnings.append("Could not parse S3 backup timestamp")

            result.info.append(f"S3 backup count: {len(lines)}")

        except FileNotFoundError:
            result.warnings.append("AWS CLI not installed, cannot check S3 backups")
        except Exception as e:
            result.warnings.append(f"S3 check failed: {str(e)}")

        return result

    def verify_backup_integrity(self) -> MonitoringResult:
        """Verify the latest backup can be decrypted/decompressed."""
        result = MonitoringResult()

        if not result.latest_backup:
            # Get latest backup
            pattern = f"vitora_{self.environment}_*_db.*"
            backup_files = sorted(
                self.backup_dir.glob(pattern),
                key=lambda f: f.stat().st_mtime,
                reverse=True
            )
            if not backup_files:
                result.warnings.append("No backup to verify")
                return result

            latest_file = backup_files[0]
        else:
            latest_file = result.latest_backup.path

        # Test decryption if encrypted
        if latest_file.suffix == ".gpg":
            if not self.encryption_key:
                result.warnings.append("Cannot verify encrypted backup: BACKUP_ENCRYPTION_KEY not set")
                return result

            try:
                proc = subprocess.run(
                    ["gpg", "--batch", "--passphrase-fd", "0", "-d", str(latest_file)],
                    input=self.encryption_key.encode(),
                    capture_output=True,
                    timeout=60,
                )
                # Just check first few bytes can be read
                if proc.returncode == 0:
                    result.info.append("Decryption test: PASSED")
                else:
                    result.healthy = False
                    result.errors.append("Decryption test: FAILED")
            except subprocess.TimeoutExpired:
                result.warnings.append("Decryption test: TIMEOUT")
            except Exception as e:
                result.warnings.append(f"Decryption test failed: {str(e)}")

        return result

    def run_all_checks(self) -> MonitoringResult:
        """Run all monitoring checks."""
        combined = MonitoringResult()

        # Local backup checks
        local_result = self.check_local_backups()
        combined.healthy &= local_result.healthy
        combined.errors.extend(local_result.errors)
        combined.warnings.extend(local_result.warnings)
        combined.info.extend(local_result.info)
        combined.latest_backup = local_result.latest_backup

        # S3 checks
        s3_result = self.check_s3_backups()
        combined.healthy &= s3_result.healthy
        combined.errors.extend(s3_result.errors)
        combined.warnings.extend(s3_result.warnings)
        combined.info.extend(s3_result.info)

        # Integrity verification
        integrity_result = self.verify_backup_integrity()
        combined.healthy &= integrity_result.healthy
        combined.errors.extend(integrity_result.errors)
        combined.warnings.extend(integrity_result.warnings)
        combined.info.extend(integrity_result.info)

        return combined

    def send_slack_alert(self, result: MonitoringResult):
        """Send Slack notification."""
        if not self.slack_webhook or not HAS_REQUESTS:
            return

        if result.healthy and not result.warnings:
            return  # Don't alert on all-clear

        color = "danger" if not result.healthy else "warning"
        status = "FAILED" if not result.healthy else "WARNING"

        blocks = []
        if result.errors:
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Errors:*\n" + "\n".join(f"• {e}" for e in result.errors)
                }
            })
        if result.warnings:
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Warnings:*\n" + "\n".join(f"• {w}" for w in result.warnings)
                }
            })

        payload = {
            "attachments": [{
                "color": color,
                "title": f"Vitora Backup Monitor: {status}",
                "fields": [
                    {"title": "Environment", "value": self.environment, "short": True},
                    {"title": "Timestamp", "value": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "short": True},
                ],
                "blocks": blocks,
            }]
        }

        try:
            requests.post(self.slack_webhook, json=payload, timeout=10)
        except Exception as e:
            print(f"Failed to send Slack alert: {e}", file=sys.stderr)

    def send_email_alert(self, result: MonitoringResult):
        """Send email notification."""
        if not self.alert_email:
            return

        if result.healthy and not result.warnings:
            return

        subject = f"[{'CRITICAL' if not result.healthy else 'WARNING'}] Vitora Backup Monitor - {self.environment}"

        body = f"""
Vitora HMIS Backup Monitoring Report
Environment: {self.environment}
Timestamp: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
Status: {'HEALTHY' if result.healthy else 'UNHEALTHY'}

ERRORS:
{chr(10).join('- ' + e for e in result.errors) if result.errors else 'None'}

WARNINGS:
{chr(10).join('- ' + w for w in result.warnings) if result.warnings else 'None'}

INFO:
{chr(10).join('- ' + i for i in result.info)}

--
Vitora HMIS Automated Backup Monitor
"""

        try:
            subprocess.run(
                ["mail", "-s", subject, self.alert_email],
                input=body.encode(),
                timeout=30,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            print(f"Failed to send email alert: {e}", file=sys.stderr)

    def print_report(self, result: MonitoringResult):
        """Print monitoring report to stdout."""
        print("=" * 60)
        print(f"VITORA BACKUP MONITOR - {self.environment.upper()}")
        print("=" * 60)
        print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Status: {'✓ HEALTHY' if result.healthy else '✗ UNHEALTHY'}")
        print()

        if result.errors:
            print("ERRORS:")
            for error in result.errors:
                print(f"  ✗ {error}")
            print()

        if result.warnings:
            print("WARNINGS:")
            for warning in result.warnings:
                print(f"  ⚠ {warning}")
            print()

        if result.info:
            print("INFO:")
            for info in result.info:
                print(f"  • {info}")
            print()

        if result.latest_backup:
            print("LATEST BACKUP:")
            print(f"  File: {result.latest_backup.path.name}")
            print(f"  Time: {result.latest_backup.timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"  Size: {result.latest_backup.size_bytes / (1024*1024):.2f} MB")
            print(f"  Encrypted: {'Yes' if result.latest_backup.encrypted else 'No'}")
            if result.latest_backup.checksum_valid is not None:
                print(f"  Checksum: {'Valid' if result.latest_backup.checksum_valid else 'INVALID'}")
            print()

        print("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Monitor Vitora HMIS backup health"
    )
    parser.add_argument(
        "--env",
        default=os.environ.get("VITORA_ENV", "staging"),
        help="Environment to check (default: staging)",
    )
    parser.add_argument(
        "--backup-dir",
        default=os.environ.get("BACKUP_DIR", "/var/backups/vitora"),
        help="Backup directory path",
    )
    parser.add_argument(
        "--alert-only",
        action="store_true",
        help="Only print output if there are errors or warnings",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output in JSON format",
    )

    args = parser.parse_args()

    monitor = BackupMonitor(
        backup_dir=args.backup_dir,
        environment=args.env,
    )

    result = monitor.run_all_checks()

    # Output
    if args.json:
        output = {
            "healthy": result.healthy,
            "environment": args.env,
            "timestamp": datetime.now().isoformat(),
            "errors": result.errors,
            "warnings": result.warnings,
            "info": result.info,
        }
        if result.latest_backup:
            output["latest_backup"] = {
                "path": str(result.latest_backup.path),
                "timestamp": result.latest_backup.timestamp.isoformat(),
                "size_bytes": result.latest_backup.size_bytes,
                "encrypted": result.latest_backup.encrypted,
                "checksum_valid": result.latest_backup.checksum_valid,
            }
        print(json.dumps(output, indent=2))
    elif not args.alert_only or not result.healthy or result.warnings:
        monitor.print_report(result)

    # Send alerts
    if not result.healthy or result.warnings:
        monitor.send_slack_alert(result)
        monitor.send_email_alert(result)

    # Exit code
    sys.exit(0 if result.healthy else 1)


if __name__ == "__main__":
    main()
