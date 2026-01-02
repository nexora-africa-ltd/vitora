# User Stories and Acceptance Criteria for Vitora HMIS

> **Vitora HMIS** — Built for Care Without Limits

---

## Document Information

| Field | Value |
|-------|-------|
| **Version** | 2.0 |
| **Last Updated** | January 2, 2026 |
| **Status** | Active |
| **Owner** | Engineering Lead, Nexora Africa Ltd |
| **Traceability** | Linked to [ROADMAP.md](../ROADMAP.md) sprints |

---

## Overview

This document outlines user stories and acceptance criteria for all end-user roles in the Vitora HMIS system. Stories are derived from system capabilities including patient management, clinical workflows, pharmacy, billing, laboratory, reporting, offline access, interoperability, security, and future AI features.

### Story ID Format

```
KE-{ROLE}-{NUM} [Phase X] [Sprint X.X]: {Story Title}
```

**Role Codes:**
| Code | Role | Code | Role |
|------|------|------|------|
| DOC | Doctor/Consultant/Clinical Officer | NRS | Nurse/Nurse Aide |
| IPD | Inpatient Department (Admission/Ward) | SRG | Surgeon/Theatre Team |
| PHM | Pharmacist | LAB | Laboratory Tech/Radiologist |
| CSH | Cashier | CLM | Claims Officer |
| BIL | Billing Clerk | REC | Receptionist/Front Desk |
| STK | Stock Controller | MGT | Management/Administrator |
| ITA | IT Administrator | LOC | Part-time/Locum Staff |
| REG | Regulator | MCH | MCH Nurse/Midwife/Pediatrician |
| CHW | Community Health Worker | PAT | Patient |
| QUE | Queue Manager | WRD | Ward Manager |

### Phase Alignment

| Phase | Focus | Timeline | Status |
|-------|-------|----------|--------|
| **Phase 0** | Foundation, Desktop, Security | Jan-Mar 2026 | ✅ Complete |
| **Phase 1** | Clinical Core, Pharmacy, Billing, Mobile | Apr-Sep 2026 | 🔄 In Progress |
| **Phase 2** | SHA Claims, Theatre, KHIS Integration | Oct 2026-Mar 2027 | 📋 Planned |
| **Phase 3** | MCH, Immunizations, Imaging, Multi-site | Apr-Sep 2027 | 📋 Planned |
| **Phase 4** | AI/ML, Predictive Analytics | Oct-Dec 2027 | 📋 Planned |

### Compliance Requirements

All stories must satisfy:
- **Kenya Data Protection Act (2019)** — 7-year audit retention, consent management, breach notification
- **KHIS/DHIS2** — Mandatory health indicators reporting
- **SHA (Social Health Authority)** — Claims submission and eligibility verification
- **FHIR R4** — Interoperability with external systems
- **Offline-First** — Full functionality without internet connectivity

---

## 1. Clinical Roles

### 1.1 Doctor / Consultant / Clinical Officer

These roles focus on clinical encounters, diagnostics, and decision-making.

---

#### KE-DOC-001 [Phase 1] [Sprint 1.1]: Patient Record Search and Access

**As a** doctor/consultant/clinical officer,  
**I want to** search and view patient records quickly using identifiers like national ID, MRN, or phone number,  
**So that** I can access full medical history before consultations.

**Acceptance Criteria:**
- **Given** I am authenticated with `encounters.view_encounter` permission
- **When** I search by national ID, phone, MRN, or name (partial match supported)
- **Then** results return in <2 seconds for databases with 100K+ records
- **And** demographics, consent status, and encounter history are displayed
- **And** sensitive flags (HIV/GBV/Mental Health) are hidden unless I have `patients.view_sensitive_patient` permission
- **And** search is available offline with locally cached patients
- **And** AuditLog records `patient_view` with my user ID, timestamp, and IP address
- **And** FHIR-compliant Patient resource export is available

**Technical Notes:**
- Search endpoint: `GET /api/patients/?search={query}`
- Encrypted fields (national_id, phone_number) use Fernet encryption at rest
- Offline: SQLite FTS5 for full-text search

---

#### KE-DOC-002 [Phase 1] [Sprint 1.1]: Clinical Encounter Recording

**As a** doctor/consultant/clinical officer,  
**I want to** record clinical encounters including vitals, diagnoses, and treatment plans,  
**So that** patient data is standardized and interoperable.

**Acceptance Criteria:**
- **Given** I have selected a patient and have `encounters.add_encounter` permission
- **When** I submit an encounter with vitals, chief complaint, and diagnosis
- **Then** encounter is saved with ICD-10 diagnosis codes
- **And** vitals are validated:
  - Temperature: 35.0-42.0°C
  - Pulse: 30-200 BPM
  - Blood Pressure: format `XXX/XX` (e.g., "120/80")
  - Respiratory Rate: 8-60 breaths/min
  - SpO2: 0-100%
  - Weight: 0.5-500 kg
  - Height: 20-250 cm
- **And** SpO2 values <95% trigger a visual critical alert (hypoxemia warning)
- **And** medical history fields are captured:
  - Allergies
  - Chronic conditions
  - Current medications
  - Past surgeries
  - Family history
  - Social history (smoking, alcohol, occupation)
- **And** encounter links to patient MRN and creates billing line items automatically
- **And** offline entry queues to SyncQueue with status `PENDING`
- **And** AuditLog records `encounter_create`

**Technical Notes:**
- Endpoint: `POST /api/encounters/`
- Model: `Encounter` with `has_critical_vitals()` and `get_alerts()` methods
- ICD-10 search: `GET /api/encounters/icd10/?search={term}`

---

#### KE-DOC-003 [Phase 1] [Sprint 1.2]: Treatment Plan Management

**As a** doctor/consultant/clinical officer,  
**I want to** create and manage treatment plans with clinical templates,  
**So that** care is standardized and evidence-based.

**Acceptance Criteria:**
- Can select from pre-defined clinical templates (e.g., Malaria, Pneumonia, Diabetes)
- Can customize treatment plan based on patient-specific factors
- Treatment plan includes: medications, procedures, follow-up schedule, referrals
- Can link treatment to ICD-10 diagnosis codes
- Templates support KEML (Kenya Essential Medicines List) drug suggestions
- Plan auto-generates pharmacy orders and billing items

**Technical Notes:**
- Models: `TreatmentPlan`, `TreatmentPlanTemplate`, `ClinicalTemplate`
- Endpoint: `POST /api/encounters/{id}/treatment-plans/`

---

#### KE-DOC-004 [Phase 4] [Sprint 4.1]: AI-Powered Clinical Risk Alerts

**As a** doctor/consultant/clinical officer,  
**I want** AI-powered alerts for clinical risks (e.g., sepsis, deterioration),  
**So that** I can intervene early and improve patient outcomes.

**Acceptance Criteria:**
- Flags risks based on vitals trends with >90% accuracy in validation testing
- Alerts appear prominently in encounter view with severity level (Warning, Critical)
- Clinician can acknowledge or override alert with documented reason
- No patient data shared externally without explicit consent
- Model retraining uses anonymized, aggregated facility data only
- Compliant with Kenya DPA for automated decision-making
- Forward-looking: Integrates with national AI health initiatives in Kenya

---

#### KE-DOC-005 [Phase 1] [Sprint 1.2]: Clinical Officer Scope-Limited Access

**As a** clinical officer,  
**I want to** assess patients and initiate treatment within my scope,  
**So that** care continues when doctors are unavailable.

**Acceptance Criteria:**
- Can create encounters and clinical notes attributed to "Clinical Officer" role
- Can order laboratory tests from approved test catalog
- Can prescribe medications within defined formulary scope
- Can escalate cases to doctor with referral note and priority flag
- Cannot perform restricted procedures (defined per facility policy)
- All actions audited with role attribution
- Scope restrictions enforced via RBAC permissions

---

#### KE-DOC-006 [Phase 2] [Sprint 2.2]: Consultant Referral Review

**As a** consultant,  
**I want to** review referred cases and provide specialist input,  
**So that** patients receive expert care.

**Acceptance Criteria:**
- Can view referral notes, attachments, and full patient history
- Can add specialist opinions as separate notes (marked "Consultant Opinion")
- Original notes remain unaltered (append-only specialist input)
- Can recommend procedures, medications, or follow-up schedule
- Access may be time-limited or case-specific based on referral
- Referring clinician receives notification of consultant response

---

### 1.2 Nurse / Nurse Aide

Focus on vitals, encounters, patient care, and clinical support.

---

#### KE-NRS-001 [Phase 1] [Sprint 1.1]: Offline Vitals and Encounter Logging

**As a** nurse/nurse aide,  
**I want to** log vitals and encounters offline,  
**So that** I can work effectively in rural areas without internet.

**Acceptance Criteria:**
- **Given** I am using the mobile or desktop app without internet connectivity
- **When** I record patient vitals (BP, temperature, pulse, SpO2, weight, height)
- **Then** data is saved locally to SQLite database
- **And** sync indicator shows "Offline" status with pending count
- **And** when connectivity is restored, data auto-syncs within 5 minutes
- **And** conflicts are flagged for manual resolution if another user modified same record
- **And** AuditLog entries include offline timestamp and sync timestamp

**Technical Notes:**
- Models: `SyncQueue`, `SyncConflict`
- Conflict resolution strategies: `AUTO`, `MANUAL`, `LOCAL_WINS`, `REMOTE_WINS`

---

#### KE-NRS-002 [Phase 1] [Sprint 1.1]: SpO2 Critical Alert Response

**As a** nurse,  
**I want to** see visual alerts when SpO2 falls below 95%,  
**So that** I can escalate hypoxemia cases immediately.

**Acceptance Criteria:**
- **Given** I am viewing or entering patient vitals
- **When** SpO2 value is <95%
- **Then** a prominent red alert banner displays "CRITICAL: Hypoxemia Alert - SpO2 {value}%"
- **And** alert persists until acknowledged
- **And** I can escalate directly to doctor from alert
- **And** alert is logged in AuditLog

**Technical Notes:**
- Method: `Encounter.has_critical_vitals()` returns `True` if SpO2 < 95
- Method: `Encounter.get_alerts()` returns list of alert messages

---

#### KE-NRS-003 [Phase 1] [Sprint 1.2]: Clinical Collaboration and Handoff

**As a** nurse/nurse aide,  
**I want** collaboration tools to share updates with doctors,  
**So that** care continuity is maintained across shifts.

**Acceptance Criteria:**
- Can add nursing notes to patient encounter
- Can flag urgent cases for immediate doctor attention
- In-app notifications for vitals alerts and new orders
- Shift handoff summary report generation
- Secure sharing via FHIR; all access audited
- Offline notes sync when connectivity restored

---

#### KE-NRS-004 [Phase 3] [Sprint 3.1]: Maternal/Child Health Tracking

**As a** nurse/nurse aide,  
**I want to** track maternal/child health visits and immunizations,  
**So that** care is compliant with national guidelines.

**Acceptance Criteria:**
- Specialized MCH module for antenatal (ANC), postnatal care
- Tracks 4+ ANC visits per national guidelines
- Immunization schedule based on KEPI program
- Auto-compiles data for KHIS immunization reports
- Privacy flags for sensitive cases (HIV-exposed infants)
- Mobile app supports community outreach with geolocation (if consented)

---

### 1.3 Inpatient Department (IPD) Roles

These roles focus on inpatient admission, ward management, nursing care, and discharge workflows. IPD enables seamless transition from outpatient to inpatient care while maintaining clinical continuity.

---

#### KE-IPD-001 [Phase 1] [Sprint 1.5]: Admission Recommendation from OPD

**As a** doctor/clinical officer,  
**I want to** recommend a patient for inpatient admission directly from the outpatient encounter,  
**So that** the admission process is faster, coordinated, and does not require re-registration of the patient.

**Acceptance Criteria:**
- **Given** a patient has an active outpatient encounter
- **When** I decide the patient requires inpatient care
- **Then** I can mark the encounter as "Recommended for Admission"
- **And** I can add admission reason and provisional diagnosis
- **And** the system changes encounter status to `ADMISSION_PENDING`
- **And** reception/front desk is notified of the pending admission
- **And** duplicate inpatient registration is prevented
- **And** admission recommendation expires after 24 hours (configurable)
- **And** AuditLog records `admission_recommended` with reason

**Technical Notes:**
- New field: `Encounter.admission_status` (NONE, PENDING, ADMITTED, DECLINED)
- New model: `AdmissionRecommendation` linking OPD encounter to IPD admission
- Notification: Real-time alert to reception via WebSocket/polling

---

#### KE-IPD-002 [Phase 1] [Sprint 1.5]: Inpatient Admission Processing

**As a** receptionist,  
**I want to** be notified when a patient has been recommended for admission and complete the inpatient registration,  
**So that** I can efficiently process admissions once the patient agrees.

**Acceptance Criteria:**
- **Given** a patient has admission recommendation from a clinician
- **When** the patient presents at reception and agrees to inpatient admission
- **Then** I can convert the outpatient encounter to an inpatient admission
- **And** I can assign ward and bed from available inventory
- **And** I can confirm/update payer/insurance details
- **And** the system preserves all outpatient notes, vitals, labs, and orders
- **And** the system creates an inpatient encounter linked to the same patient record
- **And** admission timestamp and admitting officer are recorded
- **And** AuditLog records `patient_admitted`

**Edge Cases:**
- If patient declines admission: encounter remains OPD, decline reason documented
- If no beds available: patient added to admission waiting list
- Bed availability validated before final admission confirmation

**Technical Notes:**
- New models: `Ward`, `Bed`, `Admission`
- Endpoint: `POST /api/admissions/`
- Bed status: AVAILABLE, OCCUPIED, MAINTENANCE, RESERVED

---

#### KE-IPD-003 [Phase 1] [Sprint 1.5]: Ward and Bed Management

**As a** ward manager/receptionist,  
**I want to** manage ward beds and view real-time occupancy,  
**So that** bed allocation is efficient and accurate.

**Acceptance Criteria:**
- Can view all wards with bed counts (total, occupied, available, maintenance)
- Ward types supported: Medical, Surgical, Pediatric, Maternity, ICU, Isolation
- Can add/edit/deactivate beds within wards
- Bed status transitions: Available → Reserved → Occupied → Available
- Can mark beds for maintenance with reason and expected duration
- Real-time bed occupancy dashboard for management
- Bed charges linked to ward type for billing integration
- Offline bed status visible; updates sync when connected

**Technical Notes:**
- Models: `Ward`, `Bed`
- Endpoint: `GET /api/wards/`, `GET /api/wards/{id}/beds/`
- Dashboard: Real-time occupancy percentage per ward

---

#### KE-IPD-004 [Phase 1] [Sprint 1.5]: Clinical Documentation Continuity

**As a** doctor/clinical officer,  
**I want to** continue documenting clinical notes after a patient is admitted,  
**So that** inpatient care begins immediately without workflow disruption.

**Acceptance Criteria:**
- **Given** inpatient admission is completed
- **When** I open the patient's chart
- **Then** I can continue writing notes under the inpatient encounter
- **And** I can enter ward notes, treatment plans, and orders
- **And** I can view pre-admission OPD data in the same patient chart
- **And** all clinical documentation is linked to the admission record
- **And** encounter type shows as `IPD` with ward/bed information
- **And** offline documentation syncs when connected

**Technical Notes:**
- `Admission` model links OPD encounter to IPD encounter
- Patient timeline shows seamless OPD → IPD transition

---

#### KE-IPD-005 [Phase 1] [Sprint 1.6]: Daily Ward Rounds Documentation

**As a** doctor/clinical officer,  
**I want to** document daily ward rounds for inpatients,  
**So that** progress is tracked and care plans are updated.

**Acceptance Criteria:**
- Can create daily round notes for each inpatient
- Round note captures: clinical findings, assessment, plan updates
- Can update diagnosis, medications, and investigations
- Can set patient condition status: Stable, Improving, Deteriorating, Critical
- Round notes timestamped with clinician attribution
- Can flag patients for consultant review
- Round summary visible in patient timeline
- Offline round documentation with sync

**Technical Notes:**
- New model: `WardRound` linked to `Admission`
- Endpoint: `POST /api/admissions/{id}/rounds/`

---

#### KE-IPD-006 [Phase 1] [Sprint 1.6]: Nurse's Kardex Management

**As a** nurse,  
**I want to** view and maintain a patient's Kardex during inpatient care,  
**So that** I can safely deliver, track, and hand over nursing care across shifts.

**Acceptance Criteria:**
- **Given** a patient is admitted as an inpatient
- **When** I open the patient chart
- **Then** a Kardex view is available with:
  - **Patient Snapshot** (read-only): Name, age, ward/bed, admission date, diagnosis, allergies, isolation status
  - **Current Medical Orders** (auto-populated): Active medications, IV fluids, diet orders, activity level, special instructions
  - **Nursing Care Plan**: Nursing problems, interventions, monitoring requirements, care task frequency
  - **Observations & Alerts**: Latest vitals, abnormal findings, risk indicators (fall, pressure sore)
  - **Shift Notes**: Free-text nursing narrative with nurse name, shift (Day/Night), timestamp
  - **Handover Notes**: Follow-up items for next shift, pending labs/procedures, escalations

**Safety Rules:**
- Nurses cannot alter doctor orders from the Kardex
- Kardex entries are append-only (no silent edits)
- Critical orders and allergies are visually highlighted
- All updates logged in audit trail
- Kardex visibility limited to ward-assigned staff

**Technical Notes:**
- New model: `NursingKardex` with sections as JSON or related models
- One active Kardex per admission
- Endpoint: `GET/PATCH /api/admissions/{id}/kardex/`

---

#### KE-IPD-007 [Phase 1] [Sprint 1.6]: Nursing Shift Handover

**As a** nurse,  
**I want to** quickly review the Kardex at the start of my shift,  
**So that** I understand the patient's current condition and care priorities.

**Acceptance Criteria:**
- Can view latest Kardex summary at shift start
- Handover notes from previous shift clearly visible
- Pending tasks and follow-ups highlighted
- Can acknowledge handover receipt
- Critical patients flagged for immediate attention
- Shift handover report printable for ward reference
- Handover timestamp and participants recorded

**Technical Notes:**
- New model: `ShiftHandover` linking outgoing and incoming nurses
- Auto-generates handover summary from Kardex

---

#### KE-IPD-008 [Phase 1] [Sprint 1.6]: Inpatient Transfer

**As a** doctor/ward manager,  
**I want to** transfer a patient between wards,  
**So that** patients receive appropriate level of care.

**Acceptance Criteria:**
- Can initiate transfer request with reason (step-up, step-down, specialty care)
- Target ward/bed selected from available options
- Transfer requires bed availability validation
- Transfer summary includes current status and handover notes
- Source ward notified of transfer completion
- Billing updated for new ward charges
- Full transfer audit trail maintained
- AuditLog records `patient_transferred`

**Technical Notes:**
- New model: `Transfer` linking admission to source/target beds
- Endpoint: `POST /api/admissions/{id}/transfer/`

---

#### KE-IPD-009 [Phase 1] [Sprint 1.6]: Discharge Planning and Execution

**As a** doctor/clinical officer,  
**I want to** plan and execute patient discharge,  
**So that** patients leave with clear instructions and follow-up plans.

**Acceptance Criteria:**
- Can initiate discharge planning with target date
- Discharge summary captures:
  - Admission diagnosis and final diagnosis
  - Procedures performed
  - Treatment provided
  - Discharge medications (linked to pharmacy)
  - Follow-up appointments
  - Instructions to patient/caregiver
  - Referrals (if any)
- Discharge requires clearing of:
  - Outstanding pharmacy items
  - Pending lab results (or documented acknowledgment)
  - Financial clearance (bill settled or payment plan)
- Bed status updated to AVAILABLE upon discharge
- Discharge summary printable for patient
- AuditLog records `patient_discharged`
- Length of Stay (LOS) calculated and stored

**Technical Notes:**
- New model: `Discharge` linked to `Admission`
- Endpoint: `POST /api/admissions/{id}/discharge/`
- Auto-calculates LOS for reporting

---

#### KE-IPD-010 [Phase 2] [Sprint 2.1]: Consultant Review and Referral (Inpatient)

**As a** clinician,  
**I want to** request consultant reviews or external referrals during admission,  
**So that** continuity of care and documentation are maintained.

**Acceptance Criteria:**
- Can create referral request linked to inpatient encounter
- Referral captures: reason, urgency, target specialty/consultant
- Internal consultant can document review and recommendations
- External referrals generate transfer documentation
- Referral status tracking: Requested → Accepted → Completed
- Referring clinician notified of consultant response
- Full audit trail of all referrals and responses
- Referral history visible in patient timeline

**Technical Notes:**
- Extends existing referral model for IPD context
- Notifications to consultant for pending reviews

---

### 1.4 Surgeon / Theatre Nurse / Perioperative Theatre Technician

These roles emphasize surgical scheduling, theatre management, and perioperative care (Phase 2 focus).

---

#### KE-SRG-001 [Phase 2] [Sprint 2.1]: Theatre Scheduling and Coordination

**As a** surgeon/theatre nurse/perioperative theatre technician,  
**I want to** schedule and view theatre procedures,  
**So that** operations are coordinated efficiently.

**Acceptance Criteria:**
- Calendar view shows theatre availability, patient details, and required equipment
- Integrates with patient records for pre-op vitals and consent verification
- Notifications for scheduling conflicts or delays
- Supports rescheduling with reason documentation
- Offline access for viewing schedule; syncs when connected
- Links to inventory for surgical kit availability check

---

#### KE-SRG-002 [Phase 2] [Sprint 2.1]: Perioperative Documentation

**As a** surgeon/theatre nurse/perioperative theatre technician,  
**I want to** record perioperative observations and outcomes,  
**So that** post-op care is informed and reportable.

**Acceptance Criteria:**
- Captures vitals, anesthesia details, and complications with ICD-10 codes
- Structured forms for pre-op, intra-op, and post-op phases
- Auto-generates reports for KHIS (surgical volumes indicator)
- Role-based access: Surgeons view/edit all; technicians limited to observations
- FHIR export for continuity of care to other facilities
- Offline logging with sync post-procedure

---

#### KE-SRG-003 [Phase 2] [Sprint 2.2]: Surgical Supplies Stock Alerts

**As a** surgeon/theatre nurse/perioperative theatre technician,  
**I want** stock alerts for surgical supplies,  
**So that** procedures are not delayed due to shortages.

**Acceptance Criteria:**
- Real-time alerts for low/expiring inventory linked to theatre schedules
- Integration with pharmacy module for quick reorders
- Pre-procedure checklist validates supply availability
- Audit logs track usage per procedure
- Reports on consumption trends for procurement planning

---

#### KE-SRG-004 [Phase 2] [Sprint 2.1]: Equipment and Consumables Tracking

**As a** perioperative theatre technician,  
**I want to** track equipment and consumables,  
**So that** theatre operations run smoothly.

**Acceptance Criteria:**
- Can log equipment readiness and sterilization status with timestamps
- Can record consumables usage per procedure
- Stock deductions are automatic upon procedure completion
- Equipment faults or shortages can be flagged for maintenance
- Records tied to theatre session with full audit trail

---

## 2. Support Roles

### 2.1 Receptionist / Front Desk Staff

Manage patient registrations, queue management, and record updates.

---

#### KE-REC-001 [Phase 0] [Sprint 0.2]: Quick Patient Registration

**As a** receptionist,  
**I want to** register patients quickly with auto-generated MRN,  
**So that** wait times are reduced.

**Acceptance Criteria:**
- **Given** I have patient demographics (name, DOB, gender, national ID, phone, county, sub-county)
- **When** I submit the registration form
- **Then** MRN is auto-generated in format `MRN-YYYYMMDD-XXXX` within 500ms
- **And** date of birth validation rejects future dates
- **And** Kenya location hierarchy cascades: County → Sub-County → Ward
- **And** consent_given defaults to `false` until explicitly checked
- **And** `registered_by` is auto-set to my user account
- **And** referral source is captured (self, clinic, other_facility)
- **And** AuditLog records `patient_create` with my user ID

**Technical Notes:**
- Endpoint: `POST /api/patients/`
- MRN generation: Auto in `Patient.save()` method
- Location models: `County`, `SubCounty`, `Ward` (47/289/1448 respectively)

---

#### KE-REC-002 [Phase 0] [Sprint 0.7]: Emergency Contact Management

**As a** receptionist,  
**I want to** record multiple emergency contacts for patients,  
**So that** family can be notified in emergencies.

**Acceptance Criteria:**
- Can add, edit, delete emergency contacts for a patient
- Each contact captures: name, phone number, relationship
- Relationship options: Spouse, Parent, Child, Sibling, Friend, Other
- At least one emergency contact recommended (soft validation)
- Contacts displayed on patient detail view
- Contacts synced offline with patient record

**Technical Notes:**
- Model: `EmergencyContact` with FK to `Patient`
- Endpoint: `GET/POST /api/patients/{id}/emergency-contacts/`

---

#### KE-REC-003 [Phase 1] [Sprint 1.1]: Patient Record Search and Update

**As a** receptionist,  
**I want to** search and update patient details,  
**So that** records remain accurate.

**Acceptance Criteria:**
- Search by MRN, national ID, phone, or name returns results in <2 seconds
- Can update demographics with audit trail of changes
- Cannot modify clinical data (encounters, diagnoses)
- Offline registration queues for sync when connected
- Duplicate patient detection warns before creating new record

---

#### KE-REC-004 [Phase 1] [Sprint 1.2]: Consent Management

**As a** receptionist,  
**I want to** capture and manage patient consent,  
**So that** data sharing is compliant with Kenya DPA.

**Acceptance Criteria:**
- Consent form presented at registration with clear explanation
- Patient can grant or withhold consent for:
  - Data processing for treatment
  - Data sharing with SHA for claims
  - Data export to other facilities
- Consent date/time recorded; can be revoked
- Revocation does not delete historical data (audit compliance)
- Consent status visible on patient profile

---

### 2.2 Queue Manager

Coordinate patient flow through facility departments.

---

#### KE-QUE-001 [Phase 1] [Sprint 1.2]: OPD Queue Management

**As a** queue manager,  
**I want to** manage patient queues across departments,  
**So that** flow is optimized and wait times are minimized.

**Acceptance Criteria:**
- Dashboard shows real-time queue status per department (OPD, Lab, Pharmacy)
- Can prioritize patients (emergency, pregnant, elderly, standard)
- Average wait time displayed per queue
- Patients can be called via display screen integration
- Queue data feeds into operational reports
- Offline queue management with sync

---

### 2.3 Pharmacist

Focus on medication management, dispensing, and inventory.

---

#### KE-PHM-001 [Phase 1] [Sprint 1.3]: Medication Stock Management

**As a** pharmacist,  
**I want to** manage medication stock and track batches,  
**So that** I can avoid stockouts and ensure drug safety.

**Acceptance Criteria:**
- Tracks stock levels by drug, batch number, and expiration date
- Alerts for:
  - Low stock (below reorder threshold)
  - Expiring stock (within 90 days)
  - Expired stock (quarantine required)
- Drug catalog includes: KEML code, generic name, brand, dosage forms, unit of measure
- Supports barcode scanning (EAN-13, Code128) via USB/Bluetooth scanners
- Offline mode queues stock updates; syncs when connected
- Audit trail for all stock movements

**Technical Notes:**
- Models: `Drug`, `StockBatch`, `StockAlert`, `StockAdjustment`
- Endpoint: `GET /api/pharmacy/drugs/`, `GET /api/pharmacy/stock/`

---

#### KE-PHM-002 [Phase 1] [Sprint 1.3]: Prescription Fulfillment

**As a** pharmacist,  
**I want to** view and fulfill prescriptions from clinicians,  
**So that** medications are dispensed securely and accurately.

**Acceptance Criteria:**
- **Given** a prescription is submitted by a clinician
- **When** I open the dispensing queue
- **Then** I see patient name, MRN, prescribed medications, and dosage
- **And** patient allergies are prominently displayed with conflict warnings
- **And** I can select batch to dispense from (FIFO recommended)
- **And** dispensing deducts from stock in real-time
- **And** integrates with billing for invoice generation
- **And** AuditLog records `medication_dispense` with batch number

**Technical Notes:**
- Models: `Prescription`, `PrescriptionItem`, `Dispensing`
- Endpoint: `POST /api/pharmacy/dispensing/`

---

#### KE-PHM-003 [Phase 1] [Sprint 1.4]: Drug Interaction and Allergy Warnings

**As a** pharmacist,  
**I want to** see warnings for drug interactions and allergies,  
**So that** patient safety is ensured.

**Acceptance Criteria:**
- System checks prescribed medications against patient's allergy list
- Warnings displayed for known drug-drug interactions
- Pharmacist can override with documented reason
- All warnings and overrides logged in AuditLog
- Can print patient medication information leaflet

---

#### KE-PHM-004 [Phase 4] [Sprint 4.2]: Predictive Stock Analytics

**As a** pharmacist,  
**I want** predictive analytics for stockouts,  
**So that** I can plan procurements proactively.

**Acceptance Criteria:**
- Forecasts based on historical dispense data with >85% accuracy
- Dashboard shows consumption trends and predicted stockout dates
- Exports to CSV for procurement team review
- Data anonymized for privacy compliance
- Seasonal adjustment for disease patterns (e.g., malaria season)

---

### 2.4 Stock Controller

Dedicated inventory management role (distinct from dispensing pharmacist).

---

#### KE-STK-001 [Phase 1] [Sprint 1.4]: Inventory Receipts and Adjustments

**As a** stock controller,  
**I want to** record inventory receipts and adjustments,  
**So that** stock levels are accurate.

**Acceptance Criteria:**
- Can record goods received with: supplier, batch, expiry, quantity, unit cost
- Can record stock adjustments with reason codes:
  - Breakage/Damage
  - Expired
  - Theft/Loss
  - Correction
  - Transfer
- All adjustments require supervisor approval above threshold
- Full audit trail with before/after quantities
- Integration with accounting for cost tracking

**Technical Notes:**
- Model: `StockAdjustment`
- Endpoint: `POST /api/pharmacy/stock-adjustments/`

---

#### KE-STK-002 [Phase 1] [Sprint 1.4]: Stock Reports and Analytics

**As a** stock controller,  
**I want** comprehensive stock reports,  
**So that** I can manage inventory effectively.

**Acceptance Criteria:**
- Reports available:
  - Current stock levels by drug/batch
  - Stock movement history
  - Expiry report (30/60/90 days)
  - Consumption report by period
  - Reorder report (items below threshold)
- Export to CSV, PDF formats
- KHIS-compliant reports for pharmaceutical indicators

---

### 2.5 Laboratory Technician / Radiologist

Handle test orders, specimen processing, and results delivery.

---

#### KE-LAB-001 [Phase 1] [Sprint 1.5]: Lab Order Processing

**As a** laboratory technician,  
**I want to** receive and process lab orders,  
**So that** results are delivered promptly to clinicians.

**Acceptance Criteria:**
- Notifications for new orders with priority indicator (Routine, Urgent, STAT)
- Order includes: patient MRN, test(s) requested, clinical indication, specimen type
- Can update order status: Received → In Progress → Completed → Verified
- Sample collection timestamp and collector recorded
- Supports barcode labeling for specimen tracking
- Queue view shows pending orders sorted by priority

**Technical Notes:**
- Models: `LabOrder`, `LabOrderItem`, `LabResult`, `LabQueue`
- Endpoint: `GET /api/laboratory/orders/`, `PATCH /api/laboratory/orders/{id}/`

---

#### KE-LAB-002 [Phase 1] [Sprint 1.5]: Lab Results Entry and Verification

**As a** laboratory technician,  
**I want to** enter and verify test results,  
**So that** clinicians receive accurate data.

**Acceptance Criteria:**
- Results entry form matches test type (numeric, text, coded values)
- Reference ranges displayed for numeric values
- Abnormal values flagged automatically
- Two-step verification: Tech enters → Supervisor verifies
- LOINC codes assigned to results for interoperability
- Auto-notifies ordering clinician when results ready
- Can attach images/documents (e.g., microscopy images)

**Technical Notes:**
- Models: `LabResult`, `LabResultTemplate`, `LabResultAttachment`, `LOINCCode`

---

#### KE-LAB-003 [Phase 1] [Sprint 1.5]: Lab Billing Integration

**As a** laboratory technician,  
**I want** lab tests to integrate with billing,  
**So that** services are invoiced accurately.

**Acceptance Criteria:**
- Test catalog includes pricing per test
- Completed tests auto-generate billing line items
- Links to SHA claims for insured patients
- Cost centers tracked for departmental reporting
- Offline test logging syncs billing items when connected

**Technical Notes:**
- Model: `TestCatalog` with `price` field

---

#### KE-LAB-004 [Phase 2] [Sprint 2.3]: Radiology Integration

**As a** radiologist,  
**I want to** receive imaging orders and upload results,  
**So that** diagnostic images are accessible to clinicians.

**Acceptance Criteria:**
- Imaging orders (X-ray, Ultrasound, CT, MRI) received via lab module
- Can upload DICOM images or PDF reports
- Results linked to patient encounter
- Integration with PACS (future) for image viewing
- Report templates for standardized findings
- Auto-notifies ordering clinician

---

## 3. Financial Roles

### 3.1 Cashier

Handle payments and receipt generation.

---

#### KE-CSH-001 [Phase 1] [Sprint 1.5]: Payment Processing

**As a** cashier,  
**I want to** process payments and generate receipts,  
**So that** transactions are seamless and auditable.

**Acceptance Criteria:**
- Supports multiple payment methods:
  - Cash (with change calculation)
  - M-Pesa (STK push integration)
  - Card (POS terminal integration)
  - Insurance (SHA, NHIF legacy)
- Real-time eligibility check for insured patients
- Receipt generated with: receipt number, patient name, services, amount, payment method
- Daily cash reconciliation report
- Offline payment recording with sync when connected
- All transactions logged in AuditLog

---

#### KE-CSH-002 [Phase 1] [Sprint 1.5]: Invoice Generation

**As a** cashier,  
**I want to** view and print patient invoices,  
**So that** patients know their charges before payment.

**Acceptance Criteria:**
- Invoice aggregates all billable items from encounter:
  - Consultation fees
  - Lab tests
  - Medications
  - Procedures
- Itemized breakdown with unit prices and totals
- Insurance coverage applied automatically for eligible patients
- Patient co-pay calculated and displayed
- Can apply discounts with supervisor approval
- Print or email invoice option

---

### 3.2 Billing Clerk

Invoice generation and accounts receivable management (distinct from cashier).

---

#### KE-BIL-001 [Phase 1] [Sprint 1.6]: Billing Reconciliation

**As a** billing clerk,  
**I want to** reconcile billings with services rendered,  
**So that** revenue capture is complete.

**Acceptance Criteria:**
- Dashboard shows unbilled services by department
- Can investigate and add missing billing items
- Discrepancy reports for audit
- End-of-day billing closure report
- Integration with accounting system (export format)

---

#### KE-BIL-002 [Phase 2] [Sprint 2.1]: Corporate and Insurance Accounts

**As a** billing clerk,  
**I want to** manage corporate and insurance accounts,  
**So that** bulk invoicing is efficient.

**Acceptance Criteria:**
- Can group patients by payer (SHA, corporate contracts)
- Generate consolidated invoices per payer
- Track payment status and aging
- Send statements to payers
- Reports on accounts receivable aging

---

### 3.3 Claims Officer

SHA claims submission and tracking.

---

#### KE-CLM-001 [Phase 2] [Sprint 2.1]: SHA Claims Submission

**As a** claims officer,  
**I want to** submit SHA claims with attachments,  
**So that** reimbursements are timely and accurate.

**Acceptance Criteria:**
- Packages claims with required attachments:
  - Patient registration form
  - Clinical notes
  - Lab reports
  - Invoices
  - Prescription records
- FHIR/zip format for submission
- Pre-submission validation against SHA tariffs
- Error messages for incomplete/invalid claims
- Claim tracking: Submitted → Under Review → Approved → Paid → Rejected
- Notifications for status updates

---

#### KE-CLM-002 [Phase 2] [Sprint 2.2]: Claims Reconciliation and Appeals

**As a** claims officer,  
**I want to** track claim status and manage appeals,  
**So that** revenue loss is minimized.

**Acceptance Criteria:**
- Dashboard shows claims by status with aging
- Can view rejection reasons from SHA
- Can prepare and submit appeals with supporting documents
- Historical analysis of rejection patterns
- Reports on claims performance (approval rate, average turnaround)

---

#### KE-CLM-003 [Phase 1] [Sprint 1.6]: Financial Performance Reports

**As a** cashier/claims officer,  
**I want** reports on financial performance,  
**So that** I can monitor revenue and collections.

**Acceptance Criteria:**
- Dashboards show:
  - Daily collections by payment method
  - Outstanding invoices
  - Pending claims by status
  - Revenue by department
- Exports to KHIS for financial indicators
- Role-restricted: Cashiers view daily; officers view aggregates
- Comparative reports (period over period)

---

## 4. Administrative Roles

### 4.1 Management / Administrator

Oversee operations, compliance, and reporting.

---

#### KE-MGT-001 [Phase 1] [Sprint 1.6]: Operational Dashboard

**As a** management/administrator,  
**I want** dashboards for performance monitoring,  
**So that** I can ensure operational efficiency and regulatory compliance.

**Acceptance Criteria:**
- Real-time views of:
  - OPD patient visits (today, week, month)
  - Revenue collection vs target
  - Stock levels and alerts
  - Lab turnaround times
  - Bed occupancy (if IPD implemented)
- Auto-generates KHIS reports for mandatory indicators
- Export to CSV, PDF for board reports
- Drill-down capability to department level

---

#### KE-MGT-002 [Phase 0] [Sprint 0.4]: Audit Log Access

**As a** management/administrator,  
**I want** access to audit logs,  
**So that** I can investigate privacy queries and ensure compliance.

**Acceptance Criteria:**
- Tracks all user actions with:
  - User ID, username
  - Action type (create, view, update, delete)
  - Resource type and ID
  - Timestamp
  - IP address
  - Additional details (JSON)
- Searchable by date range, user, action, resource
- 7-year retention per Kenya DPA 2019
- Alerts for anomalies (e.g., bulk data access, access outside hours)
- Export for compliance audits

**Technical Notes:**
- Model: `AuditLog`
- Endpoint: `GET /api/auditlogs/` (admin only)

---

#### KE-MGT-003 [Phase 2] [Sprint 2.3]: KHIS/DHIS2 Reporting

**As a** management/administrator,  
**I want** automated KHIS reporting,  
**So that** facility meets mandatory reporting requirements.

**Acceptance Criteria:**
- Auto-aggregates facility data for KHIS indicators:
  - OPD attendance by age/gender
  - Disease morbidity (ICD-10 mapped)
  - Immunization coverage
  - Maternal health indicators
  - Pharmaceutical consumption
- Preview report before submission
- Submission via DHIS2 API or manual export
- Acknowledgment tracking

---

#### KE-MGT-004 [Phase 4] [Sprint 4.3]: AI-Powered Resource Optimization

**As a** management/administrator,  
**I want** AI insights for resource optimization,  
**So that** facility operations are data-driven.

**Acceptance Criteria:**
- Predicts:
  - Patient no-show rates for appointment scheduling
  - Stock consumption for procurement planning
  - Staff scheduling recommendations based on patient volumes
- Dashboards with actionable recommendations
- Model accuracy metrics displayed
- Data privacy compliant; no PII in analytics

---

### 4.2 IT Administrator

System maintenance, security, and infrastructure management.

---

#### KE-ITA-001 [Phase 0] [Sprint 0.4]: System Monitoring

**As an** IT administrator,  
**I want to** monitor system performance,  
**So that** downtime is minimized.

**Acceptance Criteria:**
- Access to observability tools:
  - Prometheus metrics (CPU, memory, DB connections)
  - Grafana dashboards
  - Log aggregation (Loki)
- Alerting for:
  - High resource usage
  - API errors spike
  - Database connection issues
  - Sync queue backlog
- Can manage backups, updates via Docker/Kubernetes
- Health check endpoint: `GET /api/health/`

---

#### KE-ITA-002 [Phase 0] [Sprint 0.4]: Security Policy Enforcement

**As an** IT administrator,  
**I want to** enforce security policies,  
**So that** data is protected according to Kenya DPA.

**Acceptance Criteria:**
- Can configure:
  - Password policies (complexity, expiry)
  - Session timeout settings
  - IP allowlist/denylist
  - Two-factor authentication (2FA)
- Can run DPIA reports
- Can manage user accounts and roles (RBAC)
- Security scan integration (Bandit for Python)
- Incident response playbook accessible

---

#### KE-ITA-003 [Phase 1] [Sprint 1.2]: User and Role Management

**As an** IT administrator,  
**I want to** manage users, roles, and permissions,  
**So that** access control is properly enforced.

**Acceptance Criteria:**
- Can create, deactivate, reset user accounts
- Can assign roles with predefined permission sets:
  - Doctor, Nurse, Pharmacist, Cashier, Receptionist, Admin, etc.
- Can create custom roles for facility-specific needs
- Can grant/revoke sensitive patient access permission
- All changes logged in AuditLog
- Password reset via email or admin override

---

### 4.3 Part-time / Locum Staff

Temporary access for contract workers.

---

#### KE-LOC-001 [Phase 1] [Sprint 1.2]: Temporary Role-Based Access

**As** part-time/locum staff,  
**I want** temporary role-based access,  
**So that** I can perform duties without full admin rights.

**Acceptance Criteria:**
- Account created with expiration date
- Permissions mirror primary role (e.g., Locum Doctor has Doctor permissions)
- Auto-deactivated after expiry
- Cannot access historical records beyond assigned period
- All actions audited with locum flag

---

#### KE-LOC-002 [Phase 1] [Sprint 1.2]: Quick Onboarding

**As** part-time/locum staff,  
**I want** quick onboarding,  
**So that** I can start work immediately.

**Acceptance Criteria:**
- Self-service account activation with OTP verification
- Mobile app and desktop app support
- Guided tour of key features on first login
- Access to help documentation
- Emergency contact for system issues

---

## 5. Community Health (Phase 3)

### 5.1 MCH Nurse / Midwife / Pediatrician

Maternal and child health specialists focusing on ANC, immunizations, and child growth.

---

#### KE-MCH-001 [Phase 3] [Sprint 3.1]: MCH Client Enrollment

**As an** MCH nurse/midwife,  
**I want to** enroll pregnant women and children in the MCH module,  
**So that** I can track their care journey from registration to follow-up.

**Acceptance Criteria:**
- Captures key details:
  - Pregnant women: Expected delivery date, gravida/parity, HIV status, blood group
  - Children: Birth weight, birth date, HIV exposure status, mother linkage
- Offline mobile app support for rural/community enrollment
- Auto-syncs to central system with conflict resolution
- Integrates with patient management for unique MRN linkage
- Consent captured for data sharing
- Auto-flags high-risk cases (HIV-exposed, high-risk pregnancy) with privacy restrictions

---

#### KE-MCH-002 [Phase 3] [Sprint 3.1]: Antenatal and Postnatal Visit Tracking

**As an** MCH nurse/midwife or pediatrician,  
**I want to** track antenatal and postnatal visits,  
**So that** care is compliant with national guidelines (4+ ANC visits).

**Acceptance Criteria:**
- Schedules visits based on gestational age with reminders
- Tracks attendance and outcomes:
  - Ultrasounds, supplements, HIV testing, blood tests
- Records standardized data (fundal height, fetal heart rate) with LOINC coding
- Links to SHA for free maternity claims under Linda Jamii program
- Auto-generates billing exemptions for Linda Jamii beneficiaries
- FHIR export for sharing with other facilities
- Missed visit alerts for defaulter tracing

---

#### KE-MCH-003 [Phase 3] [Sprint 3.2]: KEPI Immunization Schedule Management

**As an** MCH nurse/midwife or pediatrician,  
**I want to** manage immunization schedules and records,  
**So that** children receive timely vaccinations per KEPI program.

**Acceptance Criteria:**
- Displays personalized schedule based on KEPI:
  | Age | Vaccines |
  |-----|----------|
  | Birth | BCG, OPV0, HepB-Birth |
  | 6 weeks | Penta1, RV1, PCV1, OPV1 |
  | 10 weeks | Penta2, RV2, PCV2, OPV2 |
  | 14 weeks | Penta3, IPV, RV3, PCV3, OPV3 |
  | 9 months | MR1, Yellow Fever (endemic areas) |
  | 18 months | MR2 |
  | 6/12/18 months | Vitamin A supplements |
- Offline logging in mobile app; syncs to KHIS for Penta3 coverage reporting
- Integrates with pharmacy for:
  - Vaccine stock checks before administration
  - Batch/lot number recording
  - Expiration alerts (prevents expired vaccine administration)
- AEFI (Adverse Event Following Immunization) reporting:
  - Standardized forms
  - Notification to national authorities
  - Linkage to patient records for follow-up
- Audit logs for accountability
- Anonymized aggregates for RMNCAH scorecard
- FHIR-compliant Immunization resource for interoperability

---

#### KE-MCH-004 [Phase 3] [Sprint 3.2]: Child Growth and HIV-Exposed Infant Follow-up

**As an** MCH nurse/midwife or pediatrician,  
**I want to** monitor child growth and HIV-exposed infant follow-up,  
**So that** early interventions can be made.

**Acceptance Criteria:**
- Tracks growth metrics:
  - Weight-for-age (with Z-score calculation)
  - Height/length-for-age
  - Head circumference
  - Mid-upper arm circumference (MUAC)
- WHO growth charts displayed with percentile lines
- Malnutrition alerts (moderate/severe acute malnutrition)
- HIV-exposed infant follow-up:
  - PCR test scheduling at 6 weeks, 9 months
  - ARV prophylaxis tracking
  - Final HIV status determination
- Mobile app supports community outreach
- Compliant with Kenya DPA; HIV data restricted to authorized users

---

#### KE-MCH-005 [Phase 4] [Sprint 4.2]: AI Risk Predictions for MCH

**As an** MCH nurse/midwife or pediatrician,  
**I want** AI-powered risk predictions,  
**So that** I can identify high-risk pregnancies or child health issues early.

**Acceptance Criteria:**
- Analyzes trends (ANC data, vitals, lab results) to flag risks:
  - Preeclampsia risk
  - Gestational diabetes
  - Preterm labor risk
  - Child malnutrition trajectory
- Accuracy >85% in validation testing
- Dashboard shows predictions with confidence levels
- Integrates with alerts for proactive referrals
- Data processing adheres to Kenya DPA; no external sharing without consent
- Scalable for national AI health initiatives

---

### 5.2 Community Health Worker (CHW) / Community Health Promoter (CHP)

Frontline workers bridging communities and health facilities.

---

#### KE-CHW-001 [Phase 3] [Sprint 3.3]: Community Mobilization for Immunization

**As a** CHW/CHP,  
**I want to** educate and mobilize communities for immunizations,  
**So that** vaccine hesitancy is reduced and coverage improves.

**Acceptance Criteria:**
- Mobile app provides multilingual educational resources on KEPI vaccines
- Can record community engagement events (barazas, household visits)
- Syncs outcomes to KHIS for community health indicators
- Integrates with SMS reminders for vaccination due dates
- Forward-looking: AI-suggested tailored messages based on local hesitancy patterns
- Data anonymized for privacy

---

#### KE-CHW-002 [Phase 3] [Sprint 3.3]: Defaulter Tracing and Referral

**As a** CHW/CHP,  
**I want to** trace and refer immunization defaulters,  
**So that** children complete their vaccination schedules.

**Acceptance Criteria:**
- Dashboard flags defaulters based on KEPI timelines
- Generates household visit lists with contact information
- Offline mobile logging of follow-up visits
- Can record reasons for default (e.g., migration, refusal, illness)
- Referral to facility syncs via FHIR
- Tracks success rates (linkage to clinic completion)
- Role-based access: Limited to community-level data; sensitive info redacted

---

#### KE-CHW-003 [Phase 3] [Sprint 3.4]: Field Data Collection

**As a** CHW/CHP,  
**I want to** record basic health data in the field,  
**So that** information is captured at point of service.

**Acceptance Criteria:**
- Supports logging during outreach:
  - Campaign vaccinations (e.g., OPV during polio campaigns)
  - Growth monitoring (MUAC screening)
  - Pregnancy identification and referral
- Offline mode with GPS coordinates (if consented)
- Photo verification option for campaign accountability
- Auto-syncs to central HMIS
- Links to AEFI reporting if adverse event observed
- Batch tracking for administered vaccines

---

#### KE-CHW-004 [Phase 3] [Sprint 3.4]: Community-Level Reporting

**As a** CHW/CHP,  
**I want** integrated reporting tools,  
**So that** community-level data informs facility planning.

**Acceptance Criteria:**
- Generates simple reports:
  - Coverage by village/community unit
  - Defaulter counts and follow-up status
  - Barrier analysis (reasons for non-vaccination)
- Mobile dashboards for real-time insights
- Exports to KHIS for community health indicators
- Anonymized aggregates for national dashboards
- Forward-looking: Predictive analytics for outbreak risk based on coverage gaps

---

## 6. External Stakeholders

### 6.1 Regulator

Access national-level aggregated data for oversight.

---

#### KE-REG-001 [Phase 2] [Sprint 2.3]: Aggregated Health Reports

**As a** regulator,  
**I want** aggregated reports from facilities,  
**So that** I can oversee national health metrics.

**Acceptance Criteria:**
- KHIS-compliant exports with mandatory indicators
- Anonymized data only (no PII)
- Secure access via authenticated FHIR API
- Audited downloads with purpose documentation
- Configurable report periods (weekly, monthly, quarterly)
- Dashboard for cross-facility comparison

---

### 6.2 Patient (Passive Role)

Benefits from the system indirectly through improved care.

---

#### KE-PAT-001 [Phase 0] [Sprint 0.4]: Data Privacy and Consent

**As a** patient,  
**I want** my data to be secure and private,  
**So that** my information is protected.

**Acceptance Criteria:**
- Consent prompts at registration with clear explanation of data use
- Right to view what data is stored about me (data subject access)
- Right to revoke consent (does not delete historical treatment records)
- Breach notifications if applicable per Kenya DPA
- No unauthorized access; all access logged
- Sensitive conditions (HIV, GBV, Mental Health) have extra protection

---

#### KE-PAT-002 [Phase 2] [Sprint 2.4]: Appointment Reminders (SMS/USSD)

**As a** patient,  
**I want to** receive appointment reminders,  
**So that** I don't miss my scheduled visits.

**Acceptance Criteria:**
- SMS reminders sent 24 hours before appointment
- USSD option for feature phone users
- Language preference respected (English, Swahili)
- Can opt-out of reminders
- Phone number verified at registration

---

#### KE-PAT-003 [Phase 3] [Sprint 3.2]: Immunization Reminders for Children

**As a** parent/guardian,  
**I want to** receive immunization reminders for my children,  
**So that** they receive timely vaccinations.

**Acceptance Criteria:**
- Automated SMS reminders based on KEPI schedule
- Reminder includes: child name, vaccine due, facility location
- Follow-up reminder if visit missed
- Can update phone number via facility visit
- Multilingual support

---

## 7. Error and Edge Case Stories

These stories address system behavior in exceptional situations.

---

#### KE-ERR-001 [Phase 1]: Sensitive Patient Access Denial

**As a** clinician without sensitive access permission,  
**When** I attempt to access a patient flagged as sensitive (HIV/GBV/Mental Health),  
**Then** I receive a clear error message: "Access Denied: This patient record requires special authorization"  
**And** the attempt is logged in AuditLog with action `sensitive_access_denied`

---

#### KE-ERR-002 [Phase 1]: Drug Allergy Warning Override

**As a** pharmacist,  
**When** I attempt to dispense a medication that conflicts with patient's known allergies,  
**Then** I see a prominent warning with allergy details  
**And** I can override only with documented clinical reason  
**And** override is logged with reason for audit

---

#### KE-ERR-003 [Phase 1]: Offline Sync Conflict Resolution

**As a** nurse who entered vitals offline,  
**When** my data conflicts with another user's entry for the same encounter,  
**Then** I see a conflict resolution interface showing both versions  
**And** I can choose: Keep Mine, Keep Theirs, or Merge  
**And** resolution is logged with strategy used

---

#### KE-ERR-004 [Phase 1]: Duplicate Patient Detection

**As a** receptionist registering a new patient,  
**When** the system detects potential duplicates (same name + DOB, or same national ID),  
**Then** I see a warning with matching patient records  
**And** I can choose to: Use Existing Record, or Create New (with justification)  
**And** decision is logged in AuditLog

---

#### KE-ERR-005 [Phase 1]: Expired Medication Prevention

**As a** pharmacist,  
**When** I attempt to dispense from an expired batch,  
**Then** the system blocks the transaction  
**And** displays error: "Cannot dispense: Batch {number} expired on {date}"  
**And** suggests alternative batches if available

---

#### KE-ERR-006 [Phase 1]: Session Timeout Handling

**As a** user with an idle session,  
**When** my session times out after configured period (default: 30 minutes),  
**Then** I am redirected to login with message "Session expired for security"  
**And** any unsaved work is preserved locally for recovery after re-login

---

## 8. Non-Functional Requirements

### Performance

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| KE-NFR-001 | Patient search response time | <2 seconds | 95th percentile with 100K+ records |
| KE-NFR-002 | Encounter save time | <1 second | Average response time |
| KE-NFR-003 | Report generation | <30 seconds | Complex monthly reports |
| KE-NFR-004 | Concurrent users per facility | 50+ | Without degradation |
| KE-NFR-005 | Mobile app launch time | <3 seconds | Cold start on mid-range device |

### Availability

| ID | Requirement | Target |
|----|-------------|--------|
| KE-NFR-006 | Offline capability | 100% core features available offline |
| KE-NFR-007 | Sync latency | <5 minutes after connectivity restored |
| KE-NFR-008 | Desktop app uptime | 99.9% (standalone mode) |
| KE-NFR-009 | Cloud backend uptime | 99.5% (planned maintenance excluded) |

### Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| KE-NFR-010 | Data at rest encryption | Fernet (AES-128) for national_id, phone_number |
| KE-NFR-011 | Data in transit encryption | TLS 1.3 for all API calls |
| KE-NFR-012 | Password policy | Min 8 chars, complexity required, 90-day expiry |
| KE-NFR-013 | Session management | JWT tokens, 30-minute idle timeout |
| KE-NFR-014 | Audit retention | 7 years per Kenya DPA 2019 |

### Compliance

| ID | Requirement | Standard |
|----|-------------|----------|
| KE-NFR-015 | Data protection | Kenya Data Protection Act 2019 |
| KE-NFR-016 | Health data interoperability | FHIR R4 |
| KE-NFR-017 | Terminology standards | ICD-10, LOINC, SNOMED CT (where applicable) |
| KE-NFR-018 | National reporting | KHIS/DHIS2 mandatory indicators |
| KE-NFR-019 | Claims processing | SHA tariff compliance |

### Usability

| ID | Requirement | Target |
|----|-------------|--------|
| KE-NFR-020 | Training time for basic tasks | <4 hours for clinical staff |
| KE-NFR-021 | Error message clarity | Plain language, actionable guidance |
| KE-NFR-022 | Accessibility | WCAG 2.1 AA compliance |
| KE-NFR-023 | Language support | English, Swahili (extensible) |

---

## 9. Traceability Matrix

### API Endpoint Mapping

| Story ID | Primary API Endpoint | Model(s) | Test File |
|----------|---------------------|----------|-----------|
| KE-DOC-001 | `GET /api/patients/` | `Patient` | `test_patient_api.py` |
| KE-DOC-002 | `POST /api/encounters/` | `Encounter`, `Diagnosis` | `test_encounter_api.py` |
| KE-REC-001 | `POST /api/patients/` | `Patient` | `test_patient_api.py` |
| KE-REC-002 | `POST /api/patients/{id}/emergency-contacts/` | `EmergencyContact` | `test_emergency_contact_api.py` |
| KE-NRS-002 | `GET /api/encounters/{id}/` | `Encounter` | `test_vitals_alerts.py` |
| KE-IPD-001 | `PATCH /api/encounters/{id}/recommend-admission/` | `Encounter`, `AdmissionRecommendation` | `test_admission_api.py` |
| KE-IPD-002 | `POST /api/admissions/` | `Admission`, `Ward`, `Bed` | `test_admission_api.py` |
| KE-IPD-003 | `GET /api/wards/`, `GET /api/wards/{id}/beds/` | `Ward`, `Bed` | `test_ward_api.py` |
| KE-IPD-005 | `POST /api/admissions/{id}/rounds/` | `WardRound` | `test_ward_round_api.py` |
| KE-IPD-006 | `GET/PATCH /api/admissions/{id}/kardex/` | `NursingKardex` | `test_kardex_api.py` |
| KE-IPD-008 | `POST /api/admissions/{id}/transfer/` | `Transfer` | `test_transfer_api.py` |
| KE-IPD-009 | `POST /api/admissions/{id}/discharge/` | `Discharge` | `test_discharge_api.py` |
| KE-PHM-001 | `GET /api/pharmacy/drugs/` | `Drug`, `StockBatch` | `test_pharmacy_api.py` |
| KE-PHM-002 | `POST /api/pharmacy/dispensing/` | `Prescription`, `Dispensing` | `test_dispensing_api.py` |
| KE-LAB-001 | `GET /api/laboratory/orders/` | `LabOrder`, `LabOrderItem` | `test_lab_api.py` |
| KE-LAB-002 | `POST /api/laboratory/results/` | `LabResult` | `test_lab_results_api.py` |
| KE-MGT-002 | `GET /api/auditlogs/` | `AuditLog` | `test_audit_api.py` |
| KE-CSH-001 | `POST /api/billing/payments/` | `Payment` | `test_billing_api.py` |

### Permission Mapping

| Story ID | Required Permission(s) |
|----------|----------------------|
| KE-DOC-001 | `patients.view_patient`, `encounters.view_encounter` |
| KE-DOC-002 | `encounters.add_encounter` |
| KE-REC-001 | `patients.add_patient` |
| KE-IPD-001 | `admissions.recommend_admission` |
| KE-IPD-002 | `admissions.add_admission` |
| KE-IPD-003 | `wards.view_ward`, `wards.manage_beds` |
| KE-IPD-005 | `admissions.add_wardround` |
| KE-IPD-006 | `admissions.view_kardex`, `admissions.update_kardex` |
| KE-IPD-008 | `admissions.transfer_patient` |
| KE-IPD-009 | `admissions.discharge_patient` |
| KE-PHM-002 | `pharmacy.dispense_medication` |
| KE-LAB-002 | `laboratory.add_labresult` |
| KE-MGT-002 | `core.view_auditlog` (admin only) |
| Sensitive access | `patients.view_sensitive_patient` |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **ANC** | Antenatal Care - healthcare during pregnancy |
| **AEFI** | Adverse Event Following Immunization |
| **CHW/CHP** | Community Health Worker/Promoter |
| **DPIA** | Data Protection Impact Assessment |
| **FHIR** | Fast Healthcare Interoperability Resources (HL7 standard) |
| **KEML** | Kenya Essential Medicines List |
| **KEPI** | Kenya Expanded Programme on Immunization |
| **KHIS** | Kenya Health Information System (DHIS2-based) |
| **Linda Jamii** | Government free maternity program |
| **LOINC** | Logical Observation Identifiers Names and Codes |
| **LOS** | Length of Stay - duration from admission to discharge |
| **MCH** | Maternal and Child Health |
| **MRN** | Medical Record Number |
| **OPD** | Outpatient Department |
| **IPD** | Inpatient Department |
| **Kardex** | Nursing reference document for inpatient care plans and handover |
| **RMNCAH** | Reproductive, Maternal, Newborn, Child, and Adolescent Health |
| **SHA** | Social Health Authority (Kenya's health insurer) |
| **SyncQueue** | Local queue for offline data pending synchronization |
| **Ward Round** | Daily clinical review of inpatients by doctors |

---

## Appendix B: Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 2025 | Engineering Lead | Initial draft |
| 2.0 | Jan 2, 2026 | Engineering Lead | Complete restructure: Added story IDs (KE prefix), Given-When-Then format, implemented feature coverage, NFRs, traceability matrix, error cases, missing roles |
| 2.1 | Jan 2, 2026 | Engineering Lead | Added IPD section (KE-IPD-001 to KE-IPD-010): Admission workflow, bed management, ward rounds, Kardex, discharge. Based on consultant stakeholder feedback |

---

*Document maintained by Nexora Africa Ltd Engineering Team*
