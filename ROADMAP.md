# Vitora HMIS - Comprehensive Development Roadmap

**Version**: 3.2
**Last Updated**: May 14, 2026
**Target Completion**: Q4 2027
**Methodology**: Test-Driven Development (TDD) with Agile Sprints

---

## Executive Summary

This roadmap outlines the complete development journey for Vitora HMIS from January 2026 to Q4 2027. The project adopts a **Test-Driven Development (TDD)** approach throughout all phases, ensuring quality, maintainability, and confidence in offline-first functionality. We prioritize Kenya pilots (rural/urban mix) for validation and iterative improvement.

### Current Status: Phase 0 COMPLETE ✅ | Phase 1 COMPLETE ✅ | Phase 2 IN PROGRESS 🚧
- **Phase 0 (Sprints 0.1-0.7)**: All completed ✅
- **Phase 1 (Sprint 1.x)**: All core clinical modules COMPLETE ✅
- **Phase 2 (Sprint 2.x)**: In progress — surveillance, MCH, imaging, allied health, procedures, analytics, MOH reporting mostly complete 🚧
- **Backend**: 38 Django apps, 389 models, 458 migrations
- **Backend Tests**: 494 test files, 10,241 test functions
- **Web App**: Next.js 16 (React 19) with 404 pages, 518 components, 69 API clients, 62 Zod schemas
- **Mobile App**: React Native 0.81 (Expo 54) with 40 screens, offline sync, biometric auth
- **Desktop App**: Offline-first Electron with JWT auth, patient registration, encounters
- **Security**: Fernet encryption, MFA/TOTP, PKI digital signatures, audit hash chain, DPIA completed
- **Deployment**: Azure Container Apps (backend) + Vercel (frontend) + Neon PostgreSQL + PowerSync Cloud

### Deployment URLs
| Service | URL |
|---------|-----|
| **Backend API** | `https://vitora-api.agreeabledune-6cc420cc.eastus.azurecontainerapps.io` |
| **Web Frontend** | `https://vitora-navy.vercel.app` / `https://staging.vitora.digital` |
| **Metabase BI** | `https://vitora-metabase.agreeabledune-6cc420cc.eastus.azurecontainerapps.io` |
| **TibaBot AI** | `https://tibabot.vitora.nexora.africa` |

### Key Stats (April 2026)

| Dimension | Value |
|-----------|-------|
| Backend Django apps | **38** |
| Total data models | **389** |
| Database migrations | **458** |
| Backend test files | **494** |
| Backend test functions | **10,241** |
| Web-app pages | **404** |
| Web-app components | **518** |
| API client modules | **69** |
| Zod schema files | **62** |
| Mobile app screens | **40** |
| CI/CD workflows | **5** |

**🚀 SHA Integration** (all 15 DHA APIs complete):
- ✅ DHA Authentication, Eligibility, Claims, Client Registry, Search, Terminology
- ✅ ICD-11, LOINC, ICHI, SHA Interventions, Drug Products, Active Components

**📦 Implemented Modules (33 Django apps)**:
- ✅ Core (locations, RBAC, audit, sync, organizations, facilities, feature flags, notifications)
- ✅ Patients (registration, allergies, emergency contacts, death records)
- ✅ Encounters (consultations, diagnoses, treatment plans, medications, ICD-10)
- ✅ Triage (KETA scale, vital thresholds, queue management, wait time breaches)
- ✅ Pharmacy (stock, prescriptions, dispensing, alerts, FEFO)
- ✅ Laboratory (orders, specimens, results, validation, LOINC, instruments, diagnostic reports)
- ✅ Billing (invoices, payments, receipts, credit notes, payment points, SHA claims)
- ✅ Inpatient (30+ models: wards, beds, admissions, discharges, transfers, ward rounds, nursing kardex, care plans, fluid balance, blood transfusion, medication admin)
- ✅ Scheduling (resources, shifts, roster, appointments, room-aware clock-in, staff constraints)
- ✅ Clinics (clinic management, rooms, sessions, visits, enrollments, programs)
- ✅ Imaging (DICOM studies/series/instances, radiology reports, procedure catalog)
- ✅ Immunizations (KEPI vaccines, campaigns, AEFI, cold chain, stock management)
- ✅ MCH (ANC visits, delivery, labour partograph, PNC, growth monitoring, HEI follow-up)
- ✅ Surveillance (IDSR weekly reporting, IHR notifications, outbreak thresholds, DHIS2 mapping)
- ✅ Procedures (catalog, orders, consent, logs, consumables, outcomes)
- ✅ Analytics (daily facility summaries, department monthly, diagnosis trends, demographics)
- ✅ MOH Reporting (MOH 705/711/717 with DHIS2 submission tracking)
- ✅ AI / TibaBot (clinical chat, ICD-10 suggest, care plans, CDS, lab interpret, discharge, ICU risk)
- ✅ CDS (clinical decision support rules engine)
- ✅ Referrals (inter-facility referral management)
- ✅ Check-in (patient check-in workflow)
- ✅ Allied Health (physiotherapy, OT, nutrition, social work, counselling)
- ✅ HL7 (HL7v2 messaging, ADT service)
- ✅ KenHDD (Kenya Health Data Dictionary validation)
- ✅ Quality (quality improvement measures, quarterly/annual reports)
- ✅ Clinical Templates (templates, sections, snapshots)
- ✅ Inventory (suppliers, purchase orders, goods receipt, store locations, transfers, ward stock, stock counts, forecasting, reorder, eTIMS integration)

**🤖 AI / TibaBot Integration**:
- ✅ Clinical chat (multi-turn conversational AI for clinicians)
- ✅ ICD-10 code suggestion from clinical text
- ✅ Care plan generation (plain + FHIR R4 CarePlan)
- ✅ CDS rule evaluation via AI
- ✅ Lab result interpretation
- ✅ Discharge assessment & ICU risk prediction
- ✅ Condition prediction from vitals/history
- ✅ Clerking autocomplete & clinical document generation
- ✅ AI feedback collection & stats
- ✅ Stored AI results (care plans, CDS, lab, discharge, ICU risk, investigation suggest)
- ✅ Fallback services when TibaBot is unavailable

**🔐 Security & Compliance**:
- ✅ MFA / Two-Factor Authentication (TOTP devices, backup codes, grace period)
- ✅ Emergency Access Override (break-glass with audit trail and review tasks)
- ✅ PKI & Digital Signatures (Certificate Authority, user certs, RSA-2048 document signing)
- ✅ Tamper-Resistant Audit Log (SHA-256 hash chain verification)
- ✅ SHR Document Sharing (push/pull FHIR bundles to Kenya Shared Health Record)
- ✅ FHIR R4 API endpoints (resource serving with profiles)
- ✅ FHIR IPS conformance testing (Inferno IPS 2.0.0-ballot — all tests passing)
- ✅ Subscription tier enforcement (FREE/BASIC/PROFESSIONAL/ENTERPRISE with 22 feature flags)
- ✅ SNOMED CT integration (concept model + 108 common concepts seeded)
- ✅ Feature Flags, Idempotency Keys, Active Shift Enforcement
- ✅ KMS encryption for M-Pesa API credentials (write-only, never exposed in GET responses)

**📊 Platform Infrastructure**:
- ✅ PowerSync offline-first sync (configured, API-only mode in staging)
- ✅ 6 WebSocket consumers (surveillance, triage, lab, inpatient, MCH, clinics)
- ✅ 18 signal modules (automated cross-app workflows)
- ✅ 9 Celery task modules (background processing)
- ✅ Sentry error tracking (frontend + mobile)
- ✅ Metabase BI dashboards
- ✅ 45+ management commands

**🖥️ Web Frontend (310 pages across 38 route groups)**:
- ✅ Dashboard, admin, patients, encounters, triage
- ✅ Pharmacy, laboratory, billing, inpatient/wards
- ✅ Scheduling, clinics, emergency department
- ✅ Theatre/surgery, imaging, immunizations, MCH
- ✅ Analytics, reports (MOH 705/711/717), surveillance
- ✅ AI assistant, CDS, referrals, procedures
- ✅ Allied health, quality, check-in, notifications
- ✅ Settings, profile, finance, transactions, workflow
- ✅ Inventory (29 pages: suppliers, POs, goods receipt, store locations, transfers, ward stock, stock counts, eTIMS, forecasting/reorder, dashboard)
- ✅ Public displays (queue, triage)

**📱 Mobile App (40 screens)**:
- ✅ Patient management, encounters, triage
- ✅ Pharmacy, laboratory, billing
- ✅ Inpatient (wards, admissions, nursing)
- ✅ MCH (ANC, immunization), screening
- ✅ Settings, audit log, sync/conflicts

### Guiding Principles
1. **TDD First**: Write tests before implementation for all features
2. **Iterative Delivery**: 2-week sprints with demos
3. **User-Centered**: Continuous feedback from clinicians and stakeholders
4. **Compliance-First**: Security and privacy in every sprint
5. **Hybrid Scalability**: Offline-first with optional cloud sync
6. **Kenya-First**: Affordable, localized, with global standards (FHIR, WHO)

---

## Team Structure

### Core Team (8 FTE)
- **Engineering Lead** (1): Architecture, technical decisions
- **Backend Engineers** (2): Django, APIs, database design
- **Frontend Engineers** (2): Next.js, React Native
- **QA Engineers** (2): Test automation, TDD pairing
- **Product Manager** (1): Backlog, stakeholder coordination

### Extended Team (Part-time)
- **DevOps Engineer** (0.5 FTE): CI/CD, infrastructure
- **Security Specialist** (0.5 FTE): Audits, compliance
- **UX Designer** (0.5 FTE): User research, UI/UX
- **Clinical Advisors** (3-5): Kenya clinicians for validation
- **Integration Partners**: SHA, KHIS/DHIS2 liaisons

### Tools & Collaboration
- **Version Control**: GitHub with branch protection rules
- **CI/CD**: GitHub Actions (5 workflows: CI, deploy, security, CodeQL, FHIR)
- **Monitoring**: Sentry (frontend + mobile), Azure Container Apps metrics
- **Testing**: Pytest, Jest, Playwright, Cucumber.js

---

## Phase 0: Inception & Readiness (Jan-Mar 2026) ✅ COMPLETE

### Goals
- Finalize architecture and technical foundation
- Build standalone desktop prototype with TDD
- Establish security baseline and compliance framework
- Set up development infrastructure
- Incorporate clinician feedback for enhanced patient registration

### Sprint Summary (7 sprints × 2 weeks)

| Sprint | Focus | Status | Key Tests |
|--------|-------|--------|-----------|
| **0.1** | Foundation & Planning | ✅ | CI/CD, TDD infrastructure |
| **0.2** | Backend Foundation | ✅ | Patient/Encounter models, 88.34% coverage |
| **0.3** | Desktop Prototype | ✅ | Electron app, E2E with Playwright |
| **0.4** | Security Baseline | ✅ | JWT auth, DPIA, audit logging, Bandit scan |
| **0.5** | Offline Sync Logic | ✅ | 108 tests (encryption, sync queue, conflict resolution) |
| **0.6** | Integration & Demo | ✅ | Login UI, token management, 84.93% coverage |
| **0.7** | Clinician Feedback | ✅ | Emergency contacts, Kenya locations, medical history, SpO2 |

### Phase 0 Final Metrics

| Component | Tests | Coverage |
|-----------|-------|----------|
| Backend (Django) | 467+ | 82.21% |
| Frontend (Jest) | 66 | - |
| E2E (Playwright) | 6 suites | - |

### Key Deliverables
- ✅ Patient registration with auto-MRN (`MRN-YYYYMMDD-XXXX`)
- ✅ Kenya location hierarchy (47 Counties → 289 Sub-Counties → 1448 Wards)
- ✅ Emergency contacts with relationship tracking
- ✅ Clinical encounters with vitals (including SpO2 with critical alerts <95%)
- ✅ Medical history (allergies, chronic conditions, medications, surgeries, family/social history)
- ✅ JWT authentication with refresh tokens (login by username or email)
- ✅ Fernet field-level encryption for sensitive data (national_id, phone_number)
- ✅ Offline sync queue with conflict resolution (SyncQueue, SyncConflict, SyncMetrics)
- ✅ Audit logging (Kenya DPA 2019 compliant - 7 year retention)
- ✅ Electron desktop app with offline patient registration
- ✅ Dark mode with theme persistence

---

## Phase 1: Clinical Core + SHA Integration (Apr-Sep 2026) ✅ COMPLETE

### Goals
- Production-ready PAS (Patient Administration System)
- Complete encounter management with status workflow
- Pharmacy, billing, laboratory, triage, and inpatient modules
- Role-Based Access Control (RBAC) with department scoping
- SHA Integration (all 15 DHA APIs)
- Mobile app foundation (React Native / Expo)
- Web frontend foundation (Next.js)

### Sprint Summary

| Sprint | Focus | Status |
|--------|-------|--------|
| **1.1-1.2** | Encounters + Mobile + RBAC foundation | ✅ |
| **1.3-1.4** | Pharmacy + Lab foundation + Web frontend | ✅ |
| **1.5-1.6** | Billing + Lab workflow + Inpatient + Triage | ✅ |
| **1.7-1.8** | Mobile features + RBAC enforcement + Pharmacy integration | ✅ |
| **1.9-1.10** | SHA Integration (all 15 DHA APIs) | ✅ |
| **1.11-1.12** | Integration testing + Polish | ✅ |

### SHA Integration ✅ ALL 15 APIs

| Service | Endpoint | Status |
|---------|----------|--------|
| Authentication | `/v1/hie-auth` | ✅ |
| Eligibility | `/v2/eligibility` | ✅ |
| Claims Submit | `/v1/shr-med/bundle` | ✅ |
| Claims Status | `/v1/shr-med/claim-status` | ✅ |
| Client Registry Fetch | `/v3/client-registry/fetch-client` | ✅ |
| Client Registry Register | `/v3/uat-cr-registration` | ✅ |
| Client Registry Update | `/v3/update-client` | ✅ |
| Facility Search | `/v1/facility-search` | ✅ |
| Practitioner Search | `/v1/practitioner-search` | ✅ |
| SHA Interventions | `/v1/sha-interventions` | ✅ |
| ICD-11 | `/v1/icd-11` | ✅ |
| ICHI | `/v1/ichi` | ✅ |
| LOINC | `/v1/loinc` | ✅ |
| Drug Products | `/v1/drug-products` | ✅ |
| Active Components | `/v1/active-component` | ✅ |

### Key Phase 1 Deliverables

**Clinical Modules:**
- ✅ Encounter management with status workflow (draft → in_progress → completed)
- ✅ ICD-10 diagnosis codes (104,814 codes) with search
- ✅ Treatment plan templates
- ✅ Pharmacy: stock management, prescriptions, dispensing, FEFO expiry, low-stock alerts
- ✅ Laboratory: orders, specimens, results, LOINC codes, result validation, critical alerts, instruments, diagnostic reports
- ✅ Billing: invoices, payments (cash/M-Pesa), receipts, credit notes, payment points, SHA claims
- ✅ Inpatient: 30+ models (wards, beds, admissions, discharges, transfers, ward rounds, nursing kardex, care plans, fluid balance, blood transfusion, medication admin, shift handover)
- ✅ Triage: KETA scale (RED/ORANGE/YELLOW/GREEN/BLUE), configurable vital thresholds, priority queue, wait time breaches, nurse override

**RBAC & Auth:**
- ✅ Role, Department, StaffProfile models with permission matrix
- ✅ Department-scoped data access
- ✅ Active shift enforcement (write ops require active shift, admin exempt)
- ✅ MFA/TOTP with configurable grace period and backup codes
- ✅ Django admin restricted to Nexora superusers

**Platforms:**
- ✅ Web frontend (Next.js 16, React 19): patient dashboard, encounters, auth, shadcn/ui
- ✅ Mobile app (Expo 54, RN 0.81): patient lookup, encounters, offline sync, biometric auth
- ✅ Scheduling: roster, shifts, room-aware clock-in, staff constraints, appointment management

---

## Phase 2: Surveillance, MCH, Imaging & Reporting (Oct 2026 - Mar 2027) 🚧 IN PROGRESS

### Goals
- Disease surveillance and outbreak alerting
- Maternal & Child Health with KEPI immunization
- Medical imaging and DICOM support
- Procedures and theatre management
- MOH reporting (705/711/717) with DHIS2 integration
- Analytics and business intelligence
- Allied health modules
- Emergency department
- Advanced platform features

### Implementation Status

#### Surveillance ✅ COMPLETE
- ✅ Notifiable disease case reporting
- ✅ IDSR weekly report generation (MOH format)
- ✅ IHR notification workflow
- ✅ Outbreak threshold alerting
- ✅ DHIS2 data element mapping
- ✅ WebSocket consumer for real-time surveillance alerts
- ✅ Frontend pages: dashboard, cases, IHR notifications, IDSR reports

#### MCH (Maternal & Child Health) ✅ COMPLETE
- ✅ MCH registration and ANC visit tracking
- ✅ Delivery management with labour partograph
- ✅ PNC (postnatal care) visits
- ✅ Growth monitoring with age-band tracking
- ✅ HEI (HIV-Exposed Infant) follow-up with PCR testing
- ✅ Community screening
- ✅ WebSocket consumer for MCH updates
- ✅ Frontend + Mobile: MCH list, ANC visits, immunization tracking

#### Immunizations / KEPI ✅ COMPLETE
- ✅ Vaccine definitions (KEPI + adult + campaign + occupational + travel)
- ✅ Multi-dose series tracking with age eligibility
- ✅ Vaccination campaigns lifecycle (planned → active → completed)
- ✅ Individual immunization records with batch/lot tracking
- ✅ AEFI (Adverse Events Following Immunization) reporting
- ✅ Vaccine stock management with cold chain equipment registry
- ✅ Temperature monitoring logs
- ✅ Frontend: immunization dashboard, records, campaigns

#### Imaging / DICOM ✅ COMPLETE
- ✅ Imaging procedure catalog
- ✅ Imaging orders with items
- ✅ DICOM study/series/instance models
- ✅ Radiology report with amendments
- ✅ Signal-based order workflows
- ✅ Frontend: imaging pages with Cornerstone.js DICOM viewer

#### Procedures / Theatre ✅ COMPLETE
- ✅ Procedure catalog (categories, body systems, risk levels, ICHI/CPT/SHA tariff codes)
- ✅ Procedure orders with status workflow (ORDERED → SCHEDULED → IN_PROGRESS → COMPLETED)
- ✅ Consent management (written/verbal/guardian, witness tracking)
- ✅ Procedure logs with timing, staff, findings, complications
- ✅ Consumable tracking and outcome assessment
- ✅ Frontend: theatre dashboard, cases, schedule, checklists, reports

#### Analytics ✅ COMPLETE
- ✅ Facility daily summary (ETL at 02:00 EAT via Celery)
- ✅ Department monthly summaries (OPD, IPD, Emergency, Pharmacy, Lab, Imaging, MCH, Theatre)
- ✅ Diagnosis trending (weekly/monthly by ICD-10, age-band, gender)
- ✅ Patient demographic snapshots (age, gender, county distribution)
- ✅ Metabase BI dashboards deployed
- ✅ Frontend: analytics dashboard, reports pages

#### MOH Reporting / KHIS ✅ COMPLETE
- ✅ MOH 705 (outpatient morbidity tally with per-disease breakdown)
- ✅ MOH 711 (integrated RH/HIV/Malaria/Nutrition monthly)
- ✅ MOH 717 (facility workload summary)
- ✅ DHIS2 data element mapping per environment (staging vs production)
- ✅ Report lifecycle: DRAFT → APPROVED → SUBMITTED (with DHIS2 tracking)
- ✅ Frontend: MOH report listing, creation, detail pages

#### Allied Health ✅ COMPLETE
- ✅ Physiotherapy (treatment types, orders, sessions)
- ✅ Occupational therapy (treatment types, orders, sessions)
- ✅ Nutrition (consultations, diet plans)
- ✅ Social work (referrals, cases, notes, interventions)
- ✅ Counselling (types, referrals, sessions)
- ✅ Frontend: allied health dashboard and sub-pages

#### CDS (Clinical Decision Support) ✅ COMPLETE
- ✅ CDSRule and CDSAlert models
- ✅ Rules engine with signal-based automated evaluation
- ✅ AI-assisted CDS evaluation via TibaBot
- ✅ Stored CDS results
- ✅ Frontend: CDS dashboard

#### Emergency Department ✅ COMPLETE
- ✅ Emergency zones, ER bed management
- ✅ Real-time queue display
- ✅ Frontend: emergency dashboard, bed board, queue

#### Inventory / Supply Chain ✅ COMPLETE
- ✅ Supplier management (CRUD, contact details, tax PINs, status tracking)
- ✅ Purchase orders with line items (DRAFT → SUBMITTED → APPROVED → RECEIVED → CANCELLED)
- ✅ Goods receipt notes with batch/lot tracking and quality checks
- ✅ Store locations (main stores, sub-stores, pharmacy, ward stock points)
- ✅ Inter-store transfers with approval workflow (PENDING → APPROVED → SHIPPED → RECEIVED)
- ✅ Ward stock management (par levels, replenishment requests)
- ✅ Stock counts / physical inventory (FULL, PARTIAL, CYCLE, SPOT) with variance analysis
- ✅ KRA eTIMS integration (invoice submission, status tracking, retry logic)
- ✅ Consumption-based demand forecasting (moving average, exponential smoothing, seasonal)
- ✅ Reorder point calculation with safety stock and lead time
- ✅ 31 models, 292 tests, 29 frontend pages, 74 API methods

#### Additional Phase 2 Completions ✅
- ✅ Check-in module (check-in workflow with state history)
- ✅ Referrals (inter-facility clinical referral management)
- ✅ HL7 (HL7v2 message model, ADT service, queue, ingestion command)
- ✅ KenHDD (Kenya Health Data Dictionary validation)
- ✅ Quality improvement (measures, quarterly/annual reports)
- ✅ Clinical templates with snapshots
- ✅ Clinics management (rooms, sessions, visits, enrollments, programs, public queue)
- ✅ Activity feed (system-wide event stream)
- ✅ Credit notes and payment points (billing)
- ✅ Lab email notifications (HTML/text templates for critical results)

### Remaining Phase 2 Work 📋

| Item | Status | Notes |
|------|--------|-------|
| Invoice PDF generation (WeasyPrint) | 📋 Pending | Templates designed, not yet wired |
| Private insurance module | 📋 Pending | Beyond SHA — private insurance pre-auth, claims |
| Payment reconciliation (bank/M-Pesa) | 📋 Pending | Statement import and matching |
| KRA eTIMS integration | ✅ Complete | Electronic tax invoicing via inventory eTIMS module |
| PowerSync activation in production | 📋 Pending | Infrastructure fully wired, disabled in staging |
| Kenya pilot deployments | 📋 Pending | 2 sites planned (1 rural, 1 urban) |
| FHIR conformance testing (Inferno) | ✅ Complete | IPS 2.0.0-ballot profile — all tests passing |
| Advanced inventory (suppliers, POs) | ✅ Complete | 31 models, 29 pages, full procurement + forecasting |

### Phase 2 Risks & Mitigations
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Pilot site connectivity | High | Medium | Offline-first design, PowerSync ready |
| DHIS2 API complexity | Medium | High | MOH report models + DHIS2 mapping built |
| Cloud costs | High | Medium | Azure cost monitoring, reserved instances |
| Multi-site sync conflicts | High | Medium | Conflict resolution built, PowerSync ready |

---

## Phase 3: Pilots, Scaling & Advanced Billing (Apr-Sep 2027, 6 months)

### Goals
- Kenya pilot deployments and real-world validation
- PowerSync activation for production offline-first
- Advanced billing (insurance, reconciliation, KRA eTIMS)
- FHIR conformance certification
- BI expansion and custom report builder
- Scale to 15 total sites

### Sprint Breakdown (12 sprints × 2 weeks)

#### Sprint 3.1-3.3: Pilot Deployments (Weeks 1-6)
- [ ] Deploy to pilot site 1 (rural clinic)
- [ ] Deploy to pilot site 2 (urban hospital)
- [ ] Activate PowerSync for offline-first operation
- [ ] On-site training for clinical staff
- [ ] Invoice PDF generation (WeasyPrint)
- [ ] Collect user feedback and iterate
- [ ] Performance monitoring and telemetry

#### Sprint 3.4-3.6: Advanced Billing & Compliance (Weeks 7-12)
- [ ] Private insurance module (pre-auth, claims, providers)
- [ ] Payment reconciliation (bank + M-Pesa statements)
- [x] KRA eTIMS integration (electronic tax invoicing) — completed in Phase 2
- [ ] SHA claims batch optimization
- [x] Advanced inventory (suppliers, purchase orders) — completed in Phase 2

#### Sprint 3.7-3.9: BI & Reporting Expansion (Weeks 13-18)
- [ ] Custom report builder UI
- [ ] Metabase dashboard expansion
- [ ] ETL pipeline optimization
- [ ] MOH report auto-submission to DHIS2 production
- [ ] Epidemiological trending dashboards

#### Sprint 3.10-3.12: Multi-Site Expansion (Weeks 19-24)
- [ ] Deploy to 5 additional sites (total: 7)
- [x] FHIR conformance testing (Inferno suite) — completed in Phase 2
- [ ] Performance optimization (query tuning, Redis caching)
- [ ] Disaster recovery testing
- [ ] Phase 3 retrospective

### Phase 3 Success Metrics
- [ ] 7+ operational sites for ≥60 days
- [ ] ≥90% offline uptime with PowerSync
- [ ] <5% sync conflicts
- [ ] SHA claims success rate ≥95%
- [ ] MOH reports auto-submitted to DHIS2
- [ ] User satisfaction ≥4/5

---

## Phase 4: AI/ML, Global Readiness & Open Source (Oct-Dec 2027, 3 months)

### Goals
- On-device ML models for offline clinical prediction
- Advanced FHIR interoperability (HL7v2↔FHIR bridge)
- Full SNOMED CT expansion (350K+ concepts)
- Multi-language support (Swahili, English, French)
- Scale to 30+ sites
- Open-source community launch

### Already Completed (ahead of schedule) ✅
- ✅ AI clinical chat, ICD-10 suggest, care plan generation
- ✅ Lab interpretation, discharge assessment, ICU risk prediction
- ✅ CDS evaluation, condition prediction, clerking autocomplete
- ✅ FHIR R4 endpoints, validator, client, SHR document sharing
- ✅ HL7v2 message model, ADT service, queue, ingestion
- ✅ SNOMED CT concept model (108 common concepts)
- ✅ LOINC, ICD-10 (104,814 codes), ICD-11 (via DHA API)

### Remaining for Phase 4

#### Sprint 4.1-4.2: On-Device ML (Weeks 1-4)
- [ ] Sepsis early warning model (ONNX for offline)
- [ ] Appointment no-show prediction
- [ ] AI-powered drug interaction safety checks
- [ ] ML model monitoring and drift detection

#### Sprint 4.3-4.4: Advanced Interoperability (Weeks 5-8)
- [x] FHIR R4 conformance certification (Inferno) — completed in Phase 2
- [ ] Bidirectional HL7v2 ↔ FHIR translation
- [ ] Full SNOMED CT expansion (350K+ concepts)
- [ ] FHIR Subscriptions for real-time interop

#### Sprint 4.5-4.6: Global Scaling & Open Source (Weeks 9-12)
- [ ] Multi-language support (i18n: Swahili, English, French)
- [ ] Multi-currency billing
- [ ] Open-source release preparation (Apache 2.0)
- [ ] Developer documentation and community launch
- [ ] Scale to 30+ sites

### Phase 4 Success Metrics
- [ ] AI models validated by clinicians
- [ ] FHIR conformance tests passing
- [ ] 30+ sites operational
- [ ] Open-source repo launched
- [ ] Community contributions from ≥5 external developers

---

## Technical Architecture

### Backend Stack
| Layer | Technology |
|-------|-----------|
| Framework | Django 5.x + Django REST Framework |
| Database | SQLite (standalone) / PostgreSQL (Neon, cloud) |
| Async | Django Channels + Daphne (ASGI) |
| Background | Celery + Redis (9 task modules) |
| Sync | PowerSync Cloud (offline-first) |
| Auth | JWT (SimpleJWT) + TOTP MFA |
| Encryption | Fernet (AES-128) for PII fields |
| Real-time | 6 WebSocket consumers |
| Signals | 18 signal modules (cross-app workflows) |

### Frontend Stack
| Layer | Technology |
|-------|-----------|
| Web | Next.js 16, React 19, TypeScript 5.3, Tailwind CSS, shadcn/ui |
| Mobile | React Native 0.81, Expo 54, expo-router |
| Desktop | Electron with embedded Django |
| State | React Query (TanStack), Zustand |
| Validation | Zod (62 schema files) |
| Charts | Recharts |
| DICOM | Cornerstone.js |
| Monitoring | Sentry |

### Infrastructure
| Service | Platform |
|---------|----------|
| Backend | Azure Container Apps (Docker) |
| Frontend | Vercel |
| Database | Neon PostgreSQL (EU Central) |
| Sync | PowerSync Cloud (EU Central) |
| BI | Metabase (Azure Container Apps) |
| AI | TibaBot API (self-hosted) |
| CI/CD | GitHub Actions (5 workflows: CI, deploy, security, CodeQL, FHIR) |
| Security | CodeQL, Bandit, dependency scanning |

---

## Test-Driven Development (TDD) Strategy

### Coverage Requirements
- Minimum 80% overall coverage (enforced by CI/CD)
- 100% coverage for critical paths (auth, billing, sync)
- Contract tests for all serializers (32 contract test files)

### Test Pyramid
- **70% Unit Tests**: Fast, isolated, high coverage
- **20% Integration Tests**: API, database, component integration
- **10% E2E Tests**: Full user workflows, UI automation

### Testing Infrastructure
| Tool | Purpose |
|------|---------|
| Pytest | Backend unit + integration tests |
| Jest | Frontend unit tests |
| Playwright | E2E browser tests |
| Cucumber.js | BDD acceptance tests |
| Contract tests | Serializer shape validation |
| Bandit | Python security scanning |
| CodeQL | Multi-language SAST |

### Per-App Test Shortcuts (Makefile)
```bash
make test-encounters    make test-patients    make test-triage
make test-lab          make test-pharmacy    make test-imaging
make test-clinics      make test-billing     make test-inpatient
make test-ai           make test-cds         make test-rbac
make test-mch          make test-scheduling  make test-checkin
make test-surveillance make test-dashboard   make test-notifications
make test-contracts    make test-fhir        make test-shr
```

---

## Risk Management

### Critical Path Items
1. **Phase 2 (remaining)**: PowerSync activation for production offline-first
2. **Phase 3**: Pilot sites must achieve 90% uptime
3. **Phase 3**: SHA claims must pass certification
4. **Phase 3**: Performance must support 15 sites concurrently
5. **All Phases**: Security audits must pass with no critical findings

### Budget
- **Allocated**: $500K
- **Contingency**: $100K (20%)
- **Burn Rate Monitoring**: Monthly reviews

### Quality Gates (Phase Transition)
- [ ] All tests passing (≥80% coverage)
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] User acceptance criteria met
- [ ] Documentation complete
- [ ] Stakeholder sign-off

---

## Success Definition

By Q4 2027, Vitora HMIS will be considered successful if:

### Technical
- [ ] 30+ operational sites in Kenya
- [ ] ≥90% offline uptime across all sites
- [ ] ≥80% test coverage maintained
- [ ] <5% sync conflict rate
- [ ] Zero critical security vulnerabilities
- [ ] 100% Kenya Data Protection Act compliance ✅

### User
- [ ] ≥4/5 user satisfaction across all user types
- [ ] ≥80% daily active user rate at sites
- [ ] <30 minutes average training time for basic tasks

### Business
- [ ] SHA claims integration certified
- [ ] KHIS reporting automated for 100% of sites
- [ ] Open-source community launched

### Clinical
- [ ] Measurable improvement in patient wait times
- [ ] Improved data quality for KHIS reporting
- [ ] Zero patient safety incidents due to system issues

---

## Glossary

| Acronym | Full Name |
|---------|-----------|
| TDD | Test-Driven Development |
| MRN | Medical Record Number |
| SHA | Social Health Authority (Kenya) |
| DHA | Digital Health Agency (Kenya) |
| KHIS | Kenya Health Information System (DHIS2-based) |
| FHIR | Fast Healthcare Interoperability Resources |
| DPIA | Data Protection Impact Assessment |
| KEPI | Kenya Expanded Programme on Immunization |
| MCH | Maternal and Child Health |
| PACS | Picture Archiving and Communication System |
| DICOM | Digital Imaging and Communications in Medicine |
| IDSR | Integrated Disease Surveillance and Response |
| IHR | International Health Regulations |
| CDS | Clinical Decision Support |
| RBAC | Role-Based Access Control |
| MFA | Multi-Factor Authentication |
| TOTP | Time-based One-Time Password |
| PKI | Public Key Infrastructure |
| SHR | Shared Health Record |
| HL7 | Health Level Seven (interoperability standard) |
| AEFI | Adverse Event Following Immunization |
| KenHDD | Kenya Health Data Dictionary |
| MOH | Ministry of Health |
| eTIMS | Electronic Tax Invoice Management System |

---

**Document Control**
- **Version**: 3.2
- **Author**: Engineering Lead
- **Review Cycle**: Monthly
- **Next Review**: June 14, 2026

**Changelog**
- 2026-05-14: v3.2 — FHIR IPS conformance testing complete (Inferno IPS 2.0.0-ballot, all tests passing). Subscription tier enforcement implemented (22 feature flags). Updated stats: 38 apps, 389 models, 458 migrations, 10,241 tests, 404 web pages, 518 components, 69 API clients, 62 Zod schemas.
- 2026-04-16: v3.1 — Added Inventory module (33rd app): 31 models, 29 frontend pages, eTIMS integration, demand forecasting. M-Pesa credentials KMS-encrypted. Updated stats: 301 migrations, 8,421 tests, 339 web pages.
- 2026-04-16: v3.0 — Major rewrite reflecting actual state: 32 apps, 294 migrations, 8,129 tests, 310 web pages, 40 mobile screens. Phase 0+1 complete. Phase 2 mostly complete. Azure Container Apps + Vercel deployment. Streamlined future phases.
- 2026-03-21: v2.1 — Added undocumented features (AI/TibaBot, MFA, PKI, emergency access, FHIR, SNOMED, WebSockets)
- 2026-03-21: v2.0 — Phase 1 complete, Phase 2 in progress
- 2025-12-27: Initial roadmap created with TDD integration
