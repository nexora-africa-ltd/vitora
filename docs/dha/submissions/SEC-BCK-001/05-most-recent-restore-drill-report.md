# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: DHA SEC-BCK-001 report of the latest verified production backup-restore drill.
Use: Attach as operational evidence; supplement with the staging drill report before DHA submission.
Inputs: GitHub Actions run 43084560711 and Azure Blob metadata for the paired production backup.
-->

# Most Recent Production Restore Drill Report

| Field | Result |
| --- | --- |
| Evidence environment | Production operational evidence |
| Restore drill workflow | Monthly Restore Drill |
| Workflow run | `43084560711` |
| Completed | 11 November 2026, 19:10:26 UTC |
| Result | **Success** |
| Backup selected | `vitora-production-2026-11-11_190814-43084310258-1.sql.gz.gpg` |
| Restore target | Isolated PostgreSQL 18 drill database |

## Verified actions

1. Selected the latest encrypted production backup and its paired SHA-256 checksum artifact.
2. Decrypted the GPG AES-256 backup in the controlled drill workflow.
3. Calculated and verified the SHA-256 checksum of the decrypted compressed dump.
4. Restored the verified dump into isolated PostgreSQL with `ON_ERROR_STOP` enabled.
5. Verified restored Django migration metadata.

The workflow completed successfully. No backup content, recovery passphrase, connection string, storage credential, or patient data is attached to this report. The detailed sanitized evidence is in [`../SEC-ENC-001/08-backup-checksum-and-restore-drill.txt`](../SEC-ENC-001/08-backup-checksum-and-restore-drill.txt).

## Objective assessment

The technical restoration stage completed successfully. The current run is evidence of recoverability; a declared incident must still measure end-to-end restoration, validation, and service cutover against the approved four-hour RTO and 24-hour RPO.

The DHA staging submission additionally requires a successful staging drill captured in `08-staging-backup-and-restore-drill.txt`; do not relabel this production result as staging evidence.
