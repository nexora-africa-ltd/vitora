# Vitora HMIS — Modules Reference

> **Last Updated**: July 2026
> **Location**: `backend/hmis/apps/` (40 Django apps)

---

## Overview

Vitora HMIS uses a modular-monolith architecture. Each module is a Django app with its own models, serializers, views, and URL routes. All clinical and administrative models inherit from `FacilityScopedModel` or `OrganizationScopedModel` for multi-tenant isolation.

---

## Module Categories

### Core Platform

| Module | Description | Key Models |
|--------|-------------|------------|
| **core** | Authentication, RBAC, audit logging, locations hierarchy, offline sync, domain events, notifications | `AuditLog`, `SyncQueue`, `SyncConflict`, `County`, `SubCounty`, `Ward`, `Department`, `Role`, `StaffProfile`, `Notification` |
| **scheduling** | Staff shifts, roster management, appointments, resources, time slots, assignment rules | `Resource`, `TimeSlot`, `Schedule`, `Appointment`, `AssignmentRule`, `Shift`, `StaffConstraint`, `ShiftSwapRequest` |
| **checkin** | Patient check-in kiosk and self-service registration | `CheckIn`, `CheckInStateHistory` |
| **comments** | Clinical comments with @mentions and reactions (polymorphic, attaches to encounters, orders, admissions) | `ClinicalComment`, `CommentReaction` |
| **licensing** | Desktop hub license activation, check-in, release management | `Installation`, `ReleaseManifest`, `CheckInLog` |

### Clinical

| Module | Description | Key Models |
|--------|-------------|------------|
| **patients** | Patient registration, MRN generation (MRN-YYYYMMDD-XXXX), demographics, medical history | `Patient`, `EmergencyContact` |
| **encounters** | Clinical visits, vitals, diagnosis (ICD-10/ICD-11), treatment plans, medications | `ICD10Code`, `Encounter`, `Diagnosis`, `TreatmentPlan`, `Medication`, `ChronicCondition`, `FamilyHistory` |
| **triage** | KETA triage scale (RED/ORANGE/YELLOW/GREEN/BLUE), priority queues, vital thresholds | `WaitingQueue`, `TriageVitalThreshold`, `TriageAssessment`, `TriageQueue`, `ERBed` |
| **clinics** | 8 clinic types (OPD, ANC, PNC, CWC, FP, IMMUNIZATION, TB, HIV), sessions, visits, enrollments | `Clinic`, `ClinicRoom`, `ClinicSchedule`, `ClinicStaff`, `ClinicSession`, `ClinicVisit`, `ClinicEnrollment` |
| **clinical_templates** | Reusable treatment plan templates | `ClinicalTemplate` |
| **cds** | Clinical Decision Support rules engine and alerts | `CDSRule`, `CDSAlert` |
| **sick_notes** | Medical certificate / sick note generation | `SickNote` |

### Pharmacy & Supply Chain

| Module | Description | Key Models |
|--------|-------------|------------|
| **pharmacy** | Drug formulary, prescriptions, dispensing (FEFO), walk-in customers | `Drug`, `Prescription`, `PrescriptionItem`, `DispenseRecord`, `DispenseItem`, `WalkInCustomer` |
| **inventory** | Medical supplies procurement, goods receipt, stock transfers, ward stock | `Supplier`, `PurchaseOrder`, `GoodsReceiptNote`, `StoreLocation`, `StockTransfer`, `WardStock` |

### Laboratory

| Module | Description | Key Models |
|--------|-------------|------------|
| **laboratory** | Lab orders, specimens, results, instruments, analyzer integrations, diagnostic reports | `TestCatalog`, `LabOrder`, `LabOrderItem`, `Specimen`, `LabResult`, `Instrument`, `AnalyzerRun`, `DiagnosticReport` |

### Inpatient & Procedures

| Module | Description | Key Models |
|--------|-------------|------------|
| **inpatient** | Wards, beds, admissions, discharges, ward rounds, nursing notes, bed transfers | `Ward`, `Bed`, `Admission`, `Discharge`, `WardRound`, `InpatientMedication`, `NursingNote`, `BedTransfer` |
| **theatre** | Operating theatres, surgery cases, operative notes, anesthesia records, PACU | `OperatingTheatre`, `SurgeryCase`, `SurgicalTeamMember`, `OperativeNote`, `PACURecord`, `AnesthesiaRecord` |
| **procedures** | Non-surgical clinical procedures, team members, consumables | `ProcedureCatalog`, `ProcedureOrder`, `ProcedureReport`, `ProcedureConsumable`, `ProcedureTeamMember` |

### Diagnostics & Imaging

| Module | Description | Key Models |
|--------|-------------|------------|
| **imaging** | DICOM/PACS integration, radiology orders, walk-in imaging | `ImagingProcedure`, `WalkInImagingPatient` |
| **dialysis** | Dialysis sessions, vascular access tracking | `VascularAccess`, `DialysisOrder`, `DialysisSession` |
| **blood_bank** | Blood donations, units, cross-matching, requests, issuance | `BloodDonor`, `BloodUnit`, `BloodRequest`, `CrossMatch`, `BloodIssue` |

### Finance & Insurance

| Module | Description | Key Models |
|--------|-------------|------------|
| **billing** | Invoices, payments, M-Pesa integration, receipts, credit notes, SHA claims & tariffs | `ServiceCategory`, `Service`, `Invoice`, `InvoiceItem`, `Payment`, `Receipt`, `SHAClaim`, `SHATariff`, `SHAMember`, `PreauthRequest` |
| **insurance** | Private payer management, policies, claims, preauths, remittances | `InsuranceProvider`, `InsurancePlan`, `PatientInsurance`, `InsuranceClaim`, `InsurancePreauth`, `InsuranceRemittance` |

### Public Health

| Module | Description | Key Models |
|--------|-------------|------------|
| **surveillance** | IDSR weekly reporting, IHR notifications, outbreak alerts, case investigations | `NotifiableDisease`, `CaseInvestigation`, `SurveillanceAlert`, `MOH502Report` |
| **mch** | Maternal & Child Health: ANC, delivery, PNC, labour partograph, growth monitoring | `MCHRegistration`, `ANCVisit`, `Delivery`, `LabourPartograph`, `PNCVisit`, `GrowthMeasurement` |
| **immunizations** | KEPI schedule, adult vaccinations, campaigns, AEFI reporting | `VaccineDefinition`, `VaccineCampaign`, `ImmunizationRecord`, `AEFI` |

### Allied Health

| Module | Description | Key Models |
|--------|-------------|------------|
| **allied_health** | Umbrella coordination app for all allied health disciplines (combined dashboard) | *(No unique models — aggregates from sub-disciplines)* |
| **physiotherapy** | Physiotherapy orders, assessments, treatment sessions | `PhysiotherapyTreatmentType`, `PhysiotherapyOrder`, `PhysiotherapySession` |
| **occupational_therapy** | OT assessments, treatment types, sessions | `OTTreatmentType`, `OTAssessment`, `OTSession` |
| **nutrition** | Nutrition screening, dietetics consultations | `NutritionConsultation` |
| **social_work** | Social work referrals, case management, interventions | `SocialWorkReferral`, `SocialWorkCase`, `CaseNote`, `SocialWorkIntervention` |
| **counselling** | Counselling types, referrals, session records | `CounsellingType`, `CounsellingReferral`, `CounsellingSession` |

### Quality & Referrals

| Module | Description | Key Models |
|--------|-------------|------------|
| **quality** | Quality improvement measures, quarterly/annual reporting | `QuarterlyReport`, `AnnualReport`, `QualityMeasure`, `QualityMeasureResult` |
| **referrals** | Inter-facility clinical referrals with acceptance workflow | `ClinicalReferral` |

### AI & Intelligence

| Module | Description | Key Models |
|--------|-------------|------------|
| **ai** | TibaBot AI integration: clinical chat, ICD-10 suggestions, care plans, lab interpretation, discharge assessment, ICU risk prediction | `TibaBotFacilityKey`, `ChatSession`, `ChatMessage` |
| **analytics** | Business intelligence, facility dashboards, diagnosis trends, demographic snapshots | `FacilityDailySummary`, `DepartmentMonthlySummary`, `DiagnosisTrend`, `PatientDemographicSnapshot` |

### Interoperability

| Module | Description | Key Models |
|--------|-------------|------------|
| **hl7** | HL7v2 ADT messaging endpoints and message logging | `HL7Endpoint`, `HL7Message` |
| **kenhdd** | Kenya Health Data Dictionary schema validation | `KENHDDDataElement`, `KENHDDValidationRun`, `KENHDDFailedRecord` |
| **moh_reporting** | MOH statutory returns (MOH 705, 711, 717) with DHIS2 mapping | `MOH705Report`, `MOH705DiseaseRow`, `MOH711Report`, `MOH717Report`, `MOHDataElementMapping` |

---

## Module Dependencies

```
core ──────────► patients ──────► encounters ──────► triage
  │                  │                 │                │
  │                  │                 ├──► laboratory  │
  │                  │                 ├──► pharmacy    │
  │                  │                 ├──► billing     │
  │                  │                 ├──► imaging     │
  │                  │                 └──► inpatient   │
  │                  │                                  │
  ├──► scheduling    ├──► clinics                       │
  ├──► checkin       └──► referrals                     │
  └──► licensing                                        │
                                                        │
billing ──────► insurance                               │
billing ──────► sha (DHA HIE)                           │
                                                        │
encounters ──► mch                                      │
encounters ──► surveillance                             │
encounters ──► procedures                               │
encounters ──► theatre                                  │
```

---

## Adding a New Module

1. Create the app: `python manage.py startapp {name} hmis/apps/{name}`
2. Add to `INSTALLED_APPS` in `hmis/settings/base.py`
3. Inherit models from `FacilityScopedModel` or `OrganizationScopedModel`
4. Register URL routes in `hmis/urls.py`
5. Wire domain events in `signals.py` (see `docs/domain-events.md`)
6. Create tests in `tests/{name}/`
7. Update this document

---

## Related Documentation

| Document | Covers |
|----------|--------|
| `docs/api-reference.md` | Full API endpoint reference |
| `docs/domain-events.md` | Event catalog and signal wiring |
| `docs/multitenancy.md` | Scoping rules and isolation |
| `docs/architecture-diagrams.md` | Visual architecture diagrams |
