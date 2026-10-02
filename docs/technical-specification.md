<!--
Purpose: DHA-facing technical specification for Vitora HMIS, covering the verified technology stack,
logical database schema, deployment architecture, interfaces, and system requirements.
Use: Submit with DHA technical-review materials and update after material architecture, database, or deployment changes.
Inputs: Current source code, Django migrations, deployment configuration, approved environment inventory, and test evidence.
-->
<!-- markdownlint-disable MD013 MD060 -->
# Vitora HMIS Technical Specification

**Product:** Vitora HMIS

**Supplier:** Nexora Consulting Ltd

**Document version:** 1.0

**Last reviewed:** 2 October 2026

**Classification:** Internal and regulatory submission material

**Purpose:** Detailed technical specification for DHA review, including the technology stack, database schema, interfaces, security architecture, and system requirements.

## 1. Document Scope and Evidence Status

This specification describes the Vitora HMIS source-controlled product and its intended production architecture. It distinguishes between implemented software capabilities, environment-dependent deployment controls, and planned controls. A source-controlled configuration is not proof that a control is active in a particular deployment. DHA submissions must be accompanied by the applicable production environment inventory, configuration evidence, test evidence, and approval records.

The authoritative sources for the physical database schema are the Django model definitions and migrations under `backend/hmis/apps/*/models*.py` and `backend/hmis/apps/*/migrations/`. This document provides the logical schema and major table relationships required for technical review; it does not replace generated migration SQL or an environment-specific database inventory.

## 2. Product Overview

Vitora HMIS is an offline-capable hospital management information system for Kenyan healthcare facilities. It supports facility administration, patient registration, clinical documentation, triage, laboratory, pharmacy, billing, claims, inpatient care, imaging, public-health reporting, and interoperability workflows.

The product is delivered through these clients:

| Client | Primary use | Offline capability |
|---|---|---|
| Web application | Browser-based facility workflows and administration | PowerSync local browser database for supported data; API fallback when PowerSync is unavailable |
| Desktop application | Workstation use and facility deployment | Local SQLite database and bundled Next.js sidecar |
| Mobile application | Android and iOS clinical workflows | Mobile-local secure storage and queued API workflows, subject to enabled module support |
| Facility hub | LAN service for facility workstations | SQLite with WAL mode, local REST/WebSocket service, and batch cloud synchronization when online |

## 3. Technology Stack

### 3.1 Backend

| Layer | Technology | Version or implementation evidence | Purpose |
|---|---|---|---|
| Language | Python | 3.12 | Backend application runtime |
| Web framework | Django | 5.x | Models, migrations, administration, middleware, security controls |
| REST API | Django REST Framework | 3.14+ | Authenticated REST APIs and serializers |
| API schema | drf-spectacular / OpenAPI | 0.29+ | API documentation and schema generation |
| Authentication | Simple JWT and HttpOnly cookies | `djangorestframework-simplejwt` | JWT access/refresh tokens, cookie authentication, token rotation and blacklisting |
| Real-time | Django Channels and Daphne | Channels 4.x, Daphne 4.x | ASGI, WebSocket connections, real-time events and notifications |
| Background processing | Celery with Redis when enabled | Celery 5.x | Optional asynchronous tasks, scheduled work, notifications, and integration jobs |
| Database drivers | psycopg / psycopg2 | PostgreSQL drivers | PostgreSQL access and connection pooling |
| Validation | Pydantic and DRF serializers | Pydantic 2.x | Input, integration, and API validation |
| FHIR | fhir-resources | 8.x | FHIR R4 resource and bundle handling |
| HL7 v2 | hl7apy | 1.3+ | HL7 v2 message processing |
| DICOM | pydicom and pynetdicom | 3.x | DICOM, PACS, imaging exchange |
| Cryptography | cryptography, PyJWT, PyCryptodome | Current locked dependencies | Field encryption, signatures, keys, tokens, and cryptographic operations |

### 3.2 Web Application

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 16 App Router | Server-rendered and client-rendered web application |
| UI runtime | React 19 | User interface components and state rendering |
| Language | TypeScript | Type-safe client application code |
| Styling | Tailwind CSS and shadcn/ui patterns | Responsive user interface and component styling |
| Server-state management | TanStack React Query | API caching, mutation handling, and refetching |
| Runtime response validation | Zod | API response and form schema validation |
| HTTP client | Axios | Cookie and bearer-token API access with interceptors |
| Offline read layer | PowerSync Web and SQLite WASM | Supported local data reads and synchronization |
| Error monitoring | Sentry Next.js SDK | Environment-configured client and server error monitoring |

### 3.3 Desktop Application

| Layer | Technology | Purpose |
|---|---|---|
| Native shell | Tauri v2 | Desktop window, updater, tray, local integration, and secure process boundary |
| Embedded application | Bundled Next.js standalone sidecar | Local web runtime served to the native webview |
| Local database | SQLite via better-sqlite3 | Desktop-local persistence and offline operation |
| Native runtime | Rust 2021 edition | Tauri command, lifecycle, updater, and sidecar implementation |
| Update delivery | Tauri updater and signed release artifacts | Desktop application update verification and installation |

### 3.4 Mobile Application

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Expo and React Native | Android, iOS, and supported web runtime |
| Navigation | Expo Router and React Navigation | Route and tab navigation |
| Secure local storage | Expo Secure Store and MMKV | Session, local preference, and protected mobile storage |
| Network and state | Axios, React Query, NetInfo | API access, cache, retry, and connectivity handling |
| Device capabilities | Expo Camera, Local Authentication, Location | Device workflows where enabled |
| Transport hardening | SSL public-key pinning package | Mobile TLS-pinning capability where configured |

### 3.5 Infrastructure and Delivery

| Component | Current or configured role | Notes |
|---|---|---|
| Azure Container Apps | Django API and planned production Next.js SSR web origin | Production web migration uses a South Africa North Container App configuration |
| Azure Database for PostgreSQL | Production relational database target | South Africa North deployment target; environment inventory must confirm the active server and backup configuration |
| Azure Blob Storage | Media, documents, encrypted database backups, and release artifacts | Storage containers and retention must be verified per environment |
| Azure Front Door Standard | Shared profile with isolated application and release endpoints | `vitoraappsa` application endpoint is configured; custom-domain cutover and WAF association require deployment validation |
| Vercel | Existing web frontend delivery during Azure Front Door cutover | Current/target state must be confirmed at release time |
| PowerSync Cloud | Browser-local synchronization for approved data streams | Requires deployed Sync Streams configuration and tenant JWT credentials |
| Redis | Optional broker/cache for asynchronous operation | Enabled only where asynchronous workers are deployed |
| GitHub Actions | Build, test, release, backup, restore-drill, and deployment automation | Workflow gates and environment approvals are configuration-dependent |

## 4. Application Architecture

### 4.1 Core Services

The Django ASGI service exposes REST APIs and Django Channels WebSockets from the same application runtime. The API enforces authentication, authorization, tenant scope, active-shift requirements where enabled, serializer validation, audit logging, and domain events.

Core platform capabilities include:

- Authentication, MFA, passkeys where configured, password reset, and HttpOnly cookie sessions.
- Organization, facility, department, role, staff, and membership management.
- RBAC permission matrices, Django permissions, sensitive-patient access filtering, and emergency-access workflows.
- Audit logging, event storage, domain event publication, synchronization support, and Kenya location reference data.
- Tenant-scoped data access through organization and facility mixins and request context.

### 4.2 Clinical and Operational Modules

| Domain | Principal capabilities |
|---|---|
| Patient management | Registration, MRN generation, demographics, contacts, consent, sensitive-patient classification, patient search |
| Encounters and triage | Encounters, vital signs, diagnosis, treatment plans, triage assessment, queues, clinical notes |
| Clinics and scheduling | Clinics, sessions, visits, rooms, staff rostering, clock-in/out, staff constraints |
| Laboratory | Orders, specimens, results, verification, critical results, reporting, analyzer integration support |
| Pharmacy and inventory | Prescriptions, dispensing, drug catalogue, stock, purchase orders, goods receipt, transfers, stock counts |
| Billing and insurance | Invoices, payments, receipts, M-Pesa, SHA/DHA claims, preauthorizations, remittances, private insurance workflows |
| Inpatient and procedures | Wards, beds, admissions, transfers, discharge, theatre, procedures, dialysis, blood bank |
| Imaging | Imaging orders, DICOM/PACS workflows, radiology reports, attachments, sharing controls |
| Public health | MCH, immunization, surveillance, IDSR, IHR notification, MOH reporting, DHIS2 integration support |
| AI support | TibaBot-assisted care plans, clinical decision support, lab interpretation, and stored outputs where enabled |

## 5. Database Architecture

### 5.1 Database Engines and Storage Model

| Deployment mode | Database engine | Purpose |
|---|---|---|
| Production cloud | PostgreSQL | Tenant-scoped transactional system of record and PowerSync replication source |
| Development and tests | SQLite or PostgreSQL, depending on settings | Local development and automated test isolation |
| Facility hub | SQLite with WAL mode | LAN-local facility service, local transactions, and cloud batch synchronization |
| Desktop | SQLite | Local desktop persistence and offline workflows |
| Browser PowerSync | SQLite WASM | Supported synchronized browser reads; encrypted PII fields are excluded from sync streams |

The database schema is managed by Django migrations. Direct database changes outside a controlled migration are not permitted for application schema changes.

### 5.2 Tenant and Identity Schema

| Logical entity | Primary purpose | Key relationships and controls |
|---|---|---|
| `Organization` | Tenant organization and high-level configuration | Owns facilities, patients, roles, memberships, and organization-scoped data |
| `Facility` | Physical or operational healthcare facility | Belongs to an organization; owns facility-scoped operational records |
| `Department` | Facility department or service unit | Belongs to a facility and may scope staff, clinics, resources, and schedules |
| `Role` | RBAC role definition | Permission matrix, hierarchy level, optional Django group, organization/facility scope |
| `StaffProfile` | Staff identity and employment profile | Links a Django user to role, organization, facility, department, credentials, and scheduling data |
| `OrgMembership` | Staff organization membership | Links staff identity, organization, roles, departments, and permitted facilities |
| `User` | Django authentication identity | Referenced by staff, audit, approvals, assignments, and created/updated metadata |

### 5.3 Clinical and Administrative Schema

| Domain | Principal entities | Key relationships |
|---|---|---|
| Patient | `Patient`, `EmergencyContact`, allergies and related clinical records | Patient belongs to an organization and has encounters, contacts, registrations, claims, and care history |
| Encounter | `Encounter`, `Diagnosis`, `TreatmentPlan`, `Medication` | Encounter belongs to a patient and facility; links to triage, laboratory, pharmacy, billing, and clinical workflow entities |
| Triage | `TriageAssessment`, triage queue entities | Assessment belongs to encounter/patient/facility and drives priority workflows |
| Clinic | `Clinic`, `ClinicSession`, `ClinicVisit`, clinic rooms | Clinic belongs to a facility and may link staff, rooms, sessions, and visits |
| Laboratory | `LabOrder`, `LabOrderItem`, `LabResult`, quality and culture records | Lab orders are facility-scoped and linked to patient and encounter context |
| Pharmacy | `Prescription`, `PrescriptionItem`, dispensing, drug, stock entities | Prescriptions link patient/encounter context to dispensing and stock movements |
| Billing | `Invoice`, `InvoiceItem`, `Payment`, `Receipt`, claims and remittances | Invoices link patient, facility, encounter, services, payments, and payer workflows |
| Inpatient | `Ward`, `Bed`, `Admission`, transfers, discharge, ward rounds | Admissions connect patient and encounter to ward/bed capacity and clinical workflows |
| Imaging | imaging order, procedure, report, attachment and DICOM entities | Imaging records are linked to patient, encounter, facility, ordering and reporting workflows |
| Scheduling | `Shift`, resource, constraint, schedule and roster entities | Shift records are facility-scoped and linked to staff, department, clinic, and room resources |

### 5.4 Logical Core Relationship Model

```text
Organization
  ├─ Facility
  │   ├─ Department
  │   ├─ StaffProfile / Role / OrgMembership
  │   ├─ Clinic / ClinicSession / ClinicVisit
  │   ├─ Encounter
  │   │   ├─ Diagnosis / TreatmentPlan / Medication
  │   │   ├─ TriageAssessment
  │   │   ├─ LabOrder / LabResult
  │   │   ├─ Prescription / Dispensing
  │   │   └─ Invoice / Payment / Receipt
  │   └─ Ward / Bed / Admission / Discharge
  └─ Patient
      ├─ EmergencyContact
      └─ Longitudinal clinical, billing, and reporting records
```

### 5.5 Tenant Scoping and Referential Integrity

Tenant-specific models must inherit from `OrganizationScopedModel` or `FacilityScopedModel`, or be protected through a nested tenant-scoping view mixin. The application resolves tenant context from the authenticated user's organization/facility and authorized request headers. Facility-scoped records must not be visible across facilities without an explicit authorized relationship.

Foreign keys model ownership and workflow relationships. Application models use Django migration constraints, model validation, serializer validation, tenant filtering, and explicit permission checks to prevent invalid parent/child relationships and cross-tenant access.

### 5.6 Audit, Event, and Synchronization Data

| Entity | Purpose |
|---|---|
| `AuditLog` | Attributable access and change accountability with action, user, resource, timestamp, IP/user-agent context, details, and hash-chain support |
| Event store entities | Domain-event persistence and projection support for significant clinical and operational events |
| Sync queue and conflict entities | Offline synchronization operations, retry status, conflict capture, and resolution metadata |
| PowerSync local schema | Client-side projection only; excludes Fernet-encrypted direct identifiers and is scoped by signed server-issued claims |

## 6. Data Protection and Security Architecture

| Control area | Technical implementation |
|---|---|
| Authentication | JWT access and refresh tokens; HttpOnly cookies for the web application; desktop bearer-token compatibility; token rotation and refresh-token blacklisting |
| MFA | TOTP MFA enforcement for configured high-risk roles, with a configurable onboarding grace period; WebAuthn/passkey support where enabled |
| Authorization | Django permissions, role permission matrices, tenant-scoped querysets, sensitive-patient permission filtering, and endpoint-specific checks |
| Session protection | Secure cookie configuration in production, CSRF protection for cookie-based mutation requests, inactivity warning/logout in the web client, and token expiry |
| Encryption in transit | HTTPS/WSS through public ingress and TLS-required integration endpoints |
| Encryption at rest | Fernet field-level encryption for selected direct identifiers; current local KMS provider uses environment-managed Fernet key material; Azure Key Vault/HSM is the production target architecture and must be enabled before it is claimed as deployed |
| Audit integrity | Audit logging and SHA-256 hash-chain support for tamper-evident audit records |
| Sensitive access | Explicit sensitive-patient classification and permission filtering; access should be attributable in audit records |
| Offline minimization | PowerSync streams exclude encrypted direct identifiers and use server-issued tenant and read-permission claims |
| Incident response | Controlled incident-response plan at `docs/incident-response-plan.md`, including personal-data breach assessment and notification procedures |

## 7. Interfaces and Interoperability

| Interface | Protocol or standard | Purpose |
|---|---|---|
| Web and client API | REST over HTTPS, JSON | Application workflow, administration, synchronized writes, and client integration |
| Real-time notifications | WebSockets over WSS | Queue, laboratory, triage, scheduling, billing, and alert updates where enabled |
| FHIR | FHIR R4 | Resource exchange, IPS-related workflows, bundles, and interoperability APIs |
| HL7 | HL7 v2 | ADT and laboratory/integration message support |
| DICOM | DICOM / PACS | Imaging order, storage, retrieval, and radiology workflow support |
| SHA/DHA | DHA HIE interfaces | Eligibility, consent, visits, claims, preauthorization, intervention lifecycle, and remittance workflows |
| DHIS2/KHIS | Configured reporting interfaces | Public-health and reporting submission support |
| Payments | M-Pesa and configured payment integrations | Payment initiation, callback, reconciliation, and receipt workflows |
| AI | TibaBot service where enabled | AI-assisted clinical workflows under configured authorization, privacy, and integration controls |

OpenAPI schema generation and endpoint routing are defined by the Django application. API consumers must use authenticated endpoints except those expressly marked public, such as approved public queue and document-verification routes.

## 8. System Requirements

### 8.1 End-User Requirements

| Client | Minimum supported baseline | Recommended baseline |
|---|---|---|
| Web application | Current supported Chrome, Edge, Firefox, or Safari with JavaScript, cookies, TLS 1.2+, and a reliable HTTPS connection | Latest browser version, 1280 x 720 or larger display, stable broadband or managed facility network |
| Windows desktop | Windows 10 version 1809 or later; 512 MB available RAM; WebView2 runtime | Windows 10 or Windows 11 with current security updates; 1 GB or more available RAM; managed endpoint protection |
| Linux desktop | Ubuntu 22.04+ or Debian 12+; 512 MB available RAM; WebKitGTK 4.1 dependency | Ubuntu 24.04; 1 GB or more available RAM |
| macOS desktop | macOS 12 Monterey or later; 512 MB available RAM | macOS 14+ on Apple Silicon; 1 GB or more available RAM |
| Mobile | Android or iOS device supported by the packaged Expo/React Native release, secure device lock, supported TLS stack | Managed Android/iOS device with biometric lock, current OS security updates, and reliable mobile/Wi-Fi connection |

The packaged desktop application bundles its required Next.js/Node sidecar. End users do **not** need to install Python, Poetry, or DPAPI tooling to run the desktop client. Mobile minimum OS versions must be validated against the actual packaged release before deployment; they are not inferred solely from source dependencies.

### 8.2 Facility Hub Requirements

| Resource | Minimum deployment baseline | Recommended baseline |
|---|---|---|
| Operating system | Supported Linux server distribution or supported Windows host running the approved hub service configuration | Managed Linux server with automatic security updates and service monitoring |
| CPU | 2 vCPU | 4 vCPU or more for multi-workstation facilities |
| Memory | 4 GB RAM | 8 GB RAM or more |
| Storage | 40 GB available SSD storage plus backup capacity | Encrypted SSD with capacity sized for local clinical records, attachments, sync queues, logs, and backup retention |
| Network | Wired or managed Wi-Fi LAN; stable route to cloud when synchronization is required | Segmented LAN, UPS-backed network equipment, monitored internet link, and documented downtime workflow |
| Native hub runtime | Python 3.11+ for Linux or Windows native hub installations; container deployments require Docker 20.10+ and Docker Compose v2 instead | Managed Python runtime with an isolated virtual environment, dependency-lock verification, and service monitoring |
| Windows secret protection | Windows DPAPI is required only when `HUB_SECRETS_FILE` is enabled for a DPAPI-protected hub secret bundle | Protect the bundle using the same Windows service/user context that runs the hub; keep a documented recovery and key-rotation procedure |
| Database | SQLite with WAL mode | SQLite with WAL mode; PostgreSQL hub deployment remains a future optional path, not a current supported hub baseline |

### 8.3 Cloud Production Requirements

| Component | Requirement |
|---|---|
| Application runtime | At least one healthy Django ASGI API replica running the Python 3.12 application image, with capacity and autoscaling configured for expected facility workload |
| Web runtime | At least one healthy Next.js SSR replica when Azure web delivery is active, to avoid avoidable cold-start impact on SSR-heavy routes |
| Database | Azure PostgreSQL production server in South Africa North, encrypted backup policy, monitored capacity, and tested restoration procedure |
| Object storage | Private containers for media, documents, and backups; separate release-artifact storage controls |
| Public ingress | HTTPS-only custom domains, certificate monitoring, restrictive CORS/CSRF configuration, and no edge caching of authenticated or patient-specific responses |
| Monitoring | Availability, latency, authentication failures, backup age, restore drill, application error, and security-alert monitoring |
| Recovery | Current backup/restore procedure plus DHA target-state design for RPO <=15 minutes, RTO <=2 hours, in-country DR site, and documented failover/fallback drills |

## 9. Deployment and Operational Constraints

1. Production and staging configuration values, secret references, domains, database servers, provider regions, and enabled modules must be recorded in an environment inventory.
2. Production database migrations must be applied through controlled deployment procedures and verified before application rollout.
3. Browser, API, document, and PowerSync data flows must be assessed before enabling a new third-party recipient, cloud region, or AI provider.
4. Public release artifacts are delivered separately from authenticated healthcare application traffic. Their Front Door routes, origins, cache policy, and access controls must not be reused for application data.
5. Authenticated pages, API responses, WebSockets, documents, and patient-specific content must not be cached by Azure Front Door or another CDN.
6. The Azure Front Door application custom-domain, WAF/security policy, origin protection, and DNS cutover must be validated before they are treated as active production controls.

## 10. Verification Evidence Required for DHA Submission

Attach or reference the following evidence for the submission environment:

- Production architecture and data-flow diagram with current region, provider, and custom-domain state.
- Database migration inventory and generated schema extract from the production release.
- OpenAPI specification and FHIR capability/conformance evidence.
- Current software bill of materials or locked dependency manifests.
- Role and permission matrix export.
- Encryption and key-management configuration evidence, including actual KMS provider and rotation evidence.
- TLS certificate and ingress configuration evidence.
- Penetration-test, vulnerability-management, and secure-development evidence.
- Backup execution, backup-retention, and timed restore-drill evidence.
- DHA-required DR evidence: RPO/RTO test results, in-country DR-site evidence, and documented failover/fallback drills.
- Incident-response plan, breach register procedure, privacy notice, DPIA, and controller/processor agreements.

## 11. Approval and Change Control

Any material change to database schema, hosting region, third-party processor, API standard, key-management provider, client offline storage, public ingress, retention process, or disaster-recovery architecture requires review of this specification and associated privacy, security, and DHA evidence.

| Version | Date | Change | Owner | Approval |
|---|---|---|---|---|
| 1.0 | 2026-10-02 | Initial DHA technical specification. | Engineering Lead | Pending DHA, DPO, security, and clinical-governance review |
