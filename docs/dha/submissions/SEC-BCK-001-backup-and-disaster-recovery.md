# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: DHA portal submission narrative for SEC-BCK-001 Backup and Disaster Recovery.
Use: Submit the GET endpoint and attach the listed controlled documents and sanitized evidence.
Inputs: DHA staging platform-security administrator, the SEC-BCK-001 evidence package, and the approved DR plan.
-->

# SEC-BCK-001 — Backup and Disaster Recovery

**Priority:** High
**Test method:** Document Review and live read-only evidence verification
**Status:** Staging backup/restore workflows implemented; capture first successful staging drill before DHA submission

## Endpoint submitted to DHA

| Portal field | Value |
| --- | --- |
| Endpoint title | Retrieve backup and disaster-recovery control status — SEC-BCK-001 |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/core/security/backup-recovery-status/` |
| Authentication | DHA staging platform-security administrator bearer JWT with `core.view_backup_recovery_evidence` |
| Tenant header | Not required; this is a platform control endpoint |
| Expected response | `200 OK`; daily backup policy, off-site storage safeguards, RTO/RPO, restore-validation requirements, and sanitized metadata from the latest verified production drill |

The endpoint is deliberately **read-only** and platform-scoped. It does not start a backup or restore, list backup objects, disclose the backup location, return an artifact, or reveal database credentials, storage credentials, passphrases, encryption keys, or patient data. Both `is_staff=True` and the dedicated Django permission are required. Anonymous requests receive `401`; other users receive `403`.

## DHA document-review package

| Attachment | DHA criterion |
| --- | --- |
| `SEC-BCK-001/01-backup-and-recovery-policy.md` | Daily schedule, backup scope, encryption, retention, ownership, and escalation procedure |
| `SEC-BCK-001/02-disaster-recovery-plan.md` | Controlled DR activation, recovery, validation, communications, and approval process |
| `SEC-BCK-001/03-rto-rpo-statement.md` | Approved targets: RTO four hours and RPO 24 hours |
| `SEC-BCK-001/04-offsite-storage-confirmation.md` | Off-site Azure Blob Storage separation, private access, TLS, and encryption safeguards |
| `SEC-BCK-001/05-most-recent-restore-drill-report.md` | Latest completed production drill, verification steps, result, and evidence references |
| `SEC-BCK-001/06-encrypted-backup-artifact.txt` | Sanitized metadata for the latest successful encrypted backup artifact and checksum |
| `SEC-BCK-001/07-backup-recovery-status-response.json` | Authenticated GET response from the submitted endpoint after deployment |
| `SEC-BCK-001/08-staging-backup-and-restore-drill.txt` | First successful staging backup and isolated restore-drill result |
| `SEC-BCK-001/automated-test-report.txt` | Endpoint permission and operational-control regression tests |
| `SEC-BCK-001/SHA256SUMS.txt` | Integrity checksums for final submission attachments |

## DHA laboratory procedure mapping

| DHA procedure | Vitora evidence |
| --- | --- |
| Review backup schedule and procedures | `01-backup-and-recovery-policy.md`; endpoint `backup_schedule` response |
| Verify daily backup frequency | Daily schedule at 02:00 UTC and successful backup workflow run `43084310258` |
| Verify off-site backup storage | `04-offsite-storage-confirmation.md`; Azure Storage evidence; endpoint `offsite_storage` response |
| Review DR plan documentation | `02-disaster-recovery-plan.md` and controlled source `docs/dha/disaster-recovery-plan.md` |
| Review recent DR test results | `05-most-recent-restore-drill-report.md`, run `43084560711` |
| Verify RTO/RPO | `03-rto-rpo-statement.md`; endpoint `recovery_objectives` response |
| Test backup restoration process | Production drill restored the encrypted backup into isolated PostgreSQL after GPG decryption and SHA-256 verification; perform any DHA-supervised sample restoration only in an isolated environment with synthetic data |

## Current operational evidence

- Daily production backup workflow **43084310258** completed successfully on 11 November 2026 and created a GPG AES-256 encrypted `.sql.gz.gpg` backup with a paired SHA-256 checksum.
- Monthly restore drill workflow **43084560711** completed successfully on 11 November 2026. It decrypted that backup, verified its SHA-256 checksum, restored it into isolated PostgreSQL, and verified restored migration metadata.
- The operational artifacts originate from production and are explicitly labelled as such. A dedicated staging backup job writes only to `staging-db-backups`, and the staging restore drill reads only from that container. Capture the first successful staging runs as `08-staging-backup-and-restore-drill.txt` before submission.

## Capture command

After deploying the endpoint and granting the dedicated permission to the DHA staging platform-security administrator:

```bash
export DHA_ACCESS_TOKEN='<DHA staging platform-security administrator token>'
export API_BASE_URL='https://staging-api.vitora.digital'

curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer ${DHA_ACCESS_TOKEN}" \
  "${API_BASE_URL}/api/core/security/backup-recovery-status/" \
  | jq . > docs/dha/submissions/SEC-BCK-001/07-backup-recovery-status-response.json
```

Never save a token, cookie, passphrase, storage key, SAS URL, database URL, backup payload, or patient data in the evidence package.

## Submission gate

1. Deploy the endpoint and migration to staging.
2. Configure the GitHub **staging** environment `BACKUP_ENCRYPTION_KEY`; it must differ from production's secret.
3. Run **Staging Daily Database Backup** and **Staging Monthly Restore Drill** successfully, then update the endpoint's staging-validation metadata and capture `08-staging-backup-and-restore-drill.txt`.
4. Create a dedicated platform staff account for DHA evidence review, grant `core.view_backup_recovery_evidence`, and validate `200 OK`.
5. Obtain required approval signatures for the Backup and Recovery Policy, Disaster Recovery Plan, and RTO/RPO statement.
6. Export the approved controlled documents to PDF if DHA requires signed PDFs rather than controlled Markdown copies.
7. Capture the authenticated endpoint response, re-check every attachment for secrets and PII, and regenerate `SHA256SUMS.txt`.

## References

- [`SEC-BCK-001/README.md`](SEC-BCK-001/README.md)
- [`../disaster-recovery-plan.md`](../disaster-recovery-plan.md)
- [`../../encryption-implementation-specification.md`](../../encryption-implementation-specification.md)
- [`SEC-ENC-001/07-encrypted-backup-artifact.txt`](SEC-ENC-001/07-encrypted-backup-artifact.txt)
- [`SEC-ENC-001/08-backup-checksum-and-restore-drill.txt`](SEC-ENC-001/08-backup-checksum-and-restore-drill.txt)
