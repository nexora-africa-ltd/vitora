# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: Controlled backup and recovery policy for DHA SEC-BCK-001.
Use: Approve, retain with operational records, and provide as document-review evidence.
Inputs: Production backup workflow configuration, Azure storage safeguards, and incident-management procedures.
-->

# Backup and Recovery Policy

**System:** Vitora HMIS
**Policy owner:** Nexora Consulting Ltd Operations Lead
**Review frequency:** Annually and after a failed backup, failed restore drill, material incident, or material infrastructure change

## Policy requirements

1. The production PostgreSQL database and required restore metadata are backed up **daily at 02:00 UTC**.
2. Each backup must fail closed when the backup encryption passphrase is unavailable.
3. Before upload, the compressed database dump is encrypted with **GPG AES-256** and paired with a SHA-256 checksum.
4. Backup artifacts are retained in a private Azure Blob Storage container separate from the application runtime. Anonymous public access is prohibited.
5. Authorized recovery personnel must verify checksum integrity and restore into an isolated PostgreSQL environment before any production recovery action.
6. A restore drill is completed at least monthly. Failed drills require incident review, corrective action, and retesting.
7. Backup and restore activity must not expose patient data, credentials, passphrases, encryption keys, or backup payloads in evidence packages or routine logs.

## Roles

| Role | Responsibility |
| --- | --- |
| Operations Lead | Runs and monitors backup/recovery operations; maintains evidence and measured results |
| Security Lead | Controls recovery access and encryption-material governance; reviews access anomalies |
| Incident Commander | Authorizes recovery-point selection and production cutover during a declared incident |
| Application Lead | Validates migrations, core workflows, tenant isolation, and audit logging after restoration |
| DPO / Compliance Lead | Reviews regulatory, contractual, and personal-data implications of material recovery incidents |

## Approval record

| Approval role | Name | Signature or approved electronic equivalent | Date |
| --- | --- | --- | --- |
| Operations Lead |  |  |  |
| Security Lead |  |  |  |
| DPO / Compliance Lead |  |  |  |
