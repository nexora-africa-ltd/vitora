<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: Final product-level DPIA and mandatory facility-deployment annex for Vitora HMIS processing.
Use: Read with the referenced evidence; complete Annex A, validate controls, close
deployment actions, and obtain controller sign-off before live patient-data processing.
Inputs: Enabled modules, data volumes, hosting locations, contracts, legal bases,
retention schedules, stakeholder feedback, and control-verification evidence.
-->

# Data Protection Impact Assessment (DPIA)

## Vitora HMIS — Comprehensive Processing, Risk and Mitigation Report

| Document control          | Details                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Document ID               | VITORA-DPIA-001                                                                                      |
| Version / assessment date | 3.0 / 15 October 2026 |
| Status                    | **FINAL PRODUCT DPIA — pre-customer product assessment; not authorization for a facility deployment** |
| Product / developer       | Vitora HMIS / Nexora Consulting Ltd.                                                                 |
| Assessment entity | Nexora Consulting Ltd. — pre-customer product assessment; healthcare-controller arrangements arise at onboarding |
| Covered facilities | Not applicable: Vitora has no customers at this assessment date |
| Assessment owner / DPO | **Thande W Murito**, Nexora DPO; include the controlled corporate privacy contact in every facility deployment annex and patient/staff notice |
| Technical contributors    | Nexora engineering, security, operations and integration owners                                      |
| Classification            | Internal confidential — controlled distribution to controller, authorized reviewers and regulator   |
| Evidence baseline | Source code and regression tests in the working tree based on revision `4b97edda3`; supporting technical verification performed on 2 October 2026; earlier documents are contextual references, not implementation proof |
| Primary jurisdiction      | Kenya; assess additional obligations for each overseas processing location                           |
| Scheduled review          | By 15 October 2027, or earlier on the triggers in Section 18                                          |
| Approval record           | Section 19; complete the product approval record before relying on this assessment and complete Annex A before live patient-data processing |

**How to use this report.** This is the final product-wide assessment of the processing activities identified in the evidence baseline, with conditional coverage for optional modules and integrations. It is not a substitute for a healthcare controller's deployment decision. Before live patient-data processing, each controller must complete Annex A, confirm which activities occur, attach operational evidence, close applicable deployment actions, and approve its own risk treatment. A feature described in documentation is not proof that it is enabled, securely configured, or effective in production. An activity may be marked not applicable only with a recorded reason and evidence that its data flow is disabled.

**Pre-customer applicability.** Nexora confirms that Vitora has **no customers**. This DPIA assesses the product's implemented capabilities and envisaged healthcare processing before customer deployment. Customer facility identities, patient volumes, customer contracts and customer operational evidence are therefore **not applicable yet**, rather than missing facts about a live customer service. They become required in the deployment annex before onboarding and processing. Nexora's own staff/accounts, development, certification and test environments still require appropriate safeguards; absence of customers is not proof that every non-production record is synthetic or anonymous.

**Meaning of open fields.** Any `Pending`, `proposed`, `to be supplied`, or blank field in this product DPIA does not assert that a control is operating or that a fact is known. It is either a product-governance action requiring the evidence identified in Section 15, or a facility-specific fact that must be completed in Annex A before live patient-data processing. These fields must never be treated as completed by copying this document into a facility file.

## Contents

1. [Executive summary](#1-executive-summary)
2. [Scope, context and DPIA screening](#2-scope-context-and-dpia-screening)
3. [Accountability and responsibilities](#3-accountability-and-responsibilities)
4. [Data subjects and information categories](#4-data-subjects-and-information-categories)
5. [Processing activity register](#5-processing-activity-register)
6. [Data lifecycle, architecture and trust boundaries](#6-data-lifecycle-architecture-and-trust-boundaries)
7. [Legal basis and regulatory assessment](#7-legal-basis-and-regulatory-assessment)
8. [Necessity and proportionality](#8-necessity-and-proportionality)
9. [Transparency, consent and vulnerable people](#9-transparency-consent-and-vulnerable-people)
10. [Recipients, processors and international transfers](#10-recipients-processors-and-international-transfers)
11. [Retention, deletion and decommissioning](#11-retention-deletion-and-decommissioning)
12. [Control assessment and assurance](#12-control-assessment-and-assurance)
13. [Risk assessment methodology](#13-risk-assessment-methodology)
14. [Detailed risk register](#14-detailed-risk-register)
15. [Risk treatment and implementation plan](#15-risk-treatment-and-implementation-plan)
16. [Data subject rights procedures](#16-data-subject-rights-procedures)
17. [Incident response and continuity](#17-incident-response-and-continuity)
18. [Consultation, monitoring and review](#18-consultation-monitoring-and-review)
19. [Decision, approval and residual-risk acceptance](#19-decision-approval-and-residual-risk-acceptance)
20. [Evidence, legal references and version history](#20-evidence-legal-references-and-version-history)

## 1. Executive summary

Vitora HMIS supports the delivery and administration of healthcare through registration, clinical documentation, diagnostics, prescriptions, inpatient and specialist care, insurance claims, payments, public health reporting and related operational services. Its web, desktop, mobile and facility-hub deployment modes can create multiple copies of identifiable health information, including local offline databases, cloud replicas, attachments, messages, audit records and backups.

The anticipated benefits are continuity of care during connectivity interruptions, more accurate clinical records, coordinated treatment, timely reporting, improved financial administration and traceable access to health information. The principal potential harms are disclosure of stigmatizing conditions, discrimination, identity or financial fraud, loss of autonomy, exposure of children or survivors of violence, and clinical injury from inaccurate or unavailable information.

**DPIA screening outcome: a DPIA is required.** The combined processing involves sensitive health information, vulnerable people, longitudinal record linkage, potential large-scale deployment, international transfers, offline replication, and AI-assisted inference. The assessment addresses the four elements of section 31(2) of the Kenya Data Protection Act: processing description, necessity/proportionality, risks to individuals, and safeguards.

### Principal findings

| Finding                                                                                                                                                     | Assessment consequence                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient and emergency-contact encryption properties are present in source; clinical narratives, names and other contextual information remain personal data | Field encryption is a useful control, but is not whole-database encryption, anonymization or comprehensive protection of every copy                                               |
| Tenant scoping, sensitive-record permissions, MFA, emergency access and tamper-evident audit mechanisms are documented                                      | Verify deployed enforcement across every route, background job, export, event and offline read; do not infer universal coverage                                                   |
| Updated PowerSync streams enforce signed model-read permissions, patient sensitivity and tenant scope, including clinical descendants | Source-derived SQL tests pass; deploy the matching credentials endpoint, streams and client together, then validate against the PowerSync service |
| Replication queries no longer select removed plaintext contact columns or the nonexistent antibiotic-sensitivity `updated_at` column | Queries are executed against schemas derived from current Django model metadata; inspect the target migration state before deployment |
| Documentation places Neon and PowerSync in EU Central                                                                                                       | Cross-border transfers must be assessed; the previous statement that no overseas transfers were planned is no longer a reliable baseline                                          |
| General Regulations regulation 26 includes primary and secondary healthcare in Kenya                                                                        | Establish evidence of qualifying Kenyan processing or a serving copy in a Kenyan data centre; a browser cache or local hub does not automatically satisfy this requirement        |
| AI, biometric/OTP integrations, diagnostic files, payer exchanges and operational notifications expand the data flow                                        | Apply purpose-specific minimization, recipient controls, meaningful human oversight and supplier assurance                                                                        |
| No customers exist; customer-specific volumes, facilities, agreements and operating evidence do not yet apply | Complete the customer annex before onboarding; product-level governance, supplier assurance and technical acceptance remain applicable now |

**Assessment recommendation:** this final product DPIA approves no customer processing by itself. Complete the Annex A deployment decision, document deployment-specific legal grounds and transfers, verify applicable safeguards, and obtain the controller's decision before processing patient data. For processing already underway, promptly assess exposure, introduce appropriate interim restrictions, and preserve necessary care continuity. Follow the statutory DPIA submission and prior-consultation requirements in Section 7; this report cannot retroactively satisfy a pre-processing requirement.

## 2. Scope, context and DPIA screening

### 2.1 Assessment boundaries

The scope follows personal data throughout collection, use, disclosure, storage, replication, archival and disposal. It covers:

- Patient-facing registration, check-in, appointments, queues and communications.
- Clinical care, sensitive clinics, allied health, maternity/child health, immunization, emergency care, blood services and other enabled specialist services.
- Laboratories, analyzers, imaging/PACS, clinical documents and interoperability interfaces.
- Billing, SHA/DHA HIE, private insurance, payment providers, procurement and supplier contacts.
- Staff identity, access management, attendance/rosters, professional credentials, administrative and support access.
- TibaBot/AI, rules-based decision support, analytics, regulatory reporting and secondary-use proposals.
- Web/cloud, desktop sidecar, mobile and facility-hub environments; APIs, WebSockets, queues, caches, local databases, backups and observability.
- Onboarding, licensing, maintenance, development/test data, export, rights handling, incidents and exit arrangements.

Standalone TibaBot consumer services, CCTV, payroll, standalone biometric attendance, genetic sequencing and research recruitment outside the HMIS are not assumed to be active. If connected or supplied with HMIS data, record them as additional processing and reassess before activation. Commercial product information without identifiable individuals is outside personal-data processing; identifiable business contacts are in scope.

### 2.2 Current particulars and future deployment annex

| Required fact                                                     | Deployment record                                          | Why it matters                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Assessment entity and DPO | Nexora Consulting Ltd.; **Thande W Murito**. Nexora registration/contact evidence still requires organizational confirmation | Establishes product accountability |
| Customer healthcare controllers and facilities | **N/A — no customers.** Record legal entity, care level, sites and applicable registration at onboarding | Defines future controller responsibilities |
| Customer patient volumes and encounter rates | **N/A — no customer deployment.** Set expected and actual volumes in the deployment annex; separately inventory development/certification data | Establishes scale without inventing patient counts |
| Customer children and vulnerable populations | **N/A — no customer population.** Safeguards are assessed prospectively in Sections 4 and 9 | Required before relevant services are introduced |
| Customer staff, privileged users and support contacts | **N/A for customer staff.** Nexora's own access inventory and reviewers remain to be confirmed | Separates present operational access from future staffing |
| Customer endpoints and hubs | **N/A — no deployed customer fleet.** Web offline access is bounded by the one-hour server credential; storage is user/facility-specific | Device controls must be verified before deployment |
| Modules and interfaces | Implemented capabilities are described in Section 5; enabled customer configuration is **N/A until onboarding** | Avoids equating implemented features with live processing |
| Customer file volumes and growth | **N/A — no customer records.** Populate before capacity/retention acceptance | Covers diagnostic files, attachments and backups |
| Processing locations | Customer-specific locations are **N/A**; actual Nexora development/certification hosting, backups and supplier access still require verification | Hosting geography cannot be certified from code alone |
| Customer processing start date/version | **N/A — no customers.** Record the released version and start date before processing; source baseline is above | Supports pre-processing assessment and change control |
| Customer incidents and complaints | **N/A — no customer operating history.** Nexora security/incident history requires separate confirmation | No claim that the product has never had a security incident |

### 2.3 High-risk screening

| Indicator                                | Present or anticipated? | Rationale                                                                                                   |
| ---------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Sensitive personal data                  | Yes                     | Health, family, reproductive, financial/property-related and potentially biometric information              |
| Vulnerable subjects                      | Yes                     | Children, critically ill people, persons with disabilities, survivors of violence and marginalized patients |
| Large-scale or systematic processing     | Potentially; quantify   | Multi-facility, longitudinal records and routine monitoring of care/access                                  |
| Matching across sources                  | Yes                     | MRN, national identifiers, payer records, referrals, laboratory and hub/cloud records                       |
| Profiling or significant decisions       | Yes, where enabled      | ICU risk, condition prediction, clinical suggestions and payer decisions                                    |
| New technology or distributed processing | Yes                     | AI, offline replicas, browser SQLite, device clients and real-time events                                   |
| International processing                 | Documented architecture | EU Central services and potentially overseas support/subprocessors                                          |
| Consequences of failure                  | Severe                  | Loss of confidentiality, discrimination, denial/delay of care and clinical injury                           |

The screening describes **envisaged healthcare use**, not an existing customer population. The assessment combines source review and specified automated regression tests; it is not a penetration test, legal approval, clinical safety certification or production audit. Non-applicable customer facts are distinguished from outstanding product-level decisions and verification.

## 3. Accountability and responsibilities

### 3.1 Roles in processing

| Party                                                                                | Expected role                                                                                             | Responsibilities and qualifications                                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Healthcare organization operating facilities                                         | Controller for care and facility administration                                                           | Determines purposes, lawful grounds, recipients, retention, access policy and rights response; approves this DPIA          |
| Nexora Consulting Ltd.                                                               | Processor when hosting, supporting or otherwise processing under the healthcare controller's instructions | Implements contracted safeguards, manages authorized subprocessors, assists with rights/DPIAs and reports incidents        |
| Nexora for its own business contacts, licensing administration and security purposes | Potential separate controller                                                                             | Define exact purposes and necessity, issue appropriate notices and record a separate basis; do not repurpose clinical data |
| Vitora HMIS                                                                          | Software product, not a legal entity                                                                      | The software itself cannot be designated a controller or processor                                                         |
| Hosting, storage, sync, communications and AI suppliers                              | Processor/subprocessor where acting under instructions                                                    | Role, locations, onward recipients and permitted use must be established by contract and actual conduct                    |
| SHA, DHA, Ministry of Health, private insurers, receiving care providers             | Usually receiving controllers for their own statutory/care/payer purposes; assess each arrangement        | Data-sharing terms, authority, minimization, identity assurance and rights coordination                                    |
| Facility staff and authorized Nexora personnel                                       | Persons acting under their respective organization's authority                                            | Named accounts, confidentiality commitments, training and least-privilege access                                           |
| Jointly determining organizations                                                    | Possible joint controllers                                                                                | Document actual allocation of duties and a transparent arrangement rather than assuming a processor relationship           |

Installing a standalone software package without Nexora receiving or accessing personal data does not, by itself, establish that Nexora processes that facility's patient data. Support access, license telemetry, synchronization and backups must each be assessed on their actual facts.

### 3.2 Operational accountability

**Named product DPO:** Thande W Murito. This identifies the privacy lead; it does not imply a signed approval, a published contact address or designation by a future customer controller. Customer-specific role assignments take place during onboarding.

| Role                           | Accountable activities                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Controller executive/sponsor   | Resources, lawful operation, risk decisions and remediation deadlines                                    |
| DPO/privacy lead               | Independent advice, legal-basis register, consultations, rights, breach assessment and regulator liaison |
| Clinical governance lead       | Clinical necessity, minimum datasets, sensitive access, AI oversight, accuracy and safe downtime care    |
| Security lead                  | Threat assessment, authentication/authorization assurance, incident command and vulnerability management |
| Engineering lead               | Privacy-by-design, tenant isolation, data lifecycle implementation and regression evidence               |
| Operations lead                | Hosting regions, encrypted backups, endpoint/hub management, recovery and monitoring                     |
| Integration/procurement owners | Supplier contracts, recipient registers, interface payloads and transfer evidence                        |
| Records manager                | Retention, legal holds, corrections, disclosures and secure destruction                                  |
| HR/facility administrator      | Staff access lifecycle, rosters, training and local physical safeguards                                  |

Name individuals and deputies before approval. The DPO advises and monitors; the accountable controller accepts lawful residual risk. A contractual assignment does not remove a party's statutory obligations.

## 4. Data subjects and information categories

### 4.1 People affected

- Patients, including walk-in patients, donors, children, pregnant people and persons receiving highly sensitive services.
- Parents, guardians, dependants, next of kin, emergency contacts and family members mentioned in records.
- Clinicians, nurses, pharmacists, laboratory personnel, administrators, contractors and other system users.
- Referring professionals, supplier representatives, payer contacts, organizational subscribers and support contacts.
- Individuals indirectly described in clinical narratives, safeguarding reports, correspondence or uploaded files.

Staff names, professional identifiers, IP addresses and attendance records are personal data even where not encrypted. Being a professional or employee does not remove data-subject rights.

### 4.2 Data classification

| Category                          | Examples                                                                                                           | Principal sensitivity and handling implications                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Identity and demographics         | Names, MRN, DOB, sex/gender, national ID/passport, citizenship, location, disability indicators                    | Identification, linkage and discrimination; limit optional fields to justified purposes                      |
| Contact and relationships         | Phone, email, address, next-of-kin details, guardian/dependant links                                               | Contact can expose a person's location or care; verify safe channels and representative authority            |
| Health and care                   | Presenting complaints, diagnosis, vitals, allergies, medication, care plans, referrals, nursing/operative notes    | Sensitive personal data whether structured, free text, inferred or in a linked record                        |
| Especially sensitive context      | HIV/TB, mental health, GBV, sexual/reproductive health, child protection and social-work information               | Potential violence, stigma and exclusion; need-to-know controls across related records                       |
| Diagnostic materials              | Specimen identifiers, results, blood grouping, DICOM headers/pixels, waveforms, images, documents                  | Embedded identifiers and incidental findings; redact both metadata and visible content for secondary use     |
| Biometric/authentication evidence | External biometric authorization references, consent/OTP status, any captured biometric sample if actually enabled | Assess collection at supplier and client boundaries; do not assume raw templates are absent without checking |
| Financial and insurance           | SHA/member/policy identifiers, eligibility and vulnerability status, claims, invoices, payments, M-Pesa references | Fraud and health inference; detailed diagnosis is generally unnecessary for payment execution                |
| Staff and access                  | Username, professional registration, role, facility/department, shifts, restrictions, clock-in metadata            | Employee privacy; scheduling constraints may reveal staff health information                                 |
| Security and operations           | IP/device identifiers, audit entries, logs, access reasons, support tickets, license installations                 | Linkable personal data; avoid secrets and clinical payloads in routine diagnostics                           |
| AI and derived information        | Prompts, chat, predictions, risk scores, generated documents, embeddings if used, reviewer feedback                | Derived outputs can remain sensitive and inaccurate; retain provenance and human review                      |

**Classification rules:** an MRN or UUID is linkable personal data, not anonymous information. Encryption and pseudonymization do not remove the data from scope. A boolean sensitive flag can itself reveal sensitive context, and the underlying clinical details remain sensitive. A report is anonymous only after an assessment shows individuals cannot reasonably be re-identified, including by linkage or small-group inference.

\newpage

## 5. Processing activity register

The register covers the identified functional and operational activities. All rows require deployment confirmation. Basis profiles **B1–B8** are defined in Section 7 and retention classes **T1–T12** in Section 11. The final controller record must select the applicable lawful ground for each distinct purpose; a profile is not a blanket authorization.

| ID  | Activity and purpose                                                                 | Data, sources and subjects                                                                         | Main recipients/stores                                                                    | Basis / retention                                               | Specific minimization or safeguard                                                                               |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P01 | Registration, search, matching and demographic updates                               | Patient/guardian identity, contact, locations; direct entry and authorized registries/imports      | Registration/care team; patient store and authorized replicas                             | B1 / T1                                                         | Optional identifiers only when required; multi-attribute matching; avoid duplicate/wrong-person merges           |
| P02 | Appointments, check-in, clinic enrolment and queue management                        | Patient identity, clinic/time/room/status                                                          | Scheduling staff, care team, kiosk; minimal public display                                | B1 / T1,T7                                                      | Reset shared kiosks; display queue tokens without names or revealing clinic labels                               |
| P03 | Encounters, triage, diagnosis, allergies and treatment                               | Patient reports, clinician observations, measurements and history                                  | Authorized care team; clinical records                                                    | B1 / T1                                                         | Purpose/role-limited access and clinically relevant history                                                      |
| P04 | HIV/TB, mental health, GBV, social work, counselling and other sensitive clinics     | Highly sensitive notes, family/social details                                                      | Specifically authorized care professionals                                                | B1 / T1                                                         | Sensitive restrictions must propagate to children, searches, exports, events and replicas                        |
| P05 | Inpatient, ICU/HDU/NBU, emergency, theatre, procedures and dialysis                  | Admissions, monitoring, nursing, medication, anesthesia, operative/procedure records               | Treating teams and approved referrals                                                     | B1,B2 / T1                                                      | Emergency basis only for the particular necessity; attributable records and review                               |
| P06 | Maternity, child health and immunization                                             | Pregnancy, delivery, mother–child links, growth, vaccinations, adverse events                     | Relevant care team; authorized health reporting recipients                                | B1,B3 / T1                                                      | Child safeguards, guardian checks, purpose-limited mother–child linkage                                         |
| P07 | Blood donation, cross-matching and blood issue                                       | Donor identity, screening, blood group, recipient links                                            | Blood-bank and treating personnel                                                         | B1 / T1                                                         | Donor confidentiality; verify recipient matching and separate donor/recipient access                             |
| P08 | Laboratory orders, specimens, analyzer interfaces and results                        | Specimen labels, patient/order IDs, results, diagnostic reports                                    | Laboratory, external lab where authorized, clinicians; LIS/interface logs                 | B1 / T1,T7                                                      | Minimum analyzer identifiers; validate result/patient association                                                |
| P09 | Imaging, PACS/DICOM and diagnostic document storage                                  | Patient identifiers, images, headers, reports and referrals                                        | Radiology/care team; PACS and protected object storage                                    | B1 / T1                                                         | Authenticated object access; metadata and burned-in-text review                                                  |
| P10 | Prescribing, dispensing and walk-in pharmacy                                         | Medication, identity/contact, allergies and dispensing history                                     | Prescribers/pharmacists; pharmacy records                                                 | B1 / T1,T2                                                      | Restrict medication history; minimize walk-in identity collection                                                |
| P11 | Referrals, transfers, shared health record, FHIR/HL7 and registry exchanges          | Clinical summaries, attachments, identifiers and professional details                              | Named receiving provider or authorized registry; interface queues                         | B1,B3 / T1,T7                                                   | Verify recipient and sharing purpose; send relevant summary rather than entire chart                             |
| P12 | SHA/DHA eligibility, consent, visits, preauthorization, claims and remittances       | Member identifiers, OTP/biometric references, clinical/billing attachments, vulnerability coverage | SHA/DHA and contracted intermediaries; billing/integration stores                         | B4 / T2,T8                                                      | Claim-specific payloads; scoped, expiring authorization; verify callbacks                                        |
| P13 | Private insurance and HealthCloud/Slade360-enabled exchanges                         | Policy/dependant records, visit consent, claims, diagnoses and payment status                      | Contracted payer/intermediary                                                             | B4 / T2,T8                                                      | Confirm active integration route and recipients; no silent fallback to unapproved processor                      |
| P14 | Invoices, receipts, refunds, accounting and M-Pesa payments                          | Patient/customer identity, transaction references, amounts, payer phone                            | Billing/finance, payment provider and authorized auditors                                 | B4 / T2                                                         | Payment gateway receives minimum transaction data, not unnecessary diagnosis/notes                               |
| P15 | Procurement, stock, suppliers and accountable stock movement                         | Supplier contacts, staff actions; patient links where issue is patient-specific                    | Procurement/pharmacy/finance; inventory store                                             | B5 / T2,T3                                                      | Keep aggregate stock operations free of patient data                                                             |
| P16 | Public health, MOH/KHIS/DHIS2, IDSR/IHR and statutory case reporting                 | Aggregate indicators; identifiable case details only when authorized/required                      | Authorized public health bodies                                                           | B3 / T1,T9                                                      | Separate aggregate reports from case notifications; suppress revealing small cells                               |
| P17 | Quality improvement, BI and operational dashboards                                   | Encounter outcomes, demographics, departmental summaries                                           | Authorized management/quality staff; analytical stores                                    | B5 / T9                                                         | Prefer anonymous aggregates; document need for any identifiable drill-down                                       |
| P18 | Rules-based CDS, TibaBot clinical chat, prediction and generated documents           | Clinical inputs, prompts, outputs, risk scores, user/facility/session identifiers                  | Care team; TibaBot and disclosed model/service suppliers                                  | B1 for necessary care assistance; B8 for separate uses / T1,T10 | Minimize inputs; prevent cross-tenant retrieval; clinician reviews consequential output                          |
| P19 | Patient/staff messaging, reminders, alerts, comments and mentions                    | Contact addresses, message content, resource references                                            | Intended recipient; in-app service, Resend/facility SMTP and configured SMS/push provider | B1,B5; B6 for optional messaging purpose / T7,T8                | Safe channel choice; generic external notification linking to authenticated content                              |
| P20 | Staff recruitment into system, invitations, onboarding, roles, roster and attendance | Staff/professional identity, role, work pattern and clock-in metadata                              | HR, authorized managers, relevant registry                                                | B5 / T3                                                         | No broader surveillance; restrict health-related work constraints                                                |
| P21 | Authentication, MFA, session management and emergency access                         | Credentials, OTP/TOTP evidence, tokens, access reason and reviewer identity                        | Identity services, security and approved reviewers                                        | B5; B2 for emergency purpose / T4,T8                            | Named accounts, limited privilege, temporary break-glass and retrospective review                                |
| P22 | Security logging, domain events, WebSockets, monitoring and investigations           | User/resource identifiers, changes, IP/device and event metadata                                   | Security/operations; audit/event/log stores and authorized subscriptions                  | B5 / T4,T7                                                      | Payload minimization; subscriber authorization; tamper-evidence and limited log access                           |
| P23 | Offline operation, PowerSync, hub/cloud synchronization and conflict handling        | Selected patient, clinical, billing and identity records; queued writes/conflicts                  | Managed clients/hubs, sync service, cloud stores                                          | Inherits source purpose / T5                                    | Server-side sync entitlement, limited replication, revocation and safe conflict resolution                       |
| P24 | Backup, disaster recovery, migration and historical imports                          | Database/files/configuration, archived records                                                     | Authorized operators; backup/migration stores                                             | Inherits source purpose; B5 for resilience / T6,T7              | Encrypt, separate access, validate migration, restore deletion/restriction markers                               |
| P25 | Support, troubleshooting, maintenance, testing and release operations                | Staff contact, redacted diagnostics; exceptional approved patient access                           | Nexora/approved support, ticketing and test systems                                       | B5; source purpose for instructed support / T7,T11              | Synthetic test data; time-bound support access; no production data in general-purpose tooling                    |
| P26 | Organizational signup, subscriptions, hub licensing and update checks                | Administrator/business contacts, installation/device and entitlement metadata                      | Nexora business/operations systems and approved suppliers                                 | B7 / T3,T7                                                      | Separate licensing metadata from patient content; document own-controller purposes                               |
| P27 | Clinical exports, printing, medical certificates and patient copies                  | Requested records, summaries, certificates, attachments                                            | Verified patient/representative, authorized clinician or recipient                        | B1,B3; rights obligation for rights copies / T1,T11             | Minimal certificate content; recipient verification; secure print/download delivery                              |
| P28 | Rights requests, consent changes, complaints, retention and deletion                 | Requester identity, authorization, request/decision evidence and affected records                  | DPO/records staff; notified recipients                                                    | B3 / T12 and source classes                                     | Restriction is separate from sensitive flag; propagate accepted changes to copies                                |
| P29 | Research, model training, external benchmarking or direct marketing proposals        | Proposed research/marketing datasets, outcomes, identifiers or derived features                    | Separately approved researchers, model suppliers or marketing processors                  | B8 / separately approved schedule                               | **Not authorized by care consent or this product DPIA**; separate purpose/legal/ethics assessment and DPIA update |

**Scope reconciliation:** compare this register with the enabled-module list, outbound network destinations, database/object-store inventory, scheduled tasks and supplier invoices. Record unmapped activities before approving the deployment; a module name alone may conceal several different processing purposes.

## 6. Data lifecycle, architecture and trust boundaries

### 6.1 Main data flows

```text
Patients / guardians / staff / authorized external sources
                         |
          registration, care, imports, devices
                         v
 Web browser / Tauri desktop / React Native mobile
       | local state, files, caches and offline database
       |                         |
       v                         v
 Cloud Django API <--------> Facility hub on local network
       |                       | local SQLite + sync queues
       v                       |
 PostgreSQL + protected files <-+ authorized cloud/hub sync
       |
       +--> PowerSync replication --> authorized browser SQLite
       +--> tasks / events / WebSockets --> authorized subscribers
       +--> clinical / payer / payment / public-health recipients
       +--> TibaBot --> approved downstream AI services, if configured
       +--> transactional messaging providers --> intended recipients
       +--> audit / monitoring / backups / approved support
                         |
             retention, rights, export and disposal
```

This is a logical flow, not a guarantee that each connection exists in a particular deployment. The browser PowerSync route and the hub/cloud synchronization route are distinct and need separate authorization, deletion and transfer checks.

### 6.2 Trust boundaries and required checks

| Boundary                                   | Main risk                                                     | Required treatment                                                                          |
| ------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Patient/guardian to staff, kiosk or import | Excess collection, impersonation, inaccurate identity         | Notice, minimum fields, representative checks and source/provenance validation              |
| User/device to API                         | Credential theft, unauthorized record access                  | Transport protection, session controls, endpoint and object-level authorization             |
| One organization/facility/role to another  | Cross-tenant or excessive intra-organization disclosure       | Tenant scope plus role/purpose restrictions; organization membership alone is insufficient  |
| Cloud database to sync service to endpoint | Over-replication and bypass of API controls                   | Enforce equivalent authorization before replication, with entitlement change handling       |
| Facility LAN to hub                        | Interception, rogue discovery endpoint, exposed admin/service | Authenticated encrypted LAN communications, trusted hub identity and network segmentation   |
| Desktop WebView to local sidecar/OS        | Local process access, cached data, unsafe IPC                 | Loopback-only services, restricted IPC/OS access, managed profiles and clear data lifecycle |
| API/tasks to external recipient            | Misdirection, unlawful transfer, excessive payload            | Destination allowlist, scoped credentials, recipient contract and payload review            |
| Event/log/object store to consumer         | Subscription leakage, public files, log disclosure            | Server-side authorization, protected object URLs, redaction and purpose-limited retention   |
| Production to support/test/export          | Uncontrolled new copies                                       | Synthetic data by default; approved, minimized, time-limited access and disposal            |
| Live system to backup and restored system  | Persistent deleted data, ransomware, key loss                 | Encrypted separate backups, restore tests, replay of restrictions/deletions                 |

### 6.3 Lifecycle requirements

1. **Collect:** identify the subject and source, deliver the appropriate notice, record the purpose and basis, and capture only necessary fields.
2. **Use and update:** apply minimum access, verify clinical identity, record provenance, correct errors with an attributable clinical amendment rather than silently rewriting history.
3. **Share:** confirm recipient, purpose, authority, approved destination and minimum dataset; record material disclosures and applicable consent evidence.
4. **Replicate:** transmit only authorized subsets; track device/facility and sync state. Treat queued writes, conflicts and tombstones as personal data.
5. **Retain:** apply class-specific schedules, reviews and restricted legal holds across databases, objects, logs, caches and suppliers.
6. **Dispose:** erase or effectively anonymize data when required, revoke links/access, expire backup copies and verify disposal. Soft deletion is not erasure.

## 7. Legal basis and regulatory assessment

### 7.1 Applicable framework

The primary framework is the Constitution of Kenya, Article 31; the Data Protection Act, 2019; and the Data Protection (General), Registration, and Complaints Handling and Enforcement Regulations, 2021. Assess healthcare confidentiality, the Health Act, Digital Health Act, applicable SHA/public-health requirements and professional obligations for each deployment. Record the exact instrument and provision relied on for any claimed mandatory disclosure or retention period.

The Data Protection Act and General Regulations published by Kenya Law were consulted for this revision; links are in Section 20. Industry protocols such as FHIR or DICOM and participation in a government integration are not, by themselves, lawful grounds or proof of compliance.

### 7.2 Purpose-specific basis profiles

General Regulations regulation 5 requires a demonstrable basis established before processing, with one basis at a time for the relevant processing without consent. Different purposes can have different bases. The following profiles identify decisions the controller must resolve; do not record all alternatives as simultaneous grounds.

| Profile                                            | Purpose and basis decision                                                                                                                                                                                                                                                                                         | Required supporting evidence                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 — Direct healthcare                            | Select the applicable section 30 basis for the specific service, such as necessary contract performance for an appropriate private-care service or a demonstrable public task for a public provider. Also satisfy the applicable sensitive-data conditions and section 46 health-data/confidentiality requirements | Service context, precise necessity, care provider responsibility, duty of confidentiality; child safeguards where relevant                        |
| B2 — Emergency care                               | Section 30(1)(b)(iii), vital interests, where factually necessary; consider section 45(c)(iii) for sensitive data where the person is physically or legally incapable of consent                                                                                                                                   | Contemporaneous emergency reason, scope, duration, responsible professional and review                                                            |
| B3 — Legal/public duties                          | Select a specific legal obligation or public-interest/official-authority basis under section 30 for each report, rights response or legally required disclosure                                                                                                                                                    | Exact statutory duty/authority, required fields, recipient, confidentiality conditions and schedule                                               |
| B4 — Billing, payment and insurance               | Separate service/payment contract administration from statutory reporting and optional disclosures. Establish the basis for each payer exchange and any purpose-specific consent required                                                                                                                          | Contract/statutory authority, payer data-sharing terms, clinical-data necessity, valid consent/authorization evidence where applicable            |
| B5 — Employment, security and internal operations | Separate employment/administrative contract obligations, legal duties and justified legitimate interests under section 30(1)(b)(vii). For legitimate interests, document purpose, necessity and balancing against individuals' rights                                                                              | Employment/role context; legitimate-interest assessment where used; notices, confidentiality and minimum access                                   |
| B6 — Optional consent-based purpose               | Sections 30(1)(a) and 32, where consent is freely given, specific, informed, affirmative and withdrawable                                                                                                                                                                                                          | Versioned purpose/notice, choice, time, actor, method, withdrawal and downstream enforcement                                                      |
| B7 — Nexora business administration               | Select contract necessity or another justified basis for organization contacts, subscription and minimal licensing/security metadata; keep purposes distinct from clinical processing                                                                                                                              | Business notice, minimal telemetry inventory, controller role determination and retention                                                         |
| B8 — Secondary use                                | Separate assessment for research, training, commercial use or marketing; assess sections 30, 37, relevant research provisions and sensitive-data restrictions. Use effective anonymization wherever sufficient                                                                                                     | Approved protocol, basis/compatibility assessment, consent if required, ethics approval where applicable, release controls and specific retention |

Consent to clinical treatment, the lawful basis for processing health data, a payer OTP/biometric authorization and consent to an optional AI/marketing purpose are separate matters. A registration checkbox does not establish all four. Sensitive-data processing must meet the relevant additional conditions in sections 44–46; section 46 does not remove the need for a section 30 basis.

### 7.3 Compliance and evidence matrix

| Provision                                                      | Requirement relevant to this DPIA                                                                        | Assessment/evidence required                                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Act sections 18–23; Registration Regulations                  | Registration and oversight                                                                               | Confirm controller/processor registration requirements and current certificates, including applicable mandatory healthcare category                                |
| Act section 24                                                 | DPO designation, role and published contacts                                                             | Record appropriate designation, independence, accessibility and regulator communication                                                                            |
| Act section 25                                                 | Fairness, transparency, purpose limitation, minimization, accuracy, storage and transfer principles      | Sections 5–12 and operational evidence                                                                                                                            |
| Act sections 26–29                                            | Rights, representatives, collection and notice                                                           | Accessible notices, lawful indirect collection, representative controls and rights workflow                                                                        |
| Act section 30; General Regulations regulation 5               | Lawful processing                                                                                        | Completed purpose-specific basis register                                                                                                                          |
| Act section 31(1)–(2)                                         | Prior DPIA for high-risk processing and prescribed content                                               | This report plus deployment-specific completion and evidence                                                                                                       |
| Act section 31(3), (5)                                         | Prior consultation where DPIA indicates high risk; submit DPIA reports sixty days before processing      | DPO to manage submission timing, consultation and regulator correspondence; no self-approved exemption                                                             |
| Act section 32; General Regulations regulation 4               | Valid consent and withdrawal                                                                             | Granular evidence and effective withdrawal, including queued disclosures                                                                                           |
| Act sections 27, 33; General Regulations regulation 13         | Representatives, children and best interests                                                             | Age/authority checks and safeguarded child-specific processes                                                                                                      |
| Act sections 34–40; General Regulations regulations 7–12, 19 | Restriction, objection, automated decisions, portability, retention, rectification and erasure           | Sections 11 and 16; end-to-end request exercises                                                                                                                   |
| Act sections 41–42; General Regulations regulations 24–25    | Privacy by design/default, security and processor contracts                                              | Verified controls, written instructions and authorized subprocessors                                                                                               |
| Act section 43; General Regulations regulations 37–38         | Breach notification and communication                                                                    | Section 17; timed incident exercise and evidence register                                                                                                          |
| Act sections 44–46                                            | Sensitive and health information                                                                         | Care-provider responsibility, relevant grounds and confidentiality safeguards                                                                                      |
| Act sections 48–49; General Regulations Part VII              | Transfers outside Kenya                                                                                  | Document transfer ground/safeguards; section 49(1) requires consent and confirmation of appropriate safeguards for sensitive personal data processed outside Kenya |
| Act section 50; General Regulations regulation 26              | Kenyan processing/serving-copy requirement for specified purposes including primary/secondary healthcare | Verify qualifying Kenyan server/data-centre arrangements; assess coverage, availability and scope                                                                  |

No universal seven-year adult or twenty-five-year child retention rule is established by the Data Protection Act. Record justified periods from the applicable healthcare/records requirements rather than repeating unverified figures from the previous version.

## 8. Necessity and proportionality

| Processing choice                         | Necessity and less intrusive approach                                                                                  | Decision/limitation                                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Identifiable longitudinal clinical record | Needed to treat the correct person and maintain continuity; disconnected anonymous records would impair safe care      | Retain relevant identity and clinical history; prevent excessive collection of unrelated family/private information                     |
| National ID/passport/phone                | May support matching, contact or payer requirements; MRN and verified demographics may suffice for some services       | Do not make government ID or phone a universal prerequisite for emergency or otherwise lawful care                                      |
| Organization-wide patient visibility      | Can support cross-facility continuity; facility/episode-based access is less intrusive                                 | Establish whether shared registration visibility is necessary; sensitive and role restrictions still apply                              |
| Broad offline replication                 | Supports unreliable connectivity but multiplies exposure; selected patients, clinics or time windows may suffice       | Limit dataset and offline duration; compare API-only or hub-mediated operation for shared/unmanaged devices                             |
| Highly sensitive notes                    | Necessary for specific treatment/safeguarding; detailed disclosure to general users is usually unnecessary             | Use appropriately segregated access and summaries without hiding information necessary to authorized care                               |
| Public queues and certificates            | Queue token or minimal fitness/attendance statement normally achieves the purpose                                      | Avoid patient names, diagnoses, MRNs and revealing specialty labels unless a distinct justified need exists                             |
| Biometrics in payer verification          | Potential fraud prevention, but OTP or assisted identity verification may be less intrusive                            | Document recipient requirement and alternatives; minimize raw capture and do not make optional verification a barrier to necessary care |
| AI-assisted clinical work                 | May assist summarization/coding and clinical review; rules or manual review may achieve a purpose with less disclosure | Assess benefit per feature, minimize inputs, maintain human decision-making and a workable non-AI route                                 |
| Management/public health reporting        | Most trends need totals rather than individual records                                                                 | Aggregate by default; case-level reporting only with identified authority; test small-cell/linkage risk                                 |
| Staff attendance and audit monitoring     | Needed for accountable care and scheduling; continuous location/device surveillance is more intrusive                  | Limit collection to justified work/security events; prohibit undeclared performance profiling                                           |
| Support and testing                       | Most defects can be reproduced using synthetic data                                                                    | Exceptional identifiable-data use needs a defined case, minimum scope, authorized access and deletion                                   |
| Long retention and backups                | Supports care, legal evidence and resilience; indefinite retention increases harm                                      | Apply differentiated schedules and legal holds, plus short-lived operational copies                                                     |

Alternatives and trade-offs must be recorded by the controller and clinical lead. Offline operation improves availability but increases confidentiality and revocation risks. Encryption reduces disclosure impact but cannot prevent excessive access by an authorized application. A favorable business case does not override an individual's statutory rights.

## 9. Transparency, consent and vulnerable people

### 9.1 Notice and choice

Provide a concise patient notice at collection, with a fuller accessible version. Offer English/Kiswahili and locally appropriate explanation, readable print, assisted oral explanation and accessible formats. Include:

- Controller identity and contact; Nexora's applicable role; DPO/privacy contact.
- Purposes, information categories, legal grounds, required/optional fields and consequences of not providing them.
- Recipient categories, material named integrations, cloud/offline storage and overseas transfers/safeguards.
- Retention periods or criteria; rights, how to exercise them and how to complain to the ODPC.
- AI/profiling use and meaningful explanation of significant consequences where applicable.
- Separate choices for genuinely optional processing and a straightforward withdrawal method.

Give staff and business contacts notices tailored to their own processing. For indirect collection, apply General Regulations regulation 6(3)'s fourteen-day information requirement, with the DPO documenting any applicable legal exception rather than silently omitting notice. Do not make web access the only way to obtain a notice or exercise rights.

### 9.2 Consent evidence

The evidence record should capture subject/representative, representative authority, distinct purpose, data categories, recipients/transfers where relevant, notice version, language/method, timestamp, collecting staff/system, expiration if applicable, and withdrawal history. A boolean and timestamp alone do not prove all these elements.

On withdrawal, identify the affected consent-based purpose, stop future processing/disclosures for that purpose, update queued work and downstream instructions, and explain any separate lawful retention. Do not relabel the same processing under a new basis merely to defeat withdrawal. OTP or biometric success establishes a particular verification event, not unlimited future consent.

### 9.3 Children, incapacity and safeguarding

- Apply section 33 parent/guardian consent, age-verification and best-interests requirements; verify authority proportionately and protect adolescents' confidentiality under applicable healthcare law.
- Consider the section 33(4) exception for a provider exclusively offering counselling or child-protection services; do not extend it indiscriminately to every service.
- Do not assume a disability eliminates decision-making capacity or that a relative automatically represents the person. Document any lawful guardianship/authorization.
- Record emergency necessity when consent cannot be obtained; review and provide information when appropriate after stabilization.
- For GBV, safeguarding and sensitive clinics, verify safe contact methods and whether a guardian/partner disclosure could cause harm. Avoid revealing clinic labels in reminders or public displays.
- Explain AI and external disclosures in understandable terms; do not condition essential care on unrelated optional processing.
- Use narrowly scoped, time-limited emergency access with attributable justification and independent retrospective review; emergency access is not a general cross-tenant bypass.

\newpage

## 10. Recipients, processors and international transfers

### 10.1 Initial recipient and transfer inventory

These entries distinguish source-evidenced architecture from deployment facts that cannot be established without an active controller, supplier contract, and runtime inventory. Each active entry must have its legal entity, role, country, processing region, backup location, remote-support locations, onward subprocessors, and contract reference recorded in Annex A before use with patient data.

| ID  | Recipient/service                                                      | Data and purpose                                                              | Location/status from reviewed evidence                                | Required assurance                                                                                               |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| X01 | Microsoft Azure hosting and any configured key services                | API runtime, requests, operational data; keys if enabled                      | Azure cloud is source-documented; actual subscribed services and regions must be recorded in Annex A | DPA, region evidence, support access, key custody and subprocessor list                                          |
| X02 | Neon PostgreSQL                                                        | Primary cloud records and replication source                                  | EU Central documented                                                 | Sensitive-data transfer assessment, retention/backups, encryption and qualifying Kenyan arrangement              |
| X03 | PowerSync Cloud                                                        | Selected records, user/tenant claims and synchronization metadata             | EU Central documented                                                 | Transfer controls, authorized stream definitions, replication account privileges and deletion assurance          |
| X04 | Vercel web delivery/runtime if used                                    | Connection metadata; personal payloads where server/proxy routes process them | Optional deployment surface; the facility must record whether enabled, its payloads, and regions in Annex A | Trace server routes/logs/caches; prevent authenticated health-response CDN caching; DPA and transfer assessment  |
| X05 | SHA/DHA HIE, registries and public-health bodies                       | Identity, eligibility, care, claims and statutory reports                     | Kenyan recipients by purpose; the facility must record enabled routes and verified destinations in Annex A | Specific authority, data-sharing agreement, verified destination and minimal dataset                             |
| X06 | Private insurers, HealthCloud/Slade360 and intermediaries              | Member/visit authorization, claims and remittance information                 | Optional integration; the facility must record its contractual chain and locations in Annex A | Role analysis, purpose/consent, recipient terms, fallback route review and transfer assessment                   |
| X07 | M-Pesa and other configured payment services                           | Payment reference, amount and necessary contact/account details               | Optional payment integration; the facility must record provider processing locations in Annex A | Minimum payload, authenticated callbacks, fraud controls and payment terms                                       |
| X08 | TibaBot and downstream model/inference providers                       | Clinical prompts, session/identity metadata, outputs and safety/usage logs    | Optional capability; no provider, region, retention, or training/reuse term may be assumed without Annex A evidence | No unauthorized training/reuse, tenant isolation, access/deletion terms, transfer and clinical-safety assessment |
| X09 | Resend, facility SMTP and configured SMS/push services                 | Recipient addresses, messages and delivery metadata                           | Configurable delivery routes; the facility must record active providers and locations in Annex A | Recipient verification, content minimization, DPA, provider retention and no unapproved failover                 |
| X10 | Object storage, PACS, external laboratories and backup providers       | Diagnostic files, attachments, images, backups and interface payloads         | Local/S3-compatible options; older DR runbook mentions Wasabi EU      | Verify actual provider/region, protected access, expiry, restore and transfer evidence                           |
| X11 | Support, observability, CI/CD and ticketing suppliers                  | Redacted logs, device/account metadata; exceptional approved record access    | Product supplier inventory must be maintained by Nexora; facility-specific support access must be recorded in Annex A | No routine clinical payloads, approved access, log retention and onward-transfer terms                           |
| X12 | Receiving facilities, patients/representatives and authorized auditors | Purpose-limited summaries, copies or evidence                                 | Destination-specific                                                  | Verify identity/authority, secure channel, disclosure record and recipient obligations                           |

### 10.2 Contract requirements

Written controller–processor and authorized subprocessor arrangements must specify subject matter, duration, instructions, purposes, data types, subjects, confidentiality, security, incident reporting, rights assistance, DPIA assistance, audit/inspection, return/deletion and termination. Obtain prior controller authorization for subprocessors and equivalent downstream obligations. Address government access requests, support access, storage/backup regions and notification of material supplier changes.

Routine controller-to-controller sharing also needs an appropriate agreement and lawful authority. Government status, vendor security certifications or a contract alone do not establish the lawfulness of a particular disclosure.

### 10.3 Transfer assessment and localization

Before an overseas flow, record:

1. Exporter/importer identity, roles, purpose, countries, data categories, subjects, frequency, volume and onward recipients, including remote support and backups.
2. The applicable transfer ground under section 48 and General Regulations Part VII; for sensitive data, section 49(1)'s consent and appropriate-safeguards requirements and any specifically applicable legal provisions.
3. Destination protections, enforceable rights, recipient practices, government-access exposure, redress and contractual/technical safeguards. EU hosting is not automatically a Kenyan adequacy determination.
4. Encryption in transit/at rest, actual key access, pseudonymization where possible, restricted recipient access and monitoring. Encryption does not make an overseas transfer disappear.
5. Evidence of compliance with regulation 26 for primary/secondary healthcare: qualifying Kenyan processing or at least one serving copy in a Kenyan data centre. Confirm the actual copy is usable, maintained, secure and covers the relevant records.
6. Informed notice/consent where required, controller/DPO decision, unresolved risks, review date, and regulator submissions/consultation where required.

Record actual locations rather than relying on a supplier's headquarters. An on-premise hub's suitability as a qualifying arrangement requires assessment; browser SQLite, an occasional backup or an unverified local device is not assumed sufficient. Where requirements cannot be met, redesign or restrict the affected overseas flow and maintain a lawful clinical continuity arrangement.

## 11. Retention, deletion and decommissioning

### 11.1 Retention schedule for controller adoption

Periods marked **proposed** are policy recommendations, not verified configuration or statutory periods. Periods marked **pending** must be set before approval. Each final schedule entry must include exact duration, legal/purpose justification, trigger, owner, storage locations, hold rules and disposal method.

| Class | Records and retention purpose                                                                           | Period/trigger and status                                                                                                                                                                                   | Disposal and owner                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1    | Clinical record, diagnostic files, consent relevant to care, signed documents and referrals             | **Pending:** set justified healthcare periods by record type, including separate child/donor/safeguarding requirements and trigger such as discharge/last encounter                                   | Records manager: review holds, remove/archive under approved policy, erase associated objects and notify relevant recipients                                        |
| T2    | Invoices, payments, claims, preauthorizations, procurement and financial evidence                       | **Pending:** reconcile tax/accounting, payer contract, dispute and clinical requirements from transaction/claim closure                                                                               | Finance/records manager: restricted archive then verified destruction                                                                                               |
| T3    | Staff, organization contacts, rosters, supplier/licensing administration                                | **Pending:** employment/contract term plus justified post-termination obligations; health-related staff constraints separately restricted                                                             | HR/business owner: revoke access immediately at role termination and dispose on schedule                                                                            |
| T4    | Audit, security accountability and emergency-access reviews                                             | **Documented product policy: seven years** for audit logs; controller must validate necessity, exceptions and actual enforcement                                                                      | Security/records manager: protect evidence, minimize content, expire without defeating audit integrity                                                              |
| T5 | Offline records, local caches, queued writes and conflicts | **Implemented web behavior:** server credential validity is one hour; a fresh session requires server authorization. Logout clears downloaded records if no writes are pending; otherwise the owner-specific database is closed and retained for reconciliation | Operations/engineering: verify endpoint encryption and recovery/disposal procedures; legacy queues are quarantined, not silently destroyed |
| T6 | Database/media backups and recovery logs | **Source defaults:** 30-day local/90-day remote retention in `backup.sh`, with cleanup logic. Actual scheduling, target storage and any WAL/incremental retention require configuration evidence | Operations: verify expiry, full recovery, legal holds and replay of deletion/restriction instructions |
| T7    | Routine application logs, event delivery, integration troubleshooting, temporary import/migration files | **Proposed:** 30 days for sanitized operational logs; temporary payload files removed after validated processing, normally within 7 days; longer incident evidence governed separately                | Operations/integration owner: redaction, TTL jobs and failed-task cleanup                                                                                           |
| T8 | OTPs, access/refresh tokens, biometric authorization references and delivery/consent evidence | **Source defaults:** access JWT 30 minutes, refresh JWT one day, PowerSync credential one hour. Cookie refresh rotates/blacklists when configured. Other OTP/biometric lifetimes and retained consent evidence require separate verification | Identity/integration owner: distinguish transient credentials from necessary T1/T2/T4 evidence; verify target configuration |
| T9    | Analytical extracts, public-health/quality reports                                                      | Identifiable source/extract:**pending**, minimum reporting/reconciliation period; **proposed** 30-day temporary extract maximum; genuinely anonymous outputs subject to disclosure-risk review  | Analytics/public-health lead: aggregate, destroy working copies, review small-cell/linkage risk                                                                     |
| T10   | AI prompts, chats, outputs, caches and provider logs                                                    | Clinician-adopted output belongs to T1;**proposed** maximum 30 days for non-record working history; provider retention/training terms **pending**, prefer no provider retention where available | AI/clinical owner: propagate deletion, remove unneeded prompts and document provenance of retained clinical output                                                  |
| T11   | Download links, exports, printed copies and support bundles                                             | **Proposed:** download link lifetime no more than 24 hours, server working copies no more than 7 days after delivery; justified support evidence expires on case closure/schedule                     | Export/support owner: revoke links, secure print collection, shred unwanted paper and confirm bundle deletion                                                       |
| T12   | Rights requests, complaints, DPIA decisions and breach records                                          | **Pending:** evidence retention justified by accountability, statutory and dispute needs, starting at case closure                                                                                    | DPO/records manager: limit identity proof, retain decision evidence under restricted access, securely destroy on expiry                                             |

### 11.2 Deletion, restriction and legal holds

- Maintain a deletion/restriction manifest linking the affected record and purpose to primary storage, related records, attachments, analytics, AI history, replicas and recipients. Use minimum identifying data in the manifest.
- A legal hold must state authority, scope, owner, start date and review/release criteria. Apply restricted access; it is not permission for unrelated reuse or indefinite retention of everything.
- Apply lawful corrections/erasure to downstream processors and reasonable notification to other recipients. Record unsuccessful attempts and escalate.
- Backups should expire on a controlled schedule and remain isolated from normal use. When immediate selective deletion is impracticable, document the limit, prevent active use and reapply deletion/restriction instructions on restore before reconnecting.
- Disconnected devices cannot be assumed remotely wiped. Use managed encryption and enforceable offline expiry, track reconnect cleanup, and assess irretrievable devices as potential incidents.
- Crypto-erasure is valid only where all relevant keys/copies are addressed; deleting a shared key could destroy unrelated records and is not a substitute for a record-level plan.

### 11.3 Exit and decommissioning

At facility closure, contract termination or device retirement: agree the lawful transfer/retention plan; export records securely; verify recipient acceptance and clinical continuity; revoke users, tokens, integrations and device certificates; remove local databases/caches/files and provider copies; expire backups under contract; sanitize or destroy media; and issue a disposal record. Software uninstallation alone does not prove erasure.

## 12. Control assessment and assurance

### 12.1 Evidence labels

- **O — Observed in source/configuration:** reviewed in the current repository; production effectiveness is not implied.
- **T — Regression-tested:** the specified behavior passed automated tests with synthetic data/mocked external services; scope and commands are recorded below.
- **U — Supplied by Nexora:** an organizational fact provided for this assessment; not a code-derived fact or a signed approval.
- **D — Documented:** described in an implementation guide or project instructions, operational effectiveness not verified.
- **V — Deployment verification required:** fact or control not established by this review.
- **R — Required/proposed:** treatment to implement or evidence before taking risk-reduction credit.

No control below is classified as production-tested by this assessment. Evidence references **E01–E21** are listed in Section 20. Customer deployment verification is N/A until onboarding; product/certification environment verification remains applicable. Historical documentation does not override current source or test results.

### 12.2 Technical and organizational control matrix

| ID  | Control and present evidence                                                                                               | Status | Verification or additional treatment                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Source defines 30-minute access/one-day refresh tokens and dashboard logout after 30 idle minutes. Cookie refresh now uses SimpleJWT validation/rotation; tests verify replay rejection and disabled-user rejection (E17) | O,T,V | Verify deployed cookie flags, MFA, CSRF/CORS, cross-tab behavior and reset/recovery; source tests do not certify every auth flow |
| C02 | `TenantScopedViewMixin` and patient queryset implement tenant scope, sensitive-record filtering and permission-checked deletion (E18) | O,V | Extend negative testing across every list/detail/search/write/export/attachment/FHIR/nested path, service account and tenant switch |
| C03 | Patient/emergency-contact encryption properties and KMS-backed helpers present (E04,E05); KMS providers described (E06)    | O,D,V  | Check migrations/backfill, all copies, blind-index protection, provider/key separation, backup encryption and rotation/recovery; no blanket SQLCipher/HSM claim                                               |
| C04 | Signed per-model read and sensitive-access claims, tenant filters and inherited patient scope now gate clinical replication; removed contact columns are excluded and only system templates are global (E03,E19) | O,T,V | SQL/schema tests and PowerSync compiler 0.43.0 validation pass. Deploy the policy-version-2 endpoint, streams and client together and verify actual replication. Temporary break-glass access remains API-only |
| C05 | Web PowerSync uses server-verified user/facility-specific databases, a fresh-sync read gate and credential expiry. Logout clears downloaded data when no writes are pending; unsent work is closed and retained for its owner. Authentication cleanup also cancels/clears React Query cache (E20) | O,T,V | User separation is application-level, not disk encryption. Verify managed endpoints, browser persistence, expiry/reconnect and recovery of quarantined work. Legacy unowned queues require explicit owner-verified recovery; hub/mobile stores need separate assessment |
| C06 | Transport and deployment protections described (E01,E10)                                                                   | D,V    | Verify TLS and server identity for cloud, LAN and supplier flows; distinguish loopback-only sidecar traffic from LAN traffic; protect discovery and sockets                                                   |
| C07 | Source includes hash-chain verification and a task that creates critical notifications on a mismatch (E18) | O,V | Verify actual scheduling, coverage, protected checkpoints, privileged database access and signing-key revocation; tamper-evidence is not unconditional immutability |
| C08 | Emergency-access models record reason, scope, access mode, expiry and reviewer; source checks active/unexpired grants (E18) | O,V | Verify route-wide least scope, review/notification delivery and tenant boundaries; temporary grants are not included in offline sensitive-access claims |
| C09 | Public queue view uses unauthenticated access and a minimized serializer; clinic name is returned (E12)                    | O,V    | Review serializer/runtime payload and clinic-name inference; prevent identifying fields, predictable tracking, excess retention and display scraping                                                          |
| C10 | JSON, SSE and ECG report requests apply recursive direct-identifier removal and text redaction; known structured names are removed from repeated text, filename identity is removed, and provider error bodies are excluded from log/error messages (E21) | O,T,V | This is minimization, not guaranteed anonymization: unrecognized free-text identifiers, images/file contents and provider-side retention/reuse still require assessment. Clinical review, fairness and supplier terms remain necessary |
| C11 | DHA and private-insurance workflows documented (E01,E11)                                                                   | D,V    | Validate recipients, consent scope/expiry, signed/authenticated callbacks, replay protection, idempotency, attachments and redacted integration logs                                                          |
| C12 | Backup script fails before dumping when the encryption key is missing, uses restrictive file permissions and streams database/media output through GPG AES-256. Defaults are 30-day local/90-day remote retention; a synthetic database-dump encryption/decryption round trip passes (E14,E17) | O,T,V | Verify scheduling, actual storage/keys, media coverage and complete database/media restore; no measured RPO/RTO or customer recovery claim is made |
| C13 | Validation, natural-key hub remapping and conflict management described (E01,E10)                                          | D,V    | Test wrong-patient prevention, reference integrity, duplicate handling, stale data indicators, conflict review and key/decryption failure effects                                                             |
| C14 | Source selects facility SMTP when its required facility/configuration flags permit it; otherwise it selects Resend when configured or Django email delivery (E15) | O,V | Verify every caller, destination, configuration and minimum content. A configured route is not proof of a supplier agreement or safe message content |
| C15 | API PII redaction helper exists (E05); audit/events and monitoring documented (E07,E16)                                    | O,D,V  | Exercise nested/list/free-text payloads, exceptions, traces, file metadata, WebSocket subscriptions and support logs; field-name redaction alone cannot find all clinical information                         |
| C16 | Secure development, vulnerability and deployment practices described (E01)                                                 | D,V    | Dependency/SBOM and scan evidence, upload scanning, penetration tests, signing/update-chain checks, restricted CI credentials and no production patient data in test/tool inputs                              |
| C17 | Rights APIs and privacy policies described in prior material                                                               | V,R    | Validate complete operational rights workflow; verify export completeness, representative checks, deadlines and erasure/restriction across all copies                                                         |
| C18 | Nexora identifies **Thande W Murito** as DPO; there are no customers | U,V,R | Obtain DPO contact/review and product governance evidence now. Customer contracts, staffing, consultation and physical controls are N/A until onboarding; actual supplier and non-production processing obligations still apply |

### 12.3 Code findings, completed treatment and remaining limits

1. **Authentication:** the cookie-refresh path previously issued only an access token. It now uses the standard refresh serializer, rotates the refresh cookie when configured, blacklists the previous refresh token and rejects disabled users. Access-token expiry is not the same as immediate access-token revocation.
2. **Replication:** the prior API-only sensitive filter and obsolete columns were corrected in source. Tests execute every stream query against schemas built from current Django models and check sensitive/foreign-tenant exclusion through the clinical hierarchy. Signed per-model permissions and policy version are required. PowerSync compiler 0.43.0 accepts the full configuration without warnings after eliminating unsupported YAML aliases/chained CTE references. Actual service deployment/replication remains an acceptance step.
3. **Global templates:** only active system templates are selected; creator identifiers are no longer exported. Content review is still required before a template is designated system-wide.
4. **Offline lifecycle:** new sessions cannot adopt the previous user's database; credentials must match the server-returned user/facility, and local reads wait for a fresh sync. A fresh offline session requires connectivity for authorization; an already authorized session may continue only within credential validity. Unsent work is retained in closed owner-specific storage, not silently erased. This does not secure the files against an OS-level attacker or guarantee immediate revocation of a disconnected device.
5. **Backups:** missing encryption credentials now stop the backup. Plaintext database/media intermediate files are not persisted by the updated backup path. The round-trip test uses synthetic dump output and real GPG; it does not establish operational recovery of a live database.
6. **AI:** recursive scrubbing now covers transport paths rather than only selected top-level message fields. Direct identifiers found in structured payloads are removed and scrubbed from nested text. Pattern/known-value redaction cannot recognize every identifying narrative or de-identify binary images/documents; these remain personal-data processing where identification is possible.
7. **Historical material:** earlier approval, encryption, hosting and retention assertions are not accepted as implementation evidence. This revision uses current code and specified tests; customer deployment facts remain N/A and infrastructure facts require operational evidence.

\newpage

## 13. Risk assessment methodology

Risk is assessed as harm to people, including confidentiality, integrity, availability, autonomy, dignity and fair access to care. Commercial or regulatory impact on the organization is secondary to this assessment.

### 13.1 Scoring

| Score | Likelihood over an indicative 12-month operating period                 | Impact on an affected individual                                                             |
| ----- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1     | Rare: exceptional circumstances with strong verified barriers           | Negligible inconvenience, readily reversible                                                 |
| 2     | Unlikely: plausible but not expected in normal operation                | Limited distress or disruption, reversible with modest effort                                |
| 3     | Possible: credible failure path under expected operating conditions     | Material distress, financial loss, discrimination or delayed care                            |
| 4     | Likely: broad exposure or important controls absent/uncertain           | Serious harm, sustained exclusion, substantial loss or clinical injury                       |
| 5     | Almost certain: recurring/ongoing failure expected without intervention | Severe/irreversible harm, threat to life/safety or profound loss of confidentiality/autonomy |

**Score = likelihood × impact.** Low: 1–4; Moderate: 5–9; High: 10–16; Critical: 17–25. The scale is a prioritization tool, not a statistical prediction. One person's severe harm matters even when the affected population is small; broad scale can increase likelihood/exposure and urgency.

- **Inherent:** before safeguards.
- **Current provisional residual:** a conservative forecast for an envisaged deployment, not measured exposure of current customers (there are none). Code/test evidence is credited only within its demonstrated scope; operational effectiveness and remaining safeguards require acceptance.
- **Target residual:** expected only after specified treatment and evidence acceptance. It is not today's risk.

Do not average away high risks across activities. Low/moderate residual risks still require recorded controller acceptance. High/critical current risks require priority treatment, a specific decision on restrictions and the section 31 consultation analysis. No score permits unlawful processing. Re-score at deployment using actual volumes, incidents, control evidence and stakeholder feedback.

## 14. Detailed risk register

Scores are shown as **likelihood × impact = total**. Owner roles must be assigned to named people in Section 15. Every row is **open** until evidence and a decision are recorded.

| Risk | Activities and harmful scenario                                                                                                 | Inherent         | Current provisional | Controls / required treatment                                                                                             | Target residual | Accountable treatment owner / action |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------ |
| R01  | P01–P28: cross-tenant or excessive cross-facility access reveals another person's care                                         | 4×5=20 Critical | 3×5=15 High        | C02; enforce scope on nested queries, jobs, files, caches and events; adversarial tenant tests                            | 1×5=5 Moderate | Engineering / A02                    |
| R02  | P04,P18,P23: sensitive patient records reach unauthorized offline clients or AI context, causing stigma or violence             | 4×5=20 Critical | 4×5=20 Critical    | C02,C04,C10; replicate only entitled records and related data; restrict affected sync pending proof                       | 1×5=5 Moderate | Engineering / A01,A02,A09            |
| R03  | P01,P04,P23: legacy contact fields or non-global templates are replicated unnecessarily or sync fails                           | 4×4=16 High     | 3×4=12 High        | C03,C04; reconcile SQL/schema/migrations; allowlist global rows and columns; inspect actual local store                   | 1×4=4 Low      | Engineering / A01                    |
| R04  | P21–P26: stolen credentials, weak recovery or excessive admin access exposes or alters records                                 | 4×5=20 Critical | 3×5=15 High        | C01,C02; MFA, revocation, least privilege, hardened reset/recovery and time-bound support                                 | 1×5=5 Moderate | Security / A02,A03                   |
| R05  | P01–P28: insider browsing or abusive emergency access exposes sensitive/family information                                     | 4×5=20 Critical | 3×5=15 High        | C07,C08,C18; purpose-bound access, anomaly review, independent break-glass review and sanctions                           | 2×4=8 Moderate | Clinical governance / A02,A03,A13    |
| R06  | P23–P25: lost/shared device, retained session or unencrypted local data reveals health history                                 | 4×5=20 Critical | 4×5=20 Critical    | C05; managed encryption, session/profile isolation, device inventory, secure disposal and lost-device response            | 1×5=5 Moderate | Operations / A04                     |
| R07  | P20–P23,P28: revoked user/consent retains offline access or queued disclosure after entitlement changes                        | 4×5=20 Critical | 4×5=20 Critical    | C04,C05,C17; finite offline window, reconnect reauthorization, purpose-aware queue checks and cleanup                     | 1×5=5 Moderate | Engineering / A01,A04,A07            |
| R08  | P03,P08,P11,P23,P24: wrong-patient merge, FK mapping or stale conflict overwrites clinical information                          | 4×5=20 Critical | 3×5=15 High        | C13; identity/provenance validation, natural-key remapping, clinical conflict review and correction propagation           | 1×5=5 Moderate | Clinical governance / A08            |
| R09  | P01–P24: network interception, rogue hub or exposed local service discloses credentials/records                                | 4×5=20 Critical | 3×5=15 High        | C06; TLS/server verification, LAN segmentation, restricted sidecar/IPC and discovery trust                                | 1×5=5 Moderate | Operations / A04,A05                 |
| R10  | P01,P12,P14,P24: exposed encryption/signing keys or incomplete backfill allows identity fraud                                   | 4×5=20 Critical | 3×5=15 High        | C03,C07; secret inventory, separation, rotation, least-privilege key access and migration evidence                        | 1×5=5 Moderate | Security / A05                       |
| R11  | P03,P08,P23,P24: ransomware, unavailable backup or lost keys prevents timely care                                               | 4×5=20 Critical | 3×5=15 High        | C05,C12,C13; isolated recoverable backups, failover/downtime care, full restore and key recovery drills                   | 1×5=5 Moderate | Operations / A12                     |
| R12  | P12,P18,P22,P25: logs, events, exceptions or support bundles expose clinical data or secrets                                    | 4×5=20 Critical | 3×5=15 High        | C14,C15,C16; allowlisted metadata, redaction tests, authorized subscriptions and short retention                          | 1×5=5 Moderate | Security / A10,A11                   |
| R13  | P21,P22,P27: audit rewriting, missing events or misuse of signing keys hides abuse or falsifies authorship                      | 4×4=16 High     | 3×4=12 High        | C07; protected external checkpoints, verification alerts, full coverage and certificate revocation tests                  | 1×4=4 Low      | Security / A05,A10                   |
| R14  | P09,P11,P12,P27: publicly accessible files, malicious uploads or embedded DICOM identifiers disclose records                    | 4×5=20 Critical | 3×5=15 High        | C02,C16; object authorization, restricted URLs, malware checks and metadata/pixel inspection                              | 1×5=5 Moderate | Engineering / A11                    |
| R15  | P02,P19,P27: queue display, wrong SMS/email, printout or certificate reveals attendance/diagnosis                               | 4×4=16 High     | 3×4=12 High        | C09,C14; neutral labels, minimal messages, verified safe contacts and secure print collection                             | 1×4=4 Low      | Facility administrator / A11         |
| R16  | P01–P29: unclear grounds, bundled consent or covert secondary use deprives individuals of control                              | 4×4=16 High     | 3×4=12 High        | C17,C18; distinct purposes/bases, layered notices, granular optional consent and downstream withdrawal                    | 1×4=4 Low      | DPO / A06,A07                        |
| R17  | P01,P04–P07,P18,P28: invalid guardian access or coercive disclosure harms a child or vulnerable person                         | 4×5=20 Critical | 3×5=15 High        | C02,C08,C18; authority and best-interests checks, confidential pathways and safe communication                            | 1×5=5 Moderate | Clinical governance / A06,A13        |
| R18  | P11–P13,P18,P23–P25: overseas processing lacks sufficient safeguards/consent or qualifying Kenyan serving copy                | 4×5=20 Critical | 4×5=20 Critical    | C18; actual flow/location inventory, section 49 assessment, contracts and regulation 26 evidence                          | 1×5=5 Moderate | DPO / A06                            |
| R19  | P11–P19,P24–P26: supplier misuse, hidden subprocessors or unapproved failover causes uncontrolled disclosure                  | 4×5=20 Critical | 3×5=15 High        | C11,C14,C18; processor authorization, onward terms, training/reuse limits, deletion/audit and change notices              | 1×5=5 Moderate | Procurement / A06,A09                |
| R20  | P12–P14: replayed callbacks, bad recipient mapping or excessive claim payload leads to fraud/denial of care                    | 4×4=16 High     | 3×4=12 High        | C11,C13; sender verification, idempotency, scoped credentials, beneficiary checks and reconciliation                      | 1×4=4 Low      | Integration owner / A08              |
| R21  | P12,P13,P21: biometric/OTP capture, reuse or inaccessible verification exposes immutable identifiers or excludes patients       | 4×5=20 Critical | 3×5=15 High        | C11; trace raw capture and supplier storage, short-lived references, anti-replay and justified alternative verification   | 1×5=5 Moderate | Integration owner / A06,A08          |
| R22  | P18: AI prompts, retrieval or provider training discloses identifiable clinical data across sessions/tenants                    | 4×5=20 Critical | 4×5=20 Critical    | C10; minimized prompts, isolation tests, prompt-injection safeguards, controlled tool access and no unauthorized training | 1×5=5 Moderate | AI owner / A09                       |
| R23  | P03,P05,P12,P18: inaccurate or biased automated output influences treatment, discharge or eligibility without meaningful review | 4×5=20 Critical | 3×5=15 High        | C10,C13; local clinical evaluation, human review/override, provenance, explanations and contestability                    | 1×5=5 Moderate | Clinical governance / A09            |
| R24  | P16,P17,P29: small cells, linkage, quasi-identifiers or pseudonymous datasets re-identify patients                              | 4×4=16 High     | 3×4=12 High        | C18; disclosure-risk testing, aggregation/suppression, controlled release and purpose-specific secondary-use review       | 1×4=4 Low      | Analytics lead / A14                 |
| R25  | P20–P22,P26: excessive staff monitoring or exposure of work restrictions causes discrimination                                 | 3×4=12 High     | 3×4=12 High        | C02,C18; staff notice, balancing assessment, restricted constraints and no undeclared profiling                           | 1×4=4 Low      | HR / A06,A13                         |
| R26  | P23–P29: excessive retention or ineffective erasure leaves records recoverable in backups, AI history or devices               | 4×4=16 High     | 4×4=16 High        | C05,C12,C17; approved schedules, deletion manifests, supplier evidence and restore/reconnect suppression                  | 1×4=4 Low      | Records manager / A07,A12            |
| R27  | P27,P28: incomplete export, incorrect representative or missed rights deadline denies rights or leaks another person's data     | 4×4=16 High     | 3×4=12 High        | C17; verified workflow, complete data inventory, tailored deadlines, third-party review and secure delivery               | 1×4=4 Low      | DPO / A07                            |
| R28  | P21–P25: delayed detection/notification prevents protective action and prolongs exposure                                       | 4×5=20 Critical | 3×5=15 High        | C07,C15,C18; monitoring, deputies, processor escalation, clock tracking and notification tabletop exercise                | 1×5=5 Moderate | Security / A12,A13                   |
| R29  | P09,P24,P25: vulnerable dependency, compromised update/CI or production data in test/AI tooling creates broad compromise        | 4×5=20 Critical | 3×5=15 High        | C16; dependency/secret scans, controlled releases, upload isolation, synthetic tests and tool-use rules                   | 1×5=5 Moderate | Engineering / A10                    |
| R30  | P23–P28: incomplete migration or vendor/device exit loses care history or leaves unauthorized copies                           | 4×5=20 Critical | 3×5=15 High        | C05,C12,C13,C17; validated export/import, continuity plan, revocation and verified supplier/device disposal               | 1×5=5 Moderate | Operations / A07,A12                 |

## 15. Risk treatment and implementation plan

**Priority definitions:** P0 = urgent exposure assessment and prerequisite for starting/expanding the affected high-risk flow; P1 = complete before controller approval of the relevant activity; P2 = continuing assurance. These are proposed governance milestones, not a statement that production has been stopped or controls have been implemented. For existing processing, the controller must immediately set dated interim measures and remediation deadlines proportionate to harm and clinical continuity.

| Action | Priority / milestone                                   | Deliverable and evidence of completion                                                                                                                                                                               | Owner                                   |
| ------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| A01    | P0 — before sensitive offline replication             | Reconcile actual streams, physical schema, migrations and global templates; restrict unproven streams; prove sensitive/role/tenant parity and no forbidden rows/columns in local stores; test entitlement revocation | Engineering + security                  |
| A02    | P0 — before access-control acceptance                 | Execute cross-tenant, intra-tenant role and sensitive-record negative tests across APIs, exports, objects, FHIR, jobs, AI context and events; verify least-privilege service accounts and scoped emergency access    | Engineering + clinical governance       |
| A03    | P1 — before privileged access approval                | Evidence production MFA, reset/recovery, session/revocation behavior, administrator restrictions, support access approval/expiry and account lifecycle reviews                                                       | Security + HR                           |
| A04    | P0 — before unmanaged offline/LAN use                 | Inventory clients/hubs, enforce managed storage encryption and network/server trust; test account switching, lost devices, offline expiry, local service isolation and cleanup without losing unsynced care          | Operations                              |
| A05    | P1 — before encryption/security assurance             | Confirm TLS, key/secret inventory, encryption backfills and all persistent copies; separate key access, test rotation, signature revocation and recovery without data loss                                           | Security + operations                   |
| A06    | P0 — before unapproved disclosure/overseas processing | Complete actual purpose/basis and recipient register, contracts, notice/consent, ODPC registration/submission analysis, transfer assessment and Kenyan serving-copy evidence; reconcile existing flows urgently      | DPO + legal/procurement                 |
| A07    | P1 — before rights/retention approval                 | Approve exact schedules; demonstrate access/correction/restriction/erasure/portability cases across related data, AI, files, devices, suppliers and backups; verify exit/deletion manifest                           | Records manager + DPO + engineering     |
| A08    | P1 — before integration/sync clinical acceptance      | Demonstrate patient matching, natural-key/FK mapping, duplicate/replay prevention, consent expiry, recipient mapping, protected biometric references and clinical conflict review                                    | Integration owner + clinical governance |
| A09    | P0 — before unassessed identifiable AI processing     | Trace each provider/data/region/retention path; validate session/tenant isolation and no unauthorized reuse; assess clinical accuracy/bias, prompt injection, human review and contestability                        | AI owner + clinical governance + DPO    |
| A10    | P1 — before security approval                         | Review audit coverage, protected checkpoints, log/event redaction, dependency/upload/update security and test-data practices; attach scan/penetration findings and remediation evidence                              | Security + engineering                  |
| A11    | P1 — before external disclosure channels accepted     | Review public queue/clinic labels, notifications, SMS/email routes, DICOM/files, download links, printing and certificates; prove recipient and object-access controls                                               | Facility administrator + engineering    |
| A12    | P1 — before continuity/incident approval              | Restore representative database/files/keys; measure actual RPO/RTO; test replay of deletions, offline reconciliation, vendor exit and timed breach escalation/notification                                           | Operations + security + DPO             |
| A13    | P1, then P2 — before sign-off and ongoing             | Complete patient/staff/clinical consultation, guardian/safeguarding training, access/emergency review policy and incident contact/deputy roster                                                                      | DPO + clinical governance + HR          |
| A14    | P1 — before report/secondary dataset release          | Validate statutory report authority and minimal case fields; test aggregation/small-cell/linkage protections; prohibit unassessed research/training/marketing reuse                                                  | Analytics/public-health lead + DPO      |
| A15    | P1 — final acceptance gate                            | Populate deployment particulars, named owners, dates, evidence references, remaining risks, DPO advice and controller decision; retain regulator submission/consultation records                                     | Controller executive + DPO              |

For each action, maintain: **named assignee; agreed due date; interim protection; evidence location; verifier; completion date; affected risks; revised score; acceptance decision**. Technical sub-actions completed in this revision are recorded below. Customer-specific operating evidence is N/A until deployment; product governance and supplier decisions still require completion. Passing tests close their defined engineering scope, not an entire risk or statutory obligation.

### Engineering treatment status — 2 October 2026

| Related actions | Completed implementation | Remaining acceptance |
|---|---|---|
| Authentication (A03) | Cookie refresh rotation, old-refresh rejection, disabled-user rejection and invalid-cookie clearing tested | Runtime configuration, broader authentication/recovery and independent review |
| A01, A02 | Signed model-read/sensitive claims; patient-scope inheritance; obsolete columns removed; system-only global templates; service compiler validation passes | Target deployment/migrations, actual replication and wider API/object authorization coverage |
| Offline lifecycle (A04) | Owner-specific databases; verified server identity/scope; fresh-sync read gate; bounded credential validity; logout cleanup, late-response rejection and isolation tests | Real browser/device verification, OS encryption, orphaned legacy queue recovery and customer endpoint policy |
| A05, A12 | Backup fails without a key; private file permissions and encrypted streams; synthetic dump/GPG round trip | Complete database/media/key restore exercise, scheduling and storage-provider evidence |
| A09, A10 | Recursive AI text/JSON minimization, known-identifier redaction, generic upload filenames and no echoed provider error bodies; AI suite passes | Unrecognized narrative and binary-file identifiers, clinical validation, provider reuse/retention, full external data flow |
| A13, A15 | Product DPO identified as Thande W Murito; pre-customer scope and N/A deployment facts recorded | DPO contact/advice, Nexora approval and applicable regulator/supplier records; customer annex before onboarding |

### Minimum acceptance exercises

Use synthetic people and representative deployment configuration. Capture expected/actual outcome and version without putting real patient data in reports.

1. A user in another organization, wrong facility, wrong role and without sensitive permission cannot retrieve the record through API, attachment, search, event, export or offline database.
2. A clinician's role/account/facility changes while a device is disconnected; verify the approved offline limit, reconnect rejection/cleanup and preservation of legitimate unsynced care.
3. A corrected or erased/restricted record is traced through related tables, object storage, AI history, analytical extracts, recipient notifications and restored backups.
4. A deliberately mismatched patient/import/callback cannot attach results, claims or payments to the wrong person; conflicts reach authorized human review.
5. A public queue, email, support bundle, diagnostic file and log capture contain only the approved minimum data.
6. An AI conversation cannot access another tenant/session; clinicians can reject outputs and patients can obtain review of significant automated decisions.
7. Restore representative clinical records, files, audit evidence and keys within adopted objectives; complete a timed incident and rights-request exercise.

\newpage

## 16. Data subject rights procedures

### 16.1 Access channels and handling workflow

Provide in-person, telephone, written and electronic request channels, with accessible support. A patient need not possess an application account. The processor forwards requests promptly to the responsible controller and assists under instructions; it does not decide substantive rights on the controller's behalf without authority.

1. Log receipt, request type, source, responsible controller and statutory deadline. Acknowledge promptly; proposed internal target is one working day.
2. Verify identity and representative authority proportionately, using existing trusted channels where possible. Avoid collecting a complete identity document unnecessarily or retaining verification copies indefinitely.
3. Locate the person's information across all modules, diagnostic files, AI history, logs where relevant, offline stores and processors. Protect third parties' rights and confidential safeguarding information.
4. Assess the requested right, applicable legal exceptions and clinical/legal retention. Separate access/erasure of personal data from amendment of an attributable clinical record.
5. Fulfil securely, issue reasoned decisions where refused or limited, explain complaint routes and notify affected recipients where required.
6. Confirm downstream action, record evidence and close the request. Escalate impending deadlines; do not assume identity checks automatically suspend statutory time.

### 16.2 Rights and deadlines

The deadlines below reflect the cited Kenyan provisions, rather than a blanket thirty-day rule. The DPO must keep them current and handle any permitted extension/refusal in accordance with the relevant provision.

| Right/request                         | Operational response                                                                                                             | Deadline/source                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Information/notice                    | Explain purposes, sources, recipients, safeguards and rights accessibly                                                          | At collection as far as practicable, Act section 29; indirect collection information within 14 days, General Regulations regulation 6(3)  |
| Access                                | Provide confirmation, required processing information and a secure copy; assess third-party information                          | Within**7 days**; regulation 9; free of charge                                                                                      |
| Rectification                         | Correct inaccurate/outdated/incomplete/misleading data and notify relevant recipients; preserve attributable clinical amendments | Within**14 days** where correction necessary; refusal notification within **7 days**; regulation 10                           |
| Restriction                           | Mark and actually limit processing, including outbound queues and replicas; allow only lawful exceptions                         | Within**14 days**; regulation 7; free of charge; record required refusal notice if applicable                                       |
| Objection                             | Stop the relevant processing or assess/document an applicable overriding ground; explain complaint rights                        | Within**14 days**; regulation 8; free of charge; direct-marketing objection is absolute                                             |
| Portability                           | Supply structured, commonly used machine-readable data, or direct transfer where technically possible and applicable             | Within**30 days**; Act section 38 and regulation 11; any fee must be lawful/reasonable; refusal notice within **7 days**      |
| Erasure                               | Assess the grounds and exceptions, respond, and implement accepted erasure across copies                                         | Respond within**14 days** under regulation 12; Act section 40 requires erasure without undue delay where applicable; free of charge |
| Consent withdrawal                    | Stop the specified consent-based processing and propagate withdrawal; explain separate lawful retention                          | At any time; Act section 32 and regulation 4; implement promptly                                                                          |
| Significant solely automated decision | Explain, provide meaningful human intervention and reconsideration, receive the person's view and issue an outcome               | As soon as reasonably practicable/reasonable period as applicable; Act section 35 and regulation 22                                       |
| Complaint                             | Offer controller/DPO contact and access to the ODPC complaints mechanism without retaliation                                     | Track under a documented complaints procedure and applicable Regulations                                                                  |

**Implementation distinctions:** `is_sensitive` is an access classification, not statutory restriction of processing. Soft deletion is not erasure or anonymization. A single patient JSON/FHIR endpoint may omit files, financial records, AI results and other relevant data. Verify completeness and safe delivery instead of treating an endpoint's existence as fulfillment of a right.

## 17. Incident response and continuity

### 17.1 Preparedness and detection

Maintain controller/processor incident contacts, deputies, supplier escalation routes and clinical downtime procedures. Monitor suspicious access/export, failed authentication, unusual sensitive/break-glass use, unauthorized sync, audit-chain failures, public objects, integration replay, wrong-patient associations and backup failures. Local offline access may not generate a central event immediately; document detection and synchronization limitations.

### 17.2 Response steps

1. **Detect and record:** capture discovery and awareness times separately, affected systems, reporter, initial scope and safety implications. Preserve evidence under controlled access.
2. **Contain proportionately:** revoke affected sessions/credentials, isolate devices/streams/objects, suspend compromised integration paths and protect necessary care delivery. Key rotation must be planned to avoid rendering records unreadable.
3. **Assess harm:** identify individuals/categories, sensitivity, actual access, possible misuse, availability/integrity effects, vulnerable people and likelihood of discrimination or physical harm. Encryption matters only if effective for the affected data and keys were not compromised.
4. **Escalate and notify:** follow the legal duties below; supplier delay or incomplete investigation must not hide the controller's notification clock.
5. **Recover:** patch the cause, restore validated data/keys, reconcile records and offline writes, reapply deletion/restriction instructions and monitor for recurrence.
6. **Learn:** record cause, effects, decisions and remedial actions, update risks and provide targeted training/control improvements. Record the basis for any decision not to notify.

### 17.3 Notification obligations

| Communication                 | Requirement                                                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Processor to controller       | Act section 43(3):**without delay and, where reasonably practicable, within 48 hours** of awareness of a personal data breach. Adopt a tighter contractual/internal escalation target, proposed within 12 hours, to support controller response |
| Controller to ODPC            | Section 43(1): where unauthorized access/acquisition creates real risk of harm, notify**without delay and within 72 hours** of awareness; explain any delay. Apply General Regulations regulation 37's notifiable-breach categories             |
| Controller to affected people | Communicate in writing within a**reasonably practical period** where required by section 43; use safe, accessible channels. Assess statutory exceptions/delay grounds with recorded reasons                                                     |
| Other recipients              | Notify contracting parties, insurers, health authorities or law enforcement where a specific obligation or justified incident purpose applies; minimize disclosed data                                                                                |

The initial notice should include the awareness timeline, nature of breach, affected categories and estimated numbers, risks/likely harm, containment/remediation, protective advice and DPO/contact details. Provide additional information in phases without undue delay where necessary. Do not defer notice until every fact is known. Retain facts, effects, decisions and remedial action as required by section 43(8).

### 17.4 Continuity and clinical safety

The approved Disaster Recovery Plan and Backup and Recovery Policy set a **24-hour RTO** and **24-hour RPO** for Tier 1 recovery, with a 48-hour maximum tolerable period of disruption. A Tier 1 database with approved continuous transaction-log capture must meet a 15-minute operational RPO. These are targets, not measured achievements. Each facility must confirm in Annex A that these targets are safe for its services, including round-the-clock inpatient/emergency operations, and adopt stricter objectives where required.

Provide safe downtime recording, secure temporary paper handling, critical-result escalation, reconciliation ownership and identity checks on re-entry. Exercise database, file, key, audit and attachment restoration together. Offline capability supports continuity only when data is sufficiently current, authorized and safely reconciled.

## 18. Consultation, monitoring and review

### 18.1 Consultation register

No interviews or formal approvals were performed in this review. There are no customer patients or customer staff to consult at present; their deployment consultation is N/A until onboarding. Pre-customer clinical/patient-representative consultation can still inform product design and must not be fabricated. Record dates, participants, concerns, changes made and reasons for rejecting recommendations when consultation occurs.

| Stakeholder                                                                    | Questions to resolve                                                                                     | Status                                                  |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Patients/patient representatives, including low-literacy and rural users | Are notices understandable, choices real, channels safe and rights accessible? | Customer consultation N/A — no customers; independent design consultation not yet recorded |
| Parents/guardians, child/safeguarding representatives and disability advocates | Are authority, confidential care, consent and best interests protected? | Customer consultation N/A; arrange relevant product-design review before use |
| Clinical and sensitive-service teams                                           | Is data collection necessary; are restrictions, emergency access, downtime and AI oversight safe?        | Product clinical consultation is recorded as not yet performed; facility clinical-governance consultation is mandatory in Annex A before relevant modules are enabled. |
| Staff/HR representatives                                                       | Is attendance/security monitoring proportionate and transparent?                                         | Product staff consultation is recorded as not yet performed; facility HR consultation is mandatory in Annex A before staff-monitoring modules are enabled. |
| DPO/legal and records management | Are bases, localization, transfers, retention and rights supported by evidence? | Product DPO is **Thande W Murito**; formal product advice is recorded by signature in Section 19. Facility legal and records review is mandatory in Annex A. |
| Nexora engineering/security/operations | Do implementation and runtime controls match the assessment? | Source review and specified regression execution are completed; production-operational evidence is a facility Annex A requirement. |
| Payers, receiving providers and subprocessors                                  | Are purpose, location, onward disclosure, security and deletion commitments enforceable?                 | No active customer recipients are assumed. Each active recipient requires Annex A contract, location, and assurance evidence. |
| Controller management | Are resources, actions, accepted residual risks and limits explicit? | Nexora executive approval is recorded in Section 19; customer-controller approval is mandatory in Annex A before onboarding. |
| ODPC                                                                           | Manage statutory submission and prior consultation where required; record reference, advice and response | The controller DPO must determine and document the requirement for each deployment in Annex A; no regulator clearance is presumed. |

If consultation is limited or inappropriate, document why, the substitute evidence used and how affected people's interests were represented.

### 18.2 Monitoring schedule

These are proposed minimum governance frequencies; refine using facility scale and risk.

| Review/control metric                                                  | Frequency / target                                                                      | Owner                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| Critical privacy/security alerts and backup failures                   | Daily operational review; urgent escalation by severity                                 | Security/operations                     |
| Break-glass invocations                                                | Review every use promptly; proposed within 1 working day                                | Clinical governance/security            |
| Rights requests and deadlines                                          | Active-case monitoring each working day; no overdue statutory responses                 | DPO/records manager                     |
| Unmanaged devices, over-age offline access, failed sync/deletion tasks | Daily exception report and risk-based resolution                                        | Operations/engineering                  |
| Privileged, sensitive and cross-facility access                        | Monthly exception review; formal role recertification quarterly and on staff changes    | Security/HR/facility administration     |
| Audit integrity and disclosure-channel sampling                        | Verify scheduled jobs/alerts; monthly sample of access, notifications, exports and logs | Security                                |
| Retention and deletion effectiveness                                   | Monthly job exception review; quarterly sample through supplier/device/backup paths     | Records manager                         |
| Restore and incident exercise                                          | Quarterly representative restore; at least annual combined incident/downtime exercise   | Operations/security/clinical governance |
| AI quality, bias, overrides and complaints                             | Before model/prompt changes and at a risk-based regular cadence, initially monthly      | AI/clinical governance                  |
| Supplier/transfer/localization assurance                               | At onboarding, material change and at least annually                                    | Procurement/DPO                         |
| DPIA and action closure                                                | Monthly until open high risks resolved; at least annual full review                     | DPO/controller                          |

Track evidence of performance rather than merely the presence of a policy: unauthorized-disclosure incidents, restriction propagation failures, device cleanup completion, rights response times, overdue high-risk actions, backup restore success and reviewed emergency-access percentage.

### 18.3 Reassessment triggers

Reassess before a new module, data category, recipient, hosting region, integration, secondary purpose, AI model/provider, biometric flow, major scale increase or material retention/access change. Also reassess after a serious incident, significant complaint, control failure, legal/regulatory change, acquisition, facility merger, new vulnerable population or evidence of a higher likelihood/impact than recorded. Record version, scope, decision and communication to affected controllers.

\newpage

## 19. Decision, approval and residual-risk acceptance

### 19.1 Current assessment decision

**Decision: approved as a final pre-customer product DPIA when the Section 19.2 execution record is signed.** This decision approves the product assessment methodology, product-level safeguards, and the mandatory deployment gate. It does not approve a healthcare controller, facility, patient-data processing, international transfer, optional module, or supplier route. Nexora has no customers, so forecast risk scores do not describe current customer exposure. The engineering treatments in Section 15 are complete only within their stated scope; deployment, supplier, organizational, and independent-review evidence remains mandatory in Annex A.

Before approving the relevant deployment:

1. Complete deployment facts, purposes/bases, recipient locations and exact retention decisions.
2. Resolve P0 treatments and verify material safeguards with the acceptance exercises and independent review.
3. Complete stakeholder consultation, DPO advice and required ODPC submission/consultation steps; record any conditions or directions.
4. Re-score risks using actual evidence. For any remaining risk, record rationale, affected people, safeguards, restrictions, accountable owner and review/expiry date.
5. Obtain the controller's signed decision and communicate permitted scope to Nexora, facility teams and authorized processors.

Possible recorded outcomes are: **approved for the specified scope**, **approved with explicit lawful conditions and dates**, or **not approved/requires redesign**. No decision can waive a statutory requirement. For an existing deployment, separately record the immediate operating restrictions and lawful continuity arrangements while remediation proceeds.

### 19.2 Product DPIA Execution Record

| Role | Name/contact | Advice or decision | Signature or approved electronic equivalent / date |
| --- | --- | --- | --- |
| Assessment author/coordinator | Nexora DPIA author recorded in the controlled document register | Confirms the product scope, evidence baseline, limitations, and Annex A deployment gate |  |
| Technical/security reviewer | Named Nexora technical/security reviewer in the controlled approval record | Validates product controls, open findings, and test evidence |  |
| Clinical governance reviewer | Named independent clinical-governance reviewer in the controlled approval record | Validates necessity, safeguarding, clinical safety, AI limitations, and continuity requirements |  |
| Records-management reviewer | Named Nexora records-management reviewer in the controlled approval record | Validates product retention framework, deletion, and rights requirements |  |
| DPO/privacy lead | **Thande W Murito**, Nexora DPO | Provides formal privacy advice and records the product consultation determination |  |
| Legal/procurement reviewer | Named Nexora legal/procurement reviewer in the controlled approval record | Validates product contract, transfer, localization, and supplier-assurance requirements |  |
| Nexora processor representative | Authorized Nexora operations representative named in the controlled approval record | Confirms delivery of assigned contractual and technical safeguards |  |
| Nexora executive approver | **Nexora Managing Director or a formally delegated executive** | Approves the pre-customer product assessment, its operating limits, and resources for Annex A controls; no separate product-sponsor role is required |  |

An unsigned copy is the final document content but is not an executed approval record. The executed controlled copy must retain the completed names, approval references, and dates. A facility/controller executive and the facility DPO or privacy lead must separately sign Annex A before that facility processes live patient data.

### 19.3 Residual-risk acceptance record

No product residual risk is accepted by default. If Nexora accepts a product-level residual risk, it must use the following record. A facility may not rely on this record for its own deployment risk; it must complete the Annex A decision instead.

| Required field                                                 | Entry                                              |
| -------------------------------------------------------------- | -------------------------------------------------- |
| Risk ID and enabled activity/deployment | Record only a product-level risk that Nexora is authorized to accept. |
| Current residual score and evidence | Record the assessed score with supporting evidence; do not copy a target score. |
| Affected subjects and foreseeable harm | Identify the affected group and credible harm. |
| Why further mitigation is not proportionate, or remaining work | Record the decision, remaining work, and completion date. |
| Compensating safeguards and operating limits | Record enforceable safeguards and any module, supplier, geography, or access restrictions. |
| Legal/transfer/consultation requirements satisfied | Attach the applicable references and approval evidence. |
| DPO advice and controller response | Record advice and explain any disagreement. |
| Named accountable risk owner and accepting executive | Name the accountable Nexora owner and Managing Director or formally delegated executive. |
| Acceptance date, expiry and reassessment trigger | Record a fixed expiry and the reassessment trigger. |

No residual risks are formally accepted in this product DPIA at the time of issue.

### 19.4 Annex A: Mandatory Facility Deployment Decision

Complete this annex for each controller/facility before onboarding, enabling a high-risk module, or processing live patient data. Attach the referenced evidence to the controlled copy; do not substitute a verbal confirmation or product-level statement.

| Required deployment fact or evidence | Facility/controller record |
| --- | --- |
| Controller legal entity, facility name, registration details, accountable executive, DPO/privacy contact, and clinical-governance lead |  |
| Go-live date, Vitora release, facilities, modules, interfaces, patient/staff volumes, children/vulnerable populations, and devices/hubs |  |
| Purpose-specific lawful bases, sensitive-data conditions, notices, consent/representative process, and any statutory reporting authority |  |
| Active supplier/recipient inventory: legal entity, role, country, processing/backup/replication/support locations, contract/DPA, onward subprocessors, and transfer assessment |  |
| Kenyan processing or serving-copy evidence and any international-transfer safeguards, notice/consent, regulator submission, or prior consultation determination |  |
| Controller retention schedule: T1-T12 periods, triggers, legal authority, holds, disposal, primary/backup/offline/supplier locations, and 20-year PHI archive evidence |  |
| Deployment verification: identity/RBAC/MFA, tenant isolation, endpoint encryption, backup/restore, immutable offsite storage, RPO/RTO/MTPD test, deletion/restriction propagation, and incident/rights exercises |  |
| Consultation record: clinical, staff/HR, patient/representative, safeguarding, supplier, DPO/legal, and any ODPC consultation outcomes |  |
| Open risks, operating restrictions, action owners/dates, residual-risk assessment, and evidence references |  |

| Deployment decision role | Name | Signature or approved electronic equivalent | Date |
| --- | --- | --- | --- |
| Facility/controller executive |  |  |  |
| Facility DPO or privacy lead |  |  |  |
| Facility clinical-governance lead |  |  |  |
| Facility records-management lead |  |  |  |
| Nexora authorized processor representative |  |  |  |

**Deployment decision:** [ ] Approved for the documented scope. [ ] Approved with documented conditions and expiry. [ ] Not approved; redesign or further evidence required.

## 20. Evidence, legal references and version history

### 20.1 Project evidence register

Sources support only the observations described. Implementation documents may describe planned, historical or deployment-dependent behavior; production verification remains necessary. File/section references are preferred over brittle line numbers.

| Evidence | Source                                                                                              | Use in assessment                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| E01      | [Project instructions](../AGENTS.md), [README](../README.md), [module reference](modules-reference.md) | Product scope, privacy/RBAC conventions, clients, modules and integration coverage                  |
| E02      | [PowerSync integration](powersync-integration.md)                                                    | Browser/local read architecture, logical replication and documented EU Central hosting              |
| E03 | [PowerSync Sync Streams](../backend/powersync/sync-streams.yaml) | Current source: signed read/sensitive claims, tenant/parent filters, minimized columns and system-only templates |
| E04      | [Patient/contact models](../backend/hmis/apps/patients/models.py)                                    | Observed encrypted properties for patient identity/contact data and emergency-contact phones        |
| E05      | [PII helpers](../backend/hmis/apps/core/pii.py)                                                      | Observed KMS-backed encryption properties, blind-index updates and named-field redaction            |
| E06      | [Key management](key-management.md)                                                                  | Documented local/Azure provider design, rotation and provider limitations                           |
| E07      | [Audit integrity and signatures](security-hardening-audit-signatures.md)                             | Documented hash chain, verification and signing architecture                                        |
| E08      | [Emergency access](emergency-access-implementation.md)                                               | Documented time-limited access, reasons, escalation and retrospective review                        |
| E09      | [TibaBot API guide](ai-api-guide.md)                                                                 | AI/chat/predictor capabilities, identity/session and downstream assurance scope                     |
| E10      | [Facility hub guide](hub-guide.md)                                                                   | Local Django/SQLite, desktop/mobile LAN access and cloud synchronization                            |
| E11      | [HealthCloud operations](healthcloud-operations-runbook.md)                                          | Private-payer integration, operational logging and fallback paths                                   |
| E12      | [Clinic views: PublicQueueView](../backend/hmis/apps/clinics/views.py)                               | Observed public route, minimized serializer use and clinic-name response                            |
| E13      | [MFA implementation](mfa-implementation.md) and E01                                                  | Authentication assurance follow-up reference; detailed production settings not verified             |
| E14 | [Backup script](../backend/scripts/backup.sh) | Required key, AES-256 streams, file permissions and 30/90-day retention. Historical DR targets require separate acceptance |
| E15 | [Email service](../backend/hmis/apps/core/services/email_service.py) | Actual facility SMTP, Resend and Django delivery selection; no supplier-contract inference |
| E16      | [Domain events](domain-events.md), [monitoring](monitoring.md) and E01                                | Follow-up references for full event/log/subscriber assurance; not a complete control audit          |
| E17 | [Cookie auth](../backend/hmis/apps/core/cookie_auth.py), [cookie tests](../backend/tests/core/test_cookie_refresh_privacy.py), [backup tests](../backend/tests/infrastructure/test_backup_dr.py) | Executed regression evidence for refresh/revocation and backup fail-closed/encryption round trip |
| E18 | [Tenant mixin](../backend/hmis/apps/core/mixins.py), [patient views](../backend/hmis/apps/patients/views_patient.py), [audit verification](../backend/hmis/apps/core/services/audit_integrity.py), [emergency access service](../backend/hmis/apps/core/emergency_access/service.py), [models](../backend/hmis/apps/core/emergency_access/models.py) | Source-derived authorization, expiry, review and audit findings; no blanket route-coverage claim |
| E19 | [Sync credentials](../backend/hmis/apps/core/powersync_tokens.py), [stream privacy tests](../backend/tests/core/test_powersync_stream_privacy.py) | Real checked-in SQL executed against current Django-model-derived SQLite schemas, plus signed-claim construction checks |
| E20 | [Sync lifecycle](../web-app/lib/context/sync-context.tsx), [connector](../web-app/lib/powersync/connector.ts), [auth storage](../web-app/lib/auth/storage.ts), [auth tests](../web-app/__tests__/lib/auth/context.test.tsx), [cleanup tests](../web-app/__tests__/lib/auth/storage.test.ts) | Mocked-SDK session-isolation, late-credential and pending-write preservation tests; browser/SDK deployment verification remains |
| E21 | [AI sanitizer](../backend/hmis/apps/ai/sanitizer.py), [AI transport](../backend/hmis/apps/ai/client.py), [privacy tests](../backend/tests/ai/test_ai_request_privacy.py) | Recursive redaction and error-message minimization verified with synthetic payloads/mocked HTTP; binary content not de-identified |

**Executed verification commands** (from `backend/` or `web-app/` respectively):

```bash
poetry run pytest tests/core/test_cookie_refresh_privacy.py tests/infrastructure/test_backup_dr.py --no-cov -q
poetry run pytest tests/core/test_powersync_stream_privacy.py tests/integration/test_powersync_tokens.py --no-cov -q
poetry run pytest tests/ai --no-cov -q
npm test -- --runInBand __tests__/lib/auth/context.test.tsx __tests__/lib/auth/storage.test.ts __tests__/app/providers.test.tsx
npx tsc --noEmit
```

These checks passed during implementation. External AI services and customer infrastructure were not called by the regression fixtures. Additionally, `SqlSyncRules.validate` from **`@powersync/service-sync-rules` 0.43.0** was run locally under Node 24 against the complete YAML and returned **no errors or warnings**. That compiler check complements the SQLite row-policy/schema tests; neither proves target deployment. The synthetic backup round trip does not substitute for a real disaster-recovery exercise.

**Evidence still required:** production configuration and physical schema; active streams and client caches; network/recipient inventory; provider contracts and regions; Kenyan serving-copy arrangements; migration/backfill results; encryption/key custody; authorization and isolation tests; vulnerability findings; restore and deletion evidence; supplier AI retention/training terms; exact lawful bases/retention authorities; ODPC registration/submission records; rights/incident exercises; stakeholder feedback and signed decisions.

### 20.2 Legal and regulatory sources

- [Constitution of Kenya, 2010](https://new.kenyalaw.org/akn/ke/act/2010/constitution/eng) — Article 31 privacy foundation.
- [Data Protection Act, 2019, Kenya Law](https://new.kenyalaw.org/akn/ke/act/2019/24/eng) — consulted for processing principles, DPIA, rights, security, breach and transfer requirements.
- [Data Protection (General) Regulations, 2021, Kenya Law](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng) — consulted for consent, rights deadlines, contracts, retention, localization and transfers.
- [ODPC regulatory framework](https://www.odpc.go.ke/data-protection-laws-kenya/) — official access to the Act, General Regulations, Registration Regulations and Complaints Handling and Enforcement Regulations.
- [ODPC guidelines](https://www.odpc.go.ke/guidelines-2/) — obtain the current applicable DPIA and health-data guidance when completing the controller assessment.

The DPO/legal reviewer must record the current applicable healthcare, reporting, confidentiality and records instruments, plus any regulatory directions specific to the deployment. A reference link is not evidence that a controller has fulfilled the requirement.

### 20.3 Version history

| Version | Date             | Change and status                                                                                                                                                                                                                                                                    |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0     | 28 December 2025 | Initial Phase 0 DPIA. Historical document labeled itself approved while reviews/signatures remained pending; its approval assertions are not evidence of completed approval                                                                                                          |
| 2.0     | 2 October 2026   | Comprehensive product/deployment assessment covering clinical and operational activities, vulnerable subjects, AI, offline/hub flows, international transfers/localization, retention, rights, scored risks, treatments and approval evidence. Draft pending validation and sign-off |
| 2.1 | 30 September 2026 | Source-based privacy fixes and regression evidence; records pre-customer status and DPO Thande W Murito; separates completed engineering, future customer annex and remaining product approval |
| 3.0 | 15 October 2026 | Final product-level DPIA. Replaces ambiguous placeholders with explicit product-scope decisions or mandatory Annex A evidence; adds product execution and facility deployment approval records; aligns continuity objectives with the approved backup and recovery policy. |

**Document owner:** Thande W Murito, Nexora DPO. **Next scheduled review:** 15 October 2027 or earlier on material change/customer onboarding. **Approval status:** final product DPIA; execution requires completed Section 19.2 approvals. Facility deployment is prohibited until Annex A is completed and signed.
