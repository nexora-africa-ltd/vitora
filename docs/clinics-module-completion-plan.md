# Clinics Module Completion Plan

**Version**: 1.0
**Created**: January 25, 2026
**Status**: Active
**Target Completion**: Sprint 2.5 (Weeks 9-10)

---

## Executive Summary

This document outlines the remaining work to complete the Clinics Module implementation. The core models, queue management, WebSocket support, chronic care enrollments, and frontend structure are complete. This plan focuses on **integration points** and **reporting infrastructure**.

### Completion Status Overview

| Phase | Description | Status |
|-------|-------------|--------|
| 2.1 | Core Models & API | ✅ Complete |
| 2.2 | Queue Management | ✅ Complete |
| 2.3 | Frontend - Clinic Pages | ✅ Complete |
| 2.4 | Enrollments & Chronic Care | ✅ Complete |
| 2.5 | Integration & Reporting | 🔶 In Progress |

---

## Priority 1: Encounter ↔ ClinicVisit Integration (CRITICAL)

**Estimated Effort**: 4-6 hours
**Files to Modify**:
- `backend/hmis/apps/encounters/models.py`
- `backend/hmis/apps/encounters/serializers.py`
- `backend/hmis/apps/clinics/models.py` (ClinicVisit.start_consultation)
- `backend/hmis/apps/encounters/migrations/`
- `backend/tests/test_clinic_encounter_integration.py` (new)

### 1.1 Problem Statement

The `Encounter` model currently has no reference to `ClinicVisit`. This breaks:
- Traceability (which clinic served the patient)
- Clinic-based reporting
- Revenue attribution per clinic

### 1.2 Implementation Tasks

```
[x] Add clinic_visit FK to Encounter model
    - Field: clinic_visit = ForeignKey('clinics.ClinicVisit', null=True, blank=True,
              related_name='encounters', on_delete=SET_NULL)
    - null=True for backward compatibility with existing encounters

[x] Update ClinicVisit.start_consultation() method
    - Create Encounter with clinic_visit reference
    - Set encounter.clinic_visit = self

[x] Update EncounterSerializer
    - Add clinic_visit_id (read-only)
    - Add clinic_name (computed from clinic_visit.session.clinic.name)
    - Add clinic_type (computed)

[x] Create migration
    - Add FK with null=True (non-breaking)
    - No data migration needed (new encounters will have reference)

[x] Write tests
    - test_encounter_created_from_clinic_visit_has_reference
    - test_encounter_clinic_visit_optional_for_direct_encounters
    - test_encounter_serializer_includes_clinic_info
```

### 1.3 API Changes

```python
# GET /api/encounters/{id}/
{
    "id": 123,
    "patient": 456,
    "encounter_type": "OPD",
    "clinic_visit_id": 789,        # NEW
    "clinic_name": "Eye Clinic",   # NEW (computed)
    "clinic_type": "EYE",          # NEW (computed)
    ...
}
```

---

## Priority 2: Billing ↔ ClinicVisit Integration (CRITICAL)

**Estimated Effort**: 6-8 hours
**Files to Modify**:
- `backend/hmis/apps/clinics/models.py` (start_consultation signal)
- `backend/hmis/apps/billing/models.py` (Invoice)
- `backend/hmis/apps/billing/services/` (new clinic billing service)
- `backend/hmis/apps/clinics/signals.py`
- `backend/tests/test_clinic_billing_integration.py`

### 2.1 Problem Statement

Billing is not automatically triggered when a clinic consultation starts. Revenue tracking per clinic is impossible.

### 2.2 Implementation Tasks

```
[x] Add clinic_visit FK to Invoice model (optional)
    - clinic_visit = ForeignKey('clinics.ClinicVisit', null=True, blank=True,
              related_name='invoices', on_delete=SET_NULL)

[x] Create clinic billing service
    - Location: backend/hmis/apps/billing/services/clinic_billing.py
    - Function: create_consultation_invoice(clinic_visit) -> Invoice
    - Auto-add consultation fee based on clinic type
    - Support clinic-specific pricing (from Clinic.default_consultation_fee or Tariff)

[x] Add signal/hook in ClinicVisit.start_consultation()
    - Option A: Signal (post_save with status change detection)
    - Option B: Direct call in start_consultation() method
    - Recommended: Option B for explicit control

[x] Update ClinicVisit.start_consultation() to create invoice
    - Create Invoice with status=DRAFT or PENDING
    - Link to encounter and clinic_visit
    - Add line item for consultation fee

[x] Add clinic_id filter to Invoice list API
    - GET /api/billing/invoices/?clinic={id}
    - GET /api/billing/invoices/?clinic_type={type}

[x] Write tests
    - test_start_consultation_creates_invoice
    - test_invoice_linked_to_clinic_visit
    - test_consultation_fee_based_on_clinic_type
    - test_filter_invoices_by_clinic
```

### 2.3 Billing Flow

```
ClinicVisit.start_consultation()
    ├── Create/link Encounter (with clinic_visit FK)
    ├── Create Invoice (DRAFT)
    │   ├── Link to clinic_visit
    │   ├── Add consultation fee line item
    │   └── Apply SHA coverage if eligible
    └── Update visit status to IN_CONSULTATION
```

---

## Priority 3: Monthly Clinic Report Model (HIGH)

**Estimated Effort**: 6-8 hours
**Files to Create/Modify**:
- `backend/hmis/apps/clinics/models.py` (MonthlyClinicReport)
- `backend/hmis/apps/clinics/serializers.py`
- `backend/hmis/apps/clinics/views.py`
- `backend/hmis/apps/clinics/services/reporting.py` (new)
- `backend/hmis/apps/core/tasks.py` (monthly aggregation task)
- `backend/tests/test_clinic_reports.py` (new)

### 3.1 Problem Statement

No aggregate reporting model exists for clinic statistics. KHIS/DHIS2 reporting requires monthly summaries.

### 3.2 Data Model

```python
class MonthlyClinicReport(TimeStampedModel):
    """Monthly aggregate statistics for DHIS2/KHIS reporting."""

    clinic = models.ForeignKey(Clinic, on_delete=CASCADE, related_name='monthly_reports')
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])

    # Visit Statistics
    total_visits = models.PositiveIntegerField(default=0)
    new_visits = models.PositiveIntegerField(default=0)
    revisits = models.PositiveIntegerField(default=0)

    # By Priority
    priority_red = models.PositiveIntegerField(default=0)
    priority_orange = models.PositiveIntegerField(default=0)
    priority_yellow = models.PositiveIntegerField(default=0)
    priority_green = models.PositiveIntegerField(default=0)
    priority_blue = models.PositiveIntegerField(default=0)

    # Demographics
    male_visits = models.PositiveIntegerField(default=0)
    female_visits = models.PositiveIntegerField(default=0)
    under_5_visits = models.PositiveIntegerField(default=0)
    under_18_visits = models.PositiveIntegerField(default=0)
    adult_visits = models.PositiveIntegerField(default=0)
    over_60_visits = models.PositiveIntegerField(default=0)

    # Chronic Care (for CCC, Diabetic, etc.)
    new_enrollments = models.PositiveIntegerField(default=0)
    active_enrollments = models.PositiveIntegerField(default=0)
    defaulters = models.PositiveIntegerField(default=0)

    # ANC Specific (for MCH clinics)
    anc_first_visits = models.PositiveIntegerField(default=0)
    anc_revisits = models.PositiveIntegerField(default=0)
    deliveries = models.PositiveIntegerField(default=0)

    # Revenue
    total_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sha_claims_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cash_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # DHIS2 Sync
    dhis2_submitted = models.BooleanField(default=False)
    dhis2_submitted_at = models.DateTimeField(null=True, blank=True)
    dhis2_response = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = ['clinic', 'year', 'month']
        ordering = ['-year', '-month', 'clinic__name']
```

### 3.3 Implementation Tasks

```
[x] Create MonthlyClinicReport model
[x] Create migration
[x] Create reporting service
    - generate_monthly_report(clinic, year, month) -> MonthlyClinicReport
    - Aggregate from ClinicVisit, ClinicEnrollment, Invoice
[x] Create Celery task for monthly aggregation
    - Run on 1st of each month for previous month
    - generate_all_clinic_reports(year, month)
[x] Create API endpoints
    - GET /api/clinics/{id}/reports/monthly/
    - GET /api/clinics/{id}/reports/monthly/{year}/{month}/
    - POST /api/clinics/{id}/reports/monthly/{year}/{month}/regenerate/
[x] Create serializer
[x] Write tests
```

---

## Priority 4: SHA Claims ↔ Clinic Context (MEDIUM)

**Estimated Effort**: 3-4 hours
**Files to Modify**:
- `backend/hmis/apps/billing/services/sha_claims.py`
- `backend/tests/billing/test_services/test_sha_claims_service.py`

### 4.1 Problem Statement

SHA claims bundle does not include clinic/service delivery point context, which may be required for proper routing and reporting.

### 4.2 Implementation Tasks

```
[x] Update build_claim_bundle() to include clinic info
    - Add clinic context to Encounter extension or meta
    - Include clinic code in claim identifier

[x] Add facility service point to FHIR Claim
    - Extension: clinic_code, clinic_type
    - Or use Encounter.serviceProvider reference

[x] Update tests
    - test_claim_includes_clinic_context
    - test_claim_without_clinic_context_still_valid
```

### 4.3 FHIR Extension Example

```json
{
  "resourceType": "Claim",
  "extension": [
    {
      "url": "https://vitora.health/fhir/StructureDefinition/service-delivery-point",
      "valueReference": {
        "reference": "Location/eye-clinic",
        "display": "Eye Clinic"
      }
    }
  ]
}
```

---

## Priority 5: E2E Tests for Clinics Frontend (MEDIUM)

**Estimated Effort**: 8-10 hours
**Files to Create**:
- `web-app/e2e/clinics.spec.ts`
- `web-app/e2e/clinic-queue.spec.ts`
- `web-app/e2e/clinic-enrollment.spec.ts`

### 5.1 Test Scenarios

```typescript
// clinics.spec.ts
describe('Clinics Module', () => {
  test('can view clinics list', async () => { ... });
  test('can open clinic dashboard', async () => { ... });
  test('can view clinic queue', async () => { ... });
  test('can view clinic staff', async () => { ... });
  test('can view clinic schedule', async () => { ... });
});

// clinic-queue.spec.ts
describe('Clinic Queue Management', () => {
  test('can add patient to queue', async () => { ... });
  test('can call patient from queue', async () => { ... });
  test('can start consultation', async () => { ... });
  test('can complete visit', async () => { ... });
  test('can refer patient to another clinic', async () => { ... });
  test('queue updates in real-time via WebSocket', async () => { ... });
});

// clinic-enrollment.spec.ts
describe('Chronic Care Enrollment', () => {
  test('can enroll patient in CCC', async () => { ... });
  test('can enroll patient in ANC', async () => { ... });
  test('can view overdue patients', async () => { ... });
  test('can view defaulters list', async () => { ... });
  test('can record visit for enrolled patient', async () => { ... });
});
```

---

## Priority 6: DHIS2 Export Service (LOW - Deferred)

**Estimated Effort**: 10-12 hours
**Target**: Phase 3

### 6.1 Scope (Deferred)

```
[ ] Create DHIS2 integration service
    - dhis2_service.py
    - Authenticate with DHIS2 API
    - Map MonthlyClinicReport → DHIS2 DataValueSet

[ ] Create export endpoints
    - POST /api/clinics/{id}/reports/monthly/{year}/{month}/submit-dhis2/

[ ] Handle DHIS2 response/errors
    - Store response in dhis2_response field
    - Retry logic for failed submissions
```

---

## Implementation Schedule

### Week 9

| Day | Task | Effort |
|-----|------|--------|
| Mon | Priority 1: Encounter ↔ ClinicVisit FK | 4h |
| Mon | Priority 1: Tests | 2h |
| Tue | Priority 2: Billing integration service | 4h |
| Tue | Priority 2: start_consultation billing hook | 2h |
| Wed | Priority 2: Invoice filters & tests | 4h |
| Thu | Priority 3: MonthlyClinicReport model | 4h |
| Thu | Priority 3: Reporting service | 4h |
| Fri | Priority 3: API endpoints & tests | 4h |

### Week 10

| Day | Task | Effort |
|-----|------|--------|
| Mon | Priority 4: SHA claims clinic context | 4h |
| Tue | Priority 5: E2E tests - clinics.spec.ts | 4h |
| Wed | Priority 5: E2E tests - queue.spec.ts | 4h |
| Thu | Priority 5: E2E tests - enrollment.spec.ts | 4h |
| Fri | Documentation, code review, bug fixes | 4h |

---

## Success Criteria

### Must Have (Sprint 2.5)
- [ ] Encounter model has clinic_visit FK
- [ ] Starting consultation creates invoice
- [ ] MonthlyClinicReport model exists and populates
- [ ] All existing tests pass (3500+)
- [ ] Coverage remains ≥80%

### Should Have
- [ ] SHA claims include clinic context
- [ ] E2E tests for clinic queue flow
- [ ] E2E tests for enrollment flow

### Nice to Have (Defer to Phase 3)
- [ ] DHIS2 export service
- [ ] Automated monthly report generation task

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| FK migration on Encounter affects existing data | Medium | Use null=True, no data migration |
| Billing integration complexity | Medium | Start with simple consultation fee, expand later |
| E2E test flakiness with WebSocket | Low | Use polling fallback in tests |

---

## Appendix: Files to Create/Modify

### New Files
```
backend/hmis/apps/billing/services/clinic_billing.py
backend/hmis/apps/clinics/services/reporting.py
backend/tests/test_clinic_encounter_integration.py
backend/tests/test_clinic_reports.py
web-app/e2e/clinics.spec.ts
web-app/e2e/clinic-queue.spec.ts
web-app/e2e/clinic-enrollment.spec.ts
```

### Modified Files
```
backend/hmis/apps/encounters/models.py
backend/hmis/apps/encounters/serializers.py
backend/hmis/apps/billing/models.py
backend/hmis/apps/clinics/models.py
backend/hmis/apps/clinics/serializers.py
backend/hmis/apps/clinics/views.py
backend/hmis/apps/core/tasks.py
backend/tests/test_clinic_billing_integration.py
```

---

**Document Owner**: Engineering Lead
**Last Updated**: January 25, 2026
