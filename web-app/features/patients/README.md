# Patients Module - Gherkin Feature Files

This directory contains Behavior-Driven Development (BDD) feature files for the Vitora HMIS Patients Module, covering patient registration, search, outpatient (OPD), inpatient (IPD), and queue management workflows for Kenya's healthcare context.

## Feature Files

| File | Description | Scenarios |
|------|-------------|-----------|
| [patient-registration.feature](./patient-registration.feature) | Patient registration with Kenya location hierarchy | ~55 |
| [patient-search.feature](./patient-search.feature) | Patient search, lookup, and quick actions | ~50 |
| [outpatient-opd.feature](./outpatient-opd.feature) | OPD encounters, vitals, diagnoses, treatment | ~65 |
| [inpatient-ipd.feature](./inpatient-ipd.feature) | Admissions, ward management, discharge | ~60 |
| [patient-queue.feature](./patient-queue.feature) | Queue management across departments | ~50 |

**Total Scenarios**: ~280

## Patient Journey Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        PATIENT JOURNEY - OPD                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. ARRIVAL          2. REGISTRATION       3. TRIAGE            4. CONSULTATION│
│  ┌─────────┐         ┌─────────┐          ┌─────────┐          ┌─────────┐     │
│  │ Patient │  ───▶   │Reception│   ───▶   │  Nurse  │   ───▶   │ Doctor  │     │
│  │ Arrives │         │  Desk   │          │ Station │          │  Room   │     │
│  └─────────┘         └─────────┘          └─────────┘          └─────────┘     │
│       │                   │                    │                    │          │
│       │              MRN Generated        Vitals Taken        Diagnosis Made   │
│       │              Consent Given        Queue Assigned      Orders Placed    │
│                                                                                 │
│  ─────┴───────────────────┴────────────────────┴────────────────────┴─────────▶│
│                                                                                 │
│  5. LABORATORY       6. PHARMACY          7. BILLING           8. DEPARTURE    │
│  ┌─────────┐         ┌─────────┐          ┌─────────┐          ┌─────────┐     │
│  │   Lab   │  ───▶   │Dispensing│  ───▶   │ Cashier │   ───▶   │ Patient │     │
│  │ Station │         │ Counter │          │  Desk   │          │ Leaves  │     │
│  └─────────┘         └─────────┘          └─────────┘          └─────────┘     │
│       │                   │                    │                    │          │
│  Samples Taken       Meds Dispensed      Payment Made         Follow-up       │
│  Results Entered     Stock Updated       Receipt Issued       Scheduled       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Key Features

### Patient Registration
- **Auto-generated MRN**: Format `MRN-YYYYMMDD-XXXX`
- **Kenya Location Hierarchy**: 47 Counties → 289 Sub-Counties → 1448 Wards
- **Data Encryption**: National ID and phone numbers encrypted with Fernet
- **Consent Management**: Kenya DPA 2019 compliant consent capture
- **Emergency Contacts**: Multiple contacts with relationship tracking
- **Duplicate Detection**: Warns on matching National ID or phone

### Outpatient (OPD)
- **Vitals with Alerts**: SpO2 < 95% triggers hypoxemia alert
- **ICD-10 Diagnoses**: Searchable diagnosis codes
- **Clinical Templates**: Pre-defined treatment protocols
- **Allergy Checking**: Drug-allergy interaction alerts
- **Prescription Generation**: Direct link to pharmacy
- **Admission Recommendation**: OPD to IPD transition

### Inpatient (IPD)
- **Ward Management**: Medical, Surgical, Pediatric, Maternity, ICU, Isolation
- **Bed Tracking**: Real-time occupancy with status (Available, Occupied, Maintenance)
- **Nursing Kardex**: Care plans, orders, shift notes
- **Ward Rounds**: Daily clinical documentation
- **Shift Handover**: Structured nurse handover process
- **Discharge Planning**: Checklist-based discharge workflow

### Queue Management
- **Priority Levels**: Emergency, Urgent, Pregnant, Elderly, Standard
- **Department Queues**: Reception, Triage, OPD, Lab, Pharmacy, Cashier
- **Display Screens**: Public queue displays with audio
- **Wait Time Tracking**: SLA compliance monitoring
- **Auto-advance**: Automatic queue progression

## Tags Reference

### Feature Tags
- `@patients` - All patient-related scenarios
- `@registration` - Patient registration
- `@search` - Patient search and lookup
- `@opd` / `@outpatient` - Outpatient workflows
- `@ipd` / `@inpatient` - Inpatient workflows
- `@queue` - Queue management

### Workflow Tags
- `@encounter` - Clinical encounters
- `@vitals` - Vital signs capture
- `@diagnosis` - ICD-10 diagnosis
- `@admission` - Inpatient admission
- `@discharge` - Patient discharge
- `@transfer` - Ward transfers
- `@kardex` - Nursing kardex
- `@rounds` - Ward rounds
- `@handover` - Shift handover

### Priority Tags
- `@smoke` - Critical path scenarios
- `@emergency` - Emergency workflows
- `@priority` - Queue prioritization

### Quality Tags
- `@offline` - Offline functionality
- `@sync` - Data synchronization
- `@validation` - Input validation
- `@audit` - Audit trail
- `@security` - Security scenarios
- `@a11y` - Accessibility

## MRN Format

Medical Record Numbers follow this format:

```
MRN-YYYYMMDD-XXXX

Example: MRN-20260107-0042

- MRN: Prefix
- YYYYMMDD: Date of registration
- XXXX: Sequential number for that day (0001-9999)
```

## Kenya Location Hierarchy

```
COUNTY (47 total)
    └── Examples: Nairobi, Mombasa, Kisumu, Nakuru
        │
        ▼
SUB-COUNTY (289 total)
    └── Cascading: Only shows sub-counties for selected county
        │
        ▼
WARD (1448 total) - Optional
    └── Cascading: Only shows wards for selected sub-county
        │
        ▼
VILLAGE/STREET (Free text) - Optional
```

## Vital Signs Validation

| Vital | Unit | Normal Range | Warning | Critical |
|-------|------|--------------|---------|----------|
| Temperature | °C | 36.1-37.2 | >38.5, <36 | >40, <35 |
| Pulse | BPM | 60-100 | >120, <50 | >150, <40 |
| Blood Pressure | mmHg | 120/80 | >140/90 | >180/110 |
| Respiratory Rate | /min | 12-20 | >24, <10 | >30, <8 |
| SpO2 | % | 95-100 | 92-94 | <92 |

## Encounter Status Flow

### OPD Encounter
```
CREATED → IN_PROGRESS → COMPLETED
                    ↓
            ADMISSION_PENDING → (to IPD)
```

### IPD Admission
```
PENDING → ADMITTED → DISCHARGED
              ↓
          TRANSFERRED
```

## Queue Priority Order

| Priority | Color | Order | Criteria |
|----------|-------|-------|----------|
| Emergency | 🔴 Red | 1 | Life-threatening |
| Urgent | 🟠 Orange | 2 | Needs prompt attention |
| Pregnant | 🟣 Purple | 3 | Pregnant patients |
| Elderly | 🔵 Blue | 4 | Age 65+ |
| Child | 🟢 Green | 5 | Age < 5 |
| Standard | ⚪ White | 6 | Default priority |

Within each priority level, patients are ordered by wait time (longest first).

## Running Tests

### Using Playwright with Cucumber

```bash
# Run all patient feature tests
npm run test:e2e -- --grep "@patients"

# Run only smoke tests
npm run test:e2e -- --grep "@patients @smoke"

# Run specific feature
npm run test:e2e -- features/patients/outpatient-opd.feature

# Run inpatient scenarios
npm run test:e2e -- --grep "@ipd"

# Run queue management tests
npm run test:e2e -- --grep "@queue"
```

## Mapping to Components

| Feature | Component Path |
|---------|---------------|
| patient-registration | `components/patients/RegistrationForm.tsx` |
| patient-search | `components/patients/PatientSearch.tsx` |
| outpatient-opd | `components/encounters/OPDEncounter.tsx` |
| inpatient-ipd | `components/inpatient/AdmissionForm.tsx` |
| patient-queue | `components/queue/QueueDashboard.tsx` |

## Mapping to Backend API

| Feature | API Endpoints |
|---------|--------------|
| Registration | `POST /api/patients/` |
| Search | `GET /api/patients/?search={query}` |
| Locations | `GET /api/locations/counties/`, `/sub-counties/`, `/wards/` |
| Emergency Contacts | `GET/POST /api/patients/{id}/emergency-contacts/` |
| Encounters | `GET/POST /api/encounters/` |
| ICD-10 Search | `GET /api/encounters/icd10/?search={term}` |
| Admissions | `GET/POST /api/admissions/` |
| Wards/Beds | `GET /api/wards/`, `GET /api/wards/{id}/beds/` |
| Queue | `GET/POST /api/queue/` |

## Sensitive Patient Handling

Patients flagged as sensitive (HIV, GBV, Mental Health):

1. `is_sensitive = True` on patient record
2. Hidden from users without `patients.view_sensitive_patient` permission
3. Access logged to audit trail
4. Special consent requirements

## Data Encryption

Encrypted fields (Fernet AES-128):
- `national_id`
- `phone_number`

## Compliance Requirements

### Kenya Data Protection Act 2019
- 7-year retention for patient records
- Consent capture at registration
- Audit trail on all access
- Right to access/delete (with limitations)

### KHIS/DHIS2 Reporting
- Encounter data feeds reports
- ICD-10 diagnosis codes
- Facility statistics

## Document Information

| Field | Value |
|-------|-------|
| **Version** | 1.0 |
| **Created** | January 7, 2026 |
| **Last Updated** | January 7, 2026 |
| **Sprint** | 1.1-1.6 |
| **Status** | ✅ Complete |

## Related Documentation

- [Ideal Patient Flow](../../../docs/ideal-patient-flow.md)
- [User Stories](../../../docs/user-stories.md)
- [Sprint 1.1-1.2 Deliverables](../../../docs/sprint-1.1-1.2-deliverables.md)
- [Sprint 1.5-1.6 Track D - Inpatient](../../../docs/sprint-1.5-1.6-track-d-inpatient-deliverables.md)
