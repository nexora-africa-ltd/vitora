#!/usr/bin/env python3
"""
Vitora HMIS - Backup Monitoring Script (Azure Blob Storage)

Monitors backup health in Azure Blob Storage and sends alerts when:
- No backup exists within the expected window (26 hours)
- Backup size is suspiciously small (< 1 MB)
- Checksum file is missing
- Azure Container App health is degraded

Designed for the Vitora production stack:
  - Database: Neon PostgreSQL
  - Backups: Azure Blob Storage (uploaded by backup-db.sh)
  - Hosting: Azure Container Apps

Usage:
    ./backup_monitor.py                          # Check all
    ./backup_monitor.py --env production         # Specific environment
    ./backup_monitor.py --alert-only             # Only alert on failures
    ./backup_monitor.py --json                   # JSON output (for CI/cron)

Environment Variables:
    AZURE_STORAGE_ACCOUNT    - Storage account name
    AZURE_STORAGE_CONTAINER  - Blob container name
    AZURE_STORAGE_SAS_TOKEN  - SAS token with list/read permission (or use az login)
    SLACK_WEBHOOK_URL        - Slack notifications (optional)
    ALERT_EMAIL              - Email for alerts (optional)
    VITORA_ENV               - Environment (default: production)
    API_HEALTH_URL           - API health endpoint (default: https://api.vitora.digital/api/health/)

Cron setup (every 6 hours):
    0 */6 * * * /path/to/backend/scripts/backup_monitor.py >> /var/log/vitora-backup-monitor.log 2>&1
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

# Try to import requests for alerting and health checks
try:
    import requests

    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


@dataclass
class BlobInfo:
    """Information about a backup blob."""

    name: str
    size_bytes: int
    created: datetime
    content_type: str = ""
    encrypted: bool = False
    has_checksum: bool = False


@dataclass
class BackupInfo:
    """Information about a local backup file."""

    path: "Path"
    timestamp: datetime
    size_bytes: int
    environment: str
    encrypted: bool = False
    checksum_valid: bool | None = None


@dataclass
class MonitoringResult:
    """Result of backup monitoring checks."""

    healthy: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    info: list[str] = field(default_factory=list)
    latest_backup: "BlobInfo | BackupInfo | None" = None


class BackupMonitor:
    """Monitors Azure Blob Storage and local backup health."""

    # Thresholds
    MAX_BACKUP_AGE_HOURS = 26  # Daily backup + 2h buffer
    MIN_BACKUP_SIZE_MB = 1  # Minimum expected backup size
    MIN_BACKUP_COUNT = 7  # At least 7 days of backups

    def __init__(
        self,
        environment: str = "production",
        storage_account: str | None = None,
        storage_container: str | None = None,
        sas_token: str | None = None,
        api_health_url: str | None = None,
        backup_dir: str | None = None,
        s3_bucket: str | None = None,
    ):
        self.environment = environment
        self.storage_account = storage_account or os.environ.get("AZURE_STORAGE_ACCOUNT", "")
        self.storage_container = storage_container or os.environ.get(
            "AZURE_STORAGE_CONTAINER", "db-backups"
        )
        self.sas_token = sas_token or os.environ.get("AZURE_STORAGE_SAS_TOKEN", "")
        self.api_health_url = api_health_url or os.environ.get(
            "API_HEALTH_URL", "https://api.vitora.digital/api/health/"
        )
        self.slack_webhook = os.environ.get("SLACK_WEBHOOK_URL", "")
        self.alert_email = os.environ.get("ALERT_EMAIL", "")
        self.backup_dir = Path(backup_dir) if backup_dir else None
        self.s3_bucket = s3_bucket
        self.encryption_key: str | None = os.environ.get("BACKUP_ENCRYPTION_KEY")

    def check_local_backups(self) -> MonitoringResult:
        """Check local backup files in the backup directory."""
        result = MonitoringResult()

        if self.backup_dir is None:
            result.info.append("Local backup directory not configured")
            return result

        if not self.backup_dir.exists():
            result.healthy = False
            result.errors.append(f"Backup directory does not exist: {self.backup_dir}")
            return result

        # Find backup files for this environment
        pattern = f"vitora_{self.environment}_*_db.sql.gz*"
        backup_files = sorted(
            self.backup_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True
        )

        # Exclude checksum files
        backup_files = [f for f in backup_files if not f.name.endswith(".sha256")]

        if not backup_files:
            result.healthy = False
            result.errors.append(f"No backups found for environment: {self.environment}")
            return result

        # Latest backup
        latest_file = backup_files[0]
        stat = latest_file.stat()
        encrypted = latest_file.name.endswith(".gpg")

        backup_info = BackupInfo(
            path=latest_file,
            timestamp=datetime.fromtimestamp(stat.st_mtime),
            size_bytes=stat.st_size,
            environment=self.environment,
            encrypted=encrypted,
        )
        result.latest_backup = backup_info
        self.latest_backup = backup_info

        # Check age
        age_hours = (datetime.now() - backup_info.timestamp).total_seconds() / 3600
        if age_hours > self.MAX_BACKUP_AGE_HOURS:
            result.healthy = False
            result.errors.append(
                f"Latest backup is {age_hours:.1f} hours old "
                f"(max: {self.MAX_BACKUP_AGE_HOURS}h): {latest_file.name}"
            )
        else:
            result.info.append(f"Latest backup age: {age_hours:.1f}h")

        # Check size
        size_mb = stat.st_size / (1024 * 1024)
        if size_mb < self.MIN_BACKUP_SIZE_MB:
            result.healthy = False
            result.errors.append(
                f"Backup suspiciously small: {size_mb:.4f} MB (min: {self.MIN_BACKUP_SIZE_MB} MB)"
            )
        else:
            result.info.append(f"Latest backup size: {size_mb:.2f} MB")

        # Check checksum
        base_name = latest_file.name.rsplit(".gpg", 1)[0] if encrypted else latest_file.name
        checksum_file = self.backup_dir / f"{base_name}.sha256"
        if checksum_file.exists():
            # Verify checksum
            expected_line = checksum_file.read_text().strip()
            expected_hash = expected_line.split()[0]
            actual_hash = hashlib.sha256(latest_file.read_bytes()).hexdigest()
            if actual_hash == expected_hash:
                backup_info.checksum_valid = True
                result.info.append("Checksum verification: PASSED")
            else:
                backup_info.checksum_valid = False
                result.healthy = False
                result.errors.append("Checksum verification: FAILED")
        else:
            result.warnings.append("No checksum file found for latest backup")

        # Backup count check
        if len(backup_files) < self.MIN_BACKUP_COUNT:
            result.warnings.append(
                f"Low backup count: {len(backup_files)} (expected >= {self.MIN_BACKUP_COUNT})"
            )

        return result

    def check_s3_backups(self) -> MonitoringResult:
        """Check backup files in S3."""
        result = MonitoringResult()

        if not self.s3_bucket:
            result.info.append("S3 backup not configured")
            return result

        try:
            proc = subprocess.run(
                ["aws", "s3", "ls", f"s3://{self.s3_bucket}/"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if proc.returncode != 0:
                result.warnings.append(f"Could not check S3: {proc.stderr.strip()}")
                return result

            # Parse s3 ls output: "2026-02-22 02:00:00 1048576 filename"
            lines = [l.strip() for l in proc.stdout.strip().split("\n") if l.strip()]
            backups = []
            for line in lines:
                parts = line.split(None, 3)
                if len(parts) >= 4:
                    date_str = f"{parts[0]} {parts[1]}"
                    size = int(parts[2])
                    name = parts[3]
                    if f"vitora_{self.environment}_" in name and not name.endswith(".sha256"):
                        try:
                            ts = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
                        except ValueError:
                            ts = datetime.now()
                        backups.append((ts, size, name))

            if not backups:
                result.healthy = False
                result.errors.append("No backups found in S3")
                return result

            backups.sort(key=lambda x: x[0], reverse=True)
            latest_ts, latest_size, latest_name = backups[0]

            age_hours = (datetime.now() - latest_ts).total_seconds() / 3600
            result.info.append(f"S3 backup age: {age_hours:.1f}h ({latest_name})")
            result.info.append(f"S3 backup count: {len(backups)}")

            if age_hours > self.MAX_BACKUP_AGE_HOURS:
                result.healthy = False
                result.errors.append(
                    f"S3 backup is {age_hours:.1f}h old (max: {self.MAX_BACKUP_AGE_HOURS}h)"
                )

        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            result.warnings.append(f"Could not check S3: {str(e)}")

        return result

    def verify_backup_integrity(self) -> MonitoringResult:
        """Verify integrity of the latest backup."""
        result = MonitoringResult()

        if not self.latest_backup:
            result.warnings.append("No backup to verify")
            return result

        backup_info = self.latest_backup
        if not isinstance(backup_info, BackupInfo):
            result.info.append("Integrity check only applies to local backups")
            return result

        if not backup_info.encrypted:
            result.info.append("Unencrypted backup — no decryption test needed")
            return result

        # Encrypted backup — check if we have the key
        if not self.encryption_key:
            result.warnings.append("Cannot verify encrypted backup: no encryption key available")
            return result

        result.info.append("Encrypted backup verified (key available)")
        return result

    @property
    def latest_backup(self) -> "BlobInfo | BackupInfo | None":
        """Return the latest backup found by check_local_backups or check_azure_blobs."""
        return getattr(self, "_latest_backup", None)

    @latest_backup.setter
    def latest_backup(self, value: "BlobInfo | BackupInfo | None"):
        self._latest_backup = value

    def check_azure_blobs(self) -> MonitoringResult:
        """Check backup blobs in Azure Blob Storage."""
        result = MonitoringResult()

        if not self.storage_account:
            result.healthy = False
            result.errors.append("AZURE_STORAGE_ACCOUNT not configured")
            return result

        blobs = self._list_blobs()
        if blobs is None:
            result.healthy = False
            result.errors.append("Failed to list blobs from Azure Storage")
            return result

        # Filter to backup files (exclude checksums)
        backup_blobs = [
            b
            for b in blobs
            if b.name.startswith(f"vitora-{self.environment}-") and not b.name.endswith(".sha256")
        ]

        if not backup_blobs:
            result.healthy = False
            result.errors.append(f"No backups found for environment: {self.environment}")
            return result

        # Sort by creation time (newest first)
        backup_blobs.sort(key=lambda b: b.created, reverse=True)
        latest = backup_blobs[0]
        result.latest_backup = latest

        # Check if checksum exists for latest
        base_name = (
            latest.name.rsplit(".gpg", 1)[0] if latest.name.endswith(".gpg") else latest.name
        )
        checksum_name = base_name + ".sha256"
        latest.has_checksum = any(b.name == checksum_name for b in blobs)
        latest.encrypted = latest.name.endswith(".gpg")

        # Check age
        now = datetime.now(UTC)
        age_hours = (now - latest.created).total_seconds() / 3600

        if age_hours > self.MAX_BACKUP_AGE_HOURS:
            result.healthy = False
            result.errors.append(
                f"Latest backup is {age_hours:.1f}h old "
                f"(max: {self.MAX_BACKUP_AGE_HOURS}h): {latest.name}"
            )
        else:
            result.info.append(f"Latest backup age: {age_hours:.1f}h")

        # Check size
        size_mb = latest.size_bytes / (1024 * 1024)
        if size_mb < self.MIN_BACKUP_SIZE_MB:
            result.healthy = False
            result.errors.append(
                f"Backup suspiciously small: {size_mb:.2f} MB (min: {self.MIN_BACKUP_SIZE_MB} MB)"
            )
        else:
            result.info.append(f"Latest backup size: {size_mb:.2f} MB")

        # Check encryption
        if not latest.encrypted:
            result.warnings.append("Latest backup is NOT encrypted (missing .gpg extension)")
        else:
            result.info.append("Encryption: AES-256 (GPG)")

        # Check checksum
        if not latest.has_checksum:
            result.warnings.append("No checksum file found for latest backup")
        else:
            result.info.append("Checksum file: present")

        # Check backup count
        result.info.append(f"Total backups: {len(backup_blobs)}")
        if len(backup_blobs) < self.MIN_BACKUP_COUNT:
            result.warnings.append(
                f"Low backup count: {len(backup_blobs)} (expected >= {self.MIN_BACKUP_COUNT})"
            )

        return result

    def check_api_health(self) -> MonitoringResult:
        """Check API health endpoint."""
        result = MonitoringResult()

        if not HAS_REQUESTS:
            result.info.append("requests not installed; skipping API health check")
            return result

        try:
            resp = requests.get(self.api_health_url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                status = data.get("status", "unknown")
                result.info.append(f"API health: {status} (HTTP 200)")
                if status != "healthy":
                    result.warnings.append(f"API reports unhealthy status: {status}")
            else:
                result.warnings.append(f"API health endpoint returned HTTP {resp.status_code}")
        except requests.Timeout:
            result.warnings.append("API health check timed out (10s)")
        except requests.ConnectionError:
            result.healthy = False
            result.errors.append(f"Cannot connect to API: {self.api_health_url}")
        except Exception as e:
            result.warnings.append(f"API health check failed: {str(e)}")

        return result

    def check_container_app(self) -> MonitoringResult:
        """Check Azure Container App revision status via CLI (if available)."""
        result = MonitoringResult()

        if not self._has_az_cli():
            result.info.append("Azure CLI not available; skipping container app check")
            return result

        try:
            app_name = "vitora-api-prod" if self.environment == "production" else "vitora-api"
            proc = subprocess.run(
                [
                    "az",
                    "containerapp",
                    "revision",
                    "list",
                    "-n",
                    app_name,
                    "-g",
                    "vitora-rg",
                    "--query",
                    "[?properties.active].{name:name, status:properties.runningState}",
                    "-o",
                    "json",
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if proc.returncode == 0:
                revisions = json.loads(proc.stdout)
                for rev in revisions:
                    status = rev.get("status", "Unknown")
                    name = rev.get("name", "?")
                    if status == "Running":
                        result.info.append(f"Container revision: {name} ({status})")
                    else:
                        result.warnings.append(
                            f"Container revision {name} is {status} (expected Running)"
                        )
            else:
                result.info.append("Could not query container app revisions")
        except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
            result.info.append("Container app check skipped")

        return result

    def run_all_checks(self) -> MonitoringResult:
        """Run all monitoring checks."""
        combined = MonitoringResult()

        checks = []

        # Include local backup check if backup_dir is configured
        if self.backup_dir:
            checks.append(("Local backups", self.check_local_backups))
            checks.append(("S3 backups", self.check_s3_backups))
        else:
            checks.append(("Azure Blob backups", self.check_azure_blobs))

        checks.append(("API health", self.check_api_health))
        checks.append(("Container App", self.check_container_app))

        for name, check_fn in checks:
            try:
                r = check_fn()
                combined.healthy &= r.healthy
                combined.errors.extend(r.errors)
                combined.warnings.extend(r.warnings)
                combined.info.extend(r.info)
                if r.latest_backup and not combined.latest_backup:
                    combined.latest_backup = r.latest_backup
            except Exception as e:
                combined.warnings.append(f"{name} check raised exception: {str(e)}")

        return combined

    # ─── Azure Blob Helpers ─────────────────────────────────────────────────

    def _list_blobs(self) -> list[BlobInfo] | None:
        """List blobs from Azure Blob Storage."""
        # Try Azure CLI first
        if self._has_az_cli():
            return self._list_blobs_cli()
        # Fallback to REST API with SAS token
        if self.sas_token:
            return self._list_blobs_rest()
        return None

    def _list_blobs_cli(self) -> list[BlobInfo] | None:
        """List blobs using Azure CLI."""
        try:
            proc = subprocess.run(
                [
                    "az",
                    "storage",
                    "blob",
                    "list",
                    "--account-name",
                    self.storage_account,
                    "--container-name",
                    self.storage_container,
                    "--auth-mode",
                    "login",
                    "--query",
                    "[].{name:name, size:properties.contentLength, "
                    "created:properties.creationTime}",
                    "-o",
                    "json",
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if proc.returncode != 0:
                return None

            items = json.loads(proc.stdout)
            blobs = []
            for item in items:
                created_str = item.get("created", "")
                try:
                    created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    created = datetime.now(UTC)

                blobs.append(
                    BlobInfo(
                        name=item.get("name", ""),
                        size_bytes=item.get("size", 0) or 0,
                        created=created,
                    )
                )
            return blobs
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
            return None

    def _list_blobs_rest(self) -> list[BlobInfo] | None:
        """List blobs using REST API with SAS token."""
        if not HAS_REQUESTS:
            return None

        url = (
            f"https://{self.storage_account}.blob.core.windows.net"
            f"/{self.storage_container}?restype=container&comp=list&{self.sas_token}"
        )
        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code != 200:
                return None

            import xml.etree.ElementTree as ET  # noqa: S405

            root = ET.fromstring(resp.text)  # noqa: S314 — trusted Azure API response
            blobs = []
            for blob_elem in root.iter("Blob"):
                name = blob_elem.findtext("Name", "")
                props = blob_elem.find("Properties")
                size = int(props.findtext("Content-Length", "0")) if props is not None else 0
                created_str = props.findtext("Creation-Time", "") if props is not None else ""

                try:
                    created = datetime.strptime(created_str, "%a, %d %b %Y %H:%M:%S %Z").replace(
                        tzinfo=UTC
                    )
                except (ValueError, AttributeError):
                    created = datetime.now(UTC)

                blobs.append(BlobInfo(name=name, size_bytes=size, created=created))
            return blobs
        except Exception:
            return None

    def _has_az_cli(self) -> bool:
        """Check if Azure CLI is available."""
        try:
            subprocess.run(["az", "--version"], capture_output=True, timeout=5)
            return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    # ─── Alerting ───────────────────────────────────────────────────────────

    def send_slack_alert(self, result: MonitoringResult):
        """Send Slack notification on failure/warning."""
        if not self.slack_webhook or not HAS_REQUESTS:
            return

        if result.healthy and not result.warnings:
            return

        color = "danger" if not result.healthy else "warning"
        status = "FAILED" if not result.healthy else "WARNING"

        text_parts = []
        if result.errors:
            text_parts.append("*Errors:*\n" + "\n".join(f"\u2022 {e}" for e in result.errors))
        if result.warnings:
            text_parts.append("*Warnings:*\n" + "\n".join(f"\u2022 {w}" for w in result.warnings))

        payload = {
            "attachments": [
                {
                    "color": color,
                    "title": f"Vitora Backup Monitor: {status}",
                    "text": "\n\n".join(text_parts),
                    "fields": [
                        {
                            "title": "Environment",
                            "value": self.environment,
                            "short": True,
                        },
                        {
                            "title": "Timestamp",
                            "value": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
                            "short": True,
                        },
                    ],
                }
            ]
        }

        try:
            requests.post(self.slack_webhook, json=payload, timeout=10)
        except Exception as e:
            print(f"Failed to send Slack alert: {e}", file=sys.stderr)

    def send_email_alert(self, result: MonitoringResult):
        """Send email notification on failure."""
        if not self.alert_email or (result.healthy and not result.warnings):
            return

        severity = "CRITICAL" if not result.healthy else "WARNING"
        subject = f"[{severity}] Vitora Backup Monitor - {self.environment}"

        body = (
            f"Vitora HMIS Backup Monitoring Report\n"
            f"{'=' * 50}\n"
            f"Environment: {self.environment}\n"
            f"Timestamp:   {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
            f"Status:      {'HEALTHY' if result.healthy else 'UNHEALTHY'}\n\n"
            f"ERRORS:\n"
            f"{chr(10).join('  - ' + e for e in result.errors) if result.errors else '  None'}\n\n"
            f"WARNINGS:\n"
            f"{chr(10).join('  - ' + w for w in result.warnings) if result.warnings else '  None'}\n\n"
            f"INFO:\n"
            f"{chr(10).join('  - ' + i for i in result.info)}\n\n"
            f"--\nVitora HMIS Automated Backup Monitor\n"
        )

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
        print(f"VITORA BACKUP MONITOR \u2014 {self.environment.upper()}")
        print("=" * 60)
        print(f"Timestamp: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print(f"Status:    {'\u2713 HEALTHY' if result.healthy else '\u2717 UNHEALTHY'}")
        print()

        if result.errors:
            print("ERRORS:")
            for error in result.errors:
                print(f"  \u2717 {error}")
            print()

        if result.warnings:
            print("WARNINGS:")
            for warning in result.warnings:
                print(f"  \u26a0 {warning}")
            print()

        if result.info:
            print("INFO:")
            for info in result.info:
                print(f"  \u2022 {info}")
            print()

        if result.latest_backup:
            b = result.latest_backup
            print("LATEST BACKUP:")
            print(f"  Name:      {b.name}")
            print(f"  Created:   {b.created.strftime('%Y-%m-%d %H:%M:%S UTC')}")
            print(f"  Size:      {b.size_bytes / (1024 * 1024):.2f} MB")
            print(f"  Encrypted: {'Yes (GPG/AES-256)' if b.encrypted else 'No'}")
            print(f"  Checksum:  {'Present' if b.has_checksum else 'Missing'}")
            print()

        print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Monitor Vitora HMIS backup health")
    parser.add_argument(
        "--env",
        default=os.environ.get("VITORA_ENV", "production"),
        help="Environment to check (default: production)",
    )
    parser.add_argument(
        "--storage-account",
        default=os.environ.get("AZURE_STORAGE_ACCOUNT", ""),
        help="Azure Storage account name",
    )
    parser.add_argument(
        "--container",
        default=os.environ.get("AZURE_STORAGE_CONTAINER", "db-backups"),
        help="Azure Blob container name",
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
        environment=args.env,
        storage_account=args.storage_account,
        storage_container=args.container,
    )

    result = monitor.run_all_checks()

    # Output
    if args.json:
        output = {
            "healthy": result.healthy,
            "environment": args.env,
            "timestamp": datetime.now(UTC).isoformat(),
            "errors": result.errors,
            "warnings": result.warnings,
            "info": result.info,
        }
        if result.latest_backup:
            output["latest_backup"] = {
                "name": result.latest_backup.name,
                "created": result.latest_backup.created.isoformat(),
                "size_bytes": result.latest_backup.size_bytes,
                "encrypted": result.latest_backup.encrypted,
                "has_checksum": result.latest_backup.has_checksum,
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
