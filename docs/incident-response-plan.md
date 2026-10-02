# Incident Response Plan

**Document owner:** Security Officer

**Approvers:** CTO, Data Protection Officer (DPO), Clinical Safety Lead

**Review cadence:** At least annually and after every Severity 1 or Severity 2 incident

**Classification:** Internal - operational and compliance controlled document

## 1. Purpose

This plan defines the required response to incidents affecting Vitora HMIS, its hosted services, web application, desktop and hub deployments, integrations, and data processed for customer health facilities.

It provides documented procedures for:

- Security, privacy, availability, integrity, clinical-safety, and third-party incidents.
- Personal-data breach assessment, containment, documentation, and notification.
- Recovery and validation of cloud and offline-first/hub services.
- DHA disaster-recovery escalation, failover, fallback, evidence collection, and corrective action.

This is an operational procedure, not a substitute for legal advice. The DPO and legal counsel determine regulatory notification obligations for each incident.

## 2. Scope

This plan applies to:

- The Django API, databases, object storage, queues, monitoring, CI/CD, and backups.
- The Next.js web application and associated browser sessions.
- Desktop and hub deployments, local databases, offline sync queues, and device-protected key material.
- Customer facility data, patient data, staff data, audit logs, claims, DHA/SHA integrations, and other regulated data.
- Employees, contractors, vendors, and subprocessors who administer or process Vitora data.

## 3. Definitions

| Term | Meaning |
|---|---|
| Incident | An event that actually or potentially affects confidentiality, integrity, availability, patient safety, legal compliance, or service operation. |
| Personal-data breach | A security breach leading to accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to personal data. |
| Security event | An observable occurrence that requires assessment but is not yet confirmed as an incident. |
| Containment | Action that stops or limits an incident's impact without necessarily removing its root cause. |
| Eradication | Removal of the cause, persistence mechanism, or unsafe condition. |
| Recovery | Restoration and validation of normal operations after containment and eradication. |
| Failover | Controlled transfer of service from the primary environment to the designated recovery environment. |
| Fallback | Controlled return of service from the recovery environment to the primary environment. |

## 4. Response Principles

1. Protect patients and preserve clinical safety before restoring convenience features.
2. Preserve evidence before making irreversible changes, where doing so does not increase harm.
3. Use least privilege and approved emergency access only.
4. Do not conceal, alter, or delete incident evidence, audit records, logs, or affected data.
5. Communicate facts, confidence level, and next update time. Do not speculate.
6. The DPO owns privacy-breach assessment and notification decisions; the incident commander owns technical coordination.
7. Keep affected customers informed through approved communications channels.

## 5. Roles and Authority

| Role | Responsibilities |
|---|---|
| Incident Commander (IC) | Declares and coordinates the incident, sets priorities, assigns owners, approves operational status updates, and records decisions. |
| Technical Lead | Leads technical investigation, containment, eradication, recovery, and evidence preservation. |
| Security Officer | Leads security analysis, evidence integrity, credential and key containment, and security corrective actions. |
| DPO | Determines whether an event is a personal-data breach, assesses risk to data subjects, approves privacy notifications, and maintains the breach record. |
| Clinical Safety Lead | Assesses patient-safety impact, approves clinical workflow fallback guidance, and coordinates facility clinical leadership. |
| Communications Lead | Prepares customer, public, vendor, and staff communications approved by the IC and DPO. |
| Scribe | Maintains the incident timeline, decisions, actions, owners, and evidence references. |
| Service Owner | Supplies system-specific expertise and confirms recovery acceptance criteria. |

The Security Officer, DPO, and Clinical Safety Lead may require escalation of any incident to Severity 1. The IC may authorize emergency containment actions necessary to protect patients or data.

## 6. Contact Directory

The current on-call directory must be maintained outside this repository in the approved secure contact system. It must contain primary and secondary contacts for the following roles:

| Escalation | Target acknowledgement |
|---|---:|
| Severity 1 Incident Commander and Technical Lead | 15 minutes |
| Severity 1 Security Officer, DPO, and Clinical Safety Lead | 30 minutes |
| Severity 2 service owner | 30 minutes |
| CTO | 60 minutes for Severity 1; as requested for Severity 2 |
| Affected facility administrator | As soon as facts permit, and no later than the communication deadline set by the IC and DPO |

Failure to acknowledge within the target time requires escalation to the named backup and then the CTO.

## 7. Severity Classification

| Severity | Criteria | Initial response target | Update frequency |
|---|---|---:|---:|
| Severity 1 - Critical | Confirmed or likely large-scale personal-data compromise; ransomware; compromised production key; patient-safety risk; complete production outage; material DHA/SHA failure; or likely regulatory notification. | 15 minutes | Every 30 minutes |
| Severity 2 - High | Confirmed unauthorized access with limited scope; major degradation; integrity issue affecting one or more facilities; hub compromise; or significant third-party integration failure. | 30 minutes | Every 2 hours |
| Severity 3 - Moderate | Limited operational impact, contained security event, or non-critical vulnerability with no evidence of exploitation. | 4 business hours | Daily until resolved |
| Severity 4 - Low | Minor event, unsuccessful attack with no impact, or service issue with a documented workaround. | 1 business day | As needed |

Severity must be reassessed whenever scope, sensitivity, patient impact, or legal obligations change.

## 8. Incident Lifecycle

### 8.1 Detect and Report

Report suspected incidents immediately through the approved security/operations channel. Sources include monitoring alerts, audit-log anomalies, user reports, vendor notifications, vulnerability reports, support tickets, lost devices, and failed recovery checks.

The first responder must:

1. Create an incident ticket and assign a unique incident ID.
2. Record reporter, time detected, systems involved, initial symptoms, and known data types.
3. Page the on-call responder according to the initial severity.
4. Avoid deleting logs, restarting systems, rotating keys, or reimaging devices until the Technical Lead or Security Officer directs it, unless immediate action is required to prevent harm.

### 8.2 Triage and Declare

The IC and Technical Lead must determine:

- Whether the event is an incident.
- Initial severity and affected services, facilities, users, and data categories.
- Whether clinical workflows require a paper or approved downtime fallback.
- Whether the DPO, Clinical Safety Lead, vendors, or customer administrators must be engaged.
- The next update time and responsible communicator.

The scribe records the declaration time, classification, assigned roles, and decisions in the incident record.

### 8.3 Contain

Containment actions may include:

- Disable or restrict affected user, service, vendor, API, or hub credentials.
- Revoke active sessions and invalidate refresh tokens.
- Isolate an affected hub or device from sync and network access.
- Disable a vulnerable feature flag, integration, deployment, queue consumer, or API route.
- Place an affected tenant, integration, or account into a safe read-only mode where clinically appropriate.
- Restrict inbound/outbound network paths through approved infrastructure controls.
- Fail over only under the Disaster Recovery Plan and with IC approval.

Document every containment action, executor, timestamp, reason, and expected side effect.

### 8.4 Preserve Evidence

Before altering affected systems where practical, preserve:

- Relevant audit logs, application logs, authentication logs, database logs, cloud activity logs, and monitoring data.
- Affected object identifiers, data classifications, query results, request IDs, IP addresses, and timestamps.
- Hub/device identifiers, local database state, sync queue state, software version, and key version metadata.
- Screenshots, immutable exports, forensic images, or snapshots where authorized.

For each evidence item record its source, collector, time collected, integrity checksum when applicable, storage location, and access restrictions. Store evidence in an access-controlled incident evidence location.

### 8.5 Eradicate

The Technical Lead and Security Officer identify and remove the root cause. Examples include:

- Patch or remove vulnerable code or infrastructure configuration.
- Remove malware, persistence, unauthorized accounts, or unsafe integrations.
- Rotate compromised credentials, API keys, certificates, and encryption key versions.
- Correct unsafe access-control rules, tenant-scoping defects, or logging gaps.
- Rebuild compromised workloads from trusted artifacts rather than modifying them in place.

Changes made under emergency procedures must be captured in the incident record and retrospectively reviewed through normal change control.

### 8.6 Recover and Validate

The Service Owner confirms recovery only after validating:

- Authentication, authorization, tenant isolation, and audit logging.
- Patient lookup and a controlled clinical write workflow.
- Database integrity and replication/backup status.
- Required integrations and safe handling of queued/offline changes.
- Monitoring, alerting, backups, and security controls.
- No new suspicious activity after recovery.

For a failover or fallback, retain the measured RPO, measured RTO, data-reconciliation outcome, and signed validation result.

### 8.7 Close and Improve

The IC may close an incident only when containment, recovery, customer communication, and required regulatory actions are complete or have a named owner and deadline.

Within 10 business days of Severity 1 or Severity 2 closure, conduct a blameless post-incident review. Track corrective actions to closure in the approved work-management system.

## 9. Personal-Data Breach Procedure

### 9.1 Immediate Actions

On a suspected personal-data breach:

1. Declare at least Severity 2 until the DPO determines otherwise.
2. Notify the DPO and Security Officer immediately.
3. Contain unauthorized access or disclosure without destroying evidence.
4. Preserve relevant logs, access records, and affected-data references.
5. Identify affected data subjects, data categories, approximate record count, recipients, and the duration of exposure.
6. Assess whether data was actually accessed, acquired, altered, disclosed, lost, or rendered unavailable.

### 9.2 DPO Assessment

The DPO documents:

- Nature of the breach and affected processing activities.
- Categories and approximate number of affected data subjects and records.
- Whether special-category or health data is involved.
- Likely consequences for data subjects and facilities.
- Containment, remediation, and risk-reduction actions.
- Whether notification to the Office of the Data Protection Commissioner (ODPC), affected customers, data subjects, DHA, or another authority is required.
- The legal basis, decision maker, and timestamp for every notification or decision not to notify.

### 9.3 Notification Deadlines

The DPO must seek legal advice where necessary and apply the shortest applicable deadline. Vitora's operational target is to prepare an ODPC notification decision promptly enough to meet the Kenya Data Protection Act requirement to notify the ODPC within **72 hours after becoming aware of a qualifying personal-data breach**, unless a documented legal exception applies.

If the 72-hour notification cannot be completed, the DPO documents the reason for delay and submits the notification as soon as possible, with the required explanation.

Where a breach is likely to result in a high risk to affected data subjects, the DPO determines whether direct communication to those data subjects is required and approves its content and timing.

Contractual, DHA, SHA, customer, or vendor notification requirements may require earlier notification. The Communications Lead must not issue external notifications without DPO approval, except where immediate clinical-safety communication is required and approved by the Clinical Safety Lead and IC.

### 9.4 Minimum Notification Content

An approved breach notification must include, to the extent known:

1. Incident ID, date/time detected, and date/time of awareness.
2. Clear description of what happened and affected systems.
3. Categories of personal data and approximate number of affected people/records.
4. Likely consequences and current confidence level.
5. Containment and remediation actions taken or planned.
6. Actions recipients can take to protect themselves, if applicable.
7. DPO contact details and an incident contact channel.
8. Date/time of next update when the investigation remains ongoing.

Use plain language for data-subject communications. Do not disclose investigation-sensitive information, credentials, or another patient's data.

### 9.5 Breach Register

The DPO maintains a restricted breach register for all suspected and confirmed personal-data breaches, including incidents that do not require notification. Each entry contains the assessment, evidence references, notification decision, communications, closure date, and corrective actions.

## 10. Incident-Specific Playbooks

### 10.1 Compromised Account or Session

1. Disable the user or service account and revoke active sessions.
2. Preserve authentication, audit, and API logs.
3. Reset credentials and require MFA re-verification where appropriate.
4. Determine accessed tenants, records, exports, and write actions.
5. Assess personal-data breach impact with the DPO.
6. Re-enable only after identity verification and remediation.

### 10.2 Compromised Encryption Key or Secret

1. Notify the Security Officer and DPO; classify at least Severity 1 for a production key.
2. Disable or restrict the compromised key version where safe to do so.
3. Rotate to a replacement key and validate service recovery.
4. Identify data, services, and hubs that used the affected key version.
5. Re-encrypt affected data according to the key-rotation procedure.
6. Review key-access audit logs and assess unauthorized decryption or disclosure.
7. Do not claim recovery until hub/device key material and backup decryption paths are validated.

### 10.3 Hub or Offline Device Loss/Compromise

1. Record device/hub identity, tenant/facility scope, last sync time, software version, and local encryption/key-storage status.
2. Isolate the device from sync; revoke its credentials and device authorization.
3. Preserve available hub telemetry and cloud-side sync history.
4. Determine whether local data, cached keys, or offline credentials could be accessed.
5. Rotate affected credentials and keys where risk assessment requires it.
6. Reconcile queued operations before permitting a replacement device to sync.
7. Complete DPO breach assessment and customer communication as applicable.

### 10.4 Ransomware, Malware, or Integrity Compromise

1. Isolate affected workloads or networks immediately.
2. Preserve forensic evidence and identify the last known-good point.
3. Disable compromised accounts and credentials.
4. Do not restore data until the cause and persistence mechanism are understood.
5. Restore from verified backups or execute approved disaster-recovery failover.
6. Validate clinical data integrity, tenant isolation, audit logging, and queued offline changes before returning to service.

### 10.5 Service Outage and DHA DR Escalation

1. Assess whether the outage threatens patient safety or exceeds the approved service threshold.
2. Activate the clinical downtime/fallback process where necessary.
3. Invoke the Disaster Recovery Plan when recovery requires failover.
4. Record the outage start time, failover start/end time, achieved RPO, achieved RTO, validation results, and fallback decision.
5. Complete controlled fallback to the primary environment only after data reconciliation and approval by the IC and Technical Lead.

### 10.6 Third-Party or Integration Incident

1. Identify the vendor, integration endpoint, affected facilities, data exchanged, and relevant contractual obligations.
2. Disable or restrict the integration if continued processing creates material risk.
3. Request the vendor's incident reference, scope, containment status, and notification timeline.
4. Preserve outbound/inbound request logs and correlation IDs.
5. The DPO determines independent notification obligations; vendor notification does not remove Vitora's obligations.

## 11. Communications

The Communications Lead maintains one approved communication record per incident. Each update includes the incident ID, timestamp, audience, approved facts, owner, and next update time.

| Audience | Owner | Content |
|---|---|---|
| Internal responders | IC | Severity, scope, decisions, assignments, and next update. |
| Affected facility administrators | Communications Lead | Service impact, workaround, patient-safety guidance, and next update. |
| Staff and clinicians | Clinical Safety Lead | Approved clinical workflow/fallback instructions. |
| ODPC and other authorities | DPO | Legally required breach notification and follow-up information. |
| Affected data subjects | DPO and Communications Lead | Plain-language, approved notification where required. |
| Vendors/subprocessors | Technical Lead or vendor manager | Incident scope, containment request, evidence, and contractual notification obligations. |

## 12. Required Incident Record

Every Severity 1 and Severity 2 incident must have a record containing:

- Incident ID, title, severity, status, and incident commander.
- Detection, declaration, containment, recovery, and closure timestamps.
- Affected systems, tenants/facilities, data classes, and patient-safety assessment.
- Evidence inventory and access restrictions.
- Timeline of decisions, actions, owners, and approvals.
- Breach assessment and notification decisions.
- Achieved RPO/RTO for recovery incidents.
- Internal, customer, regulatory, and vendor communications.
- Root cause, contributing factors, corrective actions, owners, and due dates.

## 13. Exercising and Review

1. Conduct at least one tabletop incident-response exercise annually.
2. Conduct DHA disaster-recovery failover and fallback drills at least twice yearly, with documented results.
3. Include personal-data breach notification decision-making in at least one annual exercise.
4. Test hub/device compromise and key-recovery scenarios at least annually.
5. Record exercise scope, participants, start/end time, achieved RPO/RTO, evidence, gaps, and corrective actions.
6. Review this plan after every Severity 1 or Severity 2 incident and at least annually.

## 14. Approval and Revision History

| Version | Date | Change | Owner | Approval |
|---|---|---|---|---|
| 1.0 | 2026-10-02 | Initial organization-wide incident response and breach notification procedure. | Security Officer | Pending CTO, DPO, and Clinical Safety Lead approval |
