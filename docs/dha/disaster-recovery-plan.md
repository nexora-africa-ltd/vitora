# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.

<!--
Purpose: DHA-facing disaster recovery plan for Vitora HMIS production and facility-hub deployments.
Use: Activate during a material service, data, security, or regional incident; record all decisions in the incident log.
Inputs: Current environment inventory, backup evidence, provider escalation contacts, and the Backup and Recovery Policy.
-->

# Disaster Recovery Plan

**System:** Vitora HMIS
**Owner:** Nexora Consulting Ltd Operations Lead
**Approval required from:** Security Lead and designated facility representative
**Review frequency:** Annual and after every material incident or recovery exercise

## 1. Purpose And Scope

This plan restores safe clinical-system operation after a production service failure, data corruption, security incident, backup failure, or cloud-region disruption. It covers the web application, Django API, PostgreSQL data, Azure Blob backup copies, application configuration, and facility-hub recovery procedures.

This plan does not replace a facility's clinical downtime procedure. Facilities must maintain an approved process for paper or temporary clinical documentation during downtime and reconcile those records after recovery.

## 2. Recovery Objectives

| Objective                      |   Target | Measurement                                                           |
| ------------------------------ | -------: | --------------------------------------------------------------------- |
| Recovery Time Objective (RTO)  |  4 hours | Time from declared recovery incident to restored and verified service |
| Recovery Point Objective (RPO) | 24 hours | Maximum accepted data loss window based on daily backup cadence       |
| Backup frequency               |    Daily | Scheduled production database backup at 02:00 UTC / 05:00 EAT         |
| Restore validation             |  Monthly | Isolated restore drill of the latest backup                           |

The RTO and RPO are policy targets, not measured guarantees. Actual recovery performance must be recorded in restore drills and incidents.

## 3. Roles And Responsibilities

| Role                                      | Responsibilities                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Incident Commander                        | Declares incident severity, authorizes service suspension and recovery, maintains incident timeline   |
| Operations Lead                           | Coordinates infrastructure recovery, backup retrieval, deployment, DNS, and health checks             |
| Security Lead                             | Preserves evidence, assesses compromise, coordinates credential/key rotation and access review        |
| Clinical/Fault Liaison                    | Communicates downtime and recovery status to affected facilities; coordinates clinical reconciliation |
| Data Protection Officer / Compliance Lead | Assesses notification obligations and maintains regulator/facility evidence                           |
| Application Lead                          | Validates migrations, application health, tenant isolation, and critical workflows after recovery     |

Named contacts, deputies, supplier escalation contacts, and after-hours numbers must be maintained in the controlled operations contact register and must not be embedded in source control.

## 4. Activation And Communications

Activate this plan when any of the following occurs:

- Production API or web application is unavailable beyond the operational threshold.
- Database corruption, accidental destructive change, or failed migration is suspected.
- Backup creation, upload, checksum, or restore verification fails.
- Ransomware, credential compromise, unauthorized data access, or audit-log anomaly is suspected.
- A cloud-provider or regional incident materially affects service availability.

The Incident Commander records the start time, affected services, decision owner, containment actions, selected recovery point, restoration result, and stakeholder notifications. Communications must not contain patient identifiers unless an approved secure channel and lawful purpose apply.

## 5. Recovery Procedures

### 5.1 Database Corruption Or Accidental Data Loss

1. Declare the incident and restrict write traffic where possible.
2. Preserve the current database state and relevant logs before destructive recovery actions.
3. Identify the latest verified backup that predates the failure.
4. Verify the SHA-256 checksum and decrypt the backup only in the controlled recovery environment.
5. Restore first into an isolated PostgreSQL environment.
6. Validate migrations, tenant counts, recent synthetic/known records, audit-log availability, and application health.
7. Obtain Incident Commander approval before replacing production data.
8. Restore production, restart services, monitor errors, and reconcile any documented downtime records.

### 5.2 Application Or Infrastructure Failure

1. Confirm impact through the health endpoint, provider status, and monitoring.
2. Check the active Azure Container App revision, configuration, DNS, and dependent services.
3. Roll back to the last known-good application revision if the failure is release-related.
4. Re-deploy from the approved source revision if the runtime environment is lost.
5. Validate HTTPS, authentication, tenant isolation smoke checks, critical API health, and audit logging before declaring recovery complete.

### 5.3 Security Incident Or Ransomware

1. Isolate affected services and revoke exposed credentials, tokens, and sessions.
2. Preserve logs, audit trails, infrastructure events, and a forensic copy of affected data where lawful and safe.
3. Determine the earliest trusted recovery point.
4. Deploy a clean environment with rotated application secrets, encryption keys where required, service credentials, and administrator credentials.
5. Restore only verified data into an isolated environment before production cutover.
6. Review accounts, MFA status, role assignments, third-party integrations, and audit integrity.
7. Coordinate breach assessment and notifications through the Data Protection Officer and legal/compliance process.

### 5.4 Region Or Provider Outage

1. Confirm provider scope using Azure and DNS/provider status evidence.
2. Communicate the expected outage and facility downtime procedure.
3. Restore service in the approved alternate environment only when current infrastructure, backup location, residency, and supplier arrangements have been approved.
4. Validate data consistency and reconcile offline/downtime records before resuming normal operations.

## 6. Recovery Acceptance Checklist

Recovery is complete only when the following are recorded:

- [ ] Backup checksum and decryption/restore verification passed.
- [ ] Database migrations and health checks passed.
- [ ] HTTPS, authentication, and protected API checks passed.
- [ ] Tenant/facility access smoke checks passed using synthetic records where available.
- [ ] Audit logging is active and audit records are queryable.
- [ ] Media/object storage access is validated.
- [ ] Required external integrations are tested only after clinical and security approval.
- [ ] Downtime records and pending offline writes are reconciled.
- [ ] Stakeholders receive recovery completion communication.
- [ ] Post-incident review, corrective actions, and evidence are recorded.

## 7. Testing And Evidence

The repository contains a daily production backup workflow and a monthly isolated restore drill. The drill downloads the latest backup, verifies the checksum, restores it into isolated PostgreSQL, and checks the restored migration table. Evidence required for DHA/facility review includes the workflow run, backup timestamp, restore duration, checksum result, exceptions, and corrective actions.

Facility-hub recovery uses encrypted backup bundles and the dedicated hub restore runbook: `docs/hub-backup-recovery.md`.

## 8. Related Documents

- `docs/dha/backup-and-recovery-policy.md`
- `docs/hub-backup-recovery.md`
- `docs/dpia.md`
- `docs/system-user-manual.md`
