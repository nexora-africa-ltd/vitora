# DHA Compliance Gap Closure Roadmap

> **Strategic plan to achieve full DHA compliance for Vitora HMIS.**
>
> Version: 1.0
> Created: February 22, 2026
> Target: Q4 2027

---

## Executive Summary

Vitora HMIS currently achieves **43% full DHA compliance** (40/93 items) with **73% at least partially addressed** (68/93). This roadmap outlines a phased approach to close the 53 remaining gaps over 18 months, prioritized by regulatory criticality and implementation complexity.

### Compliance Trajectory

| Milestone | Target Date | Compliance | Items Closed |
|-----------|-------------|:----------:|:------------:|
| **Current State** | Feb 2026 | 43% | — |
| **Phase 1 Complete** | Jun 2026 | 65% | +20 |
| **Phase 2 Complete** | Dec 2026 | 82% | +16 |
| **Phase 3 Complete** | Jun 2027 | 95% | +12 |
| **Full Compliance** | Dec 2027 | 100% | +5 |

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

#### 2. MFA Implementation `P0` `REQUIRED`
- **Gap**: No multi-factor authentication
- **Action**:
  - [ ] Add `django-otp` + `django-two-factor-auth` backend
  - [ ] Implement TOTP enrollment flow (QR code + backup codes)
  - [ ] Add MFA requirement for sensitive roles (ADMIN, CLINICAL_SENIOR, MANAGEMENT)
  - [ ] Frontend MFA setup wizard in settings
  - [ ] Tests: 25+ unit tests, 5 E2E tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: `core/mfa/`, MFA settings UI

#### 3. Backup & Disaster Recovery `P0` `REQUIRED`
- **Gap**: No backup strategy, no DR plan
- **Action**:
  - [ ] Configure automated PostgreSQL backups (pg_dump daily)
  - [ ] Set up off-site backup (S3/Wasabi encrypted)
  - [ ] Define RTO: 4 hours, RPO: 1 hour
  - [ ] Document DR runbook
  - [ ] Test backup restoration
  - [ ] Add backup monitoring alerts
- **Owner**: DevOps
- **Effort**: 2 weeks
- **Deliverables**: `scripts/backup.sh`, `docs/disaster-recovery.md`

#### 4. Emergency Access Procedures `P1` `REQUIRED`
- **Gap**: No break-glass mechanism
- **Action**:
  - [ ] Create `EmergencyAccess` model (reason, duration, approver)
  - [ ] Implement break-glass flow with mandatory audit logging
  - [ ] Add emergency access dashboard for administrators
  - [ ] Auto-escalation alerts via email/SMS
  - [ ] Tests: 15+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: `core/emergency_access/`

### Sprint 1.B — Disease Surveillance Foundation (Weeks 5-8)

#### 5. Immediate Reportable Diseases `P0` `CRITICAL`
- **Gap**: No disease surveillance module
- **Action**:
  - [ ] Create `surveillance` Django app
  - [ ] Define `NotifiableDisease` model (ICD-10 codes, MOH category, reporting timeline)
  - [ ] Seed with MOH 502 notifiable diseases list
  - [ ] Auto-flag encounters with notifiable diagnoses
  - [ ] Create reporting endpoint for county health offices
  - [ ] Real-time WebSocket alerts for immediate reportable diseases
  - [ ] Tests: 30+ unit tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: `hmis/apps/surveillance/`

#### 6. IDSR Weekly Reporting `P0` `CRITICAL`
- **Gap**: No IDSR implementation
- **Action**:
  - [ ] Create `IDSRWeeklyReport` model (epidemiological week, disease counts, facility)
  - [ ] Implement automated weekly aggregation (Celery task, runs Sunday midnight)
  - [ ] Build IDSR summary dashboard
  - [ ] DHIS2 submission endpoint
  - [ ] Tests: 20+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: IDSR reporting UI, Celery task

### Sprint 1.C — Clinical Data Model Enhancements (Weeks 9-12)

#### 7. Structured Allergy Model `P1` `REQUIRED`
- **Gap**: Allergies are free-text only
- **Action**:
  - [ ] Create `Allergy` model (patient FK, substance, reaction_type, severity, onset_date, status)
  - [ ] Implement allergy substance lookup (HPT registry when available, local drug list fallback)
  - [ ] Migration: parse existing `Encounter.allergies` text into structured records
  - [ ] Drug-allergy interaction checking in prescription flow
  - [ ] FHIR AllergyIntolerance resource mapping
  - [ ] Frontend allergy management UI
  - [ ] Tests: 35+ unit tests
- **Owner**: Backend + Frontend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: `patients/models.py::Allergy`, allergy UI

#### 8. Birth Certificate Identification Type `P1`
- **Gap**: Not in `IDENTIFICATION_TYPE_CHOICES`
- **Action**:
  - [ ] Add `birth_certificate` to `IDENTIFICATION_TYPE_CHOICES`
  - [ ] Migration
  - [ ] Update patient registration forms
  - [ ] Tests: 5 unit tests
- **Owner**: Backend Team
- **Effort**: 2 hours
- **Deliverables**: Migration, form update

#### 9. IPS Bundle Dynamic Population `P1`
- **Gap**: Medications/allergies not dynamically populated in IPS
- **Action**:
  - [ ] Query active prescriptions for IPS MedicationStatement section
  - [ ] Query allergies for IPS AllergyIntolerance section
  - [ ] Include TreatmentPlan as FHIR CarePlan resource
  - [ ] Tests: 15 unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: Updated `fhir/views.py::generate_ips_bundle()`

### Sprint 1.D — Audit & Integrity Enhancements (Weeks 13-16)

#### 10. Audit Trail Enhancements `P1`
- **Gap**: No automatic field-level diff, no version tracking
- **Action**:
  - [ ] Integrate `django-simple-history` for model versioning
  - [ ] Apply to Patient, Encounter, Prescription, Diagnosis models
  - [ ] Add `get_field_changes()` method for audit detail population
  - [ ] Version history UI in patient/encounter detail pages
  - [ ] Tests: 20+ unit tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: Model history, version diff UI

#### 11. Key Management System `P1`
- **Gap**: Keys in environment variables only
- **Action**:
  - [ ] Integrate AWS KMS or HashiCorp Vault (or Azure Key Vault for render)
  - [ ] Implement key rotation mechanism (annual rotation minimum)
  - [ ] Document key management procedures
  - [ ] Tests: 10 unit tests
- **Owner**: DevOps
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: KMS integration, `docs/key-management.md`

#### 12. Frontend Auto-Logoff `P1`
- **Gap**: No frontend idle timeout
- **Action**:
  - [ ] Add idle timer hook (15 min warning, 30 min auto-logout)
  - [ ] Show countdown modal before logout
  - [ ] Persist to localStorage to sync across tabs
  - [ ] Tests: 5 frontend tests
- **Owner**: Frontend Team
- **Effort**: 3 days
- **Deliverables**: `useIdleTimer` hook, logout warning modal

---

## Phase 2: Important Features (Q3-Q4 2026)

> **Goal**: Complete clinical modules and reporting capabilities.

### Sprint 2.A — Allied Health Modules (Weeks 1-6)

#### 13. Physiotherapy CPOE `P2`
- **Gap**: No dedicated physiotherapy order workflow
- **Action**:
  - [ ] Create `PhysiotherapyOrder` model (referral, treatment_type, sessions, frequency)
  - [ ] Create `PhysiotherapySession` model (date, notes, outcome)
  - [ ] Clinic queue integration
  - [ ] Billing integration
  - [ ] Tests: 25+ unit tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: `hmis/apps/physiotherapy/`

#### 14. Nutrition/Dietetics CPOE `P2`
- **Gap**: No dedicated nutrition order workflow
- **Action**:
  - [ ] Create `NutritionConsultation` model (assessment, BMI, recommendations)
  - [ ] Create `DietPlan` model (meal_plan, restrictions, supplements)
  - [ ] Integrate with anthropometric measurements
  - [ ] Tests: 20+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: `hmis/apps/nutrition/`

#### 15. Occupational Therapy Module `P2`
- **Gap**: No occupational therapy module
- **Action**:
  - [ ] Create `OccupationalTherapyOrder` model (referral, assessment_type, goals)
  - [ ] Create `OTSession` model (activities, progress_notes, outcome)
  - [ ] Clinic queue integration
  - [ ] Tests: 20+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: `hmis/apps/occupational_therapy/`

#### 16. Social Work Module `P2`
- **Gap**: No social work module
- **Action**:
  - [ ] Create `SocialWorkReferral` model (reason, urgency, assigned_worker)
  - [ ] Create `SocialWorkCase` model (assessment, interventions, outcome)
  - [ ] GBV case tracking with enhanced privacy
  - [ ] Tests: 20+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: `hmis/apps/social_work/`

#### 17. Counselling Module `P2`
- **Gap**: No dedicated counselling order model
- **Action**:
  - [ ] Create `CounsellingSession` model (type, duration, notes, follow_up)
  - [ ] Session types: HIV, Mental Health, Family Planning, General
  - [ ] Integration with mental health encounters
  - [ ] Tests: 15+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: `hmis/apps/counselling/`

### Sprint 2.B — MCH & Growth Charts (Weeks 7-10)

#### 18. MCH Register & Mother-Baby Linkage `P2`
- **Gap**: No dedicated MCH register
- **Action**:
  - [ ] Create `MCHRegistration` model (mother_patient, edd, gravida, parity)
  - [ ] Create `Delivery` model (date, type, outcome, baby_patient FK)
  - [ ] Mother-baby linkage in patient model
  - [ ] ANC visit tracking (10 contacts per WHO guidelines)
  - [ ] PNC visit tracking
  - [ ] MCH card generation (MOH 405/510)
  - [ ] Tests: 40+ unit tests
- **Owner**: Backend Team
- **Effort**: 3 sprints (6 weeks)
- **Deliverables**: `hmis/apps/mch/`

#### 19. Pediatric Growth Charts `P2`
- **Gap**: No growth chart tracking
- **Action**:
  - [ ] Create `GrowthMeasurement` model (weight, height, head_circumference, muac, date)
  - [ ] Implement WHO growth standards Z-score calculation
  - [ ] Percentile tracking and visualization
  - [ ] Malnutrition flagging (SAM/MAM)
  - [ ] Growth chart PDF export
  - [ ] Tests: 25+ unit tests
- **Owner**: Backend + Frontend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: Growth chart component, Z-score calculations

### Sprint 2.C — Quality Measures & Reporting (Weeks 11-16)

#### 20. Quarterly & Annual Reports `P2`
- **Gap**: Only monthly reports exist
- **Action**:
  - [ ] Create `QuarterlyReport` model (aggregates 3 MonthlyClinicReports)
  - [ ] Create `AnnualReport` model (aggregates 4 QuarterlyReports)
  - [ ] Automated Celery tasks for quarterly/annual generation
  - [ ] DHIS2 quarterly submission
  - [ ] Tests: 15+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: Quarterly/annual report models, Celery tasks

#### 21. Standard Quality Measures (CQM) `P2`
- **Gap**: No standard CQM definitions
- **Action**:
  - [ ] Create `QualityMeasure` model (code, name, description, numerator_logic, denominator_logic)
  - [ ] Seed with Kenya-specific quality indicators
  - [ ] Implement measure calculation engine
  - [ ] Quality dashboard with trends
  - [ ] Tests: 20+ unit tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: Quality measures framework

#### 22. Quality Measure Import/Export `P2`
- **Gap**: No import/export mechanism
- **Action**:
  - [ ] CSV/JSON import for quality measure definitions
  - [ ] QRDA-style export format (simplified)
  - [ ] DHIS2 indicator mapping
  - [ ] Tests: 10+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: Import/export endpoints

### Sprint 2.D — Public Health Reporting (Weeks 17-20)

#### 23. Public Health Event Detection `P2`
- **Gap**: No outbreak detection
- **Action**:
  - [ ] Create `OutbreakThreshold` model (disease, county, threshold_count, period_days)
  - [ ] Implement threshold-based detection (e.g., >3 cholera cases in 7 days)
  - [ ] Create `PublicHealthAlert` model (event_type, affected_area, escalation_status)
  - [ ] Alert notification system (email, SMS to county health team)
  - [ ] Tests: 25+ unit tests
- **Owner**: Backend Team
- **Effort**: 2 sprints (4 weeks)
- **Deliverables**: Outbreak detection engine

#### 24. IHR Compliance Framework `P2`
- **Gap**: No IHR implementation
- **Action**:
  - [ ] Define IHR notifiable conditions (MERS, Ebola, polio, etc.)
  - [ ] Create `IHRNotification` model (condition, report_date, who_notified)
  - [ ] Escalation workflow to MOH
  - [ ] IHR-compliant reporting templates
  - [ ] Tests: 15+ unit tests
- **Owner**: Backend Team
- **Effort**: 1 sprint (2 weeks)
- **Deliverables**: IHR notification workflow

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

| Metric | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|--------|:--------------:|:--------------:|:--------------:|
| DHA Compliance Score | 65% | 82% | 100% |
| Test Coverage | 85% | 88% | 90% |
| Critical Gaps Closed | 8/8 | 8/8 | 8/8 |
| Required Gaps Closed | 15/15 | 15/15 | 15/15 |
| Important Gaps Closed | 0/18 | 18/18 | 18/18 |
| Enhancement Gaps Closed | 0/12 | 0/12 | 12/12 |

---

## Appendix: Gap-to-Sprint Mapping

| Gap | Priority | Sprint | Status |
|-----|:--------:|:------:|:------:|
| ODPC Registration | P0 | 1.A | ⬜ |
| MFA Implementation | P0 | 1.A | ⬜ |
| Backup & Disaster Recovery | P0 | 1.A | ⬜ |
| Emergency Access Procedures | P1 | 1.A | ⬜ |
| Immediate Reportable Diseases | P0 | 1.B | ⬜ |
| IDSR Weekly Reporting | P0 | 1.B | ⬜ |
| Structured Allergy Model | P1 | 1.C | ⬜ |
| Birth Certificate ID Type | P1 | 1.C | ⬜ |
| IPS Bundle Dynamic Population | P1 | 1.C | ⬜ |
| Audit Trail Enhancements | P1 | 1.D | ⬜ |
| Key Management System | P1 | 1.D | ⬜ |
| Frontend Auto-Logoff | P1 | 1.D | ⬜ |
| Physiotherapy CPOE | P2 | 2.A | ⬜ |
| Nutrition/Dietetics CPOE | P2 | 2.A | ⬜ |
| Occupational Therapy Module | P2 | 2.A | ⬜ |
| Social Work Module | P2 | 2.A | ⬜ |
| Counselling Module | P2 | 2.A | ⬜ |
| MCH Register & Mother-Baby Linkage | P2 | 2.B | ⬜ |
| Pediatric Growth Charts | P2 | 2.B | ⬜ |
| Quarterly & Annual Reports | P2 | 2.C | ⬜ |
| Standard Quality Measures (CQM) | P2 | 2.C | ⬜ |
| Quality Measure Import/Export | P2 | 2.C | ⬜ |
| Public Health Event Detection | P2 | 2.D | ⬜ |
| IHR Compliance Framework | P2 | 2.D | ⬜ |
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
