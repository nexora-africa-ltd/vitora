# Laboratory Reporting: Current State vs Target State (Proposal & Concrete Plan)

> **Created**: 2026-02-14  
> **Updated**: 2026-02-14  
> **Owner**: Engineering  
> **Status**: Phase B Complete  
> **Scope**: Laboratory module (backend + web-app), reporting/analytics, external exchange foundations

---

## 1) Executive Summary

Vitora HMIS currently “reports” laboratory activity primarily through **clinical workflow state changes** (orders → results → verification) and **real-time notifications** (WebSocket events + in-app notifications, with optional critical-result email). This supports day-to-day care, but it is not yet “reporting” in the broader sense of:

- **Operational analytics** (turnaround time, workload, critical value trends, rejection rates)
- **Document-style outputs** (consistent attachment handling, “finalized” result artifacts)
- **Standards-based external exchange** (HL7/MLLP pipeline) beyond scaffolding
- **National aggregate reporting** alignment patterns (KHIS/DHIS2), if required

This document proposes a concrete plan to close the gaps with minimal disruption to existing workflows.

---

## 2) Definitions (What “Reporting” Means Here)

This proposal distinguishes four reporting layers:

1. **Clinical reporting (care delivery)**: Clinicians seeing results as soon as they’re verified, with critical alerts.
2. **Operational reporting (lab management)**: TAT, workload, queue performance, rejection reasons.
3. **Document reporting (artifacts)**: requisition PDFs, scanned results, attachments as formal evidence.
4. **External reporting/exchange**: LIS/LIMS integration via HL7 v2.x over MLLP, and/or future interoperability needs.

---

## 3) Current State (What Exists Today)

### 3.1 Backend workflow (orders, queue, results)

- The laboratory domain is implemented under `backend/hmis/apps/laboratory/`.
- Core entities:
  - `TestCatalog`, `LabOrder`, `LabOrderItem`, `LabQueue`, `LabResult`.
- Workflow is supported by:
  - REST endpoints (orders/results/queue).
  - Status synchronization signals.
  - Verification endpoint and verification-driven notifications.

### 3.2 Real-time clinician “reporting”

- WebSocket broadcast utilities and consumers exist.
- Events include:
  - `result_entered`, `result_verified`, `critical_alert`, `order_completed`.
- This is aligned with the intended architecture described in `docs/labsyncgap.md`.

### 3.3 Notifications

- In-app notification creation exists for “results ready,” with special handling for critical values.
- Optional email is sent for critical results (if clinician email exists).

### 3.4 External requisition documents

- External lab requisition PDF generation exists.
- ✅ **Consolidated**: `external.py` now delegates to `services/requisition.py` (single implementation).

### 3.5 Attachment handling

- ✅ **Implemented**: `LabResultAttachment` is now the canonical model for uploaded external/scanned reports.
- ✅ Attachment endpoints added:
  - `POST /api/lab/orders/{order_number}/attachments/` (upload)
  - `GET /api/lab/orders/{order_number}/attachments/` (list, reverse chronological)
  - `DELETE /api/lab/attachments/{id}/` (remove record + file)
- ✅ Validation wired via `validators.validate_lab_attachment` (type/size enforcement).

### 3.6 Missing: operational analytics / lab reports

- ✅ **Implemented**: `LabReportService` now exists in `backend/hmis/apps/laboratory/reports.py` with:
  - `turnaround_time_report(start_date, end_date)` — TAT by test, by priority, queue TAT
  - `workload_report(start_date, end_date)` — tests entered/verified by day and by technician
  - `critical_values_report(start_date, end_date)` — critical result counts by test
  - `sample_rejection_report(start_date, end_date)` — rejection rate and reason breakdown
- ✅ API endpoints exposed:
  - `GET /api/lab/reports/turnaround-time/?start=YYYY-MM-DD&end=YYYY-MM-DD`
  - `GET /api/lab/reports/workload/?start=YYYY-MM-DD&end=YYYY-MM-DD`
  - `GET /api/lab/reports/critical-values/?start=YYYY-MM-DD&end=YYYY-MM-DD`
  - `GET /api/lab/reports/rejections/?start=YYYY-MM-DD&end=YYYY-MM-DD`
- ✅ Test coverage in `backend/tests/test_lab_reports.py` (5 tests passing)

### 3.7 External exchange foundations (present but not wired end-to-end)

- HL7 v2 service exists (`services/hl7_service.py`) and MLLP transport exists (`services/mllp_client.py`).
- There is no end-to-end configured pipeline to send orders and ingest results into `LabResult`.

---

## 4) Target State (How It Should Work)

### 4.1 Clinical reporting (must not regress)

- Clinicians should continue to receive:
  - real-time verified-result notifications
  - critical alerts immediately
  - in-app notification entries for auditability

### 4.2 Operational reporting (new capability)

Add a small, testable reporting service that supports:

- **Turnaround time (TAT)**
  - average TAT by test code/category
  - TAT by priority (ROUTINE/URGENT/STAT)
  - outlier detection (e.g., 95th percentile)
- **Workload**
  - tests per day/week
  - tests by technician (entered_by / verified_by)
  - queue status counts over time
- **Critical values**
  - counts by test
  - time-to-notify / time-to-verify metrics (where available)
- **Sample rejection**
  - rejection rate
  - reasons breakdown

### 4.3 Document reporting (attachments and requisitions)

- Standardize around **one** requisition PDF implementation.
- Use a single attachment storage pattern:
  - `LabResultAttachment` should be the canonical model for uploaded external/scanned reports.
  - Allow attachment listing and deletion.
  - Ensure validators enforce safe file types and max size.

### 4.4 External exchange (staged)

- Keep HL7/MLLP capability behind configuration flags.
- Provide an internal “integration seam”:
  - build an order message (ORM)
  - send via MLLP
  - parse ORU results
  - match to `LabOrderItem` by test code
  - create/update `LabResult`

### 4.5 National aggregate reporting (optional; confirm requirement)

- If lab reporting must feed KHIS/DHIS2 datasets, implement via a **separate reporting app/service** to avoid mixing LIS analytics with national indicators.
- This would likely mirror the pattern used by clinics (`MonthlyClinicReport`) but with lab-specific indicators.

---

## 5) Gap Analysis (Now vs Target)

| Area | Current | Target | Gap |
|------|---------|--------|-----|
| Real-time clinician notifications | Implemented | Keep | None |
| Order/queue/result workflow | Implemented | Keep | Minor refinements only |
| Lab analytics (TAT/workload/critical/rejection) | ✅ **Implemented** | All 4 reports + endpoints | **Closed** (see Phase B enhancements below) |
| Attachments | ✅ **Implemented** | Use `LabResultAttachment` consistently | **Closed** |
| Requisition PDF | ✅ **Consolidated** | One canonical implementation | **Closed** |
| HL7/MLLP exchange | Services exist | Configured pipeline | Not wired end-to-end |
| Offline (PowerSync) | Not implemented | Future | Explicitly deferred |

---

## 6) Proposed Phased Implementation Plan

This plan is intentionally incremental to reduce risk.

### Phase A — Normalize “document reporting” (Attachments + PDFs)

**Goal**: Make uploaded/scanned result documents reliable and consistent.

**Deliverables**:
- Standardize on `LabResultAttachment` for uploads.
- Add endpoints:
  - `POST /api/lab/orders/{order_number}/attachments/` (or result-level, but stored on order)
  - `GET /api/lab/orders/{order_number}/attachments/`
  - `DELETE /api/lab/attachments/{id}/`
- Wire validation to `validators.validate_lab_attachment`.
- Consolidate requisition generation to a single implementation and remove/stop referencing the duplicate.

**Acceptance criteria**:
- Uploading an attachment creates a `LabResultAttachment` row with correct metadata.
- Listing returns attachments in reverse chronological order.
- Deleting removes both row and file.
- Existing UI flows still work (no broken upload/list use-cases).

**Tests**:
- Attachment upload validation (type/size)
- Attachment create/list/delete
- Requisition endpoint returns a PDF for external orders


### Phase B — Implement Lab Reports/Analytics (Operational reporting) ✅ **COMPLETED**

**Goal**: Provide lab management reporting without changing clinical workflows.

**Deliverables** (all implemented):
- ✅ `backend/hmis/apps/laboratory/reports.py`:
  - `LabReportService.turnaround_time_report(start_date, end_date)`
  - `LabReportService.workload_report(start_date, end_date)`
  - `LabReportService.critical_values_report(start_date, end_date)`
  - `LabReportService.sample_rejection_report(start_date, end_date)`
- ✅ API endpoints (all 4 exposed):
  - `GET /api/lab/reports/turnaround-time/?start=YYYY-MM-DD&end=YYYY-MM-DD`
  - `GET /api/lab/reports/workload/?start=YYYY-MM-DD&end=YYYY-MM-DD`
  - `GET /api/lab/reports/critical-values/?start=YYYY-MM-DD&end=YYYY-MM-DD`
  - `GET /api/lab/reports/rejections/?start=YYYY-MM-DD&end=YYYY-MM-DD`

**Implementation details** (documented in `reports.py` docstrings):
- **TAT definitions**:
  - Result TAT: `verified_at - entered_at` (for verified results)
  - Queue TAT: `released_at - collected_at` (for released samples)
  - Processing TAT: `released_at - processing_started_at` (for released samples)
- Uses Django ORM aggregates (deterministic queries, not Python loops)
- Date ranges are timezone-aware and inclusive of start/end dates

**TAT Report shape**:
```json
{
  "start": "2026-02-01",
  "end": "2026-02-14",
  "overall": { "results_verified": 42, "avg_result_tat_hours": 2.5 },
  "by_test": [{ "test_code": "HB", "test_name": "Hemoglobin", "result_count": 10, "avg_tat_hours": 1.8 }],
  "by_priority": [{ "priority": "STAT", "result_count": 5, "avg_tat_hours": 0.5 }],
  "queue_tat": { "released_count": 40, "avg_collect_to_release_hours": 3.0, "avg_processing_to_release_hours": 1.5 }
}
```

**Workload Report shape**:
```json
{
  "start": "2026-02-01",
  "end": "2026-02-14",
  "totals": { "tests_entered": 120, "tests_verified": 115 },
  "by_day": [{ "date": "2026-02-01", "tests_entered": 15, "tests_verified": 12 }],
  "by_technician": [{ "technician_id": 1, "technician_name": "Jane Doe", "entered_count": 30, "verified_count": 25 }]
}
```

**Critical Values Report shape**:
```json
{
  "start": "2026-02-01",
  "end": "2026-02-14",
  "total_critical": 8,
  "by_test": [{ "test_code": "HB", "test_name": "Hemoglobin", "critical_count": 3 }]
}
```

**Rejection Report shape**:
```json
{
  "start": "2026-02-01",
  "end": "2026-02-14",
  "total_orders": 150,
  "rejected_orders": 5,
  "rejection_rate": 3.33,
  "reasons": [{ "reason": "Hemolyzed sample", "count": 3 }]
}
```

**Tests** (all passing in `backend/tests/test_lab_reports.py`):
- ✅ TAT by test and by priority
- ✅ Workload by day and by technician
- ✅ Critical values count
- ✅ Rejection rate and reasons
- ✅ Missing date params returns 400

**Future enhancements** (not in current scope but identified for Phase B+):
- **Outlier/percentile TAT**: Add 95th percentile TAT (spec mentioned but not implemented)
- **TAT by category**: Currently only by test code; could add `by_category` grouping
- **Time-to-notify metrics**: Track time from critical result entry to clinician notification
- **Queue status over time**: Track queue status counts (PENDING/PROCESSING/etc.) by day
- **Weekly aggregation option**: Add `?granularity=week` for workload report
- **Extended edge case tests**: Empty date ranges, single result scenarios


### Phase C — External exchange wiring (HL7/MLLP) behind flags

**Goal**: Turn the HL7/MLLP scaffolding into an optional working integration seam.

**Deliverables**:
- Create a “send order” integration entry point:
  - Build ORM^O01 from `LabOrder`
  - Send via MLLP (config from settings/env)
- Create a “receive results” entry point:
  - Parse ORU^R01 into typed `HL7LabResult`
  - Map results to `LabOrderItem` by `test_code`
  - Create/Update `LabResult` + mark `is_external_result=True`
- Provide admin/management command for controlled ingestion testing (no always-on socket listener yet).

**Acceptance criteria**:
- When enabled, a sample ORU message can create results for an existing lab order.
- When disabled, system behavior is unchanged.


### Phase D — Offline-first (future)

**Goal**: Durable offline lab operations.

**Status**: Deferred (explicitly future work per `docs/labsyncgap.md`).

---

## 7) Risks & Mitigations

- **Risk: attachment API breaking existing UI** → mitigate by supporting legacy fields temporarily (read-only compatibility) while migrating UI to new endpoints.
- **Risk: TAT definitions vary by facility** → document metric definitions and allow configuration later.
- **Risk: HL7 mapping ambiguities (test codes)** → enforce strict mapping rules and emit clear errors for unmapped codes.

---

## 8) Out of Scope (for this plan)

- Full PowerSync implementation for laboratory (explicit future sprint).
- Full KHIS/DHIS2 dataset export for laboratory (requires indicator definitions and stakeholder confirmation).
- Advanced LIS connectivity (bi-directional order acknowledgments, continuous ORU listener service).

---

## 9) Next Actions (Recommended Sequence)

1. ~~Phase A: normalize attachments + unify requisition generator.~~ ✅ **COMPLETED**
2. ~~**Phase B: implement lab analytics services + endpoints + tests.**~~ ✅ **COMPLETED**
3. **Phase C: wire HL7/MLLP in a feature-flagged, testable manner.** ← Next
4. (Optional) Phase B+ enhancements: percentile TAT, category grouping, time-to-notify metrics

---

## 10) References

- `docs/labsyncgap.md`
- `docs/sprint-1.3-1.4-track-b-lab-deliverables.md`
- `docs/sprint-1.5-1.6-track-b-lab-workflow-deliverables.md`
- `backend/hmis/apps/laboratory/` (models, views, signals, websockets, services)
- `backend/hmis/apps/laboratory/reports.py` (Phase B implementation)
- `backend/tests/test_lab_reports.py` (Phase B tests)
- `backend/hmis/apps/clinics/` (pattern for monthly reporting aggregation)
