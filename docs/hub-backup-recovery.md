<!-- Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved. -->
# Hub Backup and Recovery

This runbook covers the encrypted Facility Hub SQLite backup subsystem. It is intended for hub operators and is run from the backend installation with `DJANGO_ENV=hub`.

## Prerequisites

- Set `HUB_BACKUP_ENCRYPTION_KEY` to a valid Fernet key. Generate one once with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and store it in the hub's protected secret store. The service fails closed when this key is absent or invalid.
- Preserve this key separately from the hub. Without the exact key, a backup cannot be inspected or recovered.
- If the hub database uses SQLCipher, install SQLCipher and `pysqlcipher3` and configure the hub SQLCipher backend before restoring. Recovery also requires the normal hub SQLCipher key material; this Fernet key decrypts the backup bundle only and does not unlock SQLCipher.
- Stop the hub service before a real restore. Verification and dry runs do not require service downtime.

## Configuration

Hub settings are read from the environment:

| Setting | Default | Purpose |
| --- | --- | --- |
| `HUB_BACKUP_DIR` | `$HUB_DATA_DIR/backups` | Local encrypted bundles and persisted upload queue |
| `HUB_BACKUP_ENCRYPTION_KEY` | empty | Required Fernet key; no unencrypted fallback |
| `HUB_BACKUP_RETENTION_COUNT` | `14` | Number of local bundles retained |
| `HUB_BACKUP_NAS_PATH` | empty | Mounted NAS directory for offsite copies |
| `HUB_BACKUP_S3_URL` | empty | S3-compatible HTTP endpoint base URL |
| `HUB_BACKUP_S3_TOKEN` | empty | Bearer token required by the HTTP PUT endpoint |
| `HUB_BACKUP_S3_TOKEN_EXPIRES_AT` | empty | ISO-8601 expiry for a cloud-issued upload token |

Configure one offsite target at a time. For Kenyan data residency, use a NAS physically operated in Kenya or an HTTPS object-storage endpoint contractually located in Kenya. Confirm the endpoint's geographic storage and disaster-recovery replication location with the provider before enabling it. Example:

```dotenv
HUB_BACKUP_NAS_PATH=/mnt/vitora-backups
# Or, not both:
HUB_BACKUP_S3_URL=https://object-storage.example.ke/vitora-hub-backups/
HUB_BACKUP_S3_TOKEN=<protected-service-token>
```

## Operations

## Installed Schedules

Native hub installers register these jobs automatically. They run through the
same protected secret loader as the hub service: Linux systemd jobs receive the
host-encrypted credential through `LoadCredentialEncrypted`; Windows tasks run
`start-hub.ps1` as `SYSTEM`, which decrypts the DPAPI bundle. Backup keys are
never stored in systemd unit files, Task Scheduler arguments, or task
environment variables.

| Job | Linux unit/timer | Windows task | Schedule | Command |
| --- | --- | --- | --- | --- |
| Snapshot | `vitora-hub-backup.service` / `.timer` | `VitoraHubDailyBackup` | Daily at the timer's next daily activation; Windows 01:00 | `hub_backup` |
| Upload queue | `vitora-hub-backup-upload.service` / `.timer` | `VitoraHubBackupUpload` | Every 30 minutes | `hub_backup_upload` |
| Verify | `vitora-hub-backup-verify.service` / `.timer` | `VitoraHubWeeklyBackupVerify` | Weekly at the timer's next weekly activation; Windows Sunday 03:00 | `hub_backup --verify` |

Installers and updaters register these definitions idempotently. Inspect their
state with:

```bash
systemctl list-timers 'vitora-hub-backup*'
journalctl -u vitora-hub-backup.service -u vitora-hub-backup-upload.service -u vitora-hub-backup-verify.service
```

```powershell
Get-ScheduledTask -TaskName VitoraHubDailyBackup,VitoraHubBackupUpload,VitoraHubWeeklyBackupVerify
Get-Content C:\VitoraHub\logs\hub-backup*.log
```

To run a Linux job immediately, use `sudo systemctl start vitora-hub-backup.service`; do not invoke it with a manually supplied key. On Windows, run `C:\VitoraHub\start-hub.ps1 -Mode backup` from an elevated PowerShell session so the same DPAPI loader is used.

Create an encrypted WAL-safe snapshot. The snapshot includes `hub.sqlite3`, `.hub_sync_state.json`, and a SHA-256 manifest inside the encrypted bundle:

```bash
python manage.py hub_backup
python manage.py hub_backup --upload
python manage.py hub_backup --verify
python manage.py hub_backup --dry-run
```

When a target is configured, creation appends the bundle to `$HUB_BACKUP_DIR/.hub_backup_upload_queue.json`. The queue survives restarts and failed network attempts. Upload queued bundles later:

```bash
python manage.py hub_backup_upload
python manage.py hub_backup_upload --dry-run
```

The generic S3-compatible target receives one HTTP `PUT` per bundle at `<HUB_BACKUP_S3_URL>/<bundle-name>` using `Authorization: Bearer <HUB_BACKUP_S3_TOKEN>`. Azure Blob SAS tokens are appended to that object URL instead and use the required `x-ms-blob-type: BlockBlob` header.

## Cloud-issued credentials

Cloud operators configure an enabled `HubBackupDestination` for each organization or a facility override. It records the endpoint and optional base prefix, ISO country of residency, and retention policy, but never a permanent cloud credential. Credential issuance appends encoded `organizations/{id}/facilities/{id}/installations/{installation_id}` segments, isolating normal uploads for every hub. The cloud requires `HUB_BACKUP_ALLOWED_RESIDENCY_COUNTRIES` to explicitly include `KE`; otherwise credential issuance fails closed.

An active protocol-v2 hub requests `POST /api/licensing/backup-credentials/` with its license bearer token. The response is an X25519 device-bound envelope containing only `HUB_BACKUP_S3_URL`, `HUB_BACKUP_S3_TOKEN`, and `HUB_BACKUP_S3_TOKEN_EXPIRES_AT`. Cloud deployments can set `HUB_BACKUP_CREDENTIAL_SIGNER=hmis.apps.licensing.backup_credentials.sign_azure_blob_backup_credentials`; it reads cloud-only `AZURE_HUB_BACKUP_STORAGE_ACCOUNT`, `AZURE_HUB_BACKUP_STORAGE_ACCOUNT_KEY`, and `AZURE_HUB_BACKUP_STORAGE_CONTAINER`, then issues a SAS with only create, write, and add permissions. `AZURE_HUB_BACKUP_SAS_EXPIRY_MINUTES` defaults to 60 and must be between 1 and 1,440. The storage account key never enters the envelope or reaches a hub.

Azure South Africa is an interim cloud control-plane location, not a compliant Kenya-resident backup destination. Do not enable it for Kenyan hub backup data while the residency policy requires `KE`; migrate encrypted backup storage to an in-country Kenyan provider before enabling production offsite backup credentials.

The activation bootstrap includes these values in its existing device-encrypted secrets envelope when a destination and signer are available. Hubs must renew before expiry. An expired token leaves every queue entry intact, so `hub_backup_upload` can retry after credentials are renewed; no backup is discarded because offsite credentials are unavailable.

## Verify and Restore

Always verify a copied bundle before recovery:

```bash
python manage.py hub_restore /path/to/hub-YYYYMMDDTHHMMSSZ.hubbackup --verify
python manage.py hub_restore /path/to/hub-YYYYMMDDTHHMMSSZ.hubbackup --dry-run
```

For a real recovery, stop the hub service, preserve the failed database for investigation, and use explicit replacement permission:

```bash
sudo systemctl stop vitora-hub
python manage.py hub_restore /path/to/hub-YYYYMMDDTHHMMSSZ.hubbackup --force
sudo systemctl start vitora-hub
```

`hub_restore` verifies Fernet authentication and both SHA-256 checksums before writing. It refuses to replace an existing database without `--force` and restores the sync state alongside the database.
