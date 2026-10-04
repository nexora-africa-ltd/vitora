<!--
Purpose: DHA submission and annual-review evidence checklist for Vitora HMIS audit-trail controls.
Use: Collect, reference, and approve production assurance evidence; this is not the technical implementation specification.
Inputs: Production environment inventory, audit-chain results, key-custody records, backup/restore evidence, access reviews, and incident/exercise records.
-->
# DHA Audit Trail Evidence Checklist

**Product:** Vitora HMIS
**Supplier:** Nexora Consulting Ltd
**Document version:** 1.0
**Effective date:** 4 October 2026
**Classification:** Internal and regulatory submission material

## Purpose

This checklist records the operational evidence required to substantiate the audit-trail controls described in `docs/audit-trail-implementation-specification.md`. It separates deployed-control assurance from source-controlled implementation detail.

Complete this checklist before DHA submission, at annual review, after a material audit/security change, and after an audit-chain integrity incident.

## Required Evidence

| Evidence item | Required evidence | Owner | Status/reference |
|---|---|---|---|
| Schema and release baseline | Production migration/schema extract showing `AuditLog` integrity fields and deployed release/version | Engineering |  |
| Audit coverage | Representative records for authentication, patient access, sensitive access, clinical write, admin action, export, integration, and emergency access | Clinical Governance / Engineering |  |
| Chain-key custody | Evidence of dedicated `AUDIT_LOG_CHAIN_KEY`, secret-manager location, permitted identities, rotation/recovery procedure, and access review | Security |  |
| Hash coverage | Current total/chained/unchained entry report, investigation of every unchained record, and approved backfill record if used | Security / Engineering |  |
| Integrity verification | Dated verification result with facility/tenant scope, entry count, result, reviewer, and retained output | Security / Facility Admin |  |
| Recurring verification | Celery Beat/worker configuration and execution evidence for recurring integrity verification | Operations |  |
| Tamper notification | Evidence that critical notifications reach designated responders and a current escalation contact list | Operations / Security |  |
| API and review access | Role/permission review showing authorized audit-log and integrity access only | Security / Facility Admin |  |
| Retention | Evidence that AuditLog records, required backups/archives, and verification evidence are retained for at least seven years | Records Manager / DPO |  |
| Legal hold | Procedure and sample evidence that applicable deletion/disposal is suspended for investigation, litigation, or regulatory hold | DPO / Legal |  |
| Backup and restoration | Timed restore evidence demonstrating retained audit data and applicable chain verification can be recovered | Operations |  |
| Privileged access | Database, storage, backup, and secret-access review; separation-of-duties evidence where applicable | Security |  |
| Tamper exercise | Recorded integrity-failure exercise or incident demonstrating detection, preservation, investigation, remediation, and re-verification | Security / Engineering |  |
| Release tests | Current release-candidate audit/integrity/redaction test output | Engineering |  |

## Retention Attestation

The organization must retain audit records and associated verification evidence for at least seven years, unless a longer applicable requirement or legal hold applies. The technical implementation sets a seven-year organization default but does not itself provide an automatic AuditLog archive/purge task. The records owner must therefore document the deployed retention mechanism and its periodic verification.

| Environment | Audit-log retention mechanism | Backup/archive location | Minimum end date | Legal-hold process verified | Reviewer/date |
|---|---|---|---|---|---|
| Production |  |  |  |  |  |
| Facility hub(s) |  |  |  |  |  |
| Staging, if it contains production-like personal data |  |  |  |  |  |

## Approval

| Review | Name/role | Date | Approval/reference |
|---|---|---|---|
| Security review |  |  |  |
| Data Protection Officer review |  |  |  |
| Clinical Governance review |  |  |  |
| Operations/Records Management review |  |  |  |
| DHA submission owner |  |  |  |
