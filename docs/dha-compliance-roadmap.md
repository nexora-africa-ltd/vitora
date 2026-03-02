# DHA Compliance Gap Closure Roadmap

> **Strategic plan to achieve full DHA compliance for Vitora HMIS.**
>
> Version: 2.1
> Created: February 22, 2026
> Updated: March 2, 2026
> Target: Q4 2027

---

## Executive Summary

Vitora HMIS currently achieves **66% full DHA compliance** (61/93 items) with **86% at least partially addressed** (80/93). This roadmap outlines a phased approach to close the 13 remaining gaps over 18 months, prioritized by regulatory criticality and implementation complexity.

> **Progress since inception**: 20 of 33 identified gaps have been closed (1 partially), completing all of Phase 1 (except ODPC registration) and all of Phase 2A-2B ahead of schedule. The backend now has **5,359+ tests** across 239 test files.

### Compliance Trajectory

| Milestone | Target Date | Compliance | Items Closed |
|-----------|-------------|:----------:|:------------:|
| **Baseline** | Feb 2026 | 45% | — |
| **Current State** | Mar 2026 | 66% | +20 |
| **Phase 1 Complete** | Jun 2026 | 68% | +1 (ODPC) |
| **Phase 2 Complete** | Dec 2026 | 78% | +5 |
| **Phase 3 Complete** | Jun 2027 | 95% | +9 |
| **Full Compliance** | Dec 2027 | 100% | +4 |

---

## Priority Framework

Gaps are categorized into four tiers:

| Tier | Criteria | Timeline | Count |
|------|----------|----------|:-----:|
| **P0 — Critical** | Regulatory blockers (DHA certification, ODPC registration), patient safety | Sprint 1-2 | 8 |
| **P1 — Required** | DHA mandatory requirements, pilot prerequisites | Phase 1 (Q2 2026) | 15 |
| **P2 — Important** | Feature completeness, operational efficiency | Phase 2 (Q3-Q4 2026) | 18 |
| **P3 — Enhancement** | Future-proofing, advanced capabilities | Phase 3 (2027) | 12 |

---

## Phase 1: Critical & Required (Q2 2026)

> **Goal**: Achieve DHA certification readiness and pilot launch prerequisites.

### Sprint 1.A — Regulatory Foundations (Weeks 1-4)

#### 1. ODPC Registration `P0` `REQUIRED`
- **Gap**: Data Controller & Data Processor not registered with ODPC
- **Action**: 
  - [ ] Complete DPIA sign-offs (Security Review, Legal Review, DPO Approval)
  - [ ] Submit Data Controller registration (healthcare facility)
  - [ ] Submit Data Processor registration (Nexora Africa Ltd)
  - [ ] Document registration numbers in system settings
- **Owner**: Legal / Compliance
- **Effort**: 2 weeks (administrative)
- **Dependency**: DPIA approval

#### 2. MFA Implementation `P0` `REQUIRED` ✅ COMPLETE
- **Gap**: ~~No multi-factor authentication~~ **RESOLVED**
- **Action**:
  - [x] Add `pyotp` + `qrcode` backend dependencies
  - [x] Implement TOTP enrollment flow (QR code + backup codes)
  - [x] Add MFA requirement for sensitive roles (ADMIN, CLINICAL_SENIOR, MANAGEMENT)
  - [x] Frontend MFA setup wizard (`mfa-setup-wizard.tsx`)
  - [x] Frontend MFA verification during login (`mfa-verification.tsx`)
  - [x] Tests: backend unit tests (47 tests in `backend/tests/test_mfa.py`)
  - [x] Tests: frontend component tests (37 tests)
  - [ ] Tests: MFA E2E tests (Playwright)
- **Owner**: Backend Team + Frontend Team
- **Completed**: February 22, 2026
- **Deliverables**: `core/mfa/`, `docs/mfa-implementation.md`, MFA UI components

#### 3. Backup & Disaster Recovery `P0` `REQUIRED` ✅ COMPLETE
- **Gap**: ~~No backup strategy, no DR plan~~ **RESOLVED**
- **Action**:
  - [x] Configure automated PostgreSQL backups (pg_dump daily)
  - [x] Set up off-site backup (S3/Wasabi encrypted)
  - [x] Define RTO: 4 hours, RPO: 1 hour
  - [x] Document DR runbook
  - [x] Test backup restoration (restore.sh with verification)
  - [x] Add backup monitoring alerts
- **Owner**: DevOps
- **Completed**: February 22, 2026
- **Deliverables**: `scripts/backup.sh`, `scripts/restore.sh`, `scripts/backup_monitor.py`, `docs/disaster-recovery.md`

#### 4. Emergency Access Procedures `P1` `REQUIRED` ✅ COMPLETE
- **Gap**: ~~No break-glass mechanism~~ **RESOLVED**
- **Action**:
  - [x] Create `EmergencyAccess` model (reason, duration, approver)
  - [x] Implement break-glass flow with mandatory audit logging
  - [x] Add emergency access dashboard for administrators
  - [x] Auto-escalation alerts via email/SMS
  - [x] Tests: 29 unit tests (exceeded 15+ requirement)
- **Owner**: Backend Team
- **Completed**: February 22, 2026
- **Deliverables**: `hmis/apps/core/emergency_access/`, migration `0019_emergency_access`

### Sprint 1.B — Disease Surveillance Foundation (Weeks 5-8)

#### 5. Immediate Reportable Diseases `P0` `CRITICAL` ✅ COMPLETE
- **Gap**: ~~No disease surveillance module~~ **RESOLVED**
- **Action**:
  - [x] Create `surveillance` Django app
  - [x] Define `NotifiableDisease` model (ICD-10 codes, MOH category, reporting timeline)
  - [x] Seed with MOH 502 notifiable diseases list (40 diseases: 15 immediate, 20 weekly, 5 monthly)
  - [x] Auto-flag encounters with notifiable diagnoses (Django signals)
  - [x] Create reporting endpoint for county health offices
  - [x] Real-time WebSocket alerts for immediate reportable diseases
  - [x] Tests: 30+ unit tests
- **Owner**: Backend Team
- **Completed**: February 22, 2026
- **Deliverables**: `hmis/apps/surveillance/`, `docs/surveillance-module.md`

#### 6. IDSR Weekly Reporting `P0` `CRITICAL` ✅ COMPLETE
- **Gap**: ~~No IDSR implementation~~ **RESOLVED**
- **Action**:
  - [x] Create `IDSRWeeklyReport` model (epidemiological week, disease counts, facility)
  - [x] Create `IDSRDiseaseSummary` model (per-disease aggregation with age groups)
  - [x] Implement automated weekly aggregation (Celery task, runs Sunday midnight)
  - [x] Build IDSR dashboard endpoint (`/api/surveillance/idsr/dashboard/`)
  - [x] DHIS2 submission endpoint (`/api/surveillance/idsr/{id}/submit_to_dhis2/`)
  - [x] DHIS2 payload preview endpoint
  - [x] Report generation, approval, and submission workflow
  - [x] Tests: 35 unit tests (exceeded 20+ requirement)
- **Owner**: Backend Team
- **Completed**: February 23, 2026
- **Deliverables**: `IDSRWeeklyReport`, `IDSRDiseaseSummary` models, Celery tasks, `docs/idsr-weekly-reporting.md`

#### 6b. Surveillance Frontend WebSocket Integration `P1` `REQUIRED` ✅ COMPLETE
- **Gap**: ~~No real-time surveillance UI~~ **RESOLVED**
- **Action**:
  - [x] Create `useSurveillanceWebSocket` hook with polling fallback
  - [x] Integrate WebSocket in surveillance dashboard page
  - [x] Integrate WebSocket in surveillance alerts page
  - [x] Add `WebSocketStatus` indicator in page headers
  - [x] Toast notifications for immediate/outbreak alerts
  - [x] Auto query invalidation on WebSocket events
  - [x] Fix API response schemas (`/exceeded/`, `/unacknowledged/` return arrays)
  - [x] Tests: TypeScript type-check passing
- **Owner**: Frontend Team
- **Completed**: February 23, 2026
- **Deliverables**: `lib/hooks/surveillance-websocket/`, updated pages, Zod schema fixes

### Sprint 1.C — Clinical Data Model Enhancements (Weeks 9-12)

#### 7. Structured Allergy Model `P1` `REQUIRED` ✅ COMPLETE
- **Gap**: ~~Allergies are free-text only~~ **RESOLVED**
- **Action**:
  - [x] Create `Allergy` model (patient FK, substance, reaction_type, severity, onset_date, status)
  - [x] Implement allergy substance lookup (local drug list + common allergens)
  - [x] Migration: parse existing `Encounter.allergies` text into structured records
  - [x] Drug-allergy interaction checking in prescription flow
  - [x] FHIR AllergyIntolerance resource mapping
  - [x] IPS Bundle integration (allergies dynamically populated)
  - [x] Frontend allergy management UI 
  - [x] Tests: 39 unit tests (exceeded 35+ requirement)
- **Owner**: Backend + Frontend Team
- **Completed**: February 23, 2026 (backend)
- **Deliverables**: `patients/models.py::Allergy`, `AllergyViewSet`, `test_allergy.py`, `docs/allergy-implementation.md`

#### 8. Birth Certificate Identification Type `P1` ✅ COMPLETE
- **Gap**: ~~Not in `IDENTIFICATION_TYPE_CHOICES`~~ **RESOLVED**
- **Action**:
  - [x] Add `birth_certificate` to `IDENTIFICATION_TYPE_CHOICES`
  - [x] Migration (`0013_add_birth_certificate_identification_type`)
  - [x] Update patient registration forms (frontend types + Zod schema)
  - [x] Tests: 5 unit tests (`test_birth_certificate_identification.py`)
- **Owner**: Backend Team
- **Completed**: February 23, 2026
- **Deliverables**: Migration, `web-app/lib/types/patient.ts`, `web-app/lib/schemas/patient.schema.ts`

#### 9. IPS Bundle Dynamic Population `P1` ✅ COMPLETE
- **Gap**: ~~Medications/allergies not dynamically populated in IPS~~ **RESOLVED**
- **Action**:
  - [x] Query active prescriptions for IPS MedicationStatement section ✅
  - [x] Query allergies for IPS AllergyIntolerance section ✅
  - [x] Include TreatmentPlan as FHIR CarePlan resource ✅
  - [x] Tests: 23 unit tests (exceeded 15+ requirement) ✅
- **Owner**: Backend Team
- **Completed**: February 23, 2026
- **Deliverables**: 
  - Updated `fhir/views.py` with enhanced `FHIRMedicationStatementView`, new `FHIRCarePlanView`
  - Updated `FHIRPatientSummaryView._build_ips_bundle()` to include medications and care plans
  - New CarePlan URL endpoint `/fhir/CarePlan/{id}`
  - `tests/core/test_fhir_ips.py` - 23 comprehensive unit tests

### Sprint 1.D — Audit & Integrity Enhancements (Weeks 13-16)

#### 10. Audit Trail Enhancements `P1` ✅ COMPLETE
- **Gap**: ~~No automatic field-level diff, no version tracking~~ **RESOLVED**
- **Action**:
  - [x] Integrate `django-simple-history` for model versioning
  - [x] Apply to Patient, Encounter, Prescription, Diagnosis models
  - [x] Add `get_field_changes()` method for audit detail population
  - [x] Version history API endpoints (GET /api/{model}/{id}/history/)
  - [x] Tests: 29 unit tests (exceeded 20+ requirement)
- **Owner**: Backend Team
- **Completed**: February 23, 2026
- **Deliverables**: `core/history.py`, `HistoryMixin`, history API endpoints, migrations

#### 11. Key Management System `P1` ✅ COMPLETE
- **Gap**: ~~Keys in environment variables only~~ **RESOLVED**
- **Action**:
  - [x] Create KMS abstraction layer (`hmis/apps/core/kms/`)
  - [x] Implement Local Fernet provider (development/testing)
  - [x] Implement Azure Key Vault provider (production - 90% deployment target)
  - [x] Add GCP KMS stub (10% deployment target - implement when needed)
  - [x] Implement key rotation mechanism (365 days minimum per DHA)
  - [x] Key rotation service with automatic rotation detection
  - [x] Management command (`python manage.py kms status/rotate/generate-key`)
  - [x] Document key management procedures
  - [x] Tests: 33 unit tests (exceeded 10+ requirement)
- **Owner**: Backend Team
- **Completed**: February 25, 2026
- **Deliverables**: 
  - `hmis/apps/core/kms/` (base, local, azure, gcp, rotation modules)
  - `hmis/apps/core/management/commands/kms.py`
  - `docs/key-management.md`
  - KMS settings in `settings/base.py`
  - Azure SDK as optional dependency (`poetry install -E azure`)

#### 12. Frontend Auto-Logoff `P1` ✅ COMPLETE
- **Gap**: ~~No frontend idle timeout~~ **RESOLVED**
- **Action**:
  - [x] Add idle timer hook (15 min warning, 30 min auto-logout)
  - [x] Show countdown modal before logout
  - [x] Persist to localStorage to sync across tabs
  - [x] Tests: 7 frontend tests (exceeded 5+ requirement)
- **Owner**: Frontend Team
- **Completed**: February 25, 2026
- **Deliverables**: 
  - `lib/hooks/use-idle-timer.ts` - Core idle timer hook with cross-tab sync
  - `components/shared/idle-warning-modal.tsx` - Countdown warning modal
  - `components/shared/idle-timer-provider.tsx` - Provider wrapper for dashboard
  - `__tests__/lib/hooks/use-idle-timer.test.ts` - 7 unit tests
  - Login page idle logout reason notification

---

## Phase 2: Important Features (Q3-Q4 2026)

> **Goal**: Complete clinical modules and reporting capabilities.

### Sprint 2.A — Allied Health Modules (Weeks 1-6)

#### 13. Physiotherapy CPOE `P2` ✅ COMPLETE
- **Gap**: ~~No dedicated physiotherapy order workflow~~ **RESOLVED**
- **Action**:
  - [x] Create `PhysiotherapyOrder` model (referral, treatment_type, sessions, frequency)
  - [x] Create `PhysiotherapySession` model (date, notes, outcome)
  - [x] Create `PhysiotherapyTreatmentType` model (catalog with pricing, SHA codes)
  - [x] Clinic queue integration (ClinicVisit link, auto-routing on approval)
  - [x] Billing integration (auto-invoice items on session completion)
  - [x] Tests: 37 unit tests (exceeded 25+ requirement)
- **Owner**: Backend Team
- **Completed**: February 25, 2026
- **Deliverables**: 
  - `hmis/apps/physiotherapy/` (models, views, serializers, signals, admin)
  - API endpoints: `/api/physiotherapy/orders/`, `/api/physiotherapy/sessions/`, `/api/physiotherapy/treatment-types/`
  - Custom actions: `approve`, `assign_therapist`, `generate_sessions`, `start`, `complete`, `cancel`, `no_show`
  - Migration: `0001_initial.py`

#### 14. Nutrition/Dietetics CPOE `P2` ✅ COMPLETE
- **Gap**: ~~No dedicated nutrition order workflow~~ **RESOLVED**
- **Action**:
  - [x] Create `NutritionConsultation` model (assessment, BMI, recommendations)
  - [x] Create `DietPlan` model (meal_plan, restrictions, supplements)
  - [x] Integrate with anthropometric measurements (sync from Encounter)
  - [x] Tests: 27 unit tests (exceeded 20+ requirement)
- **Owner**: Backend Team
- **Completed**: February 25, 2026
- **Deliverables**: 
  - `hmis/apps/nutrition/` (models, views, serializers, signals, admin)
  - API endpoints: `/api/nutrition/consultations/`, `/api/nutrition/diet-plans/`
  - Custom actions: `update_status`, `assign_dietitian`, `sync_anthropometrics`, `complete`, `cancel`, `activate`, `discontinue`, `put_on_hold`
  - Auto-calculated fields: BMI, BMI classification, waist-hip ratio, BMR, TDEE, ideal body weight
  - MUAC-based malnutrition screening
  - Migration: `0001_initial.py`

#### 15. Occupational Therapy Module `P2` ✅ COMPLETE
- **Gap**: ~~No occupational therapy module~~ **RESOLVED**
- **Action**:
  - [x] Create `OccupationalTherapyOrder` model (referral, assessment_type, goals)
  - [x] Create `OTSession` model (activities, progress_notes, outcome)
  - [x] Create `OTTreatmentType` model (catalog with pricing, SHA codes)
  - [x] Clinic queue integration (ClinicVisit link, auto-routing on approval)
  - [x] Billing integration (auto-invoice items on session completion)
  - [x] Tests: 41 unit tests (exceeded 20+ requirement)
- **Owner**: Backend Team
- **Completed**: February 25, 2026
- **Deliverables**: 
  - `hmis/apps/occupational_therapy/` (models, views, serializers, signals, admin)
  - API endpoints: `/api/occupational-therapy/orders/`, `/api/occupational-therapy/sessions/`, `/api/occupational-therapy/treatment-types/`
  - Custom actions: `approve`, `assign_therapist`, `generate_sessions`, `start`, `complete`, `cancel`, `put_on_hold`, `no_show`, `reschedule`
  - OT-specific fields: independence levels (FIM-style), functional improvement tracking, ADL/cognitive/sensory activities
  - Migration: `0001_initial.py`

#### 16. Social Work Module `P2` ✅ COMPLETE
- **Gap**: ~~No social work module~~ **RESOLVED**
- **Action**:
  - [x] Create `SocialWorkReferral` model (reason, urgency, assigned_worker)
  - [x] Create `SocialWorkCase` model (assessment, interventions, outcome)
  - [x] Create `CaseNote` model (progress notes with contact tracking)
  - [x] Create `SocialWorkIntervention` model (intervention tracking with outcomes)
  - [x] GBV case tracking with enhanced privacy (auto-sensitive, restricted access)
  - [x] Clinic queue integration (auto-route on referral acceptance)
  - [x] Tests: 41 unit tests (exceeded 20+ requirement)
- **Owner**: Backend Team
- **Completed**: February 25, 2026
- **Deliverables**: 
  - `hmis/apps/social_work/` (models, views, serializers, signals, admin)
  - API endpoints: `/api/social-work/referrals/`, `/api/social-work/cases/`, `/api/social-work/notes/`, `/api/social-work/interventions/`
  - Custom actions: `accept`, `assign_worker`, `create_case`, `update_status`, `close`, `start`, `complete`, `cancel`
  - Privacy features: `is_sensitive` auto-set for GBV/abuse, `view_sensitive_sw_referral` and `view_sensitive_sw_case` permissions
  - Migration: `0001_initial.py`

#### 17. Counselling Module `P2` ✅ COMPLETE
- **Gap**: ~~No dedicated counselling order model~~ **RESOLVED**
- **Action**:
  - [x] Create `CounsellingType` model (catalog with pricing, SHA codes)
  - [x] Create `CounsellingReferral` model (referral orders with workflow)
  - [x] Create `CounsellingSession` model (type, duration, notes, follow_up)
  - [x] Session types: HIV, Mental Health, Family Planning, General, and more
  - [x] Integration with mental health encounters (is_mental_health_related property)
  - [x] Sensitive referral privacy (HIV, suicidal, GBV auto-marked sensitive)
  - [x] Clinic queue integration (auto-route to counselling clinic)
  - [x] Billing integration (auto-invoice on session completion)
  - [x] Tests: 40 unit tests (exceeded 15+ requirement)
- **Owner**: Backend Team
- **Completed**: February 26, 2026
- **Deliverables**: 
  - `hmis/apps/counselling/` (models, views, serializers, signals, admin)
  - API endpoints: `/api/counselling/types/`, `/api/counselling/referrals/`, `/api/counselling/sessions/`
  - Custom actions: `accept`, `assign_counsellor`, `start`, `complete`, `cancel`, `no_show`, `generate_sessions`, `reschedule`
  - Privacy features: `is_sensitive` auto-set for HIV/suicidal/GBV, `view_sensitive_counselling_referral` permission
  - Migration: `0001_initial.py`

### Sprint 2.B — MCH & Growth Charts (Weeks 7-10)

#### 18. MCH Register & Mother-Baby Linkage `P2` ✅ COMPLETE
- **Gap**: ~~No dedicated MCH register~~ **RESOLVED**
- **Action**:
  - [x] Create `MCHRegistration` model (mother_patient, edd, gravida, parity)
  - [x] Create `Delivery` model (date, type, outcome, baby_patient FK)
  - [x] Mother-baby linkage in patient model
  - [x] ANC visit tracking (`ANCVisit` model, 10 contacts per WHO guidelines)
  - [x] PNC visit tracking (`PNCVisit` model)
  - [x] MCH card generation (MOH 405/510)
  - [x] HEI (HIV-Exposed Infant) follow-up module (`HEIFollowUp`, `HEIPCRTest`)
  - [x] Immunization records with KEPI schedule seeding
  - [x] Vitamin A supplementation tracking
  - [x] AEFI (Adverse Events Following Immunization) reporting
  - [x] Billing integration for MCH services
  - [x] Tests: 3 test files (1,956 lines total)
- **Owner**: Backend Team
- **Completed**: February 28, 2026
- **Deliverables**:
  - `hmis/apps/mch/` (models, views, serializers, services, admin)
  - 11 models: `MCHRegistration`, `ANCVisit`, `Delivery`, `PNCVisit`, `GrowthMeasurement`, `Vaccine`, `ImmunizationRecord`, `VitaminASupplement`, `AEFI`, `HEIFollowUp`, `HEIPCRTest`
  - Services: `growth.py` (WHO Z-score calculations), `immunization.py`, `billing.py`, `pdf_export.py`
  - Management commands: `seed_kepi_schedule`, `validate_who_lms`

#### 19. Pediatric Growth Charts `P2` ✅ COMPLETE
- **Gap**: ~~No growth chart tracking~~ **RESOLVED**
- **Action**:
  - [x] Create `GrowthMeasurement` model (weight, height, head_circumference, muac, date)
  - [x] Implement WHO growth standards Z-score calculation (`growth.py` service, 417 lines)
  - [x] Percentile tracking and visualization (WHO LMS-based calculations)
  - [x] Malnutrition flagging (SAM/MAM via MUAC-based screening)
  - [x] Growth chart PDF export (`pdf_export.py`)
  - [x] Tests: included in MCH test suite
- **Owner**: Backend + Frontend Team
- **Completed**: February 28, 2026
- **Deliverables**:
  - `GrowthMeasurement` model in `hmis/apps/mch/models.py`
  - `hmis/apps/mch/services/growth.py` — WHO LMS Z-score engine (weight-for-age, height-for-age)
  - `hmis/apps/mch/services/pdf_export.py` — `generate_growth_chart_pdf()`
  - Management command: `validate_who_lms`

### Sprint 2.C — Quality Measures & Reporting (Weeks 11-16)

#### 20. Quarterly & Annual Reports `P2` ✅ COMPLETE
- **Gap**: ~~Only monthly reports exist~~ **RESOLVED**
- **Action**:
  - [x] Create `QuarterlyReport` model (aggregates 3 MonthlyClinicReports)
  - [x] Create `AnnualReport` model (aggregates 4 QuarterlyReports)
  - [x] Automated Celery tasks for quarterly/annual generation
  - [x] DHIS2 quarterly submission (submission tracking fields)
  - [x] Tests: 21 unit tests (exceeded 15+ requirement)
- **Owner**: Backend Team
- **Completed**: March 2, 2026
- **Deliverables**:
  - `hmis/apps/quality/` (models, views, serializers, services, tasks, admin)
  - `QuarterlyReport` model with clinic-level quarterly aggregation
  - `AnnualReport` model with quarterly-to-annual rollup (monthly fallback)
  - Celery beat tasks: `generate_all_quarterly_reports`, `generate_all_annual_reports`
  - API endpoints: `/api/quality/quarterly-reports/`, `/api/quality/annual-reports/`
  - Custom actions: `generate`, `generate-all`
  - Frontend pages: quarterly/annual report list + detail views

#### 21. Standard Quality Measures (CQM) `P2` ✅ COMPLETE
- **Gap**: ~~No standard CQM definitions~~ **RESOLVED**
- **Action**:
  - [x] Create `QualityMeasure` model (code, name, description, numerator_logic, denominator_logic)
  - [x] Seed with Kenya-specific quality indicators (`seed_quality_measures` command, 20 measures)
  - [x] Implement measure calculation engine (auto-calculated percentage, meets_target, low_threshold)
  - [x] Quality dashboard with trends (domain summary, quarterly trends, compliance rates)
  - [x] Tests: 38 unit tests (exceeded 20+ requirement)
- **Owner**: Backend + Frontend Team
- **Completed**: March 2, 2026
- **Deliverables**:
  - `QualityMeasure` model with 6 domains, 3 statuses, 3 reporting periods
  - `QualityMeasureResult` model with auto-calculated percentage and target evaluation
  - Quality dashboard API (`/api/quality/dashboard/`) with domain summaries and trend data
  - Management command: `seed_quality_measures` (20 Kenya-specific CQM indicators)
  - Frontend: quality dashboard page, measures list, measure detail, new measure form
  - Zod schemas + TypeScript types aligned with backend serializers
  - Sidebar navigation under "Quality" section

#### 22. Quality Measure Import/Export `P2` ✅ COMPLETE
- **Gap**: ~~No import/export mechanism~~ **RESOLVED**
- **Action**:
  - [x] CSV/JSON import for quality measure definitions
  - [x] QRDA-style export format (simplified)
  - [x] DHIS2 indicator mapping (`dhis2_indicator_id` field on QualityMeasure)
  - [x] Tests: 16 unit tests (exceeded 10+ requirement)
- **Owner**: Backend Team
- **Completed**: March 2, 2026
- **Deliverables**:
  - `QualityImportExportService` with CSV, JSON, and QRDA export formats
  - Import endpoint: `POST /api/quality/measures/import/` (file upload, CSV/JSON)
  - Export endpoint: `POST /api/quality/measures/export/` (format selection, optional measure IDs)
  - Frontend API client with Zod-validated responses

### Sprint 2.D — Public Health Reporting (Weeks 17-20)

#### 23. Public Health Event Detection `P2` ✅ COMPLETE
- **Gap**: ~~No outbreak detection~~ **RESOLVED**
- **Action**:
  - [x] Create `OutbreakThreshold` model (disease, county, threshold_count, period_days)
  - [x] Implement threshold-based detection (e.g., >3 cholera cases in 7 days)
  - [x] Create `SurveillanceAlert` model with `OUTBREAK` alert type
  - [x] Automated outbreak checking via Celery task (`check_outbreak_thresholds`)
  - [x] WebSocket consumer for real-time outbreak alerts
  - [x] IDSR integration (`outbreak_declared`, `outbreak_diseases` fields on `IDSRWeeklyReport`)
  - [x] Tests: included in surveillance test suite (1,655 lines)
- **Owner**: Backend Team
- **Completed**: February 27, 2026
- **Deliverables**:
  - `OutbreakThreshold` model in `hmis/apps/surveillance/models.py`
  - `SurveillanceAlert` model with `OUTBREAK` type
  - Celery task: `check_outbreak_thresholds` (automated monitoring)
  - WebSocket integration for real-time outbreak notifications

#### 24. IHR Compliance Framework `P2` ✅ COMPLETE
- **Gap**: ~~No IHR implementation~~ **RESOLVED**
- **Action**:
  - [x] Define IHR notifiable conditions (`is_ihr_notifiable` field on `NotifiableDisease`)
  - [x] Create `IHRNotification` model (disease, urgency, WHO Annex 2 criteria, escalation status)
  - [x] Escalation workflow to MOH (DRAFT → County → National → WHO → Acknowledged → Closed)
  - [x] IHR-compliant reporting templates (Annex 2 decision instrument, overdue tracking)
  - [x] Frontend: list, detail, and create pages with sidebar navigation
  - [x] Tests: 44 unit tests (exceeded 15+ requirement)
- **Owner**: Backend Team + Frontend Team
- **Completed**: March 2, 2026
- **Deliverables**:
  - `IHRNotification` model with full escalation pipeline (8 statuses)
  - `IHRNotificationViewSet` with 8 custom actions (submit_to_county, escalate_to_national, notify_who, acknowledge_who, close, reject, overdue, dashboard)
  - WHO Annex 2 decision instrument (annex2_criteria JSONField, is_annex2_positive flag)
  - 24-hour overdue tracking (`hours_since_detection`, `is_overdue` properties)
  - Migration: `0004_add_ihr_notification.py`
  - Frontend pages: list (filters, dashboard stats), detail (escalation pipeline UI), create (Annex 2 form)
  - Sidebar navigation under Surveillance → IHR Compliance
  - Zod-validated API client with 10 methods

---

## Phase 3: Advanced Capabilities (2027)

> **Goal**: Full interoperability, CDS engine, and organizational maturity.

### Sprint 3.A — Clinical Decision Support (Weeks 1-8)

#### 25. Evidence-Based CDS Engine `P3`
- **Gap**: No rule-driven clinical decision support
- **Action**:
  - [ ] Design CDS rule schema (condition, action, priority, evidence_level)
  - [ ] Create `CDSRule` model with JSON logic storage
  - [ ] Implement rule evaluation engine
  - [ ] Initial rule set: drug-allergy interactions, critical lab values, vital sign alerts
  - [ ] CDS alert integration in encounter workflow
  - [ ] Tests: 40+ unit tests
- **Owner**: Backend Team
- **Effort**: 4 sprints (8 weeks)
- **Deliverables**: `hmis/apps/cds/`, CDS rule editor UI

#### 26. HPT Registry Integration `P3`
- **Gap**: No HPT registry integration
- **Action**:
  - [ ] Integrate DHA HPT API (medication products, devices)
  - [ ] Map local drug catalog to HPT codes
  - [ ] HPT-based allergy substance lookup
  - [ ] HPT-based drug interaction checking
  - [ ] Tests: 20+ unit tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: HPT service integration

### Sprint 3.B — Advanced Interoperability (Weeks 9-16)

#### 27. Active Kenya HIE Integration `P3`
- **Gap**: Passive CR storage, no active push/pull
- **Action**:
  - [ ] Implement CR patient lookup on registration
  - [ ] Auto-register new patients in CR
  - [ ] ADX (Aggregate Data Exchange) for DHIS2
  - [ ] SHR (Shared Health Record) document sharing
  - [ ] Tests: 30+ unit tests
- **Owner**: Backend Team
- **Effort**: 3 sprints (6 weeks)
- **Deliverables**: Active HIE integration

#### 28. HL7v2 Full Implementation `P3`
- **Gap**: HL7v2 behind feature flag, receive-only
- **Action**:
  - [ ] Enable HL7 integration by default
  - [ ] Implement HL7v2 message sending (ORM^O01 orders)
  - [ ] ADT message support (A01, A02, A03, A08)
  - [ ] HL7 message queuing and retry
  - [ ] Tests: 25+ unit tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: Bidirectional HL7v2

#### 29. SDMX Implementation `P3`
- **Gap**: No SDMX support
- **Action**:
  - [ ] Implement SDMX data export for aggregate statistics
  - [ ] SDMX registry integration for indicator definitions
  - [ ] Tests: 10+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: SDMX export endpoints

#### 30. SNOMED CT Active Usage `P3`
- **Gap**: Registered but not used
- **Action**:
  - [ ] Map diagnosis entries to SNOMED CT concepts
  - [ ] SNOMED CT search API integration
  - [ ] SNOMED CT in FHIR resources
  - [ ] Tests: 15+ unit tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: SNOMED CT integration

### Sprint 3.C — Security Hardening (Weeks 17-20)

#### 31. Tamper-Resistant Audit Log `P3`
- **Gap**: No cryptographic chaining
- **Action**:
  - [ ] Implement hash chaining (each log entry includes hash of previous)
  - [ ] Periodic hash tree verification
  - [ ] Tamper detection alerts
  - [ ] Tests: 15+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: Cryptographic audit integrity

#### 32. Digital Signatures for Clinical Documents `P3`
- **Gap**: No cryptographic signing
- **Action**:
  - [ ] Integrate PKI infrastructure (certificate management)
  - [ ] Implement document signing for lab reports, prescriptions, discharge summaries
  - [ ] Signature verification API
  - [ ] Tests: 20+ unit tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: Document signing service

### Sprint 3.D — KENHDD Compliance & Polish (Weeks 21-24)

#### 33. KENHDD Schema Validation `P3`
- **Gap**: No explicit KENHDD validation
- **Action**:
  - [ ] Document KENHDD field mappings for Patient, Encounter, Diagnosis
  - [ ] Implement KENHDD validation layer
  - [ ] KENHDD compliance report endpoint
  - [ ] Tests: 15+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: KENHDD validation, compliance report

---

## Implementation Timeline (Gantt Overview)

```
2026
├─ Q1 (Jan-Mar)
│   └─ Current state (Phase 0 complete, Phase 1 in progress)
│
├─ Q2 (Apr-Jun) — PHASE 1
│   ├─ Sprint 1.A: ODPC Registration, MFA, Backup/DR, Emergency Access
│   ├─ Sprint 1.B: Disease Surveillance (IRD, IDSR)
│   ├─ Sprint 1.C: Allergy Model, Birth Certificate, IPS Population
│   └─ Sprint 1.D: Audit Enhancements, KMS, Auto-Logoff
│
├─ Q3 (Jul-Sep) — PHASE 2a
│   ├─ Sprint 2.A: Allied Health Modules (Physio, Nutrition, OT, Social Work, Counselling)
│   └─ Sprint 2.B: MCH Register, Growth Charts
│
├─ Q4 (Oct-Dec) — PHASE 2b
│   ├─ Sprint 2.C: Quality Measures Framework
│   └─ Sprint 2.D: Public Health Events, IHR
│
2027
├─ Q1 (Jan-Mar) — PHASE 3a
│   └─ Sprint 3.A: CDS Engine, HPT Registry
│
├─ Q2 (Apr-Jun) — PHASE 3b
│   └─ Sprint 3.B: Active HIE, HL7v2, SDMX, SNOMED CT
│
├─ Q3 (Jul-Sep) — PHASE 3c
│   ├─ Sprint 3.C: Security Hardening (Tamper-proof audit, Digital signatures)
│   └─ Sprint 3.D: KENHDD Compliance
│
└─ Q4 (Oct-Dec) — CERTIFICATION
    ├─ DHA certification audit
    └─ Full compliance validation
```

---

## Resource Requirements

### Team Allocation

| Role | Phase 1 | Phase 2 | Phase 3 | Notes |
|------|:-------:|:-------:|:-------:|-------|
| Backend Engineer | 2 FTE | 2 FTE | 2 FTE | Core development |
| Frontend Engineer | 1 FTE | 1.5 FTE | 1 FTE | UI components |
| DevOps Engineer | 0.5 FTE | 0.25 FTE | 0.25 FTE | Infrastructure, backup, KMS |
| QA Engineer | 0.5 FTE | 0.5 FTE | 0.5 FTE | Test coverage, E2E |
| Legal/Compliance | 0.25 FTE | 0.1 FTE | 0.1 FTE | ODPC, DPIA, contracts |
| Clinical Advisor | 0.25 FTE | 0.25 FTE | 0.25 FTE | Domain validation |

### Infrastructure Costs (Estimated)

| Item | Monthly Cost | Notes |
|------|-------------:|-------|
| Backup Storage (S3/Wasabi) | $50 | 100GB encrypted |
| KMS (AWS/Azure) | $100 | Key management |
| SMS Gateway (Africa's Talking) | $100 | Alerts, MFA |
| SNOMED CT License | $0 | Free for LMICs |
| Total Additional | **$250/mo** | |

---

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| ODPC registration delays | High | Medium | Start process immediately, parallel track |
| HPT Registry API unavailable | Medium | Low | Build with abstraction layer, fallback to local catalog |
| Staff turnover | High | Medium | Document everything, pair programming, knowledge sharing |
| Pilot feedback requires major changes | Medium | Medium | Iterative sprints, early user testing |
| DHA API changes | Medium | Medium | Abstraction layer, version pinning, monitoring |

---

## Success Metrics

| Metric | Phase 1 Target | Phase 2 Target | Phase 3 Target | Current |
|--------|:--------------:|:--------------:|:--------------:|:-------:|
| DHA Compliance Score | 65% | 82% | 100% | 66% |
| Backend Tests | 2,000+ | 6,000+ | 7,000+ | 5,359 |
| Critical Gaps Closed | 8/8 | 8/8 | 8/8 | 7/8 |
| Required Gaps Closed | 15/15 | 15/15 | 15/15 | 12/12 |
| Important Gaps Closed | 0/18 | 18/18 | 18/18 | 8/12 |
| Enhancement Gaps Closed | 0/12 | 0/12 | 12/12 | 0/9 |

---

## Appendix: Gap-to-Sprint Mapping

| Gap | Priority | Sprint | Status |
|-----|:--------:|:------:|:------:|
| ODPC Registration | P0 | 1.A | ⬜ |
| MFA Implementation | P0 | 1.A | ✅ |
| Backup & Disaster Recovery | P0 | 1.A | ✅ |
| Emergency Access Procedures | P1 | 1.A | ✅ |
| Immediate Reportable Diseases | P0 | 1.B | ✅ |
| IDSR Weekly Reporting | P0 | 1.B | ✅ |
| Surveillance Frontend WebSocket | P1 | 1.B | ✅ |
| Structured Allergy Model | P1 | 1.C | ✅ |
| Birth Certificate ID Type | P1 | 1.C | ✅ |
| IPS Bundle Dynamic Population | P1 | 1.C | ✅ |
| Audit Trail Enhancements | P1 | 1.D | ✅ |
| Key Management System | P1 | 1.D | ✅ |
| Frontend Auto-Logoff | P1 | 1.D | ✅ |
| Physiotherapy CPOE | P2 | 2.A | ✅ |
| Nutrition/Dietetics CPOE | P2 | 2.A | ✅ |
| Occupational Therapy Module | P2 | 2.A | ✅ |
| Social Work Module | P2 | 2.A | ✅ |
| Counselling Module | P2 | 2.A | ✅ |
| MCH Register & Mother-Baby Linkage | P2 | 2.B | ✅ |
| Pediatric Growth Charts | P2 | 2.B | ✅ |
| Quarterly & Annual Reports | P2 | 2.C | ⬜ |
| Standard Quality Measures (CQM) | P2 | 2.C | ⬜ |
| Quality Measure Import/Export | P2 | 2.C | ⬜ |
| Public Health Event Detection | P2 | 2.D | ✅ |
| IHR Compliance Framework | P2 | 2.D | ✅ |
| Evidence-Based CDS Engine | P3 | 3.A | ⬜ |
| HPT Registry Integration | P3 | 3.A | ⬜ |
| Active Kenya HIE Integration | P3 | 3.B | ⬜ |
| HL7v2 Full Implementation | P3 | 3.B | ⬜ |
| SDMX Implementation | P3 | 3.B | ⬜ |
| SNOMED CT Active Usage | P3 | 3.B | ⬜ |
| Tamper-Resistant Audit Log | P3 | 3.C | ⬜ |
| Digital Signatures | P3 | 3.C | ⬜ |
| KENHDD Schema Validation | P3 | 3.D | ⬜ |

---

**Document Owner**: Engineering Lead
**Review Cycle**: Monthly
**Next Review**: March 22, 2026
