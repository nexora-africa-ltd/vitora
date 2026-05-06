# Vitora Full LIS Implementation Plan

> **Status**: In Progress (L5 Complete)
> **Owner**: Engineering Lead
> **Last Updated**: May 6, 2026
> **Estimated Effort**: 6-8 sprints (12-16 weeks)

---

## Executive Summary

Vitora's laboratory module already covers ~80% of a functional LIS. This plan addresses the remaining gaps to make Vitora a **complete, accreditation-ready LIS** suitable for L2-L5 Kenya facilities, eliminating the need for a separate system.

### Current State (Already Implemented)

| Capability | Status |
|-----------|--------|
| Test catalog (categories, specimen types, reference ranges) | ✅ |
| Lab orders with status workflow (DRAFT→COMPLETED) | ✅ |
| Specimen tracking (barcodes, collection, receipt, storage) | ✅ |
| Result entry (numeric/text/option, auto-flagging) | ✅ |
| Two-stage verification (technical + clinical sign-off) | ✅ |
| Amendments with audit trail | ✅ |
| Work queues (LabQueue model) | ✅ |
| Instrument/analyzer registry | ✅ |
| HL7 ORM^O01 outbound to external LIS | ✅ |
| HL7 ORU^R01 inbound result ingestion | ✅ |
| FHIR DiagnosticReport output | ✅ |
| Facility-scoped HL7 endpoint routing | ✅ |
| LOINC code mapping | ✅ |
| Result templates | ✅ |
| Result attachments (PDFs, images) | ✅ |
| QC material & lot management | ✅ |
| QC data entry with Westgard multi-rule engine | ✅ |
| Levey-Jennings chart visualization | ✅ |
| QC rule violation tracking & acknowledgment | ✅ |
| External Quality Assessment (EQA/PT) tracking | ✅ |

---

## Gap Analysis & Implementation Phases

### Phase L1: Quality Control (QC) System — 3 sprints ✅ COMPLETE

Priority: **HIGH** (required for ISO 15189 accreditation)

> **Implemented**: May 2026 — Full backend (9 models, Westgard engine, 60 tests) + frontend (QC dashboard, EQA page, Levey-Jennings charts, navigation). See `backend/hmis/apps/laboratory/qc/` and `web-app/app/(dashboard)/laboratory/qc/`.

#### L1.1 QC Lot & Material Management

```
New Models:
- QCMaterial (name, manufacturer, lot_number, expiry_date, analyte_targets)
- QCLot (material FK, lot_number, open_date, expiry_date, storage_conditions)
- QCTarget (lot FK, test_catalog FK, mean, sd, cv_percent, units)
```

**Features:**
- Register QC materials with lot numbers and expiry tracking
- Define target values (mean, SD) per analyte per lot
- Expiry alerting (7-day, 30-day warnings)
- Integration with instrument registry (which QC runs on which analyzer)

#### L1.2 QC Data Entry & Levey-Jennings Charts

```
New Models:
- QCResult (lot FK, instrument FK, test FK, value, run_date, operator, accepted)
- QCRule (name, rule_type: WESTGARD, custom_expression, is_active)
- QCRuleViolation (qc_result FK, rule FK, severity, acknowledged_by)
```

**Features:**
- Daily QC data entry (manual or auto-imported from analyzers)
- Levey-Jennings chart visualization (React, recharts)
- Westgard multi-rule engine:
  - 1-2s (warning), 1-3s (reject)
  - 2-2s, R-4s, 4-1s, 10x (trend rules)
- Rule violation alerts with mandatory acknowledgment
- QC lot shift/trend detection
- Monthly QC summary reports (CV%, bias)

#### L1.3 Proficiency Testing (EQA)

```
New Models:
- EQASurvey (provider, survey_id, due_date, status)
- EQASample (survey FK, sample_id, expected_result)
- EQASubmission (sample FK, submitted_value, z_score, acceptable)
```

**Features:**
- Track external proficiency testing programs (e.g., HUQAS, NEQAS)
- Record submitted results and received z-scores
- Dashboard showing EQA performance over time
- Non-conformance flagging when z-score > 2.0

---

### Phase L2: Delta Checks & Auto-Verification — 2 sprints ✅

Priority: **HIGH** (reduces pathologist workload by ~40%)
Status: **COMPLETE** — Backend models, engines, serializers, views, signals, migration, 44 tests; Frontend types, schemas, API client, dashboard page, navigation entry.

#### L2.1 Delta Check Engine

```
New Models:
- DeltaCheckRule (test_catalog FK, threshold_percent, threshold_absolute, lookback_hours, action)
```

**Features:**
- Compare current result to patient's most recent prior result
- Configurable thresholds per test (%, absolute, or both)
- Actions: FLAG_FOR_REVIEW, BLOCK_RELEASE, ALERT_ONLY
- UI indicator on result entry showing delta from last value
- Patient history mini-chart on result verification screen

#### L2.2 Auto-Verification Rules Engine

```
New Models:
- AutoVerifyRule (test_catalog FK, conditions: JSONField, is_active)
- AutoVerifyLog (result FK, rule FK, verified_at, outcome)
```

**Features:**
- Configurable rules per test:
  - Result within reference range
  - Delta check passes
  - QC within limits for that run
  - No critical flags
  - Specimen age within acceptable window
- Auto-verify results that pass ALL rules (no human intervention needed)
- Audit log of all auto-verified results
- Configurable percentage cap (e.g., max 70% auto-verified)
- Pathologist override/review queue for blocked results

---

### Phase L3: Analyzer Interfacing — 2 sprints

Priority: **MEDIUM** (depends on facility analyzer inventory)

#### L3.1 Bidirectional Analyzer Communication

```
New/Updated Models:
- InstrumentChannel (instrument FK, protocol: ASTM|HL7|SERIAL|TCP, config: JSONField)
- AnalyzerMessage (channel FK, direction, raw_data, parsed_data, status)
```

**Features:**
- Protocol adapters:
  - ASTM E1394/LIS2-A2 (most common for chemistry/hematology analyzers)
  - HL7 v2.x over MLLP (already implemented, enhance for bidirectional)
  - Serial/RS-232 via TCP-Serial bridge
- Work order download (host query): analyzer requests pending orders
- Result upload: auto-parse results from analyzer output
- Sample ID mapping (barcode → lab order item)
- Error handling: NAK responses, timeout recovery, reconnect
- Real-time status dashboard per analyzer (connected/disconnected/error)

#### L3.2 Common Analyzer Drivers

Pre-built configuration templates for common Kenya lab analyzers:

| Analyzer | Protocol | Template |
|----------|----------|----------|
| Sysmex XN/XP series | HL7/ASTM | Hematology |
| Roche cobas c/e | ASTM | Chemistry/Immunoassay |
| Abbott Architect | ASTM | Chemistry |
| Beckman Coulter AU | HL7 | Chemistry |
| Mindray BC series | HL7 | Hematology |
| GeneXpert | HL7/File | TB/COVID |
| BD BACTEC | HL7 | Microbiology |

---

### Phase L4: Microbiology Module — 2 sprints ✅ COMPLETE

Priority: **MEDIUM** (separate workflow from routine chemistry/hematology)

> **Implemented**: May 2026 — Full backend (`laboratory/microbiology/` sub-module: Organism, Antibiotic, CultureResult, AntibioticSensitivity, Antibiogram models, multi-step culture workflow with state transitions, WHONET CSV export, cumulative antibiogram generation, domain events, 48 tests) + frontend (list page with cultures/antibiogram tabs, detail page with workflow actions & sensitivity testing, React Query hooks, Zod schemas). See `backend/hmis/apps/laboratory/microbiology/` and `web-app/app/(dashboard)/laboratory/microbiology/`.

#### L4.1 Culture & Sensitivity Workflow

```
New Models:
- Organism (global reference: genus, species, gram_stain, organism_type)
- Antibiotic (global reference: code, name, class, disk_content)
- CultureResult (lab_result FK, organism, colony_count, morphology, multi-step status workflow)
- AntibioticSensitivity (culture FK, antibiotic, zone_diameter, mic, interpretation: S|I|R)
- Antibiogram (facility FK, year, organism, antibiotic, percent_sensitive, sample_size)
```

**Features:**
- Multi-step culture workflow: Inoculation → Incubation → Reading → Reporting
- Organism identification (manual entry + future VITEK integration)
- Antibiotic sensitivity testing (disc diffusion + MIC)
- Cumulative antibiogram generation (annual facility statistics)
- WHONET-compatible export format
- Multi-day result updates (preliminary → final reporting)

---

### Phase L5: Reporting & Analytics — 1 sprint ✅ COMPLETE

Priority: **MEDIUM**

> **Implemented**: May 2026 — Full backend (`reporting/` sub-module: TATSLATarget, TATSnapshot, WorkloadSnapshot models, percentile-based engine, 5 report endpoints, signal-driven snapshot creation, 48 tests) + frontend (SLA dashboard page with compliance/breaches/efficiency/workload tabs, React Query hooks, Zod schemas). See `backend/hmis/apps/laboratory/reporting/` and `web-app/app/(dashboard)/laboratory/sla/`.

#### L5.1 TAT Monitoring & SLA Dashboards

**Features:**
- Turnaround time tracking per test per priority:
  - Order → Collection
  - Collection → Receipt
  - Receipt → Result
  - Result → Verification
  - Total TAT
- SLA definition per test catalog (target TAT in hours)
- Real-time TAT dashboard with breach alerts
- Monthly TAT reports by department/test/shift
- Metabase integration for advanced analytics

#### L5.2 Workload & Productivity

**Features:**
- Tests per tech per day/shift
- Specimen rejection rates (by reason, by collector)
- Repeat/rerun rates per analyzer
- Critical value notification compliance (time to notify clinician)
- Monthly lab KPI summary (for facility management)

#### L5.3 Worksheet Printing & Label Generation

**Features:**
- Batch worksheet generation (grouped by analyzer/section)
- Barcode label printing (specimen tubes, slides)
- Configurable label formats (ZPL for Zebra, PDF for generic)
- Worklist export (CSV/PDF for manual analyzers)

---

### Phase L6: Advanced Features — 1 sprint (optional)

Priority: **LOW** (nice-to-have, competitive differentiator)

#### L6.1 Reflexive Testing

```
New Models:
- ReflexRule (trigger_test FK, condition, reflex_test FK, is_active)
```

**Features:**
- Auto-add follow-up tests based on initial results
- Example: TSH > 10 → auto-order Free T4
- Configurable per facility

#### L6.2 Critical Value Management

```
New Models:
- CriticalValueNotification (result FK, notified_to, notified_at, method, acknowledged_at)
```

**Features:**
- Configurable critical ranges per test (separate from reference ranges)
- Mandatory notification workflow (call clinician, document who/when)
- Read-back verification
- Compliance reporting (% notified within 30 minutes)
- SMS/push notification to ordering clinician

#### L6.3 Blood Bank Interface (Future)

- Crossmatch workflow
- Blood product inventory
- Transfusion reactions tracking
- ISBT 128 barcode support

---

## Implementation Priority Matrix

| Phase | Effort | Impact | Priority | Prerequisite |
|-------|--------|--------|----------|--------------|
| L1 (QC) | 3 sprints | High (accreditation) | ✅ Done | None |
| L2 (Delta/Auto-verify) | 2 sprints | High (efficiency) | P0 — Next | None |
| L3 (Analyzer Interface) | 2 sprints | Medium (automation) | P2 | L1 (QC validates results) |
| L4 (Microbiology) | 2 sprints | Medium (completeness) | ✅ Done | None |
| L5 (Reporting) | 1 sprint | Medium (management) | P1 | L1 + L2 |
| L6 (Advanced) | 1 sprint | Low (differentiator) | P3 | L2 |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Auto-verification rate | >60% of routine tests | `AutoVerifyLog` count / total results |
| QC compliance | 100% daily QC before patient runs | QC run dates vs. patient result dates |
| TAT compliance | >90% within SLA | TAT breach count / total orders |
| Critical value notification | >95% within 30 min | Notification timestamps |
| Specimen rejection rate | <2% | Rejected specimens / total received |
| Delta check catch rate | Track per month | Flagged results that were actual errors |

---

## Technical Considerations

### Architecture

- All new models inherit `FacilityScopedModel`
- QC data synced via PowerSync (add to sync-streams.yaml)
- Analyzer interfacing uses async workers (Celery tasks for polling)
- Chart rendering: recharts (already in web-app dependencies)
- Label printing: client-side PDF generation with `react-pdf` or server-side ZPL

### Migration Strategy

- Each phase has its own migration batch
- No breaking changes to existing lab order/result workflow
- QC system is additive (existing results remain valid)
- Auto-verify rules default to inactive (opt-in per test)

### Testing Requirements

- QC Westgard rules: comprehensive unit tests for all rule combinations
- Delta check: parameterized tests with edge cases (first result, missing history)
- Auto-verify: integration tests proving the full chain (QC + delta + range → auto-release)
- Analyzer protocol: mock ASTM/HL7 servers for integration testing

---

## Dependencies & External Systems

| Dependency | Purpose | Status |
|-----------|---------|--------|
| HAPI FHIR (staging) | LOINC terminology fallback | ✅ Deployed |
| HL7 Mock (staging) | Integration testing | ✅ Deployed |
| HL7 Endpoints (facility-scoped) | Per-facility LIS routing | ✅ Implemented |
| Metabase | Analytics dashboards | ✅ Deployed |
| Celery + Redis | Async analyzer polling | ⚠️ Eager mode in staging |
| Zebra ZPL SDK | Label printing | 📋 Client-side only |

---

## Competitive Positioning

### vs. Standalone LIS (OpenELIS, LabWare, STARLIMS)

| Aspect | Standalone LIS | Vitora LIS |
|--------|---------------|------------|
| Integration effort | HL7/MLLP + mapping | Zero (native) |
| License cost | KES 500K-2M/year | Included |
| Clinician access to results | Separate login/portal | Same screen as EMR |
| Order entry | Separate system | From encounter/prescription |
| Billing | Manual reconciliation | Auto-linked to invoice |
| Offline capability | Rare | Built-in (PowerSync) |
| Kenya-specific (KHIS, SHA) | Custom integration | Native |

### Target Market

- **Primary**: L2-L4 facilities (health centers, sub-county hospitals)
  - Typically 1-3 analyzers, 2-5 lab techs
  - No existing LIS, paper-based
  - High value from eliminating paper registers

- **Secondary**: L5 facilities (county referral hospitals)
  - 5-15 analyzers, 10-30 lab staff
  - May have legacy LIS or Excel-based tracking
  - Value from unified EMR+LIS + auto-verification

- **Not Target**: L6 national referral hospitals
  - 20+ analyzers, specialized departments
  - Already invested in enterprise LIS
  - Vitora integrates via HL7 instead of replacing

---

## Next Steps

1. ~~**Immediate**: Implement facility-scoped HL7 endpoints~~ ✅
2. ~~**Phase L1**: QC System (materials, lots, targets, Westgard, EQA)~~ ✅
3. ~~**Phase L2**: Delta Checks & Auto-Verification (engine + rules + management command)~~ ✅
4. ~~**Phase L5**: TAT/SLA monitoring, workload KPIs, technician efficiency (reporting sub-module)~~ ✅
5. ~~**Phase L4**: Microbiology Module (cultures, AST, antibiogram, WHONET export)~~ ✅
6. **Next sprint**: L3 (Analyzer Integration — HL7/ASTM bi-directional)
7. **Parallel**: Identify pilot facility for analyzer interfacing (Phase L3)
8. **Future**: L5.3 (Worksheet/Label printing), L6 (Advanced)
