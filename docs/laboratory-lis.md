# Laboratory & LIS Module — SSOT

> **Status**: L1–L6 Complete
> **Owner**: Engineering Lead
> **Last Updated**: May 12, 2026
> **Backend App**: `hmis.apps.laboratory`
> **Frontend Route**: `/laboratory/*`
> **Migrations**: 35

---

## Overview

Vitora's Laboratory module is a **complete, accreditation-ready Laboratory Information System (LIS)** integrated natively into the HMIS. It eliminates the need for a separate LIS for L2–L5 Kenya facilities by covering the full laboratory lifecycle: test catalog, ordering, specimen tracking, result entry, two-stage verification, quality control (Westgard), analyzer interfacing, microbiology, and TAT/SLA reporting.

### Completed Phases

| Phase | Scope | Tests |
|-------|-------|-------|
| **Foundation** | Test catalog, orders, specimens, results, verification, queue, HL7/FHIR, LOINC | ✅ |
| **L1 — Quality Control** | QC materials/lots, Westgard multi-rule engine, Levey-Jennings charts, EQA/PT | ✅ |
| **L2 — Auto-Verification** | Delta check engine, auto-verify rules, configurable thresholds | ✅ |
| **L3 — Analyzer Interfacing** | ASTM/HL7/Serial protocol adapters, driver templates, result auto-application | ✅ |
| **L4 — Microbiology** | Culture & sensitivity workflow, antibiogram, WHONET export | ✅ |
| **L5 — Reporting & Analytics** | TAT/SLA monitoring, workload KPIs, technician efficiency | ✅ |
| **L6 — Advanced** | Reflex testing, critical value management, worksheets | ✅ |

---

## Backend Architecture

### Directory Structure

```
backend/hmis/apps/laboratory/
├── models.py              # Core models: TestCatalog, LabOrder, LabOrderItem, LabResult, Specimen, etc.
├── views.py               # Core ViewSets
├── serializers.py          # Core serializers
├── signals.py              # Domain event wiring
├── permissions.py          # LIS-specific permissions
├── urls.py                 # Root router + sub-app includes
├── admin.py                # Admin registration
├── apps.py                 # AppConfig (imports signals in ready())
├── validators.py           # Field validators
├── websockets.py           # WebSocket consumers
├── routing.py              # WebSocket routing
├── consumers.py            # WS consumer classes
├── services/               # Business logic services
├── services_legacy.py      # Legacy service layer
│
├── qc/                     # Phase L1 — Quality Control
│   ├── models.py           # QCMaterial, QCLot, QCTarget, QCResult, QCRule, QCRuleViolation, EQASurvey, EQASample, EQASubmission
│   ├── views.py
│   ├── serializers.py
│   ├── urls.py
│   └── westgard.py         # Westgard multi-rule engine
│
├── autoverify/             # Phase L2 — Delta Checks & Auto-Verification
│   ├── models.py           # DeltaCheckRule, AutoVerifyRule, AutoVerifyLog
│   ├── views.py
│   ├── serializers.py
│   └── urls.py
│
├── analyzers/              # Phase L3 — Analyzer Interfacing
│   ├── models.py           # InstrumentChannel, AnalyzerMessage, AnalyzerDriverTemplate
│   ├── views.py
│   ├── serializers.py
│   ├── services.py         # Result auto-application, specimen resolution
│   ├── urls.py
│   └── protocols/
│       ├── astm_adapter.py     # ASTM E1394/LIS2-A2
│       ├── hl7_adapter.py      # HL7 v2.x bidirectional (MLLP)
│       └── serial_adapter.py   # RS-232 via TCP-Serial bridge
│
├── microbiology/           # Phase L4 — Microbiology
│   ├── models.py           # Organism, Antibiotic, CultureResult, AntibioticSensitivity, Antibiogram
│   ├── views.py
│   ├── serializers.py
│   └── urls.py
│
├── reporting/              # Phase L5 — TAT/SLA Reporting
│   ├── models.py           # TATSLATarget, TATSnapshot, WorkloadSnapshot
│   ├── views.py
│   ├── serializers.py
│   └── urls.py
│
├── reflex/                 # Phase L6 — Reflex Testing
│   ├── models.py           # ReflexRule
│   └── urls.py
│
├── critical_values/        # Phase L6 — Critical Value Management
│   ├── models.py           # CriticalValueNotification
│   └── urls.py
│
├── worksheets/             # Phase L6 — Worksheet/Label Generation
│   └── urls.py
│
├── standalone/             # Walk-in / External Order Support
│   └── urls.py
│
└── migrations/             # 35 migration files
```

---

## Data Models

### Core Models (`models.py`)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `TestCatalog` | Test definitions scoped per facility | `code`, `name`, `short_name`, `loinc_code`, `category` (11 types), `specimen_type` (11 types), `result_type` (NUMERIC/TEXT/OPTIONS/PANEL), `cost`, `is_panel`, `reference_range_low/high`, `critical_low/high`, `unit` |
| `LabOrder` | Order container | `order_number` (auto: `LAB-YYYYMMDD-XXXX`), `patient`, `encounter`, `status` (DRAFT→COLLECTED→IN_PROGRESS→RESULTED→COMPLETED→CANCELLED), `priority` (ROUTINE/URGENT/STAT), `order_type`, `ordered_by` |
| `LabOrderItem` | Individual test within an order | `lab_order`, `test` (FK→TestCatalog), `status`, `unit_cost` |
| `LabResult` | Result values | `order_item`, `numeric_value`, `text_value`, `option_value`, `result_flag` (NORMAL/LOW/HIGH/CRITICAL_LOW/CRITICAL_HIGH), `verification_status` (UNVERIFIED→TECH_VERIFIED→CLINICALLY_VERIFIED), `verified_by`, `verified_at` |
| `Specimen` | Physical sample tracking | `barcode` (auto-generated), `specimen_type`, `status` (ORDERED→COLLECTED→RECEIVED→IN_PROCESS→STORED→DISPOSED→REJECTED), `collected_at`, `collected_by`, `received_at`, `received_by`, `rejection_reason` |
| `LabQueue` | Work queue management | `lab_order`, `queue_number`, `queue_status`, `priority_order` |
| `DiagnosticReport` | Finalized report container | `order`, `status` (PARTIAL/PRELIMINARY/FINAL/AMENDED/CANCELLED), `conclusion`, `issued_at`, `verified_by` |
| `Instrument` | Analyzer registry | `code`, `name`, `manufacturer`, `model`, `serial_number`, `interface_type` |
| `LabAttachment` | Result attachments | `result`, `file`, `file_type` (PDF/IMAGE) |
| `LOINCCode` | LOINC reference data | `code`, `long_name`, `component`, `property`, `system` |

### QC Models (`qc/models.py`)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `QCMaterial` | Control material registration | `name`, `manufacturer`, `is_active` |
| `QCLot` | Lot tracking with expiry | `material`, `lot_number`, `open_date`, `expiry_date`, `status`, `storage_conditions` |
| `QCTarget` | Expected values per analyte | `lot`, `test` (FK→TestCatalog), `mean`, `sd`, `cv_percent`, `units` |
| `QCResult` | Daily QC data points | `lot`, `instrument`, `test`, `value`, `run_date`, `operator`, `accepted` |
| `QCRule` | Westgard rule configuration | `name`, `rule_type` (WESTGARD/CUSTOM), `custom_expression`, `is_active` |
| `QCRuleViolation` | Rule breach tracking | `qc_result`, `rule`, `severity`, `acknowledged_by`, `acknowledged_at` |
| `EQASurvey` | External quality assessment programs | `provider`, `survey_id`, `due_date`, `status` |
| `EQASample` | EQA expected values | `survey`, `sample_id`, `expected_result` |
| `EQASubmission` | Lab's EQA responses | `sample`, `submitted_value`, `z_score`, `acceptable` |

### Auto-Verification Models (`autoverify/models.py`)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `DeltaCheckRule` | Previous-result comparison rules | `test`, `check_type`, `threshold_percent`, `threshold_absolute`, `lookback_hours`, `action` (FLAG_FOR_REVIEW/BLOCK_RELEASE/ALERT_ONLY) |
| `AutoVerifyRule` | Auto-release conditions | `test`, `condition_type`, `conditions` (JSONField), `priority`, `is_active` |
| `AutoVerifyLog` | Audit trail of auto-verifications | `result`, `rule`, `verified_at`, `outcome` |

### Analyzer Models (`analyzers/models.py`)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `InstrumentChannel` | Connection to physical analyzer | `instrument`, `protocol` (ASTM/HL7/SERIAL/TCP), `host`, `port`, `config` (JSONField), `connection_status` |
| `AnalyzerMessage` | Raw message log | `channel`, `direction` (INBOUND/OUTBOUND), `raw_data`, `parsed_data`, `status` |
| `AnalyzerDriverTemplate` | Pre-built analyzer configurations | `name`, `manufacturer`, `model`, `protocol`, `default_config` |

### Microbiology Models (`microbiology/models.py`)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Organism` | Global reference (genus/species) | `genus`, `species`, `gram_stain`, `organism_type` |
| `Antibiotic` | Global reference | `code`, `name`, `class`, `disk_content` |
| `CultureResult` | Multi-step culture workflow | `lab_result`, `organism`, `status` (INOCULATED→INCUBATING→READING→REPORTED), `colony_count`, `morphology`, `culture_medium`, `incubation_hours` |
| `AntibioticSensitivity` | AST results | `culture`, `antibiotic`, `zone_diameter`, `mic`, `interpretation` (S/I/R) |
| `Antibiogram` | Cumulative facility statistics | `facility`, `year`, `organism`, `antibiotic`, `percent_sensitive`, `sample_size` |

### Reporting Models (`reporting/models.py`)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `TATSLATarget` | SLA definitions per test | `test`, `priority`, `target_hours` |
| `TATSnapshot` | Percentile-based TAT snapshots | `test`, `period`, `p50`, `p90`, `p95`, `breach_count` |
| `WorkloadSnapshot` | Technician productivity snapshots | `user`, `period`, `tests_completed`, `specimens_processed` |

---

## Permissions

Defined in `laboratory/permissions.py`:

| Permission Class | Purpose |
|-----------------|---------|
| `LaboratoryModuleRequired` | Gates all laboratory access |
| `LISStandaloneRequired` | Gates walk-in and external order features |
| `LISCollectSamplePermission` | Required for specimen collection |
| `LISEnterResultsPermission` | Required for result entry and culture reading |
| `LISReleaseResultsPermission` | Required for technical/clinical verification |
| `LISManageCatalogPermission` | Required for test catalog CRUD |
| `LISQCPermission` | Required for QC management |
| `LISConfigPermission` | Required for analyzer channel management |

---

## API Endpoints

All endpoints are prefixed with `/api/laboratory/`.

### Core Operations

```
GET|POST        /api/laboratory/tests/                           # Test catalog
GET|PATCH|DEL   /api/laboratory/tests/{id}/
GET|POST        /api/laboratory/orders/                          # Lab orders
GET|PATCH|DEL   /api/laboratory/orders/{id}/
GET|POST        /api/laboratory/results/                         # Lab results
GET|PATCH       /api/laboratory/results/{id}/
GET|POST        /api/laboratory/specimens/                       # Specimen tracking
GET|PATCH       /api/laboratory/specimens/{id}/
GET|POST        /api/laboratory/queue/                           # Work queue
GET             /api/laboratory/queue/{id}/
GET|POST        /api/laboratory/diagnostic-reports/              # Diagnostic reports
GET             /api/laboratory/diagnostic-reports/{id}/
POST            /api/laboratory/diagnostic-reports/{id}/finalize/
POST            /api/laboratory/diagnostic-reports/{id}/amend/
POST            /api/laboratory/diagnostic-reports/{id}/cancel/
GET|POST        /api/laboratory/attachments/                     # Result attachments
GET|POST        /api/laboratory/instruments/                     # Instrument registry
GET|POST        /api/laboratory/analyzer-runs/                   # Analyzer runs
GET|POST        /api/laboratory/loinc-codes/                     # LOINC codes
```

### Settings

```
GET|POST        /api/laboratory/settings/rejection-reasons/      # Specimen rejection reasons
GET|POST        /api/laboratory/settings/comment-templates/      # Result comment templates
GET|POST        /api/laboratory/settings/referral-labs/          # External referral labs
GET|POST        /api/laboratory/settings/barcode-config/         # Barcode configuration
GET|POST|PATCH  /api/laboratory/settings/workflow/               # Workflow settings
```

### Reports

```
GET             /api/laboratory/reports/turnaround-time/         # TAT report
GET             /api/laboratory/reports/workload/                 # Workload report
GET             /api/laboratory/reports/critical-values/          # Critical values report
GET             /api/laboratory/reports/rejections/               # Sample rejection report
```

### Quality Control (`/api/laboratory/qc/`)

```
GET|POST        /api/laboratory/qc/materials/                    # QC materials
GET|PATCH|DEL   /api/laboratory/qc/materials/{id}/
GET|POST        /api/laboratory/qc/lots/                         # QC lots
GET|PATCH|DEL   /api/laboratory/qc/lots/{id}/
GET|POST        /api/laboratory/qc/targets/                      # QC targets
GET|POST        /api/laboratory/qc/results/                      # QC results
GET|POST        /api/laboratory/qc/rules/                        # QC (Westgard) rules
```

### Auto-Verification (`/api/laboratory/autoverify/`)

```
GET|POST        /api/laboratory/autoverify/rules/                # Auto-verify rules
GET|PATCH|DEL   /api/laboratory/autoverify/rules/{id}/
GET|POST        /api/laboratory/autoverify/delta-rules/          # Delta check rules
GET|PATCH|DEL   /api/laboratory/autoverify/delta-rules/{id}/
GET|PATCH       /api/laboratory/autoverify/config/               # Global auto-verify config
```

### TAT/SLA Reporting (`/api/laboratory/reporting/`)

```
GET             /api/laboratory/reporting/sla-compliance/         # SLA compliance dashboard
GET             /api/laboratory/reporting/tat-trend/              # TAT trend over time
GET             /api/laboratory/reporting/active-breaches/        # Currently breaching orders
GET             /api/laboratory/reporting/technician-efficiency/  # Per-tech productivity
```

### Microbiology (`/api/laboratory/microbiology/`)

```
GET|POST        /api/laboratory/microbiology/organisms/          # Organism reference
GET|POST        /api/laboratory/microbiology/cultures/           # Culture results
GET|PATCH       /api/laboratory/microbiology/cultures/{id}/
GET|POST        /api/laboratory/microbiology/sensitivities/      # AST results
GET             /api/laboratory/microbiology/antibiogram/        # Cumulative antibiogram
```

### Analyzer Interfacing (`/api/laboratory/analyzers/`)

```
GET|POST        /api/laboratory/analyzers/channels/              # Instrument channels
GET|PATCH|DEL   /api/laboratory/analyzers/channels/{id}/
POST            /api/laboratory/analyzers/channels/{id}/test-connection/
GET             /api/laboratory/analyzers/messages/               # Message log
GET             /api/laboratory/analyzers/templates/              # Driver templates
GET             /api/laboratory/analyzers/dashboard/              # Status overview
```

### Other Sub-Modules

```
                /api/laboratory/reflex/                          # Reflex testing rules
                /api/laboratory/critical-values/                 # Critical value notifications
                /api/laboratory/worksheets/                      # Worksheet/label generation
                /api/laboratory/standalone/                      # Walk-in / external orders
```

### Nested Patient/Encounter Routes

```
GET             /api/patients/{id}/lab-orders/                   # Patient's lab orders
GET             /api/patients/{id}/lab-orders/{order_number}/
GET             /api/patients/{id}/lab-results/                  # Patient's lab results
GET             /api/encounters/{id}/lab-orders/                 # Encounter's lab orders
GET             /api/encounters/{id}/lab-orders/{order_number}/
```

---

## Interoperability

### HL7 v2 (MLLP — Port 2575)

Bidirectional messaging via `HL7BidirectionalAdapter`:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `ORM^O01` | Outbound | Send lab orders to external LIS/analyzer |
| `ORU^R01` | Inbound | Receive results from external systems |
| `QRY/QPD` | Inbound | Analyzer queries for pending work orders |
| `ACK/NAK` | Both | Standard acknowledgments |

HL7 endpoints are **facility-scoped** — each facility can have its own HL7 routing configuration.

### FHIR R4

Lab data is exposed as FHIR R4 resources under `/api/fhir/`:

| Resource | Source Model | Profile |
|----------|-------------|---------|
| `DiagnosticReport` | `DiagnosticReport` | IPS (`http://hl7.org/fhir/uv/ips/StructureDefinition/DiagnosticReport-uv-ips`) |
| `Observation` | `LabResult` | Standard R4 |
| `Specimen` | `Specimen` | Standard R4 |

The IPS endpoint (`/fhir/Patient/{id}/$summary`) bundles all lab results into an International Patient Summary.

### ASTM E1394 / LIS2-A2

Supported via `ASTMAdapter` for direct analyzer communication:
- Record types: H (Header), P (Patient), O (Order), R (Result), L (Terminator)
- Used by Roche cobas, Abbott Architect, and similar chemistry analyzers

### LOINC Mapping

All tests in the catalog can be mapped to LOINC codes for semantic interoperability. The `LOINCCode` model stores the reference data, imported via `import_loinc` management command.

---

## External HMIS Integration Guide

An external HMIS can integrate with Vitora's LIS through three channels:

### Option 1: HL7 v2 (MLLP) — Legacy / Instrument-Level

```
External HMIS                           Vitora LIS
     │                                      │
     ├── ORM^O01 (order) ─────────────────►│  Order placed, specimen barcode generated
     │                                      │  Sample collected, processed, verified
     │◄── ORU^R01 (results) ───────────────┤  Verified results returned
```

- Connect via TCP to MLLP listener (port 2575)
- Standard MLLP framing (`VT` start, `FS`+`CR` end)
- Specimen resolved by barcode → `LabOrderItem`

### Option 2: FHIR R4 — Modern Interoperability

```
GET  /api/fhir/DiagnosticReport/{id}          # Finalized report
GET  /api/fhir/Observation/{id}               # Individual result
GET  /api/fhir/Specimen/{id}                  # Specimen tracking
GET  /api/fhir/Patient/{id}/$summary          # IPS bundle with lab results
```

### Option 3: REST API — Direct Integration

```
POST /api/laboratory/orders/                  # Place order (JWT auth)
GET  /api/laboratory/results/?order={id}      # Retrieve results
GET  /api/laboratory/diagnostic-reports/{id}/ # Finalized report
```

Authentication: JWT with `LISEnterResultsPermission` for writes, `LaboratoryModuleRequired` for reads.

---

## Domain Events

Defined in `LaboratoryEvents` in `core/events/types.py`:

| Event | Trigger |
|-------|---------|
| `laboratory.order.created` | New lab order placed |
| `laboratory.order.status_changed` | Order status transition |
| `laboratory.order.completed` | All results verified |
| `laboratory.order.billed` | Order linked to invoice |
| `laboratory.specimen.created` | Specimen barcode generated |
| `laboratory.result.entered` | Result value recorded |
| `laboratory.result.verified` | Technical or clinical verification |
| `laboratory.qc.result_entered` | QC data point recorded |
| `laboratory.qc.rule_violated` | Westgard rule breach |
| `laboratory.delta_check.failed` | Delta check threshold exceeded |
| `laboratory.auto_verify.passed` | Auto-verification rule passed |
| `laboratory.auto_verify.blocked` | Auto-verification blocked (manual review required) |
| `laboratory.analyzer.result_applied` | Analyzer result auto-applied to order item |
| `laboratory.analyzer.message_received` | Raw analyzer message received |

Signal handlers in `laboratory/signals.py`:

| Signal | Handler | Effect |
|--------|---------|--------|
| `LabOrder` post_save | `create_lab_queue_entry` | Initializes queue entry |
| `LabQueue` post_save | `create_specimen_for_queue` | Auto-creates specimen records |
| `LabResult` post_save | `update_order_status_on_result` | Transitions order status |
| Priority change | `sync_lab_queue_priority` | Syncs order → queue priority |

---

## Frontend Pages

### Route Structure

```
web-app/app/(dashboard)/laboratory/
├── orders/           # Order list, create, detail
├── results/          # Result entry, verification queues
├── queue/            # Lab work queue
├── microbiology/     # Culture list, detail, antibiogram
├── qc/               # QC dashboard, Levey-Jennings charts, EQA
├── analyzers/        # Analyzer channels, driver templates, dashboard
├── worksheets/       # Worksheet generation
├── reporting/        # TAT/SLA dashboards
├── autoverify/       # Auto-verify rule management
└── sla/              # SLA compliance dashboard
```

### Frontend Files

| File | Purpose |
|------|---------|
| `web-app/lib/types/laboratory.ts` | TypeScript interfaces: `TestCatalog`, `LabOrder`, `LabResult`, `Specimen`, `QCResult`, etc. |
| `web-app/lib/schemas/laboratory.schema.ts` | Zod schemas for API response validation |
| `web-app/lib/api/laboratory.ts` | `laboratoryApi` client: `listTests`, `createOrder`, `verifyResult`, etc. |

---

## Management Commands

| Command | Purpose |
|---------|---------|
| `seed_essential_tests` | Seed common test catalog entries |
| `import_loinc` | Import LOINC codes from CSV |
| `create_missing_lab_queues` | Backfill queue entries for existing orders |
| `load_lab_reference_ranges` | Load reference ranges from CSV |
| `seed_autoverify_defaults` | Create default auto-verify rules |
| `seed_analyzer_templates` | Load 9 Kenya-common analyzer driver templates |
| `seed_worksheet_templates` | Load default worksheet templates |

### Pre-Built Analyzer Templates

Seeded via `seed_analyzer_templates`:

| Analyzer | Protocol | Category |
|----------|----------|----------|
| Sysmex XN series | HL7 | Hematology |
| Mindray BC series | HL7 | Hematology |
| Horiba Pentra series | HL7 | Hematology |
| Roche cobas c | ASTM | Chemistry |
| Erba Chem series | ASTM | Chemistry |
| Abbott Architect | ASTM | Chemistry/Immunoassay |
| Beckman Access | HL7 | Immunoassay |
| GeneXpert | HL7/File | TB/COVID |
| Dirui H-Series | HL7 | Urinalysis |

---

## Quality Control — Westgard Rules

The Westgard multi-rule engine (`qc/westgard.py`) implements:

| Rule | Type | Action |
|------|------|--------|
| 1-2s | Warning | Flag for review |
| 1-3s | Reject | Block patient results |
| 2-2s | Reject | Two consecutive >2SD same direction |
| R-4s | Reject | Two consecutive results span >4SD |
| 4-1s | Warning | Four consecutive >1SD same direction |
| 10x | Reject | Ten consecutive same side of mean |

QC violations require **mandatory acknowledgment** before patient results from that run can be released.

---

## Success Metrics

| Metric | Target | Data Source |
|--------|--------|-------------|
| Auto-verification rate | >60% of routine tests | `AutoVerifyLog` count / total results |
| QC compliance | 100% daily QC before patient runs | QC run dates vs. patient result dates |
| TAT compliance | >90% within SLA | `TATSnapshot.breach_count` / total orders |
| Critical value notification | >95% within 30 min | `CriticalValueNotification` timestamps |
| Specimen rejection rate | <2% | Rejected specimens / total received |
| Delta check catch rate | Track monthly | Flagged results confirmed as errors |

---

## Target Market

| Segment | Facilities | Fit |
|---------|-----------|-----|
| **Primary** | L2–L4 (health centers, sub-county hospitals) | 1–3 analyzers, 2–5 lab techs, no existing LIS, paper-based. Highest value. |
| **Secondary** | L5 (county referral hospitals) | 5–15 analyzers, 10–30 lab staff. Value from unified EMR+LIS + auto-verification. |
| **Integration** | L6 (national referral hospitals) | 20+ analyzers, enterprise LIS already in place. Vitora integrates via HL7, does not replace. |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `docs/lis-implementation-plan.md` | Original gap analysis, phase details, and competitive positioning |
| `docs/domain-events.md` | Domain events SSOT (includes all lab events) |
| `docs/active-hie-integration.md` | HL7/FHIR integration architecture |
| `docs/ai-integration-checklist.md` | AI lab result interpretation (TibaBot) |
