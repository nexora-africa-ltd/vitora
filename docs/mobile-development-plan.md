# Vitora HMIS — Mobile App Development Plan

**Version**: 1.1  
**Date**: March 11, 2026  
**Platform**: React Native (Expo 54) + Expo Router  
**Backend**: Django REST API (900+ tests, 82%+ coverage)  
**Primary User**: Clinicians, nurses, CHWs at bedside and in the field  

---

## Table of Contents

1. [Current State (Baseline)](#current-state-baseline)
2. [Phase 1: Clinical Core Completion](#phase-1-clinical-core-completion-weeks-14)
3. [Phase 2: Lab & Pharmacy](#phase-2-support-modules--lab--pharmacy-weeks-58)
4. [Phase 3: Offline-First & Sync](#phase-3-offline-first--data-resilience-weeks-912)
5. [Phase 4: Inpatient & Nursing](#phase-4-inpatient--specialized-workflows-weeks-1316)
6. [Phase 5: Billing, SHA & Security](#phase-5-billing-sha--compliance-weeks-1720)
7. [Phase 6: MCH & Field Outreach](#phase-6-field-outreach--mch-weeks-2124)
8. [Phase 7: Testing, Polish & Release](#phase-7-polish-testing--release-weeks-2528)
9. [Cross-Cutting Concerns](#cross-cutting-concerns-all-phases)
10. [Risk Register](#risk-register)
11. [Summary Timeline](#summary-timeline)

---

## Current State (Baseline)

### What Exists

| Layer | Status |
|-------|--------|
| JWT sign-in with runtime backend URL config | Done |
| Dashboard (patient/encounter metrics, quick actions) | Done |
| Patient list, detail, create (Kenya location cascade) | Done |
| Encounter list, detail, create, edit (vitals, history, SOAP) | Done |
| Diagnosis CRUD (free-text, type, certainty) | Done |
| Treatment plan create/update (clinical notes, referrals) | Done |
| Encounter workflow actions (start progress, finalize, cancel) | Done |
| ICD-10 diagnosis search and picker | Done |
| Triage assessment (KETA workflow) | Done |
| Patient check-in flow | Done |
| Offline draft persistence for **new and edit** encounter forms (AsyncStorage) | Done |
| Settings tab (logout, backend URL) | Done |

### Architecture

- **Navigation**: 4-tab layout — Dashboard, Patients, Encounters, Settings, with stack routes for check-in and encounter triage/edit flows
- **Data fetching**: Zod-validated API client with `parseResponse()` + `@tanstack/react-query`
- **Design system**: `app-ui.tsx` (HeroCard, SectionCard, MetricCard, Pill, AppButton, AppTextInput, AppPicker, etc.)
- **Theme**: "Vitora Sand" background (`#F4EFE5`), teal primary (`#0F766E`), orange accent (`#E08A5C`)

### Gap Analysis

| Module | Web App | Mobile | Priority |
|--------|---------|--------|----------|
| Encounter status transitions (finalize/cancel/start progress) | Full state machine | Implemented for core mobile actions; generic transition UI still limited | P0 |
| ICD-10/ICD-11 diagnosis search | Full integration | ICD-10 search and selection implemented; ICD-11 remains absent | P0 |
| Triage (KETA-based) | Full module | Implemented | P0 |
| Check-in flow | Full module | Implemented with triage or direct-clinic routing | P0 |
| Laboratory (orders, results) | Full workflow | **Missing** | P1 |
| Pharmacy (prescriptions, dispensing) | Full workflow | **Missing** | P1 |
| Offline-first with local DB | N/A (web is online-only) | Planned, not wired | P1 |
| Inpatient (wards, beds, admissions) | Full module | **Missing** | P2 |
| Billing (invoices, payments) | Full module | **Missing** | P2 |
| SHA eligibility checks | 15 DHA APIs | **Missing** | P2 |
| Surveillance (IDSR, IHR) | Advanced | **Missing** | P3 |
| MCH (ANC, PNC, immunization) | Dedicated module | **Missing** | P3 |
| Biometric auth (FaceID/TouchID) | N/A | **Missing** | P2 |
| Camera (wound photos, documents) | N/A | **Missing** | P3 |
| Push notifications | N/A | **Missing** | P3 |
| RBAC / staff management | Full admin | **Missing** | P4 (web-only) |

---

## Phase 1: Clinical Core Completion (Weeks 1–4)

> **Goal**: Make mobile clinically functional for OPD consultations end-to-end. A clinician can check in a patient, triage, consult, diagnose with ICD codes, document treatment, and close the encounter from mobile. Prescription and dispensing workflows remain part of Phase 2.

### Phase 1 Status

**Overall status**: Core Phase 1 implementation is in place.

**Verification completed**:
- `npm run typecheck` passes
- `npm run lint` passes
- Targeted Jest coverage passes for check-in API, triage API, and ICD-10 picker selection

**Residual validation gaps before broad rollout**:
- No automated UI/integration coverage yet for encounter status actions (`Start progress`, `Finalize visit`, `Cancel encounter`)
- No automated restart-flow test for edit draft restore and clear behavior
- Generic encounter `transition()` support exists in the API client, but the mobile UI currently exposes only the core actions needed for consultation flow

### 1.1 Encounter Workflow Actions (Week 1)

**Scope**: Enable clinicians to finalize, cancel, and transition encounter status from mobile.

**Implementation status**: Complete for the core encounter workflow.

**Implemented**:
- Added `finalize()`, `cancel()`, `startProgress()`, and `transition()` to the encounter API client
- Built encounter detail action buttons for `Start progress`, `Finalize visit`, and `Cancel encounter`
- Added status guard helpers including `canFinalize()`, `canCancel()`, and `canStartProgress()`
- Added confirmation dialogs and backend-aware finalize guidance before destructive or terminal actions
- Invalidates encounter, encounter list, triage, dashboard, and patient encounter queries after successful mutations

**Notes**:
- The generic `transition()` client method is available for future workflow expansion, but the current screen intentionally exposes only the core consultation actions

**Files to touch**:
- `lib/api/encounters.ts` — new action methods
- `lib/types/encounter.ts` — action response types
- `lib/encounters.ts` — guard helpers
- `app/encounters/[id].tsx` — action buttons section

### 1.2 ICD-10 Diagnosis Search (Week 1)

**Scope**: Replace free-text-only diagnosis input with searchable ICD-10 code picker.

**Implementation status**: Complete.

**Implemented**:
- Added `searchICD10(query)` to the encounter API client with paginated Zod validation
- Built reusable `ICD10Picker` with debounced search and selectable results
- Integrated the picker into the encounter edit diagnosis form while preserving free-text fallback
- Shows ICD-10 code badges in encounter detail and edit views

**Notes**:
- Mobile currently uses ICD-10 only; ICD-11 support remains out of scope for Phase 1

**Files to touch**:
- `lib/api/encounters.ts` — `searchICD10()` method
- `lib/types/encounter.ts` — `ICD10Code` type
- `lib/schemas/encounter.schema.ts` — `ICD10CodeSchema`
- `components/icd10-picker.tsx` — new reusable picker component
- `app/encounters/[id]/edit.tsx` — integrate picker into diagnosis form

### 1.3 Triage Assessment (Week 2)

**Scope**: Add triage recording with Kenya Emergency Triage Assessment (KETA) acuity levels.

**Implementation status**: Complete.

**Implemented**:
- Built triage API client with list, encounter lookup, create, and complete actions
- Added triage types and Zod schemas for assessments, alerts, vitals, and KETA levels
- Created encounter-linked triage screen with KETA acuity capture and completion workflow
- Shows triage acuity badges on encounter cards and summary/detail sections
- Validates vitals and GCS ranges client-side before posting to the backend

**Notes**:
- The mobile triage flow supports both manual category override and completion of an existing triage record

**Files to touch**:
- `lib/api/triage.ts` — new API client
- `lib/types/triage.ts` — `TriageAssessment`, `TriageLevel`, `TriageVitals`
- `lib/schemas/triage.schema.ts` — Zod schemas
- `app/encounters/[id]/triage.tsx` — triage assessment screen
- `app/encounters/[id].tsx` — triage badge on detail view
- `app/_layout.tsx` — register route

### 1.4 Check-In Flow (Week 2)

**Scope**: Quick patient check-in that creates an encounter and optionally starts triage.

**Implementation status**: Complete.

**Implemented**:
- Built check-in API client with patient search, patient lookup, and encounter creation
- Created check-in screen with patient search, clinical snapshot, visit context, and routing controls
- Supports routing to triage or directly to an active clinic with immediate post-check-in navigation
- Added `Check-in patient` quick action to the dashboard
- Added `Start consultation` shortcut on patient detail that deep-links into check-in with the patient preselected

**Files to touch**:
- `lib/api/checkin.ts` — new client
- `lib/types/checkin.ts` — `CheckInRequest`, `CheckInResponse`
- `lib/schemas/checkin.schema.ts` — Zod schemas
- `app/checkin.tsx` — check-in screen
- `app/(tabs)/index.tsx` — dashboard quick action
- `app/patients/[id].tsx` — consultation shortcut
- `app/_layout.tsx` — register route

### 1.5 Edit Draft Persistence (Week 1)

**Scope**: Extend offline draft storage to encounter **edit** forms, not just new encounters.

**Implementation status**: Complete.

**Implemented**:
- Added `saveEditDraft(encounterId, form)`, `getEditDraft(encounterId)`, `clearEditDraft(encounterId)`, and `hasEditDraft(encounterId)` to draft storage
- Wired 250ms debounced auto-save into encounter edit state
- Restores local draft state on editor re-entry and clears it after successful encounter saves or explicit discard
- Shows an `Unsaved changes` section on encounter detail when a local draft exists

**Files to touch**:
- `lib/encounter-draft-storage.ts` — edit draft methods
- `app/encounters/[id]/edit.tsx` — wire draft persistence
- `app/encounters/[id].tsx` — unsaved changes indicator

### Exit / Acceptance Criteria — Phase 1

| # | Criterion | Status | Verification |
|---|-----------|--------|-------------|
| 1 | Clinician can finalize and cancel encounters from mobile | Implemented | Mobile encounter detail exposes `Finalize visit` and `Cancel encounter` actions with guarded confirmations |
| 2 | Status guards prevent invalid transitions | Implemented | Guard helpers and backend-aware error mapping prevent invalid actions from appearing or succeeding silently |
| 3 | Diagnoses can be searched and selected from ICD-10 codes | Verified | Targeted Jest test covers ICD-10 search results and selection |
| 4 | Free-text diagnosis still works as fallback | Implemented | Edit flow allows saving diagnosis with free text only when no ICD-10 code is selected |
| 5 | Triage assessment can be recorded with KETA acuity levels | Verified | Triage screen, schema, validation, and targeted API test are in place |
| 6 | Patient can be checked in from dashboard | Verified | Dashboard quick action routes into check-in; targeted API test covers check-in payload and response handling |
| 7 | Edit form state survives app restart | Implemented, manual verification still advised | Edit drafts are auto-saved locally and restored on re-entry; no automated restart-flow test exists yet |
| 8 | `npm run typecheck` passes with zero errors | Verified | Local verification completed |
| 9 | `npm run lint` passes with zero warnings | Verified | Local verification completed |
| 10 | All new API methods use Zod-validated `parseResponse()` | Verified | Encounter, triage, and check-in clients validate responses through Zod schemas |
| 11 | Encounter detail shows triage badge and ICD-10 codes on diagnoses | Implemented | Encounter list/detail render triage badges and ICD-10 diagnosis pills |

### Phase 1 Decision

**Recommendation**: Safe to proceed to Phase 2.

**Why this is safe**:
- The planned Phase 1 implementation is present in the mobile app and the core flows compile and lint cleanly
- Targeted automated tests cover the new API and ICD-10 search behavior
- Remaining gaps are validation-depth issues, not missing core functionality

**Carry-forward items for early Phase 2**:
- Add UI or integration coverage for encounter workflow actions
- Add a manual or automated restart test for edit-draft persistence
- Decide whether broader encounter state transitions need explicit mobile controls beyond `startProgress`, `finalize`, and `cancel`

---

## Phase 2: Support Modules — Lab & Pharmacy (Weeks 5–8)

> **Goal**: Clinicians can order labs, view results, and prescribe medications during consultations. Pharmacists and lab techs get focused mobile interfaces for their workflows.

### 2.1 Laboratory Orders & Results (Weeks 5–6)

**Scope**: Order-to-result lab workflow accessible from encounter and as standalone module.

**Tasks**:
- Build lab API client (orders CRUD, results retrieval, result verification)
- Define lab types + Zod schemas matching backend serializers (`LabOrder`, `LabResult`, `LabTest`, `LabCategory`)
- Create order screen from encounter (pick tests from categories, add clinical notes, urgency)
- Build results list view with status badges (Pending, In Progress, Completed, Verified)
- Build result detail view with reference ranges and abnormal value highlighting
- Add "Lab Orders" section to encounter detail screen

**Files to touch**:
- `lib/api/laboratory.ts` — new client
- `lib/types/laboratory.ts` — `LabOrder`, `LabResult`, `LabTest`, etc.
- `lib/schemas/laboratory.schema.ts` — Zod schemas
- `app/laboratory/index.tsx` — order/result list
- `app/laboratory/[id].tsx` — result detail
- `app/laboratory/new.tsx` — create order
- `app/encounters/[id].tsx` — lab orders section
- `app/_layout.tsx` — register routes

### 2.2 Pharmacy — Prescriptions & Dispensing (Weeks 7–8)

**Scope**: Prescribe-to-dispense workflow for clinicians and pharmacists.

**Tasks**:
- Build pharmacy API client (prescriptions, dispensing, stock lookup, drug search)
- Prescription creation from encounter treatment plan
- Dispensing screen for pharmacist role (scan or search prescription → record quantities)
- Stock availability check before dispensing (show warning if low/out of stock)
- Prescription list with status (Pending, Partially Dispensed, Fully Dispensed, Cancelled)

**Files to touch**:
- `lib/api/pharmacy.ts` — new client
- `lib/types/pharmacy.ts` — `Prescription`, `Dispensation`, `DrugProduct`, `StockLevel`
- `lib/schemas/pharmacy.schema.ts` — Zod schemas
- `app/pharmacy/index.tsx` — dispensing queue
- `app/pharmacy/[id].tsx` — prescription detail + dispense
- `app/encounters/[id].tsx` — prescriptions section

### 2.3 Navigation Restructure (Week 5)

**Scope**: Accommodate new modules without crowding the bottom tab bar.

**Tasks**:
- Add 5th tab: "More" (overflow hub for Lab, Pharmacy, and Settings)
- Move Settings from tab to "More" screen
- Keep bottom tabs at max 5 items for thumb reach on small screens

**Files to touch**:
- `app/(tabs)/_layout.tsx` — restructure tab definitions
- `app/(tabs)/more.tsx` — module launcher grid

### Exit / Acceptance Criteria — Phase 2

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Lab orders can be created from encounter with test selection | Encounter → Order Lab → select tests → submit → order appears |
| 2 | Lab results display with reference ranges | View result → values shown with normal/abnormal ranges |
| 3 | Abnormal results are visually highlighted | Result with out-of-range value → red/warning badge |
| 4 | Prescriptions can be created from treatment plan | Treatment plan → Add prescription → drug search → save |
| 5 | Pharmacist can dispense and record quantities | Pharmacy queue → select prescription → record dispensed qty |
| 6 | Stock availability checked before dispensing | Dispense item with zero stock → warning shown |
| 7 | Navigation accommodates Lab + Pharmacy without clutter | 5 tabs max, "More" tab opens module grid |
| 8 | `npm run typecheck` and `npm run lint` pass | CI/local verification |
| 9 | All new API methods use `parseResponse()` with Zod schemas | Code review |

---

## Phase 3: Offline-First & Data Resilience (Weeks 9–12)

> **Goal**: Mobile works without internet. Patient lookup, encounter capture, and critical workflows function fully offline with automatic sync when connectivity returns.

### 3.1 Local Database Setup (Week 9)

**Scope**: Install, configure, and seed local database for offline data access.

**Tasks**:
- Install and configure WatermelonDB (or Expo SQLite as fallback)
- Define local schemas mirroring backend models (patients, encounters, diagnoses, treatment plans)
- Build database provider component wrapping the app
- Implement initial data seed: pull all accessible records from API on first launch
- Test database survives app updates (schema migration path)

**Files to touch**:
- `lib/db/schema.ts` — local schema definitions
- `lib/db/models/patient.ts`, `encounter.ts`, `diagnosis.ts` — model classes
- `lib/db/index.ts` — database instance and provider
- `app/_layout.tsx` — wrap with database provider

### 3.2 Sync Engine (Weeks 10–11)

**Scope**: Bidirectional sync with conflict resolution and status reporting.

**Tasks**:
- Implement pull sync: fetch changes from server since last sync timestamp (`modified_after` param)
- Implement push sync: send locally-created/modified records to server
- Conflict resolution: server-wins by default, with conflict queue for manual review
- Background sync triggered by NetInfo connectivity change events
- Sync status indicator in app header/footer (syncing / synced / offline / conflict)
- Sync progress bar and error reporting with retry
- Debounce sync triggers to avoid hammering the server

**Files to touch**:
- `lib/sync/engine.ts` — core sync orchestrator
- `lib/sync/pull.ts` — server → local
- `lib/sync/push.ts` — local → server
- `lib/sync/conflicts.ts` — conflict detection and resolution
- `lib/sync/status.ts` — sync state management (React context)
- `components/sync-indicator.tsx` — header badge

### 3.3 Offline Query Layer (Week 12)

**Scope**: Replace API-first data fetching with local-first queries.

**Tasks**:
- Build `useLocalPatients()`, `useLocalEncounters()` hooks that query local DB
- API calls become sync triggers, not primary data sources
- Patient/encounter search queries local database
- Graceful degradation: if API request fails during write, queue locally and sync later

**Files to touch**:
- `lib/hooks/use-local-patients.ts` — offline patient queries
- `lib/hooks/use-local-encounters.ts` — offline encounter queries
- Update all list/detail screens to use local-first hooks

### Exit / Acceptance Criteria — Phase 3

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | App launches and shows patient/encounter data with no internet | Enable airplane mode → open app → data visible |
| 2 | New patient created offline syncs when connectivity returns | Airplane mode → create patient → disable airplane mode → patient appears on server |
| 3 | New encounter created offline syncs when connectivity returns | Same flow as above for encounters |
| 4 | Sync conflicts are detected and queued for resolution | Edit same patient on web + mobile offline → mobile comes online → conflict flagged |
| 5 | Sync status indicator reflects current state | Online shows "Synced", offline shows "Offline", during sync shows spinner |
| 6 | Local database survives app update | Install v1 with data → update to v2 → data still present |
| 7 | Sync does not duplicate records | Create patient offline → sync → sync again → only 1 record on server |
| 8 | Background sync does not drain battery noticeably | 1hr background test → <5% battery delta attributable to sync |
| 9 | `npm run typecheck` and `npm run lint` pass | CI/local verification |

---

## Phase 4: Inpatient & Specialized Workflows (Weeks 13–16)

> **Goal**: Extend mobile to bedside nursing workflows for admitted patients: ward rounds, nursing kardex, bed management, and discharge.

### 4.1 Inpatient Module (Weeks 13–14)

**Scope**: Ward/bed management and admission/discharge flows.

**Tasks**:
- Build inpatient API client (wards, beds, admissions, discharges)
- Ward list with occupancy stats (total beds, available, occupied) and color-coded capacity
- Admission flow: encounter → select ward → check bed availability → assign bed → admit
- Bed board view: visual grid showing bed statuses (Available, Occupied, Reserved, Maintenance)
- Discharge flow: select admission → record discharge summary → update bed to Available

**Files to touch**:
- `lib/api/inpatient.ts` — new client
- `lib/types/inpatient.ts` — `InpatientWard`, `Bed`, `Admission`, `Discharge`
- `lib/schemas/inpatient.schema.ts` — Zod schemas
- `app/inpatient/index.tsx` — ward list
- `app/inpatient/[wardId].tsx` — bed board
- `app/inpatient/admissions/[id].tsx` — admission detail + discharge

### 4.2 Nursing Workflows (Weeks 15–16)

**Scope**: Bedside care documentation for nursing staff.

**Tasks**:
- Nursing kardex: view and update care plan items per shift (medications, observations, interventions)
- Ward round notes: capture clinician notes during rounds per patient
- Vital signs trending: chart vitals over admission duration (simple line chart)
- Fluid balance input and chart (intake/output)
- Medication administration record (MAR): mark medications as given, skipped, or refused

**Files to touch**:
- `lib/api/nursing.ts` — client for kardex, rounds, MAR
- `app/inpatient/nursing/kardex.tsx` — kardex screen
- `app/inpatient/nursing/rounds.tsx` — ward round capture
- `app/inpatient/nursing/mar.tsx` — medication administration
- `components/vitals-chart.tsx` — simple trend chart

### Exit / Acceptance Criteria — Phase 4

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Ward list shows real-time occupancy and bed counts | Ward list → occupancy numbers match actual bed statuses |
| 2 | Patient can be admitted from encounter and assigned a bed | Encounter → Admit → select ward → select bed → admission recorded |
| 3 | Bed board shows correct status for each bed | Bed board matches admission records (occupied beds are green, available are open) |
| 4 | Nursing kardex can be viewed and updated per shift | Open kardex → add item → save → item persisted |
| 5 | Discharge flow completes and frees bed | Discharge → bed status returns to Available |
| 6 | Ward round notes can be recorded per patient | Ward round → select patient → enter notes → save |
| 7 | `npm run typecheck` and `npm run lint` pass | CI/local verification |

---

## Phase 5: Billing, SHA & Compliance (Weeks 17–20)

> **Goal**: Mobile supports billing lookups and SHA eligibility checks. Full billing stays web-primary, but clinicians can check insurance status and view invoice summaries. Security is hardened with biometric auth and session timeout.

### 5.1 Billing Read Access (Week 17)

**Scope**: Read-only invoice and payment viewing from mobile.

**Tasks**:
- Build billing API client (invoice list, detail, payment summary — read-only)
- Invoice list filtered by patient or encounter
- Invoice detail with line items, totals, and payment status
- No invoice creation on mobile (web-only for now)

**Files to touch**:
- `lib/api/billing.ts` — read-only client
- `lib/types/billing.ts` — `Invoice`, `Payment`, `LineItem`
- `lib/schemas/billing.schema.ts` — Zod schemas
- `app/billing/index.tsx` — invoice list
- `app/billing/[id].tsx` — invoice detail

### 5.2 SHA Eligibility Check (Week 18)

**Scope**: Verify patient's SHA insurance coverage before consultation.

**Tasks**:
- Build SHA API client (eligibility verification call)
- Add "Check SHA Eligibility" action on patient detail screen
- Display coverage status badge on patient cards (Covered / Not Covered / Pending)
- Show alert banner if patient is not covered before starting a consultation

**Files to touch**:
- `lib/api/sha.ts` — eligibility client
- `lib/types/sha.ts` — `SHAEligibility`, `CoverageStatus`
- `app/patients/[id].tsx` — eligibility check section

### 5.3 Audit Log Viewer (Week 19)

**Scope**: Read-only audit trail for the current user's own activity.

**Tasks**:
- Build audit log API client (list with user filter, action type filter)
- Create audit log screen in Settings showing current user's actions
- Display action type, resource, timestamp in chronological list

**Files to touch**:
- `lib/api/audit.ts` — read-only client
- `app/settings/audit-log.tsx` — audit log screen

### 5.4 Security Hardening (Week 20)

**Scope**: Biometric auth, session timeout, and secure storage audit.

**Tasks**:
- Biometric authentication (FaceID/TouchID) via `expo-local-authentication`
- Auto-lock after configurable inactivity timeout (default: 5 min)
- Lock screen with biometric or PIN re-authentication
- Certificate pinning for API calls (production builds only)
- Audit all `AsyncStorage` usage — migrate any sensitive data to `SecureStore`

**Files to touch**:
- `lib/auth/biometric.ts` — biometric auth helper
- `lib/auth/session-timeout.ts` — auto-lock logic
- `app/sign-in.tsx` — biometric unlock option
- `app/_layout.tsx` — session timeout wrapper

### Exit / Acceptance Criteria — Phase 5

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Invoice list and detail viewable from mobile | Navigate to Billing → invoices load → tap detail → line items visible |
| 2 | SHA eligibility can be checked from patient detail | Patient detail → Check Eligibility → coverage status shown |
| 3 | Alert shown if patient is not SHA-covered | Uncovered patient → consultation attempt → warning banner displayed |
| 4 | Biometric auth (FaceID/TouchID) works as login option | Enable biometric → lock screen → unlock with fingerprint/face |
| 5 | Session auto-locks after inactivity | Leave app idle 5min → return → lock screen shown |
| 6 | Audit log viewer shows current user's actions | Settings → Audit Log → actions listed chronologically |
| 7 | No sensitive data stored in plain AsyncStorage | Audit `AsyncStorage` keys → tokens/PII only in `SecureStore` |
| 8 | `npm run typecheck` and `npm run lint` pass | CI/local verification |

---

## Phase 6: Field Outreach & MCH (Weeks 21–24)

> **Goal**: Community Health Workers (CHWs) can use mobile for field visits — immunization tracking, antenatal care, and community screening. This is the **primary mobile-specific use case** that web doesn't serve well.

### 6.1 MCH — Antenatal Care (Weeks 21–22)

**Scope**: ANC visit recording, risk assessment, and immunization tracking.

**Tasks**:
- Build MCH API client (ANC visits, risk assessments, birth plans, immunization records)
- ANC visit capture form (gestational age, fundal height, fetal heart rate, weight, BP, urine, blood group)
- ANC visit history timeline per patient
- High-risk pregnancy flagging (age <18 or >35, multiple pregnancy, previous C-section, etc.)
- Immunization schedule display (TT, IPT doses) with administered/due tracking

**Files to touch**:
- `lib/api/mch.ts` — ANC client
- `lib/types/mch.ts` — `ANCVisit`, `BirthPlan`, `ImmunizationRecord`, `RiskFactor`
- `lib/schemas/mch.schema.ts` — Zod schemas
- `app/mch/index.tsx` — MCH patient list
- `app/mch/anc/[id].tsx` — ANC visit detail/capture
- `app/mch/immunization.tsx` — immunization schedule

### 6.2 Community Screening (Weeks 23–24)

**Scope**: Offline field screening with GPS and photo capture.

**Tasks**:
- Build offline screening forms for common conditions (malnutrition, TB contact tracing, malaria RDT)
- GPS location capture for field visits (expo-location)
- Photo capture for wound/condition documentation (expo-camera)
- Batch upload of screening results when connectivity returns
- Community Health Unit (CHU) assignment and territory display

**Files to touch**:
- `lib/api/screening.ts` — screening client
- `app/screening/index.tsx` — screening list
- `app/screening/new.tsx` — screening form
- `components/camera-capture.tsx` — photo capture component
- `lib/location.ts` — GPS helper (permissions, coordinate capture)

### Exit / Acceptance Criteria — Phase 6

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | ANC visits can be recorded with gestational vitals | ANC form → enter fundal height, FHR, gestational age → save → visit recorded |
| 2 | High-risk pregnancies are flagged automatically | Patient age 16 → ANC visit → "High Risk" flag appears |
| 3 | Immunization schedule displays with dose tracking | MCH → Immunization → TT1 given, TT2 due on [date] |
| 4 | GPS coordinates captured and attached to field visits | Screening → GPS icon → coordinates recorded in submission |
| 5 | Photos can be captured and attached to encounters | Screening → Camera → take photo → attached to record |
| 6 | Screening forms work fully offline | Airplane mode → complete screening → save locally → sync when online |
| 7 | CHW can complete a full field visit without internet | End-to-end: patient lookup → screening → ANC → immunization → all offline |
| 8 | `npm run typecheck` and `npm run lint` pass | CI/local verification |

---

## Phase 7: Polish, Testing & Release (Weeks 25–28)

> **Goal**: Production-ready mobile app with comprehensive testing, performance optimization, App Store / Play Store submission, and documentation.

### 7.1 Testing Suite (Weeks 25–26)

**Scope**: Achieve release-quality test coverage across all layers.

**Tasks**:
- Unit tests for all API clients with MSW (Mock Service Worker) for HTTP mocking
- Component tests for shared components using React Native Testing Library
- Integration tests for critical flows (login → check-in → consult → diagnose → finalize)
- E2E tests with Detox or Maestro covering 5 critical paths:
  1. Login → Dashboard
  2. Patient create → verify in list
  3. Encounter create → edit → finalize
  4. Create patient offline → sync → verify on server
  5. Lab order → result viewing
- Offline scenario tests (create offline, sync, verify no duplicates)

**Files to touch**:
- `__tests__/api/` — API client unit tests
- `__tests__/components/` — component tests
- `__tests__/flows/` — integration test scenarios
- `e2e/` — E2E test specs
- `jest.config.js` — test configuration
- `package.json` — test scripts and thresholds

### 7.2 Performance & UX Polish (Week 27)

**Scope**: Optimize for mid-range Android devices common in Kenyan healthcare facilities.

**Tasks**:
- Profile and optimize FlatList rendering (windowSize, maxToRenderPerBatch, getItemLayout)
- Image caching and lazy loading for patient photos / lab images
- Bundle size reduction (tree-shaking, remove unused dependencies)
- Haptic feedback on key actions (expo-haptics: success on save, warning on error)
- Pull-to-refresh on all list screens
- Skeleton loaders replacing spinner-only loading states
- Error boundary with Sentry crash reporting integration
- Splash screen optimization (minimize white flash)

### 7.3 App Store Submission (Week 28)

**Scope**: Submit to Play Store and App Store with all required metadata.

**Tasks**:
- App icons and splash screens for all densities (mdpi through xxxhdpi, 1x through 3x)
- Store metadata: title, descriptions (short + full), screenshots (phone + tablet), keywords
- Privacy policy and data handling declarations (Kenya DPA 2019 compliance statement)
- EAS Build configuration for dev/staging/production profiles
- TestFlight (iOS) and Play Store Internal Testing track deployment
- Address review feedback and resubmit if needed

**Files to touch**:
- `app.json` — version, icons, splash, permissions
- `eas.json` — EAS Build profiles
- `assets/` — icons, splash screens, store screenshots
- `mobile/README.md` — setup, build, and release instructions

### Exit / Acceptance Criteria — Phase 7

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | ≥70% code coverage from unit + integration tests | `npm test -- --coverage` output |
| 2 | E2E tests pass for all 5 critical paths | Detox/Maestro CI run |
| 3 | App launches in <2s on mid-range Android (e.g., Samsung A14) | Stopwatch test on real device |
| 4 | List scrolling at 60fps (no jank) | React Native Perf Monitor — no dropped frames on patient list |
| 5 | Bundle size <25MB (APK) / <50MB (IPA) | EAS build output check |
| 6 | Crash-free rate >99.5% over 48hr internal testing | Sentry dashboard |
| 7 | App Store / Play Store review submitted | Store submission confirmation |
| 8 | Internal testing validated by ≥3 clinicians | Sign-off from clinical advisors |
| 9 | `npm run typecheck`, `npm run lint`, `npm test` all pass | CI green |
| 10 | `mobile/README.md` documents setup, build, test, and release | README review |

---

## Cross-Cutting Concerns (All Phases)

### Accessibility

- All interactive elements have `accessibilityLabel` and `accessibilityRole`
- Minimum touch target: 48×48dp (per Android/iOS guidelines)
- Color contrast meets WCAG AA (4.5:1 ratio for normal text)
- Screen reader tested (VoiceOver on iOS, TalkBack on Android)
- Focus order is logical for form flows

### Internationalization (Stretch)

- Extract all user-facing strings to locale files (`i18n/en.json`, `i18n/sw.json`)
- Support English (primary) and Swahili (secondary)
- Date/number formatting respects device locale

### Analytics & Monitoring

- Sentry for crash reporting and performance monitoring (Phase 7)
- Basic usage analytics: encounters created/day, sync success rate, offline usage %
- No PII in analytics payloads

### CI/CD Pipeline

- GitHub Actions: `npm run typecheck` + `npm run lint` on every PR
- EAS Build: automated builds triggered by tag/branch for dev, staging, production
- Pre-commit hooks: typecheck + lint (husky + lint-staged)
- Store deployment automated via EAS Submit

### Code Quality Gates

Every phase must pass before the next begins:

```
npm run typecheck     # Zero errors
npm run lint          # Zero warnings
npm test              # All tests pass (when test suite exists)
```

---

## Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WatermelonDB complexity / learning curve | High | Medium | Start Phase 1–2 with AsyncStorage cache; migrate to WatermelonDB in Phase 3 only |
| Expo SDK breaking changes | Medium | Low | Pin SDK version; test upgrades in isolation branch |
| Backend API changes break mobile | High | Medium | Zod schema `parseResponse()` catches shape mismatches at runtime before they reach UI |
| Performance on low-end Android | High | Medium | Profile rendering from Phase 1; optimize FlatList early; lazy-load heavy screens |
| App Store rejection | Medium | Low | Follow Apple/Google guidelines strictly; test on real devices; prepare privacy declarations early |
| Offline sync data loss | Critical | Low | Idempotent sync operations; conflict queue; local SQLite backup before push |
| Scope creep per phase | High | High | Exit criteria checklists enforce phase boundaries; no next-phase work until current checklist complete |
| Clinician adoption resistance | Medium | Medium | Involve 3+ clinical advisors as testers from Phase 1; iterate on feedback each phase |

---

## Summary Timeline

| Phase | Weeks | Focus | Key Deliverable |
|-------|-------|-------|-----------------|
| **1** | 1–4 | Clinical Core | OPD consultation end-to-end (check-in → triage → diagnose → finalize) |
| **2** | 5–8 | Lab & Pharmacy | Order-to-result, prescribe-to-dispense |
| **3** | 9–12 | Offline-First | Local database + bidirectional sync engine |
| **4** | 13–16 | Inpatient | Ward management, nursing kardex, discharge |
| **5** | 17–20 | Billing & Security | SHA eligibility, biometric auth, session security |
| **6** | 21–24 | MCH & Field | ANC visits, immunization tracking, community screening |
| **7** | 25–28 | Release | Test suite, performance polish, App Store submission |

**Total**: 28 weeks (7 months) from Phase 1 kickoff to store submission.
