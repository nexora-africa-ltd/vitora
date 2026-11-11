# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: Evidence-package index for DHA SEC-BCK-001 Backup and Disaster Recovery.
Use: Collect, sanitize, approve, checksum, and submit the listed attachments.
Inputs: Approved policy/DR documents, production backup and restore-drill evidence, and an authenticated staging endpoint capture.
-->

# SEC-BCK-001 Evidence Package

This package supports the DHA document-review test for Backup and Disaster Recovery. It supplements, but never replaces, the controlled operational records and provider logs.

## Evidence index

| File | Status | Purpose |
| --- | --- | --- |
| `01-backup-and-recovery-policy.md` | Ready for approval | Daily backup procedure, scope, encryption, retention, and ownership |
| `02-disaster-recovery-plan.md` | Ready for approval | DR activation and recovery process |
| `03-rto-rpo-statement.md` | Ready for approval | RTO four hours and RPO 24 hours commitment |
| `04-offsite-storage-confirmation.md` | Ready | Off-site private encrypted storage confirmation |
| `05-most-recent-restore-drill-report.md` | Ready | Successful production restore drill report |
| `06-encrypted-backup-artifact.txt` | Ready | Successful production encrypted backup metadata |
| `07-backup-recovery-status-response.json` | Capture after staging deployment | Read-only endpoint evidence |
| `08-staging-backup-and-restore-drill.txt` | Capture after first successful staging drill | Staging GPG backup, checksum verification, and isolated restore result |
| `automated-test-report.txt` | Capture after implementation verification | Automated endpoint/control test output |
| `SHA256SUMS.txt` | Generate last | Integrity manifest |

Do not include credentials, passphrases, backup content, database URLs, account keys, SAS values, tokens, or patient data.
