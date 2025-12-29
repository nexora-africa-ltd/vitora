# Sprint 0.1 Task 3: MVP Scope and Acceptance Criteria

**Document Version**: 1.0
**Date**: December 27, 2025
**Status**: APPROVED
**Sprint**: 0.1 (Weeks 1-2)
**Phase**: Phase 0 - Inception & Readiness

---

## Executive Summary

This document defines the Minimum Viable Product (MVP) scope for the Vitora HMIS Phase 0 prototype and establishes concrete acceptance criteria for successful completion. The MVP focuses on proving the offline-first architecture with core patient management capabilities.

### MVP Goal
Deliver a functional standalone desktop application that demonstrates offline-first patient management with the ability to register patients, record basic encounters, and sync data when connectivity is available.

---

## MVP Scope Definition

### What's IN Scope (Phase 0 MVP)

#### 1. Core Infrastructure
- ✅ **Desktop Application** (Electron-based)
  - Cross-platform support (Windows, macOS, Linux)
  - Embedded Django backend (runs locally)
  - Standalone operation (no internet required)
  - System tray integration for status monitoring

- ✅ **Backend Foundation** (Django)
  - Patient model with MRN generation
  - Encounter model with vitals
  - SQLite database (local, encrypted)
  - REST API endpoints (patient CRUD, encounter CRUD)
  - Authentication (local admin user)

- ✅ **Frontend** (Next.js embedded in Electron)
  - Patient registration form
  - Patient search/list view
  - Patient details view
  - Encounter creation form (vitals entry)
  - Encounter history view
  - Offline indicator

#### 2. Patient Management
- ✅ **Patient Registration**
  - Required fields: First name, Last name, Date of birth, Gender
  - Optional fields: National ID, Phone number
  - Automatic MRN generation (format: MRN-YYYYMMDD-XXXX)
  - Consent tracking (checkbox with timestamp)
  - Sensitive flag for special cases

- ✅ **Patient Search**
  - Search by MRN (exact match)
  - Search by name (partial match)
  - Search by national ID (exact match)
  - Results displayed in table/list
  - Click to view details

#### 3. Encounter Management
- ✅ **Vitals Recording**
  - Temperature (°C)
  - Blood Pressure (systolic/diastolic)
  - Pulse (bpm)
  - Respiratory Rate (breaths/min)
  - Weight (kg)
  - Height (cm)
  - Automatic BMI calculation

- ✅ **Clinical Documentation**
  - Chief complaint (required)
  - Diagnosis (optional)
  - Treatment plan (optional)
  - Encounter timestamp (auto-generated)
  - Encounter type (OPD/Emergency)

#### 4. Offline Functionality
- ✅ **Local Data Storage**
  - All data stored in local SQLite database
  - Works completely offline
  - No cloud dependency for core operations

- ✅ **Data Persistence**
  - Patient data persists across app restarts
  - Encounter data persists across app restarts
  - No data loss on app closure

#### 5. Security Baseline
- ✅ **Database Encryption**
  - SQLCipher for encrypted SQLite database
  - Local encryption key management

- ✅ **Access Control**
  - Single admin user (username/password)
  - Login required on app start
  - Session timeout after 30 minutes inactivity

- ✅ **Audit Logging**
  - All patient records include created_at, updated_at timestamps
  - Track who created/modified records (created_by, updated_by)

#### 6. Testing Infrastructure
- ✅ **TDD Setup**
  - Pytest configured and running
  - Test coverage reporting (≥80% target)
  - Ruff linter configured
  - Black formatter configured

- ✅ **Core Tests**
  - Patient model tests (MRN generation, validation)
  - Encounter model tests (vitals validation)
  - API endpoint tests (CRUD operations)
  - E2E tests (patient registration, vitals entry)

---

### What's OUT of Scope (Phase 0 MVP)

The following features are explicitly OUT of scope for the Phase 0 prototype and will be addressed in later phases:

#### Deferred to Phase 1
- ❌ Pharmacy/inventory management
- ❌ Billing and invoicing
- ❌ M-Pesa integration
- ❌ Mobile app (React Native)
- ❌ Cloud sync functionality
- ❌ Multi-user support (beyond single admin)
- ❌ Role-based access control (RBAC)
- ❌ Lab results module
- ❌ Printing (prescriptions, receipts)

#### Deferred to Phase 2+
- ❌ SHA claims integration
- ❌ KHIS/DHIS2 reporting
- ❌ Theatre management
- ❌ Advanced inventory
- ❌ MCH/Immunization
- ❌ DICOM/Imaging
- ❌ AI/ML features

#### Explicitly Not Included
- ❌ Multiple clinic/site support
- ❌ Cloud backend infrastructure
- ❌ Production deployment tooling
- ❌ Training materials (Phase 1)
- ❌ User documentation (Phase 1)
- ❌ FHIR API (Phase 4)

---

## Acceptance Criteria

### Must-Have Criteria (PASS/FAIL)

All of the following criteria must be met for the MVP to be considered complete:

#### AC-1: Desktop Application Installation
- [ ] **GIVEN** a Windows/macOS/Linux computer
- [ ] **WHEN** user downloads and installs the Vitora HMIS desktop app
- [ ] **THEN** the app installs without errors
- [ ] **AND** the app launches successfully
- [ ] **AND** the local Django backend starts automatically
- [ ] **AND** the user sees a login screen

**Test Method**: Manual installation on 3 platforms (Windows 10+, macOS 11+, Ubuntu 22.04+)

#### AC-2: User Authentication
- [ ] **GIVEN** the app is running and showing login screen
- [ ] **WHEN** user enters correct admin credentials
- [ ] **THEN** user is authenticated successfully
- [ ] **AND** user sees the main dashboard/patient list
- [ ] **WHEN** user enters incorrect credentials
- [ ] **THEN** user sees an error message
- [ ] **AND** login fails

**Test Method**: Automated E2E test + manual verification

#### AC-3: Patient Registration (Happy Path)
- [ ] **GIVEN** authenticated user is on patient registration page
- [ ] **WHEN** user enters valid patient data (first name, last name, DOB, gender)
- [ ] **AND** clicks "Register Patient"
- [ ] **THEN** patient is created with auto-generated MRN
- [ ] **AND** patient appears in patient list
- [ ] **AND** MRN follows format MRN-YYYYMMDD-XXXX
- [ ] **AND** success message is displayed

**Test Method**: Automated E2E test

#### AC-4: Patient Registration (Validation)
- [ ] **GIVEN** user is on patient registration page
- [ ] **WHEN** user leaves required fields empty
- [ ] **THEN** validation errors are shown
- [ ] **AND** patient is NOT created
- [ ] **WHEN** user enters invalid DOB (future date)
- [ ] **THEN** validation error is shown
- [ ] **AND** patient is NOT created

**Test Method**: Automated unit tests + E2E tests

#### AC-5: Patient Search Functionality
- [ ] **GIVEN** database contains 10 patients
- [ ] **WHEN** user searches by exact MRN
- [ ] **THEN** correct patient is returned
- [ ] **WHEN** user searches by partial name (e.g., "john")
- [ ] **THEN** all matching patients are returned
- [ ] **WHEN** user searches for non-existent patient
- [ ] **THEN** "No results found" message is displayed

**Test Method**: Automated integration tests

#### AC-6: Encounter Creation with Vitals
- [ ] **GIVEN** user has selected a patient
- [ ] **WHEN** user creates a new encounter
- [ ] **AND** enters vitals (temperature: 37.5, BP: 120/80, pulse: 75)
- [ ] **AND** enters chief complaint
- [ ] **AND** saves the encounter
- [ ] **THEN** encounter is created and linked to patient
- [ ] **AND** vitals are saved correctly
- [ ] **AND** encounter appears in patient's encounter history
- [ ] **AND** BMI is calculated if height/weight provided

**Test Method**: Automated E2E test

#### AC-7: Vitals Validation
- [ ] **GIVEN** user is entering vitals for an encounter
- [ ] **WHEN** user enters temperature > 45°C or < 30°C
- [ ] **THEN** warning/error is shown (out of normal range)
- [ ] **WHEN** user enters pulse > 200 or < 30
- [ ] **THEN** warning/error is shown
- [ ] **WHEN** user enters negative values
- [ ] **THEN** validation error prevents saving

**Test Method**: Automated unit tests

#### AC-8: Offline Functionality
- [ ] **GIVEN** app is running with no internet connection
- [ ] **WHEN** user registers a new patient
- [ ] **THEN** patient is created successfully in local database
- [ ] **AND** no errors occur due to lack of internet
- [ ] **WHEN** user creates an encounter
- [ ] **THEN** encounter is saved successfully in local database
- [ ] **WHEN** user closes and reopens the app (still offline)
- [ ] **THEN** all data is still present and accessible

**Test Method**: Manual testing with network disabled

#### AC-9: Data Persistence
- [ ] **GIVEN** app is running with 5 patients and 10 encounters
- [ ] **WHEN** user closes the app
- [ ] **AND** reopens the app
- [ ] **THEN** all 5 patients are still present
- [ ] **AND** all 10 encounters are still present
- [ ] **AND** no data has been lost

**Test Method**: Automated integration test

#### AC-10: Database Encryption
- [ ] **GIVEN** app has been running and storing data
- [ ] **WHEN** tester inspects the SQLite database file directly
- [ ] **THEN** data is encrypted (not readable as plain text)
- [ ] **WHEN** tester attempts to open DB without encryption key
- [ ] **THEN** access is denied or data is unreadable

**Test Method**: Manual security test

#### AC-11: Test Coverage
- [ ] **GIVEN** all code has been written
- [ ] **WHEN** pytest runs with coverage reporting
- [ ] **THEN** overall test coverage is ≥ 80%
- [ ] **AND** Patient model coverage is ≥ 95%
- [ ] **AND** Encounter model coverage is ≥ 95%
- [ ] **AND** API endpoints coverage is ≥ 90%

**Test Method**: Automated coverage report via pytest-cov

#### AC-12: Code Quality
- [ ] **GIVEN** all code has been written
- [ ] **WHEN** Ruff linter runs
- [ ] **THEN** zero critical errors
- [ ] **AND** less than 10 warnings
- [ ] **WHEN** Black formatter runs
- [ ] **THEN** all code is properly formatted

**Test Method**: Automated via CI/CD

---

### Should-Have Criteria (NICE-TO-HAVE)

These are desirable but not required for MVP acceptance:

#### SH-1: Performance
- [ ] Patient registration completes in < 1 second
- [ ] Patient search returns results in < 500ms
- [ ] Encounter creation completes in < 1 second
- [ ] App startup time < 10 seconds

#### SH-2: Usability
- [ ] Forms have clear labels and placeholders
- [ ] Error messages are user-friendly
- [ ] Navigation is intuitive (breadcrumbs, back buttons)
- [ ] Keyboard shortcuts work (Enter to submit, Esc to cancel)

#### SH-3: Accessibility
- [ ] Forms are keyboard-navigable
- [ ] Focus indicators are visible
- [ ] Color contrast meets WCAG 2.1 AA standards
- [ ] Screen reader compatible

---

## MVP User Stories

### Epic 1: Patient Management

#### US-1.1: Register New Patient
**As a** clinic receptionist
**I want to** register a new patient in the system
**So that** I can track their medical records

**Acceptance Criteria**:
- Can enter patient demographics
- MRN is auto-generated
- Can mark patient as sensitive (HIV, GBV)
- Can record consent

#### US-1.2: Search for Existing Patient
**As a** clinic staff member
**I want to** search for an existing patient
**So that** I can access their records quickly

**Acceptance Criteria**:
- Can search by MRN, name, or national ID
- Results display immediately
- Can click result to view patient details

#### US-1.3: View Patient Details
**As a** clinician
**I want to** view a patient's complete information
**So that** I can provide informed care

**Acceptance Criteria**:
- Can see all demographics
- Can see encounter history
- Can see recent vitals

### Epic 2: Encounter Management

#### US-2.1: Record Patient Vitals
**As a** nurse
**I want to** record patient vitals during consultation
**So that** the doctor has current health indicators

**Acceptance Criteria**:
- Can enter all standard vitals
- System validates ranges
- Vitals are timestamped
- BMI is auto-calculated

#### US-2.2: Document Clinical Encounter
**As a** doctor
**I want to** document a patient consultation
**So that** there's a record of the visit

**Acceptance Criteria**:
- Can record chief complaint
- Can record diagnosis
- Can record treatment plan
- Encounter is linked to patient

#### US-2.3: Review Encounter History
**As a** clinician
**I want to** view a patient's past encounters
**So that** I can understand their medical history

**Acceptance Criteria**:
- Encounters displayed chronologically
- Can view vitals from past encounters
- Can view notes from past encounters

### Epic 3: Offline Operation

#### US-3.1: Work Without Internet
**As a** rural clinic staff member
**I want to** use the system without internet
**So that** I can continue working during outages

**Acceptance Criteria**:
- All core functions work offline
- No error messages about connectivity
- Data is saved locally

---

## Success Metrics

### Quantitative Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Test Coverage | ≥ 80% | pytest-cov report |
| Patient Registration Time | < 2 minutes | User observation |
| App Startup Time | < 10 seconds | Automated test |
| Bug Count (Critical) | 0 | Bug tracker |
| Bug Count (High) | < 5 | Bug tracker |
| Bug Count (Medium) | < 15 | Bug tracker |
| Offline Uptime | 100% | Manual testing |
| Data Persistence Rate | 100% | Automated tests |

### Qualitative Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Code Readability | Good | Code review |
| Documentation Quality | Complete | Doc review |
| UX Intuitiveness | Easy to use | User feedback |
| Installation Ease | Simple | Install test |

---

## Demo Scenarios

For the Phase 0 demo to stakeholders, the following scenarios will be demonstrated:

### Demo Scenario 1: New Patient Registration (3 minutes)
1. Launch desktop app
2. Login as admin
3. Navigate to "Register New Patient"
4. Enter patient details (Jane Doe, 1990-05-15, Female, National ID)
5. Mark consent as given
6. Click "Register"
7. Show auto-generated MRN
8. Show patient in patient list

### Demo Scenario 2: Patient Search (2 minutes)
1. Search for patient by name "Jane"
2. Show search results
3. Search by MRN
4. Show exact match
5. Click to view patient details

### Demo Scenario 3: Record Vitals & Encounter (4 minutes)
1. Select patient (Jane Doe)
2. Click "New Encounter"
3. Enter vitals:
   - Temperature: 37.2°C
   - BP: 118/76
   - Pulse: 72
   - Weight: 65kg
   - Height: 165cm
4. Show auto-calculated BMI
5. Enter chief complaint: "Headache for 2 days"
6. Enter diagnosis: "Tension headache"
7. Enter treatment plan: "Paracetamol 500mg TDS x 3 days"
8. Save encounter
9. Show encounter in patient's history

### Demo Scenario 4: Offline Operation (3 minutes)
1. Disconnect from internet
2. Register new patient (offline)
3. Create encounter for existing patient (offline)
4. Show "Offline Mode" indicator
5. Close and reopen app
6. Show all data persisted
7. Reconnect internet (no sync in Phase 0, but show readiness)

### Demo Scenario 5: Security (2 minutes)
1. Logout of app
2. Show login screen
3. Attempt login with wrong password (fails)
4. Login with correct credentials
5. Show session timeout behavior (optional)
6. Mention encrypted database

**Total Demo Time**: ~15 minutes + Q&A

---

## MVP Out-of-Scope Decisions

### Why No Cloud Sync in Phase 0?
**Decision**: Focus on proving offline-first architecture first
**Rationale**:
- Sync logic is complex and requires conflict resolution
- Core offline functionality must be rock-solid before adding sync
- Phase 0 is about proving the concept, Phase 1 adds sync

### Why No Mobile App in Phase 0?
**Decision**: Desktop prototype only
**Rationale**:
- Desktop app proves the architecture
- Mobile app can reuse backend APIs (Phase 1)
- Focus resources on getting core functionality right

### Why No Billing/Pharmacy in Phase 0?
**Decision**: Patient + Encounters only
**Rationale**:
- MVP should prove core clinical workflow
- Financial modules add complexity
- Phase 1 will add these incrementally

### Why Single User in Phase 0?
**Decision**: Single admin user, no RBAC
**Rationale**:
- Multi-user adds complexity (session management, permissions)
- Phase 0 is about proving technical feasibility
- Phase 1 will add proper user management

---

## Definition of Done (Phase 0 MVP)

The Phase 0 MVP is considered DONE when:

### Code Complete
- [ ] All user stories implemented
- [ ] All acceptance criteria met
- [ ] All tests passing (unit, integration, E2E)
- [ ] Test coverage ≥ 80%
- [ ] Code reviewed and approved
- [ ] Linting passes with no critical errors
- [ ] No known critical or high-priority bugs

### Documentation Complete
- [ ] README updated with Phase 0 features
- [ ] API documentation generated
- [ ] Installation guide created
- [ ] Development setup guide updated
- [ ] Sprint 0.1-0.6 deliverables documented

### Testing Complete
- [ ] All automated tests pass
- [ ] Manual testing completed on all 3 platforms
- [ ] Offline testing completed
- [ ] Security testing completed (encryption verified)
- [ ] Performance testing completed (meets targets)

### Demo Ready
- [ ] Demo scenarios scripted
- [ ] Demo data prepared
- [ ] Demo environment tested
- [ ] Stakeholder presentation created

### Infrastructure Complete
- [ ] CI/CD pipeline running
- [ ] Automated builds for Windows/macOS/Linux
- [ ] Test coverage reporting automated
- [ ] Linting automated
- [ ] Security scanning automated

---

## Risk Register (Phase 0 MVP)

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Electron performance issues | Low | High | Profile and optimize, consider PyQt alternative |
| SQLCipher integration complexity | Medium | Medium | Start early, use existing libraries, have fallback |
| Cross-platform compatibility issues | Medium | High | Test early on all 3 platforms, use Docker for consistency |
| Test coverage below 80% | Low | Medium | TDD from day 1, pair programming, code review gates |
| MRN generation collisions | Low | Critical | Use UUID + timestamp, test extensively |
| Data loss bugs | Low | Critical | Extensive testing, automated backups, transaction safety |
| Security vulnerabilities | Low | Critical | Security audit, use proven libraries, follow best practices |

---

## Dependencies

### External Dependencies
- Python 3.12+
- Node.js 20+
- Electron 28+
- Django 5.x
- SQLCipher 4.x
- pytest, Ruff, Black

### Internal Dependencies
- None (Phase 0 is self-contained)

### Team Dependencies
- Backend engineer (Patient/Encounter models)
- Frontend engineer (Next.js forms)
- Full-stack engineer (Electron integration)
- QA engineer (test automation)

---

## Timeline

### Sprint 0.1 (Weeks 1-2) - Current Sprint
- [x] Task 1: Vision workshop ✅
- [x] Task 2: Consultant feedback review ✅
- [x] Task 3: MVP scope definition (this document) ✅
- [ ] Task 4-8: Infrastructure setup

### Sprint 0.2-0.6 (Weeks 3-12)
- Sprint 0.2: Backend models and tests
- Sprint 0.3: Desktop prototype
- Sprint 0.4: Security baseline
- Sprint 0.5: Offline sync logic (queue only, no cloud)
- Sprint 0.6: Demo preparation

**Phase 0 Target Completion**: End of March 2026

---

## Approval

### Stakeholder Sign-Off

| Stakeholder | Role | Approval | Date |
|-------------|------|----------|------|
| Engineering Lead | Technical Approval | ✅ APPROVED | 2025-12-27 |
| Product Manager | Business Approval | Pending | - |
| Clinical Advisor | Clinical Approval | Pending | - |
| Security Lead | Security Approval | Pending | - |

---

## Appendix

### A. MVP Feature Checklist

**Patient Management**:
- [x] Patient registration form
- [x] MRN auto-generation
- [x] National ID field
- [x] Consent tracking
- [x] Sensitive flag
- [x] Patient search (MRN, name, ID)
- [x] Patient list view
- [x] Patient details view

**Encounter Management**:
- [x] Vitals entry (temp, BP, pulse, RR, weight, height)
- [x] BMI calculation
- [x] Chief complaint field
- [x] Diagnosis field
- [x] Treatment plan field
- [x] Encounter timestamp
- [x] Encounter history view

**Infrastructure**:
- [x] Electron desktop app
- [x] Django backend (local)
- [x] SQLite database
- [x] SQLCipher encryption
- [x] REST API endpoints
- [x] Authentication (single user)
- [x] Audit logging

**Testing**:
- [x] Pytest setup
- [x] Coverage reporting
- [x] Ruff linting
- [x] Black formatting
- [x] Unit tests
- [x] Integration tests
- [x] E2E tests

### B. MVP Non-Features

**Explicitly NOT in Phase 0**:
- ❌ Pharmacy module
- ❌ Billing module
- ❌ Mobile app
- ❌ Cloud sync
- ❌ Multi-user/RBAC
- ❌ SHA claims
- ❌ KHIS reporting
- ❌ Printing
- ❌ Lab results
- ❌ Prescriptions
- ❌ Appointments
- ❌ Imaging
- ❌ Reports/Analytics

---

**Document Status**: APPROVED
**Next Action**: Begin Sprint 0.1 Task 4 (GitHub repository setup)
**Document Owner**: Engineering Lead
**Last Updated**: December 27, 2025
