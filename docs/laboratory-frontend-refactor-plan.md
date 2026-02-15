# Laboratory Frontend Refactor Plan

> **Created**: 2026-02-15  
> **Owner**: Engineering  
> **Status**: Planning  
> **Scope**: Web-app alignment with backend LIS evolution phases

---

## 1) Executive Summary

The backend laboratory module has evolved significantly through Phases L0-L4, T0-T1, and Phase C (lab reporting). This document outlines the frontend refactors needed to expose these capabilities in the web application.

**Key backend changes requiring frontend support:**

| Phase | Backend Feature | Frontend Status |
|-------|----------------|-----------------|
| L0 | Specimen model | ❌ Missing |
| L1 | Results linked to Specimen | ⚠️ Partial (no specimen display) |
| L2 | Two-stage validation (ResultValidation) | ❌ Missing |
| L3 | Instruments & AnalyzerRun | ❌ Missing |
| L4 | DiagnosticReport + PDF | ❌ Missing |
| C | Lab operational reports (TAT, workload, critical, rejections) | ❌ Missing |
| T0 | ExternalCodeMapping | ❌ Missing (admin-only, low priority) |

---

## 2) Current Frontend State

### 2.1 Existing Types (`lib/types/laboratory.ts`)

| Type | Status | Notes |
|------|--------|-------|
| `TestCatalog` | ✅ Complete | |
| `TestCatalogListItem` | ✅ Complete | |
| `LabOrder` | ✅ Complete | |
| `LabOrderItem` | ✅ Complete | |
| `LabResult` | ✅ Complete | Missing `specimen` FK |
| `LabQueue` | ✅ Complete | Has `sample_id` but no `specimen` object |
| `LabTechnician` | ✅ Complete | |
| `CriticalAlert` | ✅ Complete | |
| `Specimen` | ✅ Complete | NEW in L0 |
| `ResultValidation` | ✅ Complete | NEW in L2 |
| `Instrument` | ✅ Complete | NEW in L3 |
| `AnalyzerRun` | ✅ Complete | NEW in L3 |
| `DiagnosticReport` | ✅ Complete | NEW in L4 |
| Lab Report Types | ✅ Complete | NEW in Phase C |

### 2.2 Existing API Client (`lib/api/laboratory.ts`)

| Endpoint Group | Status | Notes |
|----------------|--------|-------|
| Test Catalog | ✅ Complete | listTests, getTest, searchTests |
| Lab Orders | ✅ Complete | CRUD, submit, collect, cancel |
| Lab Results | ✅ Complete | CRUD, verify, attachments |
| Lab Queue | ✅ Complete | All workflow actions |
| Specimens | ❌ Missing | No specimen CRUD |
| Result Validations | ❌ Missing | No two-stage validation |
| Instruments | ❌ Missing | No instrument management |
| Analyzer Runs | ❌ Missing | No analyzer run tracking |
| Diagnostic Reports | ❌ Missing | No report generation/viewing |
| Lab Reports | ❌ Missing | TAT, workload, critical, rejections |

### 2.3 Existing Pages/Components

| Page | Location | Status |
|------|----------|--------|
| Lab Dashboard | `/laboratory/page.tsx` | ✅ Exists |
| Orders List | `/laboratory/orders/page.tsx` | ✅ Exists |
| Order Detail | `/laboratory/orders/[orderNumber]/page.tsx` | ✅ Exists |
| New Order | `/laboratory/orders/new/page.tsx` | ✅ Exists |
| Results Detail | `/laboratory/results/[id]/page.tsx` | ✅ Exists |
| Test Catalog | `/laboratory/tests/` | ✅ Exists |
| Lab Queue | Via `lab-queue-view.tsx` component | ✅ Exists |
| Specimens | ❌ None | Need specimen tracking UI |
| Instruments | ❌ None | Need instrument management |
| Diagnostic Reports | ❌ None | Need report viewer |
| Lab Operational Reports | ❌ None | Need reports dashboard |

---

## 3) Refactor Plan by Phase

### Phase F1 — Types & Schemas (Priority: HIGH) ⏱️ 4-6 hours

**Goal**: Add missing TypeScript types and Zod schemas for new backend models.

**Status**: ✅ Completed (2026-02-15)

#### 3.1.1 Add to `lib/types/laboratory.ts`

```typescript
// =========== Phase L0 — Specimen ===========

export type SpecimenStatus =
  | 'PENDING'
  | 'COLLECTED'
  | 'RECEIVED'
  | 'PROCESSING'
  | 'REJECTED'
  | 'STORED'
  | 'DISPOSED';

export interface Specimen {
  id: number;
  barcode: string;
  specimen_type: SpecimenType;
  container_type?: string | null;
  lab_order: number;
  order_items: number[];
  collected_by?: number | null;
  collected_by_name?: string | null;
  collected_at?: string | null;
  collection_site?: string | null;
  received_by?: number | null;
  received_at?: string | null;
  status: SpecimenStatus;
  rejection_reason?: string | null;
  storage_location?: string | null;
  storage_temperature?: string | null;
  created_at: string;
  updated_at: string;
}

// =========== Phase L2 — Two-Stage Validation ===========

export type ValidationType = 'TECHNICAL' | 'CLINICAL';
export type ValidationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ResultValidation {
  id: number;
  result: number;
  validation_type: ValidationType;
  validation_type_display: string;
  status: ValidationStatus;
  status_display: string;
  validated_by?: number | null;
  validated_by_name?: string | null;
  validated_at?: string | null;
  comment?: string | null;
}

export interface ResultValidationCreateData {
  validation_type: ValidationType;
  status: 'APPROVED' | 'REJECTED';
  comment?: string;
}

// =========== Phase L3 — Instruments & Analyzer Runs ===========

export type InterfaceType = 'ASTM' | 'HL7' | 'SERIAL' | 'TCP' | 'NONE';
export type AnalyzerRunStatus = 'RECEIVED' | 'PARSED' | 'APPLIED' | 'ERROR';

export interface Instrument {
  id: number;
  code: string;
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  department?: string | null;
  is_active: boolean;
  interface_type: InterfaceType;
  interface_type_display: string;
  integration_config?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyzerRun {
  id: number;
  specimen: number;
  specimen_barcode: string;
  instrument: number;
  instrument_code: string;
  instrument_name: string;
  operator?: number | null;
  operator_name?: string | null;
  run_datetime: string;
  raw_message?: string | null;
  raw_payload?: Record<string, unknown> | null;
  status: AnalyzerRunStatus;
  status_display: string;
  error_message?: string | null;
  created_at: string;
}

// =========== Phase L4 — Diagnostic Reports ===========

export type DiagnosticReportStatus =
  | 'DRAFT'
  | 'PRELIMINARY'
  | 'FINAL'
  | 'AMENDED'
  | 'CANCELLED';

export interface DiagnosticReport {
  id: number;
  report_number: string;
  lab_order: number;
  lab_order_number: string;
  patient_name: string;
  status: DiagnosticReportStatus;
  status_display: string;
  is_finalized: boolean;
  issued_by: number;
  issued_by_name: string;
  issued_at?: string | null;
  conclusion?: string | null;
  clinical_info?: string | null;
  amended_by?: number | null;
  amended_by_name?: string | null;
  amended_at?: string | null;
  cancellation_reason?: string | null;
  pdf_file?: string | null;
  pdf_url?: string | null;
  fhir_resource_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagnosticReportCreateData {
  lab_order: number;
  conclusion?: string;
  clinical_info?: string;
}

// =========== Phase C — Lab Operational Reports ===========

export interface TurnaroundTimeReport {
  start: string;
  end: string;
  overall: {
    results_verified: number;
    avg_result_tat_hours: number | null;
  };
  by_test: Array<{
    test_code: string;
    test_name: string;
    result_count: number;
    avg_tat_hours: number | null;
  }>;
  by_priority: Array<{
    priority: LabPriority;
    result_count: number;
    avg_tat_hours: number | null;
  }>;
  queue_tat: {
    released_count: number;
    avg_collect_to_release_hours: number | null;
    avg_processing_to_release_hours: number | null;
  };
}

export interface WorkloadReport {
  start: string;
  end: string;
  totals: {
    tests_entered: number;
    tests_verified: number;
  };
  by_day: Array<{
    date: string;
    tests_entered: number;
    tests_verified: number;
  }>;
  by_technician: Array<{
    technician_id: number;
    technician_name: string;
    entered_count: number;
    verified_count: number;
  }>;
}

export interface CriticalValuesReport {
  start: string;
  end: string;
  total_critical: number;
  by_test: Array<{
    test_code: string;
    test_name: string;
    critical_count: number;
  }>;
}

export interface SampleRejectionReport {
  start: string;
  end: string;
  total_orders: number;
  rejected_orders: number;
  rejection_rate: number;
  reasons: Array<{
    reason: string;
    count: number;
  }>;
}
```

#### 3.1.2 Add to `lib/schemas/laboratory.schema.ts`

Add corresponding Zod schemas for all new types (Specimen, ResultValidation, Instrument, AnalyzerRun, DiagnosticReport, and report response types).

---

### Phase F2 — API Client Extensions (Priority: HIGH) ⏱️ 4-6 hours

**Goal**: Add API methods for new backend endpoints.

#### 3.2.1 Add to `lib/api/laboratory.ts`

```typescript
// ============ Specimens ============

async getSpecimen(barcode: string): Promise<Specimen> {...},
async listOrderSpecimens(orderNumber: string): Promise<Specimen[]> {...},

// ============ Result Validations (Two-Stage) ============

async getResultValidations(resultId: number): Promise<ResultValidation[]> {...},
async createResultValidation(
  resultId: number,
  data: ResultValidationCreateData
): Promise<ResultValidation> {...},

// ============ Instruments ============

async listInstruments(params?: { is_active?: boolean; search?: string }): Promise<Instrument[]> {...},
async getInstrument(id: number): Promise<Instrument> {...},
async createInstrument(data: Partial<Instrument>): Promise<Instrument> {...},
async updateInstrument(id: number, data: Partial<Instrument>): Promise<Instrument> {...},

// ============ Analyzer Runs ============

async listAnalyzerRuns(specimenId?: number): Promise<AnalyzerRun[]> {...},
async getAnalyzerRun(id: number): Promise<AnalyzerRun> {...},
async markAnalyzerRunError(id: number, errorMessage: string): Promise<AnalyzerRun> {...},

// ============ Diagnostic Reports ============

async listDiagnosticReports(params?: {
  lab_order?: number;
  status?: DiagnosticReportStatus;
}): Promise<DiagnosticReport[]> {...},
async getDiagnosticReport(id: number | string): Promise<DiagnosticReport> {...},
async createDiagnosticReport(data: DiagnosticReportCreateData): Promise<DiagnosticReport> {...},
async updateDiagnosticReport(id: number, data: Partial<DiagnosticReport>): Promise<DiagnosticReport> {...},
async finalizeDiagnosticReport(id: number): Promise<DiagnosticReport> {...},
async amendDiagnosticReport(id: number, conclusion: string): Promise<DiagnosticReport> {...},
async cancelDiagnosticReport(id: number, reason: string): Promise<DiagnosticReport> {...},
async downloadDiagnosticReportPdf(id: number): Promise<Blob> {...},

// ============ Lab Operational Reports ============

async getTurnaroundTimeReport(startDate: string, endDate: string): Promise<TurnaroundTimeReport> {...},
async getWorkloadReport(startDate: string, endDate: string): Promise<WorkloadReport> {...},
async getCriticalValuesReport(startDate: string, endDate: string): Promise<CriticalValuesReport> {...},
async getSampleRejectionReport(startDate: string, endDate: string): Promise<SampleRejectionReport> {...},
```

---

### Phase F3 — Lab Queue Enhancements (Priority: MEDIUM) ⏱️ 3-4 hours

**Goal**: Update queue view to display specimen information.

#### 3.3.1 Update `LabQueue` Type

Add optional `specimen` field to `LabQueue` interface:

```typescript
export interface LabQueue {
  // ... existing fields ...
  specimen?: Specimen | null;  // NEW: linked specimen
}
```

#### 3.3.2 Update `lab-queue-view.tsx`

- Display specimen barcode prominently (scannable)
- Show specimen status badge
- Add specimen collection timestamp
- Show storage location if applicable

---

### Phase F4 — Two-Stage Validation UI (Priority: MEDIUM) ⏱️ 6-8 hours

**Goal**: Implement technical and clinical review workflow.

#### 3.4.1 New Component: `ResultValidationPanel`

Location: `components/laboratory/result-validation-panel.tsx`

Features:
- Display validation history for a result
- Show TECHNICAL vs CLINICAL validation badges
- Allow authorized users to add validations
- Indicate when result is fully validated (both stages complete)

#### 3.4.2 Update Result Entry/Verification

Update `lab-results-entry.tsx`:
- After result entry, show "Submit for Technical Review" button
- After technical approval, show "Submit for Clinical Review"
- Display validation status badges in result list

#### 3.4.3 New Page: Pending Validations Dashboard

Route: `/laboratory/validations/page.tsx`

Features:
- Tab: "Technical Review" - results awaiting technical validation
- Tab: "Clinical Review" - results awaiting clinical validation
- Filter by test type, priority, date
- Bulk validation actions

---

### Phase F5 — Diagnostic Reports UI (Priority: MEDIUM) ⏱️ 8-10 hours

**Goal**: Allow lab to generate, view, and manage diagnostic reports.

#### 3.5.1 New Pages

| Route | Purpose |
|-------|---------|
| `/laboratory/reports/page.tsx` | List diagnostic reports |
| `/laboratory/reports/[reportNumber]/page.tsx` | View report detail |

#### 3.5.2 New Components

| Component | Purpose |
|-----------|---------|
| `diagnostic-report-list.tsx` | Table/cards of reports with status filters |
| `diagnostic-report-detail.tsx` | View report with PDF preview |
| `diagnostic-report-form.tsx` | Create/edit report (conclusion, clinical info) |
| `report-status-badge.tsx` | DRAFT/PRELIMINARY/FINAL/AMENDED badge |

#### 3.5.3 Add Report Generation to Order Detail

In `lab-order-detail.tsx`:
- Add "Generate Report" button (when all results verified)
- Show linked diagnostic report if exists
- Download PDF action

---

### Phase F6 — Lab Operational Analytics (Priority: HIGH) ⏱️ 8-10 hours

**Goal**: Add lab-specific analytics dashboard.

#### 3.6.1 New Page

Route: `/laboratory/analytics/page.tsx`

Features:
- Date range picker (default: last 7 days)
- TAT overview card with trend chart
- Workload summary (tests/day, by technician)
- Critical values count and breakdown
- Sample rejection rate with reasons pie chart

#### 3.6.2 New Components

| Component | Purpose |
|-----------|---------|
| `lab-tat-chart.tsx` | Line chart of TAT trends by day/test |
| `lab-workload-chart.tsx` | Bar chart of tests by technician |
| `lab-critical-values-card.tsx` | Summary card with test breakdown |
| `lab-rejection-chart.tsx` | Pie chart of rejection reasons |
| `lab-analytics-dashboard.tsx` | Main dashboard container |

#### 3.6.3 Integration with Reports Page

Add "Laboratory" section to `/reports/page.tsx` linking to lab analytics.

---

### Phase F7 — Instrument Management (Priority: LOW) ⏱️ 4-6 hours

**Goal**: Admin UI for managing lab instruments (optional for MVP).

#### 3.7.1 New Pages (Admin)

| Route | Purpose |
|-------|---------|
| `/laboratory/instruments/page.tsx` | List instruments |
| `/laboratory/instruments/[id]/page.tsx` | Instrument detail |
| `/laboratory/instruments/new/page.tsx` | Add instrument |

#### 3.7.2 Components

- `instrument-table.tsx` - List with active/inactive filters
- `instrument-form.tsx` - Create/edit form
- `analyzer-run-history.tsx` - View runs for an instrument

---

### Phase F8 — WebSocket Integration Updates (Priority: LOW) ⏱️ 2-3 hours

**Goal**: Handle new real-time events from backend.

#### 3.8.1 New Event Types

Add to `lib/types/events.ts` or `laboratory.ts`:

```typescript
export interface LabWebSocketEvents {
  // Existing
  result_entered: { result_id: number; order_number: string; test_name: string };
  result_verified: { result_id: number; order_number: string };
  critical_alert: { result_id: number; test_name: string; value: string; flag: ResultFlag };
  order_completed: { order_number: string };
  
  // NEW: Two-stage validation
  validation_submitted: { result_id: number; validation_type: ValidationType };
  validation_approved: { result_id: number; validation_type: ValidationType };
  validation_rejected: { result_id: number; validation_type: ValidationType };
  
  // NEW: Diagnostic reports
  report_finalized: { report_number: string; lab_order_number: string };
  report_amended: { report_number: string };
}
```

#### 3.8.2 Update Socket Provider

Update `lab-clinician-socket-provider.tsx` to handle new events with appropriate toasts/notifications.

---

## 4) Implementation Priority & Timeline

| Phase | Priority | Effort | Depends On | Sprint Target |
|-------|----------|--------|------------|---------------|
| F1: Types & Schemas | HIGH | 4-6 hrs | None | Sprint 2.1 |
| F2: API Client | HIGH | 4-6 hrs | F1 | Sprint 2.1 |
| F6: Lab Analytics | HIGH | 8-10 hrs | F1, F2 | Sprint 2.1 |
| F3: Queue Enhancements | MEDIUM | 3-4 hrs | F1, F2 | Sprint 2.2 |
| F4: Two-Stage Validation | MEDIUM | 6-8 hrs | F1, F2 | Sprint 2.2 |
| F5: Diagnostic Reports | MEDIUM | 8-10 hrs | F1, F2 | Sprint 2.2 |
| F7: Instruments | LOW | 4-6 hrs | F1, F2 | Sprint 2.3 |
| F8: WebSocket Updates | LOW | 2-3 hrs | F4, F5 | Sprint 2.3 |

**Total Estimated Effort**: 40-53 hours

---

## 5) File Changes Summary

### New Files

```
lib/types/laboratory.ts           # Update with new types
lib/schemas/laboratory.schema.ts  # Update with new schemas
lib/api/laboratory.ts             # Update with new endpoints

# Phase F4 - Two-Stage Validation
components/laboratory/result-validation-panel.tsx
app/(dashboard)/laboratory/validations/page.tsx

# Phase F5 - Diagnostic Reports
components/laboratory/diagnostic-report-list.tsx
components/laboratory/diagnostic-report-detail.tsx
components/laboratory/diagnostic-report-form.tsx
components/laboratory/report-status-badge.tsx
app/(dashboard)/laboratory/reports/page.tsx
app/(dashboard)/laboratory/reports/[reportNumber]/page.tsx

# Phase F6 - Lab Analytics
components/laboratory/analytics/lab-tat-chart.tsx
components/laboratory/analytics/lab-workload-chart.tsx
components/laboratory/analytics/lab-critical-values-card.tsx
components/laboratory/analytics/lab-rejection-chart.tsx
components/laboratory/analytics/lab-analytics-dashboard.tsx
app/(dashboard)/laboratory/analytics/page.tsx

# Phase F7 - Instruments (Optional)
components/laboratory/instrument-table.tsx
components/laboratory/instrument-form.tsx
components/laboratory/analyzer-run-history.tsx
app/(dashboard)/laboratory/instruments/page.tsx
app/(dashboard)/laboratory/instruments/[id]/page.tsx
app/(dashboard)/laboratory/instruments/new/page.tsx
```

### Modified Files

```
lib/types/laboratory.ts           # Add: Specimen, ResultValidation, Instrument, etc.
lib/schemas/laboratory.schema.ts  # Add corresponding Zod schemas
lib/api/laboratory.ts             # Add API methods
components/laboratory/lab-queue-view.tsx           # Show specimen info
components/laboratory/lab-results-entry.tsx        # Add validation workflow
components/laboratory/lab-order-detail.tsx         # Add report generation
app/(dashboard)/laboratory/layout.tsx              # Add analytics/reports nav
app/(dashboard)/reports/page.tsx                   # Link to lab analytics
```

---

## 6) Testing Considerations

### Unit Tests

- Test new Zod schemas with valid/invalid data
- Test API client methods with MSW mocks
- Test validation panel rendering and actions

### E2E Tests

- Two-stage validation workflow (enter result → technical review → clinical review)
- Diagnostic report generation and PDF download
- Lab analytics date filtering and chart rendering

### Contract Tests

- Verify frontend schemas match backend serializers
- Add to `test_contracts.py` for new serializers

---

## 7) References

- [lis-evolution.md](lis-evolution.md) - Backend LIS phases L0-L4
- [laboratory-reporting-proposal.md](laboratory-reporting-proposal.md) - Phase C reporting
- [terminology-strategy.md](terminology-strategy.md) - Phase T0 external mappings
- Backend serializers: `hmis/apps/laboratory/serializers.py`
- Backend URLs: `hmis/apps/laboratory/urls.py`
