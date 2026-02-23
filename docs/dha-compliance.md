# DHA Compliance Checklist

> **Vitora HMIS** — Digital Health Authority (DHA) compliance status.
>
> Last updated: **February 22, 2026**
>
> 📋 **Gap closure plan**: [dha-compliance-roadmap.md](dha-compliance-roadmap.md)

---

## Demographics & Patient Registration

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Captures Sex/Gender | ✅ | `Patient.gender` — Male / Female / Other |
| Captures Date of Birth | ✅ | `Patient.date_of_birth` with future-date validation |
| Captures Residence/Address | ✅ | Kenya location hierarchy — 47 Counties → 289 Sub-Counties → 1448 Wards + village |
| Captures Contact Information | ✅ | `phone_number` (Fernet-encrypted), `email` |
| Captures Next of Kin | ✅ | `EmergencyContact` model — name, relationship, phone |
| Captures National ID | ✅ | `identification_type = national_id` + Fernet-encrypted `identification_number` |
| Captures Passport Number | ✅ | `identification_type = passport` + `identification_number` |
| Captures Birth Certificate | ✅ | `identification_type = birth_certificate` + `identification_number` |
| KENHDD Compliant | ⚠️ | Partial — uses Kenya location hierarchy, SHA/CR integration, ICD-10/11; no explicit KENHDD schema validation |

---

## Computerized Provider Order Entry (CPOE)

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Supports Medications | ✅ | `Drug`, `Prescription`, `PrescriptionItem` models; pharmacy web UI |
| Supports Dispensing | ✅ | `Dispensing` model with FEFO batch tracking; dispensing web UI |
| Supports Laboratory Orders | ✅ | `LabOrder`, `LabOrderItem`, `LabResult`, `DiagnosticReport`; LOINC integration |
| Supports Radiology Orders | ✅ | `ImagingOrder`, `ImagingOrderItem`, `RadiologyReport`; imaging web UI |
| Supports Physiotherapy | ⚠️ | Partial — `PHYSIO` clinic type + template routing; no dedicated CPOE workflow |
| Supports Occupation Therapy | ❌ | No occupational therapy module or order entry |
| Supports Nutrition/Dietetics | ⚠️ | Partial — `NUTRITION` clinic type + `TreatmentPlan.diet_recommendations`; no dedicated CPOE |
| Supports Social Work | ❌ | No social work module or order entry |
| Supports Counselling | ⚠️ | Partial — `MENTAL_HEALTH` clinic type exists; no dedicated counselling order model |
| Supports Family History | ✅ | `Encounter.family_history` text field |
| Supports Vital Signs | ✅ | Full vital set — temperature, pulse, BP, respiratory rate, SpO₂, weight, height; triage thresholds |
| Supports BMI/Growth Charts | ⚠️ | Partial — BMI calculation + classification implemented; no pediatric growth chart tracking |
| Supports Billing | ✅ | `Invoice`, `InvoiceItem`, `Payment`, `SHAClaim` models; billing web UI |
| Supports MCH Encounter | ⚠️ | Partial — ANC/PNC/FP/CWC/Immunization clinic types; no dedicated MCH register or mother-baby linkage |

---

## Problem List & Diagnoses (KENHDD)

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| KENHDD Compliant | ⚠️ | Partial — ICD-10 + ICD-11 coding (DHA APIs); no explicit KENHDD problem list schema |
| Can Record Problems | ✅ | `Diagnosis` model — ICD-10/11 codes, free text, PRIMARY/SECONDARY/DIFFERENTIAL/WORKING types |
| Can Update Problems | ✅ | `certainty` field (confirmed/provisional/ruled_out/suspected), `is_confirmed`, `updated_at` |
| Can Access Problem History | ✅ | Diagnoses linked to encounters via FK; accessible through patient encounter history; FHIR IPS Problem List section |

---

## Medication Management & HPT Registry

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| HPT Registry Integration | ❌ | DHA terminology APIs integrated (SHA, ICHI, LOINC) but not HPT specifically |
| Active Medication List | ✅ | `Prescription`/`PrescriptionItem` with status tracking; `Encounter.current_medications` |
| Medication History | ✅ | Patient prescriptions queryable historically; FHIR `MedicationStatement` endpoint |
| Allergy List | ⚠️ | Partial — `Encounter.allergies` text field; check-in allergy alerts; no dedicated structured `Allergy` model |
| Allergy History | ⚠️ | Partial — allergy text persisted across encounters; no structured allergy timeline |
| HPT Allergy Integration | ❌ | No HPT registry linkage to allergy checking |

---

## Clinical Decision Support

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Evidence-Based Interventions | ❌ | No evidence-based CDS engine; treatment plan templates exist but are not rule-driven |
| Uses Problem List | ⚠️ | Partial — check-in service reads `chronic_conditions` for alerts; no CDS rule engine |
| Uses HPT Registry | ❌ | No HPT registry integration for CDS |
| Uses Allergy List | ⚠️ | Partial — check-in allergy alerts (severe/general); no drug–allergy interaction checking |
| Uses Demographics | ✅ | Age-category vital sign thresholds (pediatric vs adult); triage `TriageVitalThreshold` |
| Uses Lab Results | ⚠️ | Partial — check-in alerts for pending labs; critical value flagging; no CDS rules triggered by specific results |
| Uses Vital Signs | ✅ | `has_critical_vitals()`, `get_alerts()`, triage thresholds; real-time critical patient WebSocket alerts |

---

## Clinical Summary Generation

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Human-Readable Format | ✅ | Vitals summary, diagnosis display, treatment summary methods; encounter detail web UI |
| Kenya HIE Exchangeable | ✅ | FHIR R4 IPS Bundle via `GET /fhir/Patient/{id}/$summary`; Kenya Client Registry integration; SHA FHIR claims |
| Includes Biodata | ✅ | FHIR Patient resource — name, gender, DOB, identifiers (national ID, CR number, MRN), address |
| Includes Clinical Information | ✅ | IPS Bundle Condition resources; encounter vitals, HPI, assessment, examination |
| Includes Medications | ⚠️ | Partial — IPS Composition has Medication Summary section; FHIR `MedicationStatement` exists; IPS section not yet dynamically populated |
| Includes Prescriptions | ⚠️ | Partial — pharmacy module tracks full prescriptions; not yet aggregated into IPS Bundle dynamically |
| Includes Care Plan | ⚠️ | Partial — `TreatmentPlan` model exists; not yet exposed as FHIR CarePlan in IPS Bundle |

---

## Electronic Prescribing

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Can Create Prescriptions | ✅ | `Prescription` + `PrescriptionItem` — auto-number RX-YYYYMMDD-XXXX, drug, dosage, frequency, duration, route |
| Electronic Transmission | ✅ | Prescriptions flow electronically encounter → pharmacy queue; status auto-updates |
| Includes Diagnostic Tests | ⚠️ | Partial — lab/imaging orders are separate CPOE workflows on the same encounter; not embedded in prescription |
| Includes Problem List | ✅ | Prescriptions linked to encounters which carry `Diagnosis` records (ICD-10/11) |
| Includes Medication Lists | ✅ | `Encounter.current_medications` + `PrescriptionItem` per encounter; historical prescriptions queryable |

---

## Quality Measures & Reporting

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Can Capture Quality Measures | ⚠️ | Partial — `MonthlyClinicReport` aggregates visits, demographics, chronic care, ANC stats; not standard DHA quality measures |
| Can Calculate Quality Measures | ⚠️ | Partial — billing, lab, clinic reporting services calculate aggregates; no standard CQM definitions |
| Can Import Quality Measures | ❌ | No import mechanism for external quality measure definitions |
| Can Export Quality Measures | ⚠️ | Partial — `MonthlyClinicReport` has DHIS2 submission fields; billing reports; no QRDA-format export |
| Electronic Submission | ⚠️ | Partial — DHIS2 submission scaffolded; SHA claims fully electronic via FHIR bundles |

---

## Reporting Capabilities

> Public health and disease surveillance reporting.

### Immediate Reportable Diseases `CRITICAL`

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Real-Time Reporting | ❌ | No disease surveillance module or notifiable disease flagging |
| MOH Guidelines Compliant | ❌ | No MOH 502 (Immediate Notifiable Disease) form or equivalent |

### IDSR Weekly Reporting `CRITICAL`

> Integrated Disease Surveillance and Response (IDSR) weekly reporting.

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Automated Reports | ❌ | No IDSR models, serializers, or Celery tasks |
| Weekly Submission | ❌ | No weekly reporting period or IDSR submission endpoint |

### Public Health Events

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Event Detection | ❌ | No outbreak/event detection logic or threshold-based surveillance triggers |
| Alert Mechanism | ❌ | Clinical alerts exist (SpO₂, critical labs) but no public health event alerts |

### Events of International Concern (IHR)

> International Health Regulations (IHR) compliance.

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| IHR Compliant | ❌ | No IHR-related code, models, or reporting endpoints |

### Routine Reporting

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Monthly Reports | ✅ | `MonthlyClinicReport` model with DHIS2 fields; automated Celery task `generate_monthly_clinic_reports` |
| Quarterly Reports | ❌ | No quarterly report model or generation logic |
| Annual Reports | ❌ | No annual report model or generation logic |

---

## Data Protection (ODPC & DPIA) `REQUIRED`

### ODPC Registration

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Registered with ODPC | ❌ | DPIA identifies roles but sign-offs are all "Pending" |
| Data Controller Registered | ❌ | Not yet registered |
| Data Processor Registered | ❌ | Not yet registered |
| DPIA Completed | ⚠️ | Partial — comprehensive DPIA exists (`docs/dpia.md`, v1.0, approved for Phase 0); Security/Legal/DPO reviews still pending |

### Encryption `REQUIRED`

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Data at Rest Encrypted | ✅ | Fernet field-level encryption for `national_id`, `phone_number`; SQLCipher full-DB encryption planned |
| Data in Transit Encrypted | ✅ | `SECURE_SSL_REDIRECT`, HSTS (1 year), `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, TLS enforced in production |
| Encryption Standard | — | AES-128 (Fernet) for data at rest, TLS 1.2+ for data in transit |
| Key Management System Implemented | ⚠️ | Partial — keys stored as environment variables; no HSM, KMS, or key rotation mechanism |

### Authentication & Access Control

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Unique User Identification | ✅ | Django `User` with unique username; JWT tokens carry `user_id`; `registered_by` FK on Patient |
| Digital Health ID Integration | ⚠️ | Partial — `cr_number` field for Kenya Client Registry on Patient; FHIR maps to `urn:sha:client-registry`; no active CR lookup/registration API |
| Multi-Factor Authentication (MFA) | ❌ | Planned — DPIA lists "Two-factor authentication (planned)"; no TOTP/MFA implementation |
| Role-Based Access Control (RBAC) | ✅ | 7 hierarchy levels: ADMIN → MANAGEMENT → CLINICAL_SENIOR → CLINICAL → TECHNICAL → ADMINISTRATIVE → COMMUNITY; `RoleBasedPermission`, `SensitiveAccessPermission`, `SHAPermission` |
| Number of Permission Levels | — | 7 |
| Automatic Logoff | ⚠️ | Partial — JWT access tokens expire in 30 min, refresh in 1 day; no frontend idle-timeout auto-logout |
| Emergency Access Procedures | ❌ | No break-glass or emergency access override mechanism |

### Audit Trail

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Tamper-Resistant | ⚠️ | Partial — append-only (`AuditLogPermission` blocks mutations via API); no cryptographic chaining or integrity hashing |
| Tracks User Actions | ✅ | `AuditLog` model — user, action, resource_type, resource_id, ip_address, user_agent, timestamp |
| Tracks Data Changes | ⚠️ | Partial — `details` JSONField can store changes; no automatic field-level diff tracking |
| Version Tracking | ❌ | No record versioning |
| Amendment Tracking | ⚠️ | Partial — only in imaging module (`ReportAmendment` model) |
| Retention Period (years) | — | 7 years (`AUDIT_LOG_RETENTION_YEARS = 7`, Kenya DPA 2019 compliant) |

### Backup & Disaster Recovery

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Backup Frequency | ❌ | Not configured; log rotation only (`backupCount: 5` for logs) |
| Off-Site Backup | ❌ | Not configured |
| Disaster Recovery Plan | ❌ | No DR plan; DPIA lists "Automated backup with encryption" as planned |
| RTO (Recovery Time Objective) | — | Not defined |
| RPO (Recovery Point Objective) | — | Not defined |
| Backup/Recovery Tested | ❌ | Not tested; pilot doc has "Backup strategy tested" unchecked |
| Last Test Date | — | N/A |

### Data Integrity

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Validation Rules | ✅ | DOB not in future, Kenya location cascade, ICD-10 validation, vital sign ranges, DRF serializer validation, FHIR resource validation |
| Checksum Verification | ⚠️ | Partial — SHA-256 checksums on SHA claim attachments; not applied to general data records |
| Digital Signatures | ❌ | No cryptographic signing for clinical documents; imaging reports have finalization status but no signatures |

---

## Interoperability

> Data exchange and standards compliance.

### Kenya Health Information Exchange (HIE) `CRITICAL`

> All systems that capture or manage patient data must integrate with the national Kenya HIE.

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| Integrated with Kenya HIE | ⚠️ | Partial — `cr_number` field for Client Registry; SHA claims reference `kenya-hie.health` terminology; no active ADX/SHR push/pull |

### Data Exchange Standards

| Component | Implemented | Notes |
|-----------|:-----------:|-------|
| HL7 Compliant | ⚠️ | Partial — HL7v2 MLLP integration for lab LIS behind feature flag (`HL7_INTEGRATION_ENABLED`); `hl7_ingest` command for ORU messages; disabled by default |
| FHIR R4 | ✅ | Full implementation — 10 resource endpoints (Patient, Practitioner, Organization, Observation, Condition, Composition, AllergyIntolerance, MedicationStatement, Device); IPS Bundle; SMART on FHIR OAuth2; `FHIRValidator` |
| SDMX Compliant | ❌ | No SDMX references in codebase |

### Interoperability Maturity Level

| Level | Description | Status |
|-------|-------------|:------:|
| Level 1: Unstructured Data Exchange | Basic data sharing via documents, PDFs, images | ✅ |
| Level 2: Structured Data Exchange | Formatted data exchange (CSV, XML, JSON) with defined structure | ✅ |
| Level 3: Semantic Interoperability | Common data definitions and standards (FHIR, HL7 with standard terminologies) | ⚠️ Partial — FHIR R4, ICD-10/11, LOINC implemented; SNOMED CT registered but not actively used |
| Level 4: Automated Data Sharing | Real-time automated workflows and decision support across systems | ❌ No active HIE participation or cross-facility data sharing |

### Medical Terminology Standards

| Standard | Implemented | Notes |
|----------|:-----------:|-------|
| SNOMED CT | ⚠️ | Partial — registered as code system (`http://snomed.info/sct`) in migration; not used for clinical coding |
| ICD-10 | ✅ | `ICD10Code` model with search API; `Diagnosis.icd10_code` FK; CSV import command |
| ICD-11 | ✅ | DHA API integration for ICD-11 codes; `Diagnosis.icd11_code` field |
| LOINC | ✅ | `LOINCCode` model; `TestCatalog.loinc_code` field; LOINCCodeViewSet API; code system registered |

---

## Summary

| Category | ✅ Done | ⚠️ Partial | ❌ Missing | Total |
|----------|:-------:|:----------:|:---------:|:-----:|
| Demographics & Patient Registration | 7 | 1 | 1 | 9 |
| CPOE | 8 | 4 | 2 | 14 |
| Problem List & Diagnoses | 3 | 1 | 0 | 4 |
| Medication Management & HPT Registry | 2 | 2 | 2 | 6 |
| Clinical Decision Support | 2 | 3 | 2 | 7 |
| Clinical Summary Generation | 4 | 3 | 0 | 7 |
| Electronic Prescribing | 4 | 1 | 0 | 5 |
| Quality Measures & Reporting | 0 | 4 | 1 | 5 |
| Reporting Capabilities | 1 | 0 | 9 | 10 |
| Data Protection (ODPC & DPIA) | 5 | 5 | 6 | 16 |
| Interoperability | 4 | 4 | 1 | 9 |
| **Totals** | **40** | **28** | **25** | **93** |

**Overall compliance: 40 / 93 fully implemented (43%), 68 / 93 at least partially addressed (73%).**

### Key Gaps

- **Birth certificate** identification type
- **Dedicated Allergy model** (structured, coded — severity, reaction type)
- **HPT Registry** integration
- **Occupational therapy** & **Social work** modules
- **Pediatric growth charts**
- **Clinical decision support engine** (evidence-based rules)
- **IPS Bundle** dynamic population (medications, allergies from live data)
- **Standard quality measure** definitions & export (CQM / QRDA)
- **KENHDD** explicit compliance mapping / validation
- **Disease surveillance** — IDSR, IHR, immediate reportable diseases
- **Quarterly & annual** routine reporting
- **MFA / two-factor authentication**
- **Backup & disaster recovery** plan
- **ODPC registration** (Data Controller & Processor)
- **Emergency access** (break-glass) procedures
- **Digital signatures** for clinical documents
- **SDMX** data exchange standard
- **Active Kenya HIE** push/pull integration
