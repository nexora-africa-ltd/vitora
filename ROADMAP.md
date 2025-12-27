# Vitora HMIS - Comprehensive Development Roadmap

**Version**: 1.0  
**Last Updated**: December 27, 2025  
**Target Completion**: Q4 2027  
**Methodology**: Test-Driven Development (TDD) with Agile Sprints

---

## Executive Summary

This roadmap outlines the complete development journey for Vitora HMIS from January 2026 to Q4 2027. The project adopts a **Test-Driven Development (TDD)** approach throughout all phases, ensuring quality, maintainability, and confidence in offline-first functionality. We prioritize Kenya pilots (rural/urban mix) for validation and iterative improvement.

### Key Metrics
- **Total Effort**: 15-20 person-years
- **Budget**: ~$500K (leveraging open-source, local talent)
- **Success Criteria**:
  - 90% offline uptime
  - <5% sync conflicts
  - ≥80% test coverage (enforced via TDD)
  - User satisfaction >4/5 in pilots
  - 100% Kenya Data Protection Act compliance

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
- **Project Management**: GitHub Projects with automated workflows
- **Version Control**: GitHub with branch protection rules
- **CI/CD**: GitHub Actions with automated testing
- **Communication**: Slack/Discord for daily standups
- **Documentation**: Confluence/Notion + inline code docs
- **Testing**: Pytest, Jest, Playwright with coverage reports

---

## Phase 0: Inception & Readiness (Jan-Mar 2026, 3 months)

### Goals
- Finalize architecture and technical foundation
- Build standalone desktop prototype with TDD
- Establish security baseline and compliance framework
- Set up development infrastructure

### Sprint Breakdown (6 sprints × 2 weeks)

#### Sprint 0.1: Foundation & Planning (Weeks 1-2)
**TDD Focus**: Set up testing infrastructure before any code

**Tasks**:
- [x] Vision refinement workshop with Kenyan clinicians
- [x] Review and incorporate consultant feedback from PDF
- [x] Define MVP scope and acceptance criteria
- [x] Set up GitHub repository with branch protection
- [x] Configure CI/CD pipeline with test gates
- [x] Install Pytest, coverage tools, linters (Ruff, Black)
- [x] Create test templates and TDD guidelines document
- [x] Define coding standards and review process

**Deliverables**:
- Project charter document
- TDD guidelines and test templates
- CI/CD pipeline running (even with no code)
- Development environment setup guide

**Tests First**:
- Write infrastructure tests (CI/CD validation)
- Create smoke tests for empty project structure

#### Sprint 0.2: Backend Foundation (Weeks 3-4)
**TDD Focus**: Test models and API endpoints before implementation

**Tasks**:
- [x] **Write tests first**: Patient model tests (MRN generation, validation)
- [x] Implement Patient model to pass tests
- [x] **Write tests first**: Encounter model tests (vitals validation)
- [x] Implement Encounter model to pass tests
- [x] **Write tests first**: API endpoint tests for patient CRUD
- [x] Implement patient API endpoints to pass tests
- [x] Configure SQLite and PostgreSQL settings with tests
- [x] Set up Django migrations with rollback tests

**Deliverables**:
- Django backend with Patient and Encounter models
- Comprehensive test suite (≥80% coverage) - **88.34% achieved**
- API documentation (auto-generated from tests)
- Database migration scripts

**Test Coverage Requirements**:
- Unit tests: 100% for models and utilities
- Integration tests: 100% for API endpoints
- Database tests: Both SQLite and PostgreSQL

#### Sprint 0.3: Desktop Prototype (Weeks 5-6)
**TDD Focus**: Test Electron integration and local server startup

**Tasks**:
- [ ] **Write tests first**: Backend startup/shutdown tests
- [ ] Implement Electron main process with backend integration
- [ ] **Write tests first**: Window management tests
- [ ] Implement basic window and navigation
- [ ] **Write tests first**: Local database connection tests
- [ ] Integrate SQLite with Electron app
- [ ] **Write tests first**: Patient registration UI tests (E2E)
- [ ] Build patient registration form

**Deliverables**:
- Electron desktop app prototype
- Working patient registration offline
- E2E test suite with Playwright
- Packaging scripts for Windows/Mac/Linux

**Test Coverage Requirements**:
- E2E tests: Critical user flows (register patient, view patient)
- Integration tests: Electron ↔ Backend communication
- Unit tests: Main process logic

#### Sprint 0.4: Security Baseline (Weeks 7-8)
**TDD Focus**: Security tests and compliance validation

**Tasks**:
- [ ] **Write tests first**: Encryption tests for local database
- [ ] Implement SQLCipher integration
- [ ] **Write tests first**: Authentication/authorization tests
- [ ] Implement JWT-based auth system
- [ ] **Write tests first**: Sensitive data access control tests
- [ ] Implement SensitiveAccessPermission
- [ ] Conduct DPIA (Data Protection Impact Assessment)
- [ ] Create audit log system with tests
- [ ] Penetration testing on prototype

**Deliverables**:
- Encrypted local database (SQLCipher)
- Authentication system with tests
- DPIA documentation
- Security audit report
- Audit logging system

**Test Coverage Requirements**:
- Security tests: 100% for auth and encryption
- Compliance tests: Automated GDPR/Kenya DPA checks
- Penetration test results

#### Sprint 0.5: Offline Sync Logic (Weeks 9-10)
**TDD Focus**: Test sync conflict resolution and queuing

**Tasks**:
- [ ] **Write tests first**: Offline queue tests
- [ ] Implement local change queue
- [ ] **Write tests first**: Sync conflict resolution tests
- [ ] Implement last-write-wins with user prompts
- [ ] **Write tests first**: Network status detection tests
- [ ] Implement connectivity monitoring
- [ ] **Write tests first**: Background sync tests
- [ ] Implement Celery background sync tasks
- [ ] Test offline → online → offline transitions

**Deliverables**:
- Offline queue system with tests
- Conflict resolution mechanism
- Background sync with Celery
- Network resilience tests

**Test Coverage Requirements**:
- Unit tests: 100% for sync logic
- Integration tests: Offline/online transitions
- Chaos tests: Network failures, partial syncs

#### Sprint 0.6: Demo & Retrospective (Weeks 11-12)
**TDD Focus**: Integration testing and user acceptance tests

**Tasks**:
- [ ] Integration testing across all components
- [ ] Performance testing (load, stress)
- [ ] User acceptance testing with clinician advisors
- [ ] Demo to stakeholders with live feedback
- [ ] Document lessons learned
- [ ] Refine Phase 1 backlog based on feedback
- [ ] Update roadmap based on learnings

**Deliverables**:
- Working prototype demo
- User feedback report
- Phase 0 retrospective document
- Refined Phase 1 plan
- Test coverage report (target: ≥80%)

**Test Coverage Requirements**:
- System tests: End-to-end workflows
- Performance tests: Baseline metrics
- UAT: Clinician validation tests

### Phase 0 Dependencies
- Python 3.12+, Node.js 20+
- Access to Kenyan clinician advisors
- Initial budget allocation ($50K)

### Phase 0 Risks & Mitigations
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Talent shortage (Python/Django) | High | Medium | Partner with Kenyan universities, remote hiring |
| Scope creep | High | High | Strict MVP definition, regular stakeholder alignment |
| Security vulnerabilities | Critical | Low | Weekly security scans, external audits |
| TDD adoption resistance | Medium | Medium | Training sessions, pair programming, clear benefits demo |
| Infrastructure setup delays | Medium | Low | Use Docker for consistency, automate setup |

### Phase 0 Success Metrics
- [ ] Prototype demonstrates offline patient registration
- [ ] ≥80% test coverage achieved
- [ ] Security audit passed with no critical findings
- [ ] Clinician advisors rate prototype ≥4/5
- [ ] All CI/CD pipelines green
- [ ] Zero production data at risk (isolated environment)

---

## Phase 1: Clinical Core (Apr-Sep 2026, 6 months)

### Goals
- Production-ready PAS (Patient Administration System)
- Complete encounter management with vitals
- Basic pharmacy and billing modules
- Offline desktop + mobile app
- Kenya pilot deployments (2 sites: 1 rural, 1 urban)

### Sprint Breakdown (12 sprints × 2 weeks)

#### Sprint 1.1-1.2: Encounter Management (Weeks 1-4)
**TDD Focus**: Test vital signs validation and clinical workflows

**Tasks**:
- [ ] **Write tests first**: Vitals validation tests (ranges, units)
- [ ] Implement vitals capture form
- [ ] **Write tests first**: Diagnosis entry tests (ICD-10 validation)
- [ ] Implement diagnosis capture with code lookup
- [ ] **Write tests first**: Treatment plan tests
- [ ] Implement treatment plan templates
- [ ] **Write tests first**: Encounter history tests
- [ ] Implement encounter timeline view

**Deliverables**:
- Encounter module with vitals, diagnosis, treatment
- Clinical templates library
- Test suite with ≥85% coverage

**TDD Approach**:
```python
# Example: Write test first
def test_vital_signs_validation():
    encounter = Encounter(temperature=35.0)  # Hypothermia
    assert encounter.has_critical_vitals() == True
    assert "hypothermia" in encounter.get_alerts()

# Then implement to pass the test
```

#### Sprint 1.3-1.4: Pharmacy Module (Weeks 5-8)
**TDD Focus**: Test inventory tracking and stock alerts

**Tasks**:
- [ ] **Write tests first**: Stock level tests, reorder alerts
- [ ] Implement pharmacy inventory model
- [ ] **Write tests first**: Drug dispensing tests with validations
- [ ] Implement drug dispensing workflow
- [ ] **Write tests first**: Expiry tracking tests
- [ ] Implement expiry alerts and FEFO logic
- [ ] **Write tests first**: Prescription tests
- [ ] Implement prescription management

**Deliverables**:
- Pharmacy stock management
- Drug dispensing system
- Prescription tracking
- Low stock/expiry alerts

#### Sprint 1.5-1.6: Billing Basics (Weeks 9-12)
**TDD Focus**: Test billing calculations and payment recording

**Tasks**:
- [ ] **Write tests first**: Invoice generation tests
- [ ] Implement billing invoice system
- [ ] **Write tests first**: Payment processing tests (cash, M-Pesa)
- [ ] Implement payment recording
- [ ] **Write tests first**: Receipt generation tests
- [ ] Implement receipt printing
- [ ] **Write tests first**: Billing report tests
- [ ] Implement basic financial reports

**Deliverables**:
- Billing module with invoicing
- M-Pesa integration stub (for testing)
- Receipt generation
- Financial reports

#### Sprint 1.7-1.8: Mobile App Foundation (Weeks 13-16)
**TDD Focus**: Test mobile offline storage and sync

**Tasks**:
- [ ] **Write tests first**: SQLite mobile tests
- [ ] Implement WatermelonDB setup
- [ ] **Write tests first**: Patient search tests (offline)
- [ ] Implement mobile patient lookup
- [ ] **Write tests first**: Vitals entry tests (mobile)
- [ ] Implement mobile vitals capture
- [ ] **Write tests first**: Mobile sync tests
- [ ] Implement background sync

**Deliverables**:
- React Native app (Android focus)
- Offline patient lookup
- Mobile vitals entry
- Background sync

#### Sprint 1.9-1.10: Integration & Testing (Weeks 17-20)
**TDD Focus**: System-wide integration tests

**Tasks**:
- [ ] Integration testing: Desktop ↔ Backend ↔ Mobile
- [ ] **Write tests first**: Cross-device sync tests
- [ ] Implement cross-device conflict resolution
- [ ] Performance testing under load
- [ ] Security penetration testing
- [ ] Accessibility testing (WCAG 2.1 AA)
- [ ] **Write tests first**: Regression test suite
- [ ] Fix bugs identified in testing

**Deliverables**:
- Full integration test suite
- Performance baseline report
- Accessibility compliance report
- Bug fixes from testing phase

#### Sprint 1.11-1.12: Kenya Pilots (Weeks 21-24)
**TDD Focus**: User acceptance testing in real environments

**Tasks**:
- [ ] Deploy to pilot site 1 (rural clinic)
- [ ] Deploy to pilot site 2 (urban hospital)
- [ ] **Write tests first**: Pilot monitoring tests
- [ ] Implement telemetry and error reporting
- [ ] On-site training for clinical staff
- [ ] Collect user feedback and issues
- [ ] **Write tests first**: Bug reproduction tests
- [ ] Fix pilot-reported bugs
- [ ] Document pilot outcomes

**Deliverables**:
- 2 live pilot sites
- Training materials
- Pilot feedback report
- Bug fixes and improvements
- Phase 1 success metrics report

### Phase 1 Dependencies
- Phase 0 completion with passing tests
- Pilot site agreements and infrastructure
- Clinical content (diagnosis codes, drug lists)
- M-Pesa sandbox access

### Phase 1 Risks & Mitigations
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Pilot site connectivity issues | High | Medium | Offline-first design, local support team |
| User adoption resistance | High | Medium | Extensive training, change management |
| Mobile device compatibility | Medium | Medium | Test on range of Android devices |
| Data migration from existing systems | High | Low | Import tools, validation scripts |
| M-Pesa integration delays | Medium | Medium | Mock payment gateway for testing |

### Phase 1 Success Metrics
- [ ] ≥85% test coverage maintained
- [ ] Pilots operational for ≥30 days
- [ ] <10 critical bugs in production
- [ ] Offline uptime ≥90% in pilots
- [ ] User satisfaction ≥4/5
- [ ] Daily active users ≥20 per pilot site
- [ ] All TDD practices followed (tests written first)

---

## Phase 2: Claims, Theatre, Inventory & Reporting v1 (Oct 2026-Mar 2027, 6 months)

### Goals
- SHA claims submission integration
- Theatre/surgery management
- Advanced inventory with suppliers
- KHIS/DHIS2 automated reporting
- Cloud sync introduction (optional)
- Scale to 5 additional sites

### Sprint Breakdown (12 sprints × 2 weeks)

#### Sprint 2.1-2.2: SHA Claims Integration (Weeks 1-4)
**TDD Focus**: Test claims validation and submission

**Tasks**:
- [ ] **Write tests first**: SHA eligibility check tests
- [ ] Implement SHA API integration (eligibility)
- [ ] **Write tests first**: Claims packaging tests
- [ ] Implement claims form generation
- [ ] **Write tests first**: Tariff code mapping tests
- [ ] Implement tariff code lookup
- [ ] **Write tests first**: Claims submission tests (with mocks)
- [ ] Implement claims submission workflow
- [ ] **Write tests first**: Claims status tracking tests
- [ ] Implement claims tracking dashboard

**Deliverables**:
- SHA eligibility verification
- Claims packaging and submission
- Tariff code database
- Claims tracking system

**TDD Approach**:
```python
# Write test first
def test_sha_claim_validation():
    claim = Claim(patient=patient, services=[service])
    assert claim.validate() == True
    assert claim.calculate_amount() == 1500.00
    
# Then implement
```

#### Sprint 2.3-2.4: Theatre Management (Weeks 5-8)
**TDD Focus**: Test surgery scheduling and tracking

**Tasks**:
- [ ] **Write tests first**: Theatre scheduling tests
- [ ] Implement surgery booking system
- [ ] **Write tests first**: Pre-op checklist tests
- [ ] Implement pre-operative workflows
- [ ] **Write tests first**: Intra-op documentation tests
- [ ] Implement surgery notes capture
- [ ] **Write tests first**: Post-op tracking tests
- [ ] Implement post-operative care tracking

**Deliverables**:
- Theatre scheduling system
- Surgery documentation
- Pre/intra/post-op workflows
- Theatre utilization reports

#### Sprint 2.5-2.6: Advanced Inventory (Weeks 9-12)
**TDD Focus**: Test supplier management and procurement

**Tasks**:
- [ ] **Write tests first**: Supplier management tests
- [ ] Implement supplier database
- [ ] **Write tests first**: Purchase order tests
- [ ] Implement procurement workflow
- [ ] **Write tests first**: Stock transfer tests
- [ ] Implement inter-department transfers
- [ ] **Write tests first**: Inventory valuation tests
- [ ] Implement FIFO/FEFO costing

**Deliverables**:
- Supplier management
- Purchase order system
- Stock transfer workflows
- Inventory valuation reports

#### Sprint 2.7-2.8: KHIS/DHIS2 Reporting (Weeks 13-16)
**TDD Focus**: Test indicator calculations and export formats

**Tasks**:
- [ ] **Write tests first**: KHIS indicator tests (OPD, IPD, etc.)
- [ ] Implement indicator calculation engine
- [ ] **Write tests first**: DHIS2 JSON export tests
- [ ] Implement DHIS2 data export
- [ ] **Write tests first**: Automated reporting tests
- [ ] Implement scheduled report generation
- [ ] **Write tests first**: Report validation tests
- [ ] Implement data quality checks

**Deliverables**:
- KHIS indicator calculations
- DHIS2 export functionality
- Automated monthly reports
- Data quality dashboard

**TDD Approach**:
```python
# Test indicator calculations
def test_opd_attendance_calculation():
    # Given: 50 OPD encounters in January
    encounters = create_opd_encounters(count=50, month=1)
    # When: Calculate OPD attendance
    indicator = KHISIndicator.calculate('OPD_ATTENDANCE', month=1)
    # Then: Should return 50
    assert indicator.value == 50
```

#### Sprint 2.9-2.10: Cloud Sync (Optional) (Weeks 17-20)
**TDD Focus**: Test cloud connectivity and data synchronization

**Tasks**:
- [ ] **Write tests first**: Cloud authentication tests
- [ ] Implement OAuth2 cloud authentication
- [ ] **Write tests first**: Cloud database sync tests
- [ ] Implement PostgreSQL cloud database
- [ ] **Write tests first**: Bi-directional sync tests
- [ ] Implement conflict resolution for cloud sync
- [ ] **Write tests first**: Sync status monitoring tests
- [ ] Implement sync dashboard
- [ ] **Write tests first**: Bandwidth optimization tests
- [ ] Implement delta sync (only changes)

**Deliverables**:
- Cloud backend infrastructure
- Bi-directional sync engine
- Conflict resolution UI
- Sync monitoring dashboard

#### Sprint 2.11-2.12: Expansion & Stabilization (Weeks 21-24)
**TDD Focus**: Test scalability and multi-site scenarios

**Tasks**:
- [ ] Deploy to 5 new sites (3 rural, 2 urban)
- [ ] **Write tests first**: Multi-site data isolation tests
- [ ] Implement tenant isolation (if multi-tenant)
- [ ] Load testing with multiple sites
- [ ] **Write tests first**: Site-to-site sync tests
- [ ] Optimize sync for low-bandwidth
- [ ] Collect feedback from all sites
- [ ] Bug fixes and performance optimization

**Deliverables**:
- 7 total operational sites
- Multi-site deployment playbook
- Performance optimization report
- Phase 2 retrospective

### Phase 2 Dependencies
- Phase 1 completion with stable pilots
- SHA API access and credentials
- DHIS2 instance access for testing
- Cloud infrastructure (AWS/Azure)

### Phase 2 Risks & Mitigations
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| SHA API downtime | High | Medium | Queue claims locally, retry logic |
| DHIS2 integration complexity | Medium | High | Partner with KHIS team, use test instance |
| Cloud costs exceed budget | High | Medium | Cost monitoring, optimization, reserved instances |
| Multi-site sync conflicts | High | Medium | Robust conflict resolution, user training |
| Bandwidth limitations | Medium | High | Delta sync, compression, adaptive sync |

### Phase 2 Success Metrics
- [ ] ≥85% test coverage maintained
- [ ] 7 sites operational for ≥60 days
- [ ] Claims submission success rate ≥95%
- [ ] KHIS reports automated for all sites
- [ ] Cloud sync (if enabled) success rate ≥98%
- [ ] <5% sync conflicts
- [ ] User satisfaction ≥4/5 across all sites

---

## Phase 3: MCH/Immunization, Imaging, BI Mart (Apr-Sep 2027, 6 months)

### Goals
- Maternal and Child Health module
- Immunization tracking with KEPI integration
- Imaging/radiology module (DICOM)
- Business Intelligence data mart
- Analytics dashboard
- Scale to 15 total sites

### Sprint Breakdown (12 sprints × 2 weeks)

#### Sprint 3.1-3.3: MCH & Immunization (Weeks 1-6)
**TDD Focus**: Test MCH workflows and immunization schedules

**Tasks**:
- [ ] **Write tests first**: ANC (Antenatal Care) workflow tests
- [ ] Implement ANC module
- [ ] **Write tests first**: Delivery/PNC tests
- [ ] Implement delivery and postnatal care
- [ ] **Write tests first**: Immunization schedule tests
- [ ] Implement child immunization tracking
- [ ] **Write tests first**: KEPI export tests
- [ ] Integrate with Kenya KEPI system
- [ ] **Write tests first**: Growth monitoring tests
- [ ] Implement child growth charts

**Deliverables**:
- MCH module (ANC, delivery, PNC)
- Immunization tracking
- KEPI integration
- Growth monitoring

#### Sprint 3.4-3.6: Imaging & DICOM (Weeks 7-12)
**TDD Focus**: Test DICOM handling and image storage

**Tasks**:
- [ ] **Write tests first**: DICOM import tests
- [ ] Implement DICOM image ingestion
- [ ] **Write tests first**: Image viewer tests
- [ ] Build web-based DICOM viewer
- [ ] **Write tests first**: Radiology report tests
- [ ] Implement radiology reporting
- [ ] **Write tests first**: Image archival tests
- [ ] Implement PACS-lite (local storage)

**Deliverables**:
- DICOM image viewer
- Radiology reporting module
- Local image archival (PACS-lite)
- Integration with imaging devices

#### Sprint 3.7-3.9: Business Intelligence Mart (Weeks 13-18)
**TDD Focus**: Test ETL processes and analytics queries

**Tasks**:
- [ ] **Write tests first**: ETL pipeline tests
- [ ] Implement data warehouse ETL
- [ ] **Write tests first**: Analytics query tests
- [ ] Build analytics data models (star schema)
- [ ] **Write tests first**: Dashboard widget tests
- [ ] Implement analytics dashboard
- [ ] **Write tests first**: Report generation tests
- [ ] Build custom report builder

**Deliverables**:
- BI data mart (TimescaleDB/PostgreSQL)
- ETL pipeline
- Analytics dashboard
- Custom report builder

#### Sprint 3.10-3.12: Expansion & Optimization (Weeks 19-24)
**TDD Focus**: Test performance at scale

**Tasks**:
- [ ] Deploy to 8 additional sites (total: 15)
- [ ] **Write tests first**: Large dataset tests
- [ ] Optimize database queries and indexes
- [ ] **Write tests first**: Caching layer tests
- [ ] Implement Redis caching
- [ ] Load testing with 15 sites
- [ ] **Write tests first**: Disaster recovery tests
- [ ] Implement automated backups and DR
- [ ] Phase 3 retrospective and planning for Phase 4

**Deliverables**:
- 15 operational sites
- Performance optimizations
- Disaster recovery system
- Phase 3 retrospective

### Phase 3 Dependencies
- Phase 2 completion with stable multi-site deployment
- KEPI system access
- DICOM test images and devices
- Data warehouse infrastructure

### Phase 3 Risks & Mitigations
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| DICOM complexity | High | High | Use established libraries (dcm4che), expert consultation |
| Data warehouse performance | Medium | Medium | Proper indexing, partitioning, query optimization |
| KEPI integration delays | Medium | Medium | Work with MOH early, use test environment |
| Imaging storage costs | High | Medium | Compression, tiered storage, retention policies |

### Phase 3 Success Metrics
- [ ] ≥85% test coverage maintained
- [ ] 15 sites operational for ≥90 days
- [ ] MCH module adopted in ≥10 sites
- [ ] BI dashboards used weekly by site managers
- [ ] DICOM images viewable in <5 seconds
- [ ] User satisfaction ≥4/5

---

## Phase 4: AI/Advanced Analytics & Global Scaling (Oct-Dec 2027, 3 months)

### Goals
- AI-powered clinical decision support
- Predictive analytics for operations
- Advanced interoperability (FHIR R4 full)
- Global readiness (multi-language, multi-currency)
- Scale to 30+ sites
- Open-source community launch

### Sprint Breakdown (6 sprints × 2 weeks)

#### Sprint 4.1-4.2: AI Foundation (Weeks 1-4)
**TDD Focus**: Test ML model predictions and edge cases

**Tasks**:
- [ ] **Write tests first**: Sepsis prediction model tests
- [ ] Train and deploy sepsis early warning model
- [ ] **Write tests first**: No-show prediction tests
- [ ] Implement appointment adherence model
- [ ] **Write tests first**: Drug interaction tests
- [ ] Implement pharmacy safety checks with AI
- [ ] **Write tests first**: Model monitoring tests
- [ ] Implement model drift detection

**Deliverables**:
- Sepsis early warning system
- No-show prediction
- AI-powered drug safety
- ML monitoring dashboard

**TDD for ML**:
```python
# Test ML model behavior
def test_sepsis_prediction_on_high_risk_patient():
    patient_data = {
        'temperature': 39.5,
        'heart_rate': 120,
        'white_blood_cells': 15000
    }
    risk_score = sepsis_model.predict(patient_data)
    assert risk_score >= 0.7  # High risk
    assert 'sepsis' in get_clinical_alerts(patient_data)
```

#### Sprint 4.3-4.4: Advanced Interoperability (Weeks 5-8)
**TDD Focus**: Test FHIR compliance and data exchange

**Tasks**:
- [ ] **Write tests first**: FHIR R4 resource tests (all profiles)
- [ ] Implement full FHIR R4 API
- [ ] **Write tests first**: FHIR validation tests
- [ ] Add FHIR validation layer
- [ ] **Write tests first**: External system integration tests
- [ ] Implement HL7v2 ↔ FHIR bridge
- [ ] **Write tests first**: Terminology service tests
- [ ] Integrate SNOMED CT, LOINC, ICD-10

**Deliverables**:
- Full FHIR R4 compliance
- HL7v2 integration
- Terminology services
- Interoperability test suite

#### Sprint 4.5-4.6: Global Scaling & Open Source (Weeks 9-12)
**TDD Focus**: Test internationalization and community readiness

**Tasks**:
- [ ] **Write tests first**: Multi-language tests
- [ ] Implement i18n (Swahili, English, French)
- [ ] **Write tests first**: Multi-currency tests
- [ ] Implement currency and localization
- [ ] **Write tests first**: Community contribution tests
- [ ] Prepare open-source release (Apache 2.0 license)
- [ ] **Write tests first**: Documentation tests
- [ ] Complete developer documentation
- [ ] Launch community (GitHub Discussions, Discord)
- [ ] Final retrospective and handoff

**Deliverables**:
- Multi-language support (3+ languages)
- Multi-currency billing
- Open-source repository
- Community launch
- Final project retrospective

### Phase 4 Dependencies
- Phase 3 completion with stable operations
- ML training data (de-identified)
- FHIR conformance testing tools
- Open-source legal review

### Phase 4 Risks & Mitigations
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| AI bias in predictions | Critical | Medium | Fairness audits, diverse training data |
| FHIR complexity | High | High | Use reference implementations, testing tools |
| Open-source IP issues | Critical | Low | Legal review, clear licensing |
| Community management overhead | Medium | Medium | Dedicated community manager, clear guidelines |

### Phase 4 Success Metrics
- [ ] ≥85% test coverage maintained
- [ ] AI models validated by clinicians
- [ ] FHIR conformance tests passing
- [ ] 30+ sites operational
- [ ] Open-source repo launched
- [ ] 100+ GitHub stars in first month
- [ ] Community contributions from ≥5 external developers

---

## Test-Driven Development (TDD) Strategy

### Core TDD Principles

1. **Red-Green-Refactor Cycle**:
   - **Red**: Write a failing test first
   - **Green**: Write minimal code to pass the test
   - **Refactor**: Improve code while keeping tests green

2. **Test Pyramid**:
   - **70% Unit Tests**: Fast, isolated, high coverage
   - **20% Integration Tests**: API, database, component integration
   - **10% E2E Tests**: Full user workflows, UI automation

3. **Coverage Requirements**:
   - Minimum 80% overall coverage (enforced by CI/CD)
   - 100% coverage for critical paths (auth, billing, sync)
   - Branch coverage, not just line coverage

### TDD Workflow for Each Sprint

#### Week 1: Test Design
- **Monday**: Sprint planning, define acceptance criteria
- **Tuesday-Wednesday**: Write test specifications
  - Unit tests for models and business logic
  - Integration tests for APIs
  - E2E tests for user stories
- **Thursday**: Test review and refinement
- **Friday**: Begin implementation (tests written, all failing)

#### Week 2: Implementation & Validation
- **Monday-Wednesday**: Implement features to pass tests
  - Pair programming (dev + QA)
  - Continuous test running
  - Refactor as tests pass
- **Thursday**: Final testing and bug fixes
- **Friday**: Sprint demo and retrospective

### Testing Tools & Infrastructure

#### Backend (Python/Django)
```bash
# Test execution
pytest tests/ --cov=hmis --cov-report=html --cov-fail-under=80

# Watch mode during development
pytest-watch

# Mutation testing (validate test quality)
mutmut run
```

#### Frontend (Next.js/React)
```bash
# Unit tests
jest --coverage --watchAll=false

# E2E tests
playwright test

# Visual regression tests
npx percy exec -- playwright test
```

#### Mobile (React Native)
```bash
# Unit tests
jest

# Integration tests
detox test --configuration android.emu.debug
```

### TDD Anti-Patterns to Avoid

❌ **Don't**:
- Write tests after implementation
- Test implementation details instead of behavior
- Skip tests for "simple" code
- Write tests just to increase coverage
- Ignore failing tests

✅ **Do**:
- Write tests first, always
- Test behavior and contracts
- Test edge cases and error conditions
- Refactor tests as you refactor code
- Maintain and update tests continuously

### TDD Metrics & Monitoring

Track these metrics per sprint:
- **Test Coverage**: Overall, unit, integration, E2E
- **Test Execution Time**: Keep under 10 minutes for unit tests
- **Test Flakiness**: <1% flaky test rate
- **Bug Escape Rate**: Bugs found in production vs. caught by tests
- **TDD Compliance**: % of features with tests written first

### Example TDD User Story

**User Story**: As a nurse, I want to record patient vitals so that doctors can review them.

**TDD Approach**:

1. **Write Test First** (Sprint Day 1):
```python
# tests/test_vitals.py
def test_record_vitals_for_patient():
    patient = Patient.objects.create(mrn="MRN001", name="John Doe")
    encounter = Encounter.objects.create(patient=patient)
    
    # Should accept valid vitals
    encounter.temperature = 37.5
    encounter.pulse = 80
    encounter.blood_pressure = "120/80"
    encounter.save()
    
    assert encounter.temperature == 37.5
    assert encounter.has_critical_vitals() == False

def test_critical_vitals_alert():
    encounter = Encounter(temperature=40.0, pulse=150)
    assert encounter.has_critical_vitals() == True
    assert "fever" in encounter.get_alerts()
    assert "tachycardia" in encounter.get_alerts()
```

2. **Run Test** (Sprint Day 1):
```bash
$ pytest tests/test_vitals.py
# Expected: FAILED (no implementation yet)
```

3. **Implement Feature** (Sprint Day 2-3):
```python
# hmis/apps/encounters/models.py
class Encounter(models.Model):
    temperature = models.DecimalField(...)
    pulse = models.IntegerField(...)
    
    def has_critical_vitals(self):
        return (self.temperature >= 39.0 or 
                self.pulse >= 120 or 
                self.pulse <= 50)
    
    def get_alerts(self):
        alerts = []
        if self.temperature >= 39.0:
            alerts.append("fever")
        if self.pulse >= 120:
            alerts.append("tachycardia")
        return alerts
```

4. **Run Test Again** (Sprint Day 3):
```bash
$ pytest tests/test_vitals.py
# Expected: PASSED
```

5. **Refactor** (Sprint Day 4):
- Extract vital ranges to constants
- Add more edge case tests
- Optimize queries

---

## Risk Management & Contingencies

### Critical Path Items

These must succeed or the entire project is at risk:

1. **Phase 0**: Desktop prototype must work offline
2. **Phase 1**: Pilot sites must achieve 90% uptime
3. **Phase 2**: SHA claims integration must pass certification
4. **Phase 3**: Performance must support 15 sites concurrently
5. **All Phases**: Security audits must pass with no critical findings

### Budget Contingency

- **Allocated**: $500K
- **Contingency**: $100K (20%)
- **Burn Rate Monitoring**: Monthly reviews
- **Cost Optimization**: Open-source tools, local talent, cloud cost management

### Schedule Contingency

- **Buffer Time**: 2 weeks per phase for unexpected delays
- **Fast-Follow Sprints**: Reserve capacity for critical bug fixes
- **Scope Flexibility**: Features can be moved to later phases if needed

### Quality Gates

Before proceeding to next phase:

- [ ] All tests passing (≥80% coverage)
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] User acceptance criteria met
- [ ] Documentation complete
- [ ] Stakeholder sign-off

---

## Communication & Reporting

### Daily Standups (15 min)
- What did you accomplish yesterday?
- What will you work on today?
- Any blockers?
- Test coverage status

### Sprint Reviews (2 hours, end of each sprint)
- Demo working software
- Test results review
- Stakeholder feedback
- Accept/reject user stories

### Sprint Retrospectives (1 hour, end of each sprint)
- What went well?
- What needs improvement?
- Action items for next sprint
- TDD adoption feedback

### Monthly Stakeholder Reports
- Progress against roadmap
- Test coverage trends
- Pilot site metrics
- Budget vs. actuals
- Risks and mitigations

### Quarterly Executive Reviews
- Phase completion status
- Success metrics dashboard
- Strategic decisions needed
- Budget realignment if necessary

---

## Success Definition

Vitora HMIS will be considered successful if by Q4 2027:

### Technical Success
- [ ] 30+ operational sites in Kenya
- [ ] ≥90% offline uptime across all sites
- [ ] ≥85% test coverage maintained throughout
- [ ] <5% sync conflict rate
- [ ] Zero critical security vulnerabilities
- [ ] 100% Kenya Data Protection Act compliance

### User Success
- [ ] ≥4/5 user satisfaction across all user types
- [ ] ≥80% daily active user rate at sites
- [ ] <30 minutes average training time for basic tasks
- [ ] ≥95% clinician adoption rate

### Business Success
- [ ] On-time delivery (±1 month)
- [ ] On-budget delivery (±10%)
- [ ] SHA claims integration certified
- [ ] KHIS reporting automated for 100% of sites
- [ ] Open-source community launched with active contributors

### Clinical Success
- [ ] Measurable improvement in patient wait times
- [ ] Improved data quality for KHIS reporting
- [ ] Positive feedback from Kenya MOH
- [ ] Zero patient safety incidents due to system issues

---

## Appendix

### A. Sprint Planning Template

```markdown
## Sprint X.Y: [Sprint Name]

**Duration**: [Start Date] - [End Date]
**TDD Focus**: [Main testing focus area]

### Goals
- Goal 1
- Goal 2

### User Stories
1. As a [role], I want [feature] so that [benefit]
   - **Acceptance Criteria**: 
     - Criterion 1
     - Criterion 2
   - **TDD Tests** (write first):
     - Test 1: ...
     - Test 2: ...
   - **Definition of Done**:
     - [ ] Tests written first and passing
     - [ ] Code reviewed
     - [ ] Documentation updated
     - [ ] Coverage ≥80%

### Tasks
- [ ] Write tests for Story 1
- [ ] Implement Story 1
- [ ] Write tests for Story 2
- [ ] Implement Story 2

### Sprint Metrics
- Test Coverage: [Target]%
- Velocity: [Story Points]
- Bug Count: [Target]
```

### B. Test Coverage Report Template

```markdown
## Test Coverage Report - Sprint X.Y

**Date**: [Date]
**Overall Coverage**: XX%

### Coverage by Component
| Component | Coverage | Status |
|-----------|----------|--------|
| Backend Models | XX% | ✅/❌ |
| Backend APIs | XX% | ✅/❌ |
| Frontend Components | XX% | ✅/❌ |
| E2E Tests | XX% | ✅/❌ |

### Critical Paths (100% required)
- [ ] Authentication: XX%
- [ ] Billing: XX%
- [ ] Sync: XX%

### Untested Code
- File: path/to/file.py, Lines: 45-67
- Reason: [Why not tested]
- Plan: [When will be tested]

### Flaky Tests
- Test: test_name
- Flakiness Rate: X%
- Action: [Fix plan]
```

### C. TDD Checklist

Before starting any feature:
- [ ] User story written with acceptance criteria
- [ ] Test cases identified and documented
- [ ] Test environment set up
- [ ] Tests written and failing (Red)
- [ ] Minimal code implemented (Green)
- [ ] Code refactored for quality (Refactor)
- [ ] Coverage checked (≥80%)
- [ ] Code reviewed with tests
- [ ] Documentation updated
- [ ] Integration tests passing
- [ ] Demo prepared

### D. Glossary

- **TDD**: Test-Driven Development
- **MRN**: Medical Record Number
- **SHA**: Social Health Authority (Kenya)
- **KHIS**: Kenya Health Information System (based on DHIS2)
- **FHIR**: Fast Healthcare Interoperability Resources
- **DPIA**: Data Protection Impact Assessment
- **UAT**: User Acceptance Testing
- **E2E**: End-to-End
- **RLS**: Row Level Security
- **PACS**: Picture Archiving and Communication System
- **DICOM**: Digital Imaging and Communications in Medicine
- **MCH**: Maternal and Child Health
- **KEPI**: Kenya Expanded Programme on Immunization

---

**Document Control**
- **Version**: 1.0
- **Author**: Engineering Lead
- **Approvers**: Product Manager, Clinical Advisors, Stakeholders
- **Review Cycle**: Monthly
- **Next Review**: January 31, 2026

**Changelog**
- 2025-12-27: Initial roadmap created with TDD integration
