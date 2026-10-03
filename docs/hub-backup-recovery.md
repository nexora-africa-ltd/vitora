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

Configure one offsite target at a time. For Kenyan data residency, use a NAS physically operated in Kenya or an HTTPS object-storage endpoint contractually located in Kenya. Confirm the endpoint's geographic storage and disaster-recovery replication location with the provider before enabling it. Example:

```dotenv
HUB_BACKUP_NAS_PATH=/mnt/vitora-backups
# Or, not both:
HUB_BACKUP_S3_URL=https://object-storage.example.ke/vitora-hub-backups/
HUB_BACKUP_S3_TOKEN=<protected-service-token>
```

## Operations

Create an encrypted WAL-safe snapshot. The snapshot includes `hub.sqlite3`, `.hub_sync_state.json`, and a SHA-256 manifest inside the encrypted bundle:

```bash
python manage.py hub_backup
python manage.py hub_backup --upload
python manage.py hub_backup --dry-run
```

When a target is configured, creation appends the bundle to `$HUB_BACKUP_DIR/.hub_backup_upload_queue.json`. The queue survives restarts and failed network attempts. Upload queued bundles later:

```bash
python manage.py hub_backup_upload
python manage.py hub_backup_upload --dry-run
```

The S3-compatible target receives one HTTP `PUT` per bundle at `<HUB_BACKUP_S3_URL>/<bundle-name>` using `Authorization: Bearer <HUB_BACKUP_S3_TOKEN>`.

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
