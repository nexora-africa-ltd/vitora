# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.

<!--
Purpose: DHA-facing policy for Vitora HMIS database backup, retention, verification, and recovery.
Use: Applies to production operations, restore drills, and facility-hub backup configuration.
Inputs: Daily backup workflow evidence, restore-drill evidence, storage access review, and approved key-custody records.
-->

# Backup And Recovery Policy

**System:** Vitora HMIS
**Policy owner:** Nexora Consulting Ltd Operations Lead
**Effective frequency:** Daily
**Recovery Time Objective:** 4 hours
**Recovery Point Objective:** 24 hours

## 1. Policy Statement

Vitora HMIS production data must be backed up daily, protected from unauthorized access, verified for integrity, and recoverable through a controlled restore procedure. Backups are resilience copies and must not be used as an uncontrolled secondary clinical system.

## 2. Backup Standard

| Requirement            | Policy Requirement                                                      | Implemented Evidence                                               |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Frequency              | Daily                                                                   | GitHub Actions daily backup workflow runs at 02:00 UTC / 05:00 EAT |
| RPO                    | 24 hours                                                                | Daily backup cadence                                               |
| RTO                    | 4 hours                                                                 | Disaster Recovery Plan recovery target                             |
| Backup content         | PostgreSQL database dump and SHA-256 checksum                           | `backend/scripts/backup-db.sh`                                     |
| Primary backup storage | Private Azure Blob container                                            | `db-backups` container is created with public access disabled      |
| Retention              | 30 days unless legal hold or approved retention rule requires otherwise | Daily workflow pruning and backup script retention setting         |
| Restore validation     | Monthly isolated drill                                                  | `.github/workflows/restore-drill.yml`                              |

## 3. Security Requirements

- Backup storage containers must not permit public access.
- Backup access must use least-privilege managed identity, OIDC, or time-limited SAS credentials.
- A SHA-256 checksum must accompany each database backup and must be verified before restore.
- Production scheduled backup jobs must have `BACKUP_ENCRYPTION_KEY` configured so the dump is encrypted using GPG AES-256 before upload.
- Encryption-key custody, rotation, recovery access, and separation of duties must be documented in the controlled operations secret register.
- Backup restoration must occur first in an isolated environment unless emergency recovery is expressly authorized by the Incident Commander.
- Backup evidence and access logs must be retained according to the approved records-retention schedule.

The backup script supports encrypted and unencrypted operation when invoked manually. This policy prohibits scheduling production backups without the encryption key; operations must verify this configuration in every environment.

## 4. Daily Backup Procedure

1. The scheduled workflow authenticates to Azure using OIDC.
2. It ensures the private backup container exists.
3. It issues a short-lived write SAS token or uses authorized Azure identity access.
4. It ensures an API container replica is available.
5. It invokes `backend/scripts/backup-db.sh` inside the application container.
6. The script runs `pg_dump`, compresses the output, performs a size sanity check, creates a SHA-256 checksum, encrypts when the encryption key is configured, and uploads the backup plus checksum.
7. The workflow verifies that the latest backup object exists and records its metadata.
8. Backup failure must create an operations alert and incident/ticket according to the operations escalation process.

## 5. Recovery Procedure

1. Obtain Incident Commander approval and identify the recovery point.
2. Retrieve the selected backup and matching checksum into an isolated recovery environment.
3. Decrypt the backup using authorized key custody procedures.
4. Verify the SHA-256 checksum.
5. Restore into isolated PostgreSQL and validate migrations and representative data integrity.
6. Record measured recovery time and data recovery point.
7. Obtain approval before production cutover.
8. After restoration, validate health, authentication, tenant controls, audit logging, and media access.

## 6. Restore Drill

A monthly restore drill restores the latest production backup into an isolated PostgreSQL service. The workflow verifies backup checksum before restoring and confirms the restored database contains migration records. Operations must retain drill evidence and compare the measured result with the RTO/RPO targets.

## 7. Facility Hub Backup Policy

Facility hubs use encrypted Fernet backup bundles containing the SQLite database, synchronization state, and SHA-256 manifest. Hub operators must configure `HUB_BACKUP_ENCRYPTION_KEY`, retain the key separately from the device, and configure only approved offsite destinations. Refer to `docs/hub-backup-recovery.md` for operational commands and residency constraints.

## 8. Exceptions And Review

Any inability to meet the daily backup schedule, encryption requirement, 24-hour RPO, or 4-hour RTO must be recorded as an operational risk and approved by the designated security/compliance authority. This policy is reviewed annually and after a restore failure, security incident, or material infrastructure change.
