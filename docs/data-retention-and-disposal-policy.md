<!--
Purpose: DHA-facing policy for retention, restriction, archival, and secure disposal of data processed by Vitora HMIS.
Use: Adopt and complete for each controller/facility before live processing; review after material legal, clinical, technical, processor, or storage changes.
Inputs: Controller-approved records schedule, applicable healthcare/tax/claims/employment requirements, DPIA, processor register, environment inventory, and backup/retention evidence.
-->
# Data Retention and Secure Disposal Policy

**Product:** Vitora HMIS
**Supplier:** Nexora Consulting Ltd
**Document version:** 1.0
**Effective date:** 4 October 2026
**Classification:** Internal and regulatory submission material

## 1. Purpose

This policy establishes how data processed through Vitora HMIS must be retained, restricted, archived, deleted, and securely disposed of. It applies to production cloud services, facility hubs, desktop/mobile/browser clients, backups, exports, integrations, support materials, and authorized processors/subprocessors.

The responsible healthcare facility is normally the controller for patient and facility operational data. It must adopt the final record schedule for its services, facilities, legal obligations, contracts, and clinical governance requirements. Nexora implements approved technical controls and assists the controller as required by the applicable agreement.

## 2. Policy Principles

1. Retain personal data only for the period necessary for its documented healthcare, operational, financial, legal, regulatory, security, or accountability purpose.
2. Do not infer a universal patient-record retention period from the Kenya Data Protection Act alone. The DPIA records that the Act does not establish a universal seven-year adult or twenty-five-year child clinical-record rule.
3. Apply the longer period when more than one valid requirement applies, unless the controller/DPO/legal adviser records a contrary lawful basis.
4. Retention clocks must have a defined trigger, such as last encounter, discharge, claim closure, contract termination, employee departure, export delivery, incident closure, or creation of an operational copy.
5. Retention schedules must identify the data class, purpose, lawful/contractual basis, period, trigger, owner, storage locations, legal-hold rule, disposal method, and review date.
6. Disposal must be secure, attributable, approved, and verified. Uninstalling software or deleting a visible application record alone does not prove that all copies have been disposed of.
7. A legal hold, active rights request, security investigation, clinical safety review, payer dispute, or statutory/regulatory obligation suspends ordinary disposal for its documented scope and duration.
8. Data retained under a hold remains restricted to the hold purpose; a hold does not permit unrelated processing, indefinite retention of unrelated data, or broader access.
9. Retention and disposal procedures must preserve care continuity, clinical safety, patient rights, auditability, and the integrity of required records.

## 3. Scope and Data Locations

This policy covers the following data locations where enabled for a facility:

| Location or copy | Examples | Retention/disposal consideration |
|---|---|---|
| Primary application database | Patient, encounter, laboratory, pharmacy, billing, claims, scheduling, staff, and configuration records | Controller schedule and authorized record-level workflow apply |
| Object/media storage | Documents, attachments, images, DICOM objects, exports, report files | Metadata and binary object must be handled together under the approved schedule |
| Audit and security data | AuditLog, emergency-access records, authentication/security events, integrity results | Seven-year audit policy; disposal must not defeat required audit-chain evidence |
| Facility hubs | Local SQLCipher/SQLite database, sync state, encrypted backup bundles, queued uploads | Local retention, backup count, device decommissioning, and reconciliation controls apply |
| Browser/mobile/desktop stores | PowerSync browser projection, desktop local database, mobile secure/local storage, temporary downloads | Device lifecycle, credential revocation, cache/database cleanup, and offline reconciliation apply |
| Backups and recovery media | Database dumps, hub backup bundles, backup manifests, restore logs | Controlled expiry and restoration safeguards; not a routine source for active processing |
| Integrations and recipients | DHA/SHA, DHIS2/KHIS, private insurers, payment services, laboratories, AI services, messaging providers | Controller must apply contract/recipient retention and deletion instructions |
| Operational copies | Sync queues, failed jobs, temporary imports, support bundles, diagnostic logs, downloads | Short-lived operational retention; avoid using them as a second record system |

## 4. Retention Schedule

### 4.1 Established product settings and source-backed operational defaults

The following periods/settings are grounded in the current product source or approved product policy. They are not evidence that an environment has scheduled or enforced them until the facility retains deployment evidence.

| Data class | Period or setting | Trigger/basis | Implementation status |
|---|---|---|---|
| Audit logs, audit integrity results, and emergency-access accountability records | **Minimum 7 years** | Audit/security accountability; organization retention default is 7 years | Organization model defaults `data_retention_years` to 7. AuditLog has no source-controlled automatic archive/purge task. |
| General organization retention setting | **7 years by default** | Organization-level compliance configuration | Configurable field; does not automatically delete, archive, or enforce a schedule for all models. |
| PostgreSQL backup path in `backup.sh` | **30 days local; 90 days remote** | Operational backup retention | Source default and cleanup logic. Actual scheduled job and target storage must be verified. |
| Azure Blob backup path in `backup-db.sh` | **30 days by default** | Operational backup retention | Source default, configurable through `BACKUP_RETENTION_DAYS`; unencrypted output is possible if that script runs without its encryption key. |
| Facility hub local backup bundles | **14 bundles by default** | Hub recovery copies | Configurable `HUB_BACKUP_RETENTION_COUNT`; count-based, not a guaranteed time period. Bundles are encrypted when the required hub backup key is present. |
| Synced offline queue entries | **24 hours by default after sync** | Operational synchronization metadata | `prune_sync_queue` command; execution must be explicitly scheduled. |
| Permanently failed sync queue entries | **7 days** | Operational troubleshooting/retry metadata | `prune_sync_queue` command; execution must be explicitly scheduled. |
| Access JWT | **30 minutes by documented source default** | Short-lived authentication credential | Credential lifetime, not patient-record retention. Verify deployed settings. |
| Refresh JWT | **1 day by documented source default** | Authentication session credential | Credential lifetime, not patient-record retention. Verify deployed settings. |
| PowerSync credential | **1 hour by documented source default** | Browser synchronization authorization | Credential lifetime, not browser-data deletion period. |

## 5. Retention Controls

### 5.1 Restriction and legal hold

1. The DPO, legal adviser, Records Manager, security incident lead, clinical governance lead, or another authorized controller representative may issue a hold.
2. Each hold must state authority, data scope, purpose, owner, start date, review date, release criteria, affected systems/copies, and access restrictions.
3. The Records Manager must maintain a minimum-data deletion/restriction manifest linking the affected record/purpose to primary storage, attachments, analytics, AI history, replicas, backups, and recipients.
4. Normal deletion, disposal, archive expiry, and processor deletion instructions must be suspended for the held scope.
5. Release of a hold must be documented and approved before normal disposal resumes.

### 5.2 Data-subject requests, correction, and erasure

Requests for access, correction, restriction, objection, portability, or erasure must be handled through the responsible controller's rights process. A request for erasure does not require deletion where continued retention is necessary or lawful for clinical care, legal obligations, claims, tax/accounting, security, audit, dispute, or other applicable purposes.

Before completing a deletion request, the responsible owner must assess linked clinical records, financial/claim records, audit records, attachments, backups, offline copies, exports, integrations, and processor copies. Corrections should use the applicable amendment/correction workflow and must not be used to conceal prior clinical, financial, or audit history.

### 5.3 Audit records

Audit records and associated integrity evidence have a minimum seven-year policy period. Their hash-chain relationship means that record deletion must not create unexplained sequence gaps or defeat verification of remaining evidence. Before any post-retention archive/disposal activity, the Security Officer and Records Manager must approve an archival/closure approach that preserves required integrity evidence and applicable key-verification capability.

## 6. Secure Disposal Procedure

### 6.1 Authorization and preparation

Before disposing of any personal data:

1. Confirm the applicable approved schedule and that the retention period has ended.
2. Confirm no legal hold, clinical hold, complaint, investigation, claim dispute, regulatory request, backup-restore requirement, or security incident blocks disposal.
3. Identify all in-scope copies using the deletion/restriction manifest.
4. Obtain authorization from the data owner and the Records Manager; require DPO/security approval for sensitive, large-scale, cross-border, or high-risk disposal.
5. Create a disposal work record stating scope, identifiers minimized to what is necessary, systems/copies, method, owner, approver, date, result, exception, and verification evidence.

### 6.2 Primary records and object storage

1. Use an approved application workflow or controlled administrative/database procedure; do not perform ad hoc production deletion.
2. Remove or archive linked database records and associated objects together where the approved schedule requires it. For example, a DICOM study’s metadata, images, attachments, derivatives, and external storage references require coordinated handling.
3. Verify that tenant/facility scoping is applied and that disposal cannot affect another organization or facility.
4. Record the disposal action in the appropriate accountable record/audit process where supported.
5. Confirm that search, normal application retrieval, object download, and linked workflow references no longer expose data that was approved for disposal.

### 6.3 Backups and recovery media

1. Do not modify backups ad hoc to satisfy a deletion request unless the approved recovery/backup process supports it and the controller has authorized the action.
2. Allow backup copies to expire through the controlled retention schedule, protect them from normal operational use, and document any unavoidable delay before a deletion is fully reflected in backup media.
3. If a backup is restored, reapply outstanding deletion/restriction instructions before reconnecting it to production processing where technically feasible.
4. Verify disposal/expiry of cloud backup objects, local media, hub bundles, and their manifests according to the selected production backup path.
5. Preserve backups required for a legal hold, audit period, incident investigation, or recovery obligation.

### 6.4 Offline clients, hubs, and removable media

1. Revoke user/device credentials and prevent new synchronization before decommissioning a desktop, mobile device, browser profile, or facility hub.
2. Reconcile or safely preserve unsynchronized clinical work before clearing a local store; do not silently destroy pending care data.
3. Remove local databases, downloaded files, exports, cached objects, sync queues, browser storage, and hub backup bundles under a controlled device-decommissioning process.
4. Use approved operating-system/device-management secure erase or cryptographic erase procedures only when all relevant keys/copies are addressed.
5. Treat lost, stolen, inaccessible, or irretrievable devices as potential security incidents. Document the inability to confirm deletion and assess risk/notification obligations.

### 6.5 Processors and external recipients

1. Send a documented deletion/return/restriction instruction to each applicable processor or recipient where the controller has authority to do so.
2. Track the recipient, data scope, instruction date, response, deletion/return confirmation, exception, and escalation.
3. Confirm provider retention, backup, support-log, and training/reuse terms for integration, AI, messaging, payment, payer, laboratory, imaging, and analytics providers.
4. Where immediate deletion is unavailable, restrict further use, document the reason and expected expiry, and escalate through the contract/DPO process.

### 6.6 Paper, printouts, and physical media

1. Collect printed patient documents, labels, reports, and exports from printers promptly.
2. Place paper records in the controller-approved confidential-waste process; cross-cut shredding or an approved secure-destruction supplier should be used according to the facility procedure.
3. Sanitize or physically destroy storage media using an approved method appropriate to the medium and risk level.
4. Retain a certificate or disposal record when a third party destroys confidential paper or media.

## 7. Technical Boundaries

1. The organization `data_retention_years` field defaults to seven years but does not automatically identify and delete/archival every data class.
2. The source repository contains different backup paths with different default retention behaviors. The controller must identify the authoritative production backup job and storage lifecycle; do not assume one script's default applies to all environments.
3. `prune_sync_queue` removes synchronization metadata, not the authoritative clinical record. It must never be treated as clinical-record disposal.
4. Browser, desktop, mobile, hub, integration, and processor data can persist independently of a primary database deletion. Deletion requires a copy-by-copy assessment.
5. Encryption can reduce exposure risk but does not remove retention, rights, disposal, or downstream-recipient obligations. Crypto-erasure is valid only where all relevant key material and copies are within scope.
6. A user-visible delete action may be a soft delete, workflow cancellation, or record-state transition rather than irreversible media disposal. The responsible owner must confirm the actual effect before recording a disposal as complete.

## 8. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| Controller/facility leadership | Approves the final schedule, lawful purposes, funding, and accountability model |
| Records Manager | Maintains the schedule, retention/disposal manifest, archive process, and disposal records |
| Clinical Governance lead | Approves clinical record categories, triggers, continuity safeguards, and specialty exceptions |
| Finance lead | Approves financial/claims retention and disposal after reconciliation/dispute checks |
| DPO | Reviews rights requests, holds, high-risk disposal, processors, transfers, and compliance implications |
| Security Officer | Reviews secure disposal methods, incidents, audit/security records, and key/media controls |
| Operations/IT | Operates backups, archival, device/hub decommissioning, storage lifecycle, and restoration safeguards |
| Nexora, where processor | Implements documented instructions and provides technical/operational assistance under the processing agreement |

## 9. Monitoring, Review, and Exceptions

1. Review retention configuration, backup lifecycle, hub/offline copies, processor terms, and disposal records at least annually.
2. Review this policy after a new module, data category, integration, processor, storage region, backup architecture, legal/regulatory change, security incident, merger/closure, or material rights request.
3. Test restoration and post-restore reapplication of active deletion/restriction instructions as part of recovery exercises.
4. Record exceptions with a purpose, risk, compensating controls, owner, approval, expiry, and review date. Expired exceptions must be remediated, renewed, or result in capability restriction.

## 10. Approval and Adoption

This policy is reviewed and approved by the controller according to its clinical, legal, financial, privacy, and records-governance arrangements.

| Version | Date | Change | Owner | Approval |
|---|---|---|---|---|
| 1.0 | 2026-10-04 | Initial DHA-facing data retention and secure disposal policy. | DPO, Records Manager, and Security Officer | Pending controller, clinical governance, and DHA review |
