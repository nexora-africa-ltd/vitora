<!--
Purpose: DHA-facing information security policy for Vitora HMIS, covering implemented access control,
encryption, data protection, security operations, and deployment verification requirements.
Use: Submit as controlled policy evidence and review after material security, hosting, or processing changes.
Inputs: Approved production environment inventory, configuration evidence, security tests, incident records,
and change approvals.
-->
<!-- markdownlint-disable MD013 MD060 -->
# Information Security Policy

**Product:** Vitora HMIS

**Supplier:** Nexora Consulting Ltd

**Document version:** 1.0

**Effective date:** 2 October 2026

**Classification:** Internal and regulatory submission material

**Policy owner:** Security Officer

**Approvers:** CTO, Data Protection Officer (DPO), Clinical Safety Lead

## 1. Purpose

This policy establishes the information security requirements for Vitora HMIS. It covers access control, encryption, data protection, application security, logging, incident response, third-party processing, and operational assurance for the web, desktop, mobile, facility hub, and cloud service components.

The policy is intended to support the Kenya Data Protection Act, 2019, applicable Data Protection Regulations, DHA requirements, and contractual obligations. It does not claim that a control is active in a specific environment without deployment evidence.

## 2. Scope

This policy applies to:

- Vitora HMIS application source code, releases, APIs, databases, object storage, and backups.
- Web, desktop, mobile, and facility hub clients.
- Patient, staff, facility, financial, clinical, claims, audit, and integration data.
- Nexora personnel, contractors, customer administrators, vendors, and subprocessors with authorized access.
- Development, test, staging, production, recovery, and support environments.

## 3. Security Principles

Vitora security controls shall be designed and operated according to the following principles:

1. **Least privilege:** grant only the minimum role, facility, department, and data access needed for a defined duty.
2. **Tenant isolation:** prevent access across organizations and facilities unless an authorized workflow explicitly permits it.
3. **Defence in depth:** combine identity controls, authorization, encryption, auditability, secure transport, validation, monitoring, and recovery controls.
4. **Privacy by design:** minimize direct identifiers, restrict sensitive records, protect data in transit and at rest, and avoid replicating unnecessary PII to offline clients.
5. **Clinical safety:** prioritize safe care continuity, attributable emergency access, and reconciliation of offline data over convenience.
6. **Evidence-based assurance:** distinguish configured, tested, and planned controls; retain evidence for production claims.

## 4. Roles and Responsibilities

| Role | Security responsibility |
|---|---|
| CTO | Accountable executive for security resourcing, risk acceptance, and major incident escalation |
| Security Officer | Maintains security policy, coordinates security assessment, monitors corrective actions, and manages security incidents with the IC |
| DPO | Advises on personal-data processing, rights, breaches, notifications, DPIA, and processor obligations |
| Engineering Lead | Implements secure architecture, reviews changes, manages dependencies, and maintains technical security evidence |
| DevOps / Platform Owner | Operates hosting, secrets, ingress, backups, monitoring, restoration, and environment access controls |
| Clinical Safety Lead | Assesses patient-safety impact, downtime procedures, emergency access, and clinical recovery validation |
| Facility Administrator | Maintains appropriate facility users, roles, departments, devices, and operational access reviews |
| Authorized User | Uses only assigned credentials, protects devices, reports suspected incidents, and does not share accounts |

This governance-responsibility table is not the application RBAC role catalogue. Application role codes, categories, and permission matrices are maintained in Vitora RBAC configuration and assigned by authorized facility administrators under the access-control policy.

## 5. Information Classification

| Classification | Examples | Minimum handling requirement |
|---|---|---|
| Public | Approved marketing content and public product documentation | May be publicly distributed after approval |
| Internal | Architecture summaries, operational procedures, non-sensitive configuration guidance | Restricted to authorized personnel and approved customers |
| Confidential | Facility configuration, staff records, contracts, security findings, internal logs | Access controlled; disclose only for a defined business purpose |
| Restricted health and personal data | Patient records, direct identifiers, clinical notes, claims, biometrics, credentials, encryption keys | Need-to-know access, tenant scope, approved processing purpose, encrypted transport, and auditability |

## 6. Access Control Policy

### 6.1 Identity and Authentication

1. Each user shall have an individually attributable account. Shared user accounts are prohibited except for a documented, time-limited technical exception approved by the Security Officer.
2. Web authentication uses JWT access and refresh tokens stored in HttpOnly cookies for browser clients. Desktop clients may use bearer-token compatibility because cross-origin desktop cookies are not suitable for that client model.
3. Access tokens are configured for a 30-minute lifetime. Refresh tokens are configured for a one-day lifetime, rotate on refresh, and are blacklisted after rotation.
4. Cookie authentication uses `HttpOnly`, `Secure` in production, and `SameSite=Lax` settings. CSRF protection applies to cookie-authenticated mutation requests.
5. Password reset, change-password, email verification, invitation, and account activation workflows shall use authenticated or time-limited token controls as implemented by the relevant service.
6. The web client provides an inactivity warning after 15 minutes and invokes logout after 30 minutes of inactivity. This is a client-side control; server-enforced inactivity expiry remains a required enhancement before it is relied on as a sole session-security measure.

### 6.2 Multi-Factor Authentication

1. MFA enforcement is implemented for superusers and users with `ADMIN`, `CLINICAL_SENIOR`, or `MANAGEMENT` roles/categories when `MFA_ENFORCEMENT` is enabled.
2. A confirmed TOTP device or WebAuthn credential satisfies MFA enrollment, unless MFA has been administratively disabled on the staff profile under an approved exception.
3. The configurable MFA onboarding grace period defaults to 72 hours. After expiry, access is restricted until required MFA setup is completed.
4. Production administrators shall not disable MFA without a documented, time-bound exception approved by the Security Officer.

### 6.3 Authorization and Least Privilege

1. API authorization maps HTTP methods to create, read, update, and delete actions and evaluates the user role permission matrix.
2. Where no staff profile is available, the application falls back to mapped Django permissions.
3. Role assignments shall be approved by the relevant facility administrator and reviewed when a user changes job, facility, department, or employment status.
4. Licensed roles are denied applicable actions when required licence information is missing or invalid.
5. Delete operations shall use explicit permission checks and audit logging. No authenticated user is entitled to delete a record solely by being authenticated.
6. Superuser access shall be restricted to authorized platform administration and protected by MFA.

### 6.4 Tenant and Sensitive-Record Access

1. Organization-scoped models are owned by an organization tenant. Facility-scoped models are owned by a facility and automatically inherit the facility organization.
2. Tenant-scoped views and querysets shall filter data by the authenticated user's authorized organization and facility context.
3. Sensitive patient records require the `patients.view_sensitive_patient` permission or an approved emergency-access override. Sensitive access must be attributable in audit records.
4. Emergency access shall be purpose-limited, time-limited, attributable, and subject to retrospective review.
5. Facility, organization, and department headers or context values must not override the authenticated user's authorized scope.

### 6.5 Access Lifecycle

| Event | Required action |
|---|---|
| New user | Verify identity, assign minimum role/facility/department scope, provide security guidance, and require MFA where applicable |
| Role or facility change | Reassess permissions, active memberships, assigned devices, and MFA requirement before or at the effective change time |
| Separation or access revocation | Disable account, revoke sessions/tokens where possible, remove facility membership, and recover or revoke managed devices |
| Break-glass access | Record purpose, approver, affected scope, duration, and retrospective review result |
| Privileged access review | Review administrator, security, database, cloud, and integration access at least quarterly or after material personnel change |

## 7. Encryption and Key Management Policy

### 7.1 Encryption in Transit

1. Production public application traffic shall use HTTPS. Real-time application traffic shall use WSS.
2. Production Django settings enable HTTPS redirect, secure session and CSRF cookies, HSTS, HSTS subdomains, and HSTS preload settings.
3. API integrations shall use TLS-protected endpoints and validate certificates according to the client library and integration configuration.
4. Plain HTTP is permitted only for documented local development, controlled LAN setup, or a specifically approved hub scenario; it shall not be used for public production ingress.

### 7.2 Encryption at Rest

1. Vitora uses `encrypted_pii_property()` descriptors for selected direct identifiers and secrets. Examples include patient identification number, phone number, email, address, national ID, principal national ID, selected contact details, insurance credentials, and configured integration secrets.
2. The application stores encrypted PII in dedicated encrypted columns and may store a separate HMAC blind index for permitted lookup use cases.
3. PII values must not be intentionally written to audit-log details. Audit logging invokes PII redaction before persistence.
4. Encryption does not remove the need for tenant isolation, RBAC, auditability, secure transport, data minimization, or access review.

### 7.3 Current and Target KMS Posture

| Control | Current software capability | Production policy requirement |
|---|---|---|
| Local KMS provider | Fernet symmetric encryption using an environment-managed `ENCRYPTION_KEY`; retained for legacy v1 compatibility and controlled single-server use | Must not be represented as HSM-backed cloud KMS |
| Azure Key Vault provider | Separate staging/production vaults and KEKs with managed-identity cryptographic access; supports organization-scoped wrapped key material | Maintain migration, key-version, rotation, and recovery evidence before claiming complete legacy-key retirement |
| Key rotation | Configurable KMS rotation interval defaults to 365 days | Maintain approved rotation schedule, key-version inventory, decryption continuity, re-encryption procedure, and test evidence |
| HMAC key | `PII_HMAC_KEY` is distinct from the encryption key | Store as a managed secret and rotate independently according to approved procedure |

1. Encryption keys, JWT signing secrets, database credentials, API credentials, backup passphrases, and other secrets shall not be committed to source control, placed in public logs, or embedded in client applications.
2. Production secret storage, access, rotation, and emergency recovery shall be documented in the environment inventory and tested under the incident and DR procedures.
3. Key compromise shall trigger immediate incident handling, key restriction or disablement where safe, replacement key creation, re-encryption assessment, access-log review, and DPO notification assessment.

## 8. Data Protection Policy

### 8.1 Data Minimization and Purpose Limitation

1. Collect and process only data required for healthcare delivery, lawful facility operations, billing/claims, public-health reporting, security, or another documented purpose.
2. Do not repurpose patient-care data for marketing, model training, research, or external disclosure without a separate approved purpose, lawful basis, and required assessment.
3. Optional integrations, AI services, external recipients, and international transfers require documented data-flow, recipient, security, and privacy review before enablement.
4. Patient and staff privacy notices shall identify the responsible controller, processing purposes, recipient categories, retention criteria, rights channels, and complaint route.

### 8.2 Offline and Client Data Protection

1. PowerSync Sync Streams are permission-gated and tenant-scoped. Credentials are issued by the server and contain facility, organization, read-permission, and sensitive-access claims.
2. Fernet-encrypted direct identifiers are excluded from browser PowerSync streams. Encryption keys shall never be distributed to browser SQLite clients.
3. Facility hubs use SQLite with WAL mode and must be installed on managed, access-controlled hosts with encrypted storage, backup, and patching procedures.
4. Desktop and mobile devices handling patient data shall use device lock, supported operating-system security updates, and managed endpoint controls appropriate to the facility risk assessment.
5. Lost, stolen, compromised, or decommissioned offline devices/hubs shall be treated as potential incidents. Credentials shall be revoked, local data risk assessed, and queued records reconciled before replacement synchronization.

### 8.3 Retention, Restriction, and Disposal

1. Retention periods shall be determined by the responsible controller according to applicable healthcare, tax, claims, employment, legal, and regulatory obligations.
2. The organization setting defaults to seven years, but configuration alone is not evidence of automatic deletion, archival, or legal retention enforcement.
3. Audit-log policy is seven years; actual archival/purge implementation and evidence must be verified before it is claimed as enforced.
4. Data subject requests for access, correction, restriction, objection, portability, or erasure shall be handled through the responsible controller and applicable legal exceptions.
5. Legal holds shall suspend disposal for the defined scope, purpose, authority, and duration without authorizing unrelated processing.
6. Backup expiry, offline caches, exports, AI working data, replicated stores, and recipients must be addressed in the controller's retention and deletion procedure.

## 9. Secure Development and Change Management

1. Application changes shall be reviewed, tested, and tracked through source control.
2. Backend changes use Django migrations for schema changes; uncontrolled production schema changes are prohibited.
3. New tenant-specific data models must use organization or facility scoping unless they are documented global reference data.
4. API client responses shall be validated with Zod schemas in the web application where supported by the module architecture.
5. Security-relevant changes require testing for authorization, tenant isolation, validation, error handling, audit events, logging, and rollback/recovery effect.
6. Dependencies, containers, operating systems, and third-party integrations shall be monitored for security updates and remediated according to risk and change-control procedures.
7. Secrets, real patient data, and production credentials shall not be used in source-controlled test fixtures, documentation examples, or unapproved support environments.

## 10. Logging, Monitoring, and Auditability

1. Audit records capture user, action, resource type/ID, timestamp, IP address, user agent, contextual details, and tenant context where available.
2. Audit details are redacted for PII before storage.
3. Audit entries use a monotonic sequence and HMAC-SHA256 hash chain, enabling detection of alteration, deletion, or reordering when the chain is verified.
4. Security and operations teams shall monitor authentication failures, sensitive access, emergency access, application errors, integration failures, backup age, restore drills, sync failures, and availability signals.
5. Monitoring and audit evidence access shall be restricted because logs can contain security and operational metadata.
6. Audit log retention, integrity verification, backup, archival, and production access restrictions shall be evidenced during DHA review.

## 11. Network, Endpoint, and Platform Security

1. Production applications shall use approved custom domains, valid TLS certificates, restrictive `ALLOWED_HOSTS`, CORS, CSRF trusted origins, and secure proxy-header configuration.
2. Public routes shall be deliberately designated. Public queue and document-verification capabilities must be limited to their approved data set and use case.
3. Authenticated application pages, API responses, WebSockets, documents, and patient-specific content shall not be cached by Azure Front Door, Vercel, Cloudflare, or another CDN.
4. Azure Front Door application routing, WAF/security-policy binding, origin protection, and DNS cutover must be verified before being claimed as active production security controls.
5. Release-download infrastructure must remain logically separated from authenticated healthcare application traffic, including endpoint, origin, route, cache, WAF exception, and change-control boundaries.
6. Rate limiting and anti-abuse controls shall be enabled and reviewed for authentication, password reset, signup, public verification, upload, and integration endpoints.

## 12. Incident Management and Business Continuity

1. Security events and suspected personal-data breaches shall be handled under the controlled Incident Response Plan.
2. Responders shall detect, record, triage, contain, preserve evidence, eradicate, recover, notify, and complete a post-incident review according to incident severity.
3. Where Nexora acts as processor, it shall notify the responsible controller without undue delay in accordance with law and contract. The controller and DPO determine regulatory and data-subject notification obligations.
4. Current backup and restore controls must be verified from active Azure workflows and storage evidence. A documented recovery target is not evidence that the target is achieved.
5. DHA target-state continuity requirements include RPO <=15 minutes, RTO <=2 hours, an in-country DR site, and bi-annual documented failover/fallback drills. These requirements shall not be claimed as met until tested evidence is retained.
6. Recovery testing shall include database, files, keys, authentication, audit records, critical clinical workflows, offline reconciliation, and integration safety checks.

## 13. Third-Party and Supplier Security

1. Third parties that process personal data shall be assessed and authorized before use.
2. Controller-processor and subprocessor terms shall address documented instructions, confidentiality, security measures, incident notification, rights assistance, audit/inspection, return/deletion, and termination.
3. Supplier access shall be least-privilege, time-bound where practical, attributable, and logged.
4. Hosting, storage, PowerSync, AI, communications, payment, payer, laboratory, and support suppliers shall be recorded in the deployment and data-flow inventory with their processing purpose, region, and transfer safeguards.
5. A third-party security certification, government status, or contract alone does not establish lawful disclosure or adequate processing safeguards.

## 14. Security Exceptions

1. Security exceptions require a documented business/clinical justification, risk assessment, compensating controls, owner, approval, expiry date, and review date.
2. The Security Officer, DPO, and Clinical Safety Lead shall review exceptions affecting restricted health data, MFA, encryption, tenant isolation, public ingress, backups, or incident notification.
3. Expired exceptions shall be remediated, renewed through formal approval, or result in the affected capability being restricted.

## 15. Evidence and Assurance Requirements

The following evidence shall be maintained for the submission environment:

- Production access-control and role review records.
- MFA enrollment and exception records for privileged roles.
- Tenant-isolation and sensitive-access test evidence.
- TLS, certificate, ingress, CORS, and CSRF configuration evidence.
- KMS provider, key-access, rotation, and recovery evidence.
- Encryption and PII-field migration evidence.
- Audit-log integrity verification and access-control evidence.
- Dependency, vulnerability, penetration-test, and remediation records.
- Backup, retention, restore-drill, RPO/RTO, and DR failover/fallback evidence.
- Incident-response exercise, breach-register, and notification-decision records.
- Processor/subprocessor, transfer, and data-flow approvals.

## 16. Review and Approval

This policy shall be reviewed at least annually and after a material security incident, major technology or hosting change, new high-risk processing activity, new processor/region, major schema change, or regulatory change.

| Version | Date | Change | Owner | Approval |
|---|---|---|---|---|
| 1.0 | 2026-10-02 | Initial DHA-facing information security policy. | Security Officer | Pending CTO, DPO, Clinical Safety Lead, and DHA review |
