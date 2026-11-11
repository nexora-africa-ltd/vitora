<!--
Purpose: DHA-facing technical specification of Vitora HMIS audit-trail capture, tamper-resistance, access controls, and seven-year retention configuration.
Use: Describe the source-controlled implementation and update after material changes to audit capture, integrity verification, key handling, storage, or retention behavior.
Inputs: Current source code, Django migrations, technical configuration, and automated test results.
-->
# Audit Trail Implementation Specification

**Product:** Vitora HMIS
**Supplier:** Nexora Consulting Ltd
**Document version:** 1.0
**Effective date:** 4 October 2026
**Classification:** Internal and regulatory submission material

## 1. Purpose and Technical Scope

This specification describes the source-controlled Vitora HMIS audit-trail implementation: audit-event capture, PII/secret redaction, hash chaining, integrity verification, application access controls, technical retention configuration, and maintenance utilities.

The implementation provides attributable audit records, tenant/facility context, read-only application APIs, PII/secret redaction, a cryptographic hash chain, integrity verification, diagnostics, and alerting on detected chain failures. It is **tamper-resistant and tamper-evident**, not an immutable/WORM storage system. It does not by itself prevent a sufficiently privileged infrastructure or database administrator from modifying records, deleting records, changing the verification key, or restoring an altered database.

Source-controlled settings establish a default seven-year retention period. The current repository does not contain an automated AuditLog archive/purge task. The retention setting is therefore a policy/configuration default, not an automatic archive or deletion mechanism.

## 2. Control Summary

| Control objective | Implemented mechanism | Scope |
|---|---|---|
| Attributable activity record | `AuditLog` entries capture actor, action, resource, time, network/client context, tenant context, and structured details | Audited application workflows and system/security events |
| Tenant/facility accountability | Organization and facility fields are resolved from request context or staff profile where available | Multi-tenant audit entries |
| PII/secret minimization | Configured direct identifiers and credential fields are redacted before audit details are persisted | `AuditLog.log()` entries |
| Tamper-evident ordering | Globally unique monotonic sequence number plus previous-entry hash | Chained audit entries |
| Entry integrity | HMAC-SHA256 over canonical audit-entry content and previous hash; legacy SHA-256 verification remains supported | Current chained entries and legacy compatibility |
| Unauthorized API mutation prevention | Audit-log API exposes list/retrieve only; mutation methods are not exposed | Application API |
| Integrity verification | On-demand verification, diagnostics, management commands, and verification task | Global chain; facility views validate entry hashes in scope |
| Tamper notification | Critical in-app notifications for active superusers when verification detects a mismatch | Configured asynchronous execution environment |
| Retention | Organization retention configuration defaults to, and is database-constrained to, a minimum `data_retention_years=7` | Audit-trail retention policy |

## 3. Audit-Record Architecture

### 3.1 Primary audit record

The primary audit entity is `core.AuditLog`. The logical record contains:

| Field group | Stored information | Purpose |
|---|---|---|
| Identity | User reference; anonymous/system action where no user is available | Identifies the actor where authentication context exists |
| Action | Action name, resource type, resource identifier | Identifies what operation was performed or attempted |
| Time | Timezone-aware timestamp | Establishes event time and ordering context |
| Tenant context | Organization and facility references when resolvable | Supports facility/organization accountability and access scoping |
| Client context | IP address and user-agent string where supplied | Supports investigation and anomaly review |
| Patient context | Denormalized patient identifier where relevant | Supports sensitive-access and patient-related investigation |
| Details | Structured JSON context such as changed fields, purpose, legal basis, state transition, or reason | Provides event-specific accountability while applying redaction rules |
| Integrity fields | Sequence number, entry hash, previous hash, hash algorithm | Supports ordering and tamper detection |

`AuditLog` supports common action names for authentication, patient CRUD/view/list events, sensitive-access outcomes, encounter CRUD/view events, emergency-access actions, exports, system errors, and workflow-specific application actions. The action vocabulary is extensible because modules log their own domain-specific operations.

### 3.2 Representative auditable activities

Audit coverage includes, depending on the enabled module and workflow:

- successful and failed login, logout, and token refresh;
- patient create, read, update, soft-delete/deactivation, search/list, and sensitive-record access/denial;
- encounter create, view, update, and delete;
- clinical, laboratory, pharmacy, procedure, referral, scheduling, billing, insurance, imaging, and administrative workflow transitions where the respective view/service is audited;
- CDS alert actions and AI feature access where those modules are enabled;
- emergency-access/break-glass invocation, review, revocation, close, accessed resource, and overdue-review events;
- data export and selected security/system error events;
- manual and background audit-integrity verification results.

The presence of an AuditLog model does not prove that every endpoint, background job, export, or integration action is audited. New or changed workflows require audit coverage review and automated tests before production release.

### 3.3 Record creation path

The standard application path is `AuditLog.log(...)`.

```text
Audited application action
  -> AuditLog.log(action, actor, resource, request/details)
  -> resolve organization/facility context
  -> redact configured PII and secret fields from details
  -> acquire transaction/serialization protection
  -> determine next sequence number and previous entry hash
  -> calculate HMAC-SHA256 entry hash
  -> persist AuditLog record atomically
```

Application code must use `AuditLog.log()` rather than direct ORM creation for new audit events. Direct ORM creation can create an unchained record because hash fields are populated by the logging method, not by an `AuditLog.save()` override. Hash-coverage monitoring identifies records with no sequence number so they can be investigated and, where approved, backfilled.

## 4. Tamper-Resistance and Integrity Verification

### 4.1 Hash-chain construction

Each entry created through `AuditLog.log()` has:

- a globally unique, monotonic `sequence_number`;
- `previous_hash`, containing the predecessor's entry hash, or a fixed all-zero genesis hash for the first entry;
- `entry_hash`, a 64-character hexadecimal digest; and
- `hash_algorithm`, allowing verifiers to distinguish current and legacy algorithms.

The current hash payload includes the sequence number, previous hash, action, actor identifier, timestamp, resource type, resource identifier, and a deterministic JSON representation of details. Changing any included value changes the recomputed hash. Removing a chained entry introduces a sequence gap and normally breaks the predecessor/successor linkage.

### 4.2 HMAC-SHA256 and key custody

New chained entries use HMAC-SHA256. The verification/signing key is resolved from `AUDIT_LOG_CHAIN_KEY`; if that setting is absent, the application falls back to Django `SECRET_KEY`.

For safe deployment, configure a dedicated high-entropy `AUDIT_LOG_CHAIN_KEY` rather than relying on the fallback `SECRET_KEY`. Key rotation must preserve the ability to verify entries made under prior keys.

The implementation also verifies explicitly tagged legacy SHA-256 entries to preserve existing audit evidence during algorithm migration. SHA-256 without a secret is weaker against an attacker able to rewrite both database content and hashes; HMAC-SHA256 with protected key custody improves resistance to such rewriting.

### 4.3 Concurrency and atomicity

The logging method creates an audit entry inside a database transaction. On databases supporting row locking, it locks the current final chained entry while assigning the next sequence number. SQLite uses serialized transactions for its local path. This design is intended to prevent concurrent standard application writes from issuing the same sequence number or referencing the wrong predecessor.

The system has automated tests for sequential chaining and, on non-SQLite databases, concurrent writes preserving unique sequence numbers and a valid chain. Production database transaction isolation and operational load should be validated during deployment/performance testing.

### 4.4 What verification detects

Full-chain verification recalculates each stored hash, compares it to `entry_hash`, checks predecessor linkage, and checks for sequence gaps. It reports the first mismatch or chain-break detail. Diagnostics can additionally report mismatch ranges, sequence gaps, linkage breaks, algorithm transitions, and likely key/algorithm transition points.

Detected examples include:

| Change | Expected verification outcome |
|---|---|
| Details or another hashed field changed | Recomputed hash mismatch at the modified sequence |
| Stored entry hash changed | Hash mismatch at the modified sequence |
| Chained entry removed | Sequence-gap and/or predecessor-link failure |
| Predecessor reference changed | Chain-break failure at the affected sequence |
| Algorithm tagging inconsistent with content | Hash mismatch or diagnostics showing transition issue |

### 4.5 Important integrity limitations

The hash chain is a detective control, not an absolute prevention mechanism. It does not itself provide:

- write-once immutable storage or external notarization of each hash;
- protection against a privileged actor who can change database data **and** access the active chain key;
- proof that an event was logged if a compromised application/database prevents it from being written;
- automatic verification of every historical entry on every request; or
- automatic retention/archive enforcement for seven years.

Deployment assurance requirements and DHA submission artifacts are maintained in `docs/dha-audit-evidence-checklist.md`.

## 5. Access Controls and Audit Review

### 5.1 Application API restrictions

The audit-log API is read-only. It supports list and retrieve operations but exposes no create, update, or delete operation through its ViewSet. Authenticated users may view their own applicable audit events; authorized administrators and superusers can review facility-scoped audit records. Audit-log records cannot be modified or deleted using the application API.

Audit views support filtering by action, resource type, actor, date range, ordering, and tenant/facility context as permitted by the requester's role.

### 5.2 Integrity operations

Chain status, manual integrity verification, and diagnostics require administrator privileges and an active facility context. The web administration area exposes:

- **Admin → Audit Logs** for allowed record review;
- **Admin → Audit Integrity** for chain coverage, status, tamper-alert count, and on-demand verification.

An on-demand verification records its own `audit_integrity_check` event, including the result, number of entries checked, first mismatch sequence, errors, and indication that the trigger was manual.

### 5.3 Audit-log redaction

Before `details` are persisted through `AuditLog.log()`, the application redacts configured direct identifiers and secrets. The configured set includes examples such as identification numbers, national ID, phone numbers, email, address, emergency contact values, insurance member/policy numbers, API credentials, and SMTP credentials. Redaction applies to top-level detail keys and to `old_values`, `new_values`, and `changes` structures.

Redaction reduces the risk of an audit log becoming a secondary plaintext PII/credential store. It is name-based and must be maintained whenever new PII/secret fields or new details structures are introduced. It does not justify logging arbitrary free-text PII.

## 6. Integrity Monitoring and Incident Response

### 6.1 Verification mechanisms

| Mechanism | Function | Operational use |
|---|---|---|
| Admin user interface | Shows chain status and supports an authorized manual check | Routine review and investigation |
| API | Returns chain status, verification result, and diagnostics for authorized administrators | Controlled operational automation/support |
| `verify_audit_chain_integrity` task | Verifies the latest configured number of entries, default 1,000 | Background monitoring when Celery worker/beat scheduling is enabled |
| `audit_chain_diagnostics` command | Reports mismatch ranges, gaps, link breaks, algorithm/key transition hints | Incident triage and maintenance |
| `backfill_audit_hashes` command | Chains eligible legacy records that lack sequence/hash fields | Approved migration/remediation only |

The verification task is designed to run hourly and to create critical notifications for active superusers when it detects a failure. Its scheduling and notification delivery depend on the deployed Celery Beat, worker, and notification configuration.

### 6.2 Tamper alert response

If an integrity result is invalid:

1. Treat the result as a security and potential privacy/clinical-record integrity incident.
2. Preserve evidence: result timestamp, sequence range, mismatch detail, chain status, relevant application logs, database audit/access logs, notification records, and backup metadata.
3. Do not run backfill, alter the affected audit entries, rotate the key, restore over the evidence, or delete records before the incident lead authorizes a preservation plan.
4. Restrict privileged access as appropriate and determine whether the application, database, credentials, backup, or deployment environment may be compromised.
5. Run diagnostics and a controlled full-chain verification using the correct historical key material.
6. Compare with protected backups and independent operational evidence. Restore or remediate only through approved incident/change management.
7. Assess patient-safety, data-protection, regulatory-notification, and legal-hold implications with the Security Officer, DPO, and clinical governance lead.
8. Record root cause, affected interval, actions, outcome, and follow-up verification.

## 7. Retention and Disposal

### 7.1 Minimum retention period

`Organization.data_retention_years` defaults to **7 years** and is protected by application validation and a database constraint from being reduced below that minimum. For this specification, AuditLog records and integrity-verification evidence must be retained for at least seven years from the applicable event date, unless a longer legal, contractual, clinical, tax, litigation-hold, or investigation requirement applies.

The retention period applies to:

- primary AuditLog records and their integrity fields;
- audit-chain verification and diagnostic results;
- relevant notification/incident records for integrity failures;
- protected backups and archive copies necessary to restore retained audit evidence; and
- documentation of chain-key custody/rotation sufficient to verify retained records.

## 8. Migration and Algorithm Maintenance

### 8.1 Hash coverage

Older records can lack chain fields if they were created before hash chaining or through a nonstandard direct ORM path. The chain-status view reports total, chained, and unchained entry counts. A non-zero unchained count must be investigated before asserting complete chain coverage.

`backfill_audit_hashes` is available to process unchained historical entries in chronological order. It provides dry-run and batch-size controls. Run it only through approved change management after preserving a backup and recording the initial coverage, entry range, resulting sequence range, operator, time, and full-chain verification result.

### 8.2 Algorithm transition

Each chained entry stores the selected hash algorithm. The verifier supports HMAC-SHA256 and legacy SHA-256, permitting controlled algorithm transition. The diagnostic output identifies algorithm transition points. Algorithm or key migration requires a pre-change backup, verification before and after change, documented key custody, and retained evidence of the transition boundary.

## 9. Test Coverage

Source-controlled tests cover, among other cases:

- creation of chained entries with genesis hash and sequence numbering;
- predecessor linking and deterministic hash computation;
- valid-chain verification;
- detection of modified details, modified hashes, and deleted middle entries;
- latest-window verification and diagnostics for mismatch ranges/gaps;
- legacy tagged SHA-256 compatibility;
- facility-scoped integrity view behavior;
- admin-only status/verification/diagnostics access;
- critical notification creation when a background verification finds tampering;
- hash backfill idempotence and dry-run behavior;
- PII redaction in audit details; and
- representative patient, authentication, clinical, and workflow audit events.

## 10. Approval and Review

Review this specification at least annually and after any material change to audit event coverage, hash algorithm, chain-key management, database access model, audit API/permissions, backup/archive process, retention period, monitoring schedule, or incident-response procedure.

| Version | Date | Change | Owner | Approval |
|---|---|---|---|---|
| 1.0 | 2026-10-04 | Initial DHA-facing audit-trail implementation specification. | Security Officer and Engineering Lead | Pending DHA, DPO, Security, and Clinical Governance review |
