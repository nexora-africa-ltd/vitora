# Triage Vitals Capture Implementation Plan

> **Status**: Planned  
> **Created**: January 5, 2026  
> **Priority**: High (Clinical Accuracy)  
> **Epic**: Triage Module Enhancement  
> **Estimated Duration**: 4-5 days  
> **Rationale**: Cannot accurately assign KETA triage categories without vital signs

---

## Problem Statement

The current triage assessment form captures:
- ✅ Chief complaint
- ✅ AVPU (consciousness level)
- ✅ Mobility status
- ✅ Arrival mode
- ✅ Pain score
- ❌ **Vital signs** (missing)

Without vitals, the triage nurse cannot:
1. Accurately categorize patients using KETA/WHO ETAT protocols
2. Detect critical conditions (hypoxia, shock, severe hypertension)
3. Provide complete handoff to clinicians

The backend `TriageCategoryCalculator` already supports vitals-based calculation, but receives empty data because the frontend never collects them.

### KETA Category Thresholds (Currently Unused)

| Condition | Threshold | Category |
|-----------|-----------|----------|
| SpO2 < 90% | Critical | RED |
| Systolic BP < 90 or > 180 | Critical | RED |
| Heart rate < 40 or > 150 | Critical | RED |
| SpO2 < 95% + breathing complaint | Urgent | ORANGE |
| Temperature > 40°C | Urgent | ORANGE |
| Pain score ≥ 9 | Urgent | ORANGE |

---

## Solution Overview

Add vital signs input fields to the triage assessment form, use them for KETA category calculation, and auto-copy to the linked Encounter on completion.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Triage Form                  Backend                    Encounter      │
│  ───────────                  ───────                    ─────────      │
│  [Vitals Input]  ──POST──▶  TriageAssessment  ──signal──▶ [Vitals]     │
│  [AVPU, etc.]               .create()                    .spo2         │
│                                  │                       .pulse        │
│                                  ▼                       .temperature  │
│                        calculate_category()              .bp           │
│                                  │                       .rr           │
│                                  ▼                                      │
│                        Return suggested                                 │
│                        category + alerts                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Specifications

### Vital Sign Ranges

| Vital | Field Type | Min | Max | Critical Low | Critical High | Unit |
|-------|-----------|-----|-----|--------------|---------------|------|
| SpO2 | Decimal(5,2) | 0 | 100 | < 90 | - | % |
| Heart Rate | Integer | 0 | 300 | < 40 | > 150 | bpm |
| Systolic BP | Integer | 0 | 300 | < 90 | > 180 | mmHg |
| Diastolic BP | Integer | 0 | 200 | < 60 | > 120 | mmHg |
| Temperature | Decimal(4,1) | 30 | 45 | < 35 | > 40 | °C |
| Respiratory Rate | Integer | 0 | 60 | < 10 | > 30 | /min |
| Pain Score | Integer | 0 | 10 | - | ≥ 9 | 0-10 |

### API Changes

**POST /api/triage/assessments/** (updated request body):
```json
{
  "encounter": 123,
  "arrival_mode": "WALK_IN",
  "arrival_time": "2026-01-05T10:30:00Z",
  "chief_complaint_category": "CHEST_PAIN",
  "chief_complaint": "Sharp chest pain for 2 hours",
  "mental_status": "A",
  "mobility": "AMBULATORY",
  "pain_score": 7,
  "spo2": 94,
  "heart_rate": 110,
  "systolic_bp": 160,
  "diastolic_bp": 95,
  "temperature": 37.2,
  "respiratory_rate": 22,
  "triage_category": "ORANGE",
  "assigned_area": "ER_ACUTE"
}
```

---

## Deliverables

### Phase 1: Backend - Vitals in TriageAssessment

#### 1.1 Add Vitals Fields to TriageAssessment Model
- [ ] Add `spo2` field (DecimalField, nullable)
- [ ] Add `heart_rate` field (IntegerField, nullable) 
- [ ] Add `systolic_bp` field (IntegerField, nullable)
- [ ] Add `diastolic_bp` field (IntegerField, nullable)
- [ ] Add `temperature` field (DecimalField, nullable)
- [ ] Add `respiratory_rate` field (IntegerField, nullable)
- [ ] Create migration

**File**: `backend/hmis/apps/triage/models.py`

**Acceptance Criteria**:
- [ ] All vital fields are optional (nullable) - some facilities may not have all equipment
- [ ] Field constraints match clinical ranges (e.g., SpO2 0-100, HR 0-300)
- [ ] Migration applies without errors

---

#### 1.2 Update TriageAssessment Serializer
- [ ] Add vitals fields to `TriageAssessmentSerializer`
- [ ] Add vitals validation (reasonable ranges)
- [ ] Include vitals in create/update operations

**File**: `backend/hmis/apps/triage/serializers.py`

**Acceptance Criteria**:
- [ ] Serializer accepts vitals on create
- [ ] Invalid vital ranges return 400 error with clear message
- [ ] Vitals are included in serialized response

---

#### 1.3 Auto-Copy Vitals to Encounter (Signal)
- [ ] Create/update signal to copy vitals from TriageAssessment to Encounter
- [ ] Only copy if Encounter vitals are empty (don't overwrite)
- [ ] Log audit entry for vitals source

**File**: `backend/hmis/apps/triage/signals.py`

**Acceptance Criteria**:
- [ ] On TriageAssessment create, vitals copy to linked Encounter
- [ ] Existing Encounter vitals are NOT overwritten
- [ ] Works correctly when some vitals are null

---

#### 1.4 Add Vitals Source Tracking to Encounter
- [ ] Add `vitals_source` field (choices: TRIAGE, CONSULTATION, NURSING)
- [ ] Add `vitals_recorded_by` FK to User
- [ ] Add `vitals_recorded_at` DateTimeField
- [ ] Create migration

**File**: `backend/hmis/apps/encounters/models.py`

**Acceptance Criteria**:
- [ ] Encounter shows who recorded vitals and when
- [ ] Source is set automatically based on how vitals were entered
- [ ] Fields are nullable for backwards compatibility

---

#### 1.5 Backend Tests
- [ ] Test TriageAssessment with vitals creates successfully
- [ ] Test vitals auto-copy to Encounter
- [ ] Test calculate-category endpoint with vitals returns correct category
- [ ] Test RED category for SpO2 < 90%
- [ ] Test ORANGE category for SpO2 < 95% + breathing complaint
- [ ] Test vitals validation rejects out-of-range values

**File**: `backend/tests/test_triage_vitals.py`

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] Coverage for critical paths ≥ 80%

---

### Phase 2: Frontend - Vitals Input in Triage Form

#### 2.1 Update Form Schema
- [ ] Add vitals fields to `triageFormSchema` Zod schema
- [ ] All vitals optional but validated when provided
- [ ] Update `TriageFormData` type

**File**: `web-app/components/triage/triage-assessment-form.tsx`

**Acceptance Criteria**:
- [ ] Form validates vital ranges (e.g., SpO2 0-100)
- [ ] Empty vitals are allowed (submit as null)
- [ ] Type-safe form data

---

#### 2.2 Add Vitals Section UI
- [ ] Create collapsible "Vital Signs" section
- [ ] Add inputs: SpO2, Heart Rate, BP (systolic/diastolic), Temp, RR
- [ ] Add pain score slider (already exists, ensure integration)
- [ ] Show unit labels (%, bpm, mmHg, °C, /min)
- [ ] Visual indicators for critical values (red border)

**File**: `web-app/components/triage/triage-assessment-form.tsx`

**UI Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ▼ Vital Signs                                                   │
├─────────────────────────────────────────────────────────────────┤
│  SpO2          Heart Rate       Blood Pressure                  │
│  [____] %      [____] bpm       [____] / [____] mmHg           │
│                                                                 │
│  Temperature   Respiratory Rate  Pain Score                     │
│  [____] °C     [____] /min       [0──●────────10]              │
│                                                                 │
│  ⚠️ SpO2 92% - Below normal (consider supplemental O2)         │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria**:
- [ ] All vital inputs render correctly
- [ ] Critical values highlight in red (SpO2 < 90, HR < 40 or > 150, etc.)
- [ ] Form is accessible (labels, ARIA)
- [ ] Mobile-responsive layout

---

#### 2.3 Create VitalsInputSection Component (Optional Extraction)

**File**: `web-app/components/triage/vitals-input-section.tsx` (new)

- [ ] Create reusable vitals input component
- [ ] Props: `onChange`, `values`, `errors`, `disabled`
- [ ] Include:
  - Two-column layout for desktop
  - Single-column for mobile
  - Clear labels with units
  - Input validation feedback
  - Quick-entry number inputs (no spinners)
  - Real-time validation indicators:
    - 🔴 Critical (RED threshold)
    - 🟠 Warning (ORANGE threshold)
    - ✅ Normal

**Acceptance Criteria**:
- [ ] Component renders all vital inputs
- [ ] Responsive layout (mobile/desktop)
- [ ] Inline validation messages
- [ ] Warning banners for abnormal values
- [ ] Accessible (labels, ARIA)

---

#### 2.4 Wire Up Calculate Category with Vitals
- [ ] Pass vitals to `useCalculateTriageCategory` mutation
- [ ] Update `calculateSuggestedCategory` local function to use form vitals
- [ ] Show suggested category updates as vitals are entered
- [ ] Display alerts from backend response

**File**: `web-app/components/triage/triage-assessment-form.tsx`

**Acceptance Criteria**:
- [ ] Suggested category updates when vitals change
- [ ] Critical vital alerts display prominently
- [ ] Backend calculation matches displayed suggestion

---

#### 2.4 Update Triage Types
- [ ] Add vitals to `TriageAssessmentCreateData` interface
- [ ] Add vitals to `TriageAssessment` response type
- [ ] Update `CalculateCategoryRequest` if needed

**File**: `web-app/lib/types/triage.ts`

**Acceptance Criteria**:
- [ ] Types match backend API contract
- [ ] No TypeScript errors

---

#### 2.5 Frontend Tests
- [ ] Test form renders vital inputs
- [ ] Test vital validation (range errors)
- [ ] Test suggested category updates with vitals
- [ ] Test form submission includes vitals
- [ ] Test critical value highlighting

**File**: `web-app/__tests__/components/triage/triage-assessment-form.test.tsx`

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] Coverage for vital input interactions

---

### Phase 3: Integration & Polish

#### 3.1 E2E Test
- [ ] Add Playwright test for complete triage flow with vitals
- [ ] Test: Enter vitals → See suggested category → Submit → Verify on encounter

**File**: `web-app/e2e/triage-vitals.spec.ts`

**Acceptance Criteria**:
- [ ] E2E test passes in CI
- [ ] Covers happy path and edge cases

---

#### 3.2 Documentation
- [ ] Update triage workflow docs
- [ ] Add vitals capture to training materials
- [ ] Update API documentation

**Acceptance Criteria**:
- [ ] Docs reflect new workflow
- [ ] Screenshots updated

---

#### 3.3 Backwards Compatibility
- [ ] Existing triage assessments without vitals continue to work
- [ ] Category override still functions
- [ ] No breaking changes to API consumers

**Acceptance Criteria**:
- [ ] Existing data unaffected
- [ ] Mobile app (if any) continues to work

---

## Technical Specifications

### Vital Sign Ranges

| Vital | Field Type | Min | Max | Critical Low | Critical High | Unit |
|-------|-----------|-----|-----|--------------|---------------|------|
| SpO2 | Decimal(5,2) | 0 | 100 | < 90 | - | % |
| Heart Rate | Integer | 0 | 300 | < 40 | > 150 | bpm |
| Systolic BP | Integer | 0 | 300 | < 90 | > 180 | mmHg |
| Diastolic BP | Integer | 0 | 200 | < 60 | > 120 | mmHg |
| Temperature | Decimal(4,1) | 30 | 45 | < 35 | > 40 | °C |
| Respiratory Rate | Integer | 0 | 60 | < 10 | > 30 | /min |
| Pain Score | Integer | 0 | 10 | - | ≥ 9 | 0-10 |

### API Changes

**POST /api/triage/assessments/** (updated request body):
```json
{
  "encounter": 123,
  "arrival_mode": "WALK_IN",
  "arrival_time": "2026-01-05T10:30:00Z",
  "chief_complaint_category": "CHEST_PAIN",
  "chief_complaint": "Sharp chest pain for 2 hours",
  "mental_status": "A",
  "mobility": "AMBULATORY",
  "pain_score": 7,
  "spo2": 94,
  "heart_rate": 110,
  "systolic_bp": 160,
  "diastolic_bp": 95,
  "temperature": 37.2,
  "respiratory_rate": 22,
  "triage_category": "ORANGE",
  "assigned_area": "ER_ACUTE"
}
```

**POST /api/triage/assessments/calculate-category/** (existing, vitals already supported):
```json
{
  "spo2": 94,
  "systolic_bp": 160,
  "diastolic_bp": 95,
  "heart_rate": 110,
  "temperature": 37.2,
  "respiratory_rate": 22,
  "mental_status": "A",
  "chief_complaint_category": "CHEST_PAIN",
  "pain_score": 7
}
```

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| TriageAssessment model | ✅ Exists | Add vitals fields |
| TriageCategoryCalculator | ✅ Exists | Already supports vitals |
| Triage form component | ✅ Exists | Add vitals section |
| calculate-category API | ✅ Exists | Already accepts vitals |

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Triage takes longer with vitals | Medium | Optimized input layout, tab navigation, vitals optional |
| Equipment not available | Low | All fields nullable; form works without vitals |
| Nurses don't record vitals | High | Training; UI prompts; reports on missing vitals |
| Incorrect vital entry | Medium | Range validation, visual warnings for abnormal values |
| Data sync issues | Low | Single copy on create, no real-time sync needed |

---

## Acceptance Criteria (Epic Level)

| Criteria | Verification |
|----------|--------------|
| Triage nurse can enter vitals during assessment | Manual test |
| System suggests category based on entered vitals | Manual test |
| Critical vitals (SpO2 < 90%) auto-suggest RED | Unit test |
| Vitals are copied to Encounter on triage complete | Unit test |
| Doctor can see triage vitals in encounter | Manual test |
| Vitals source shows "Triage Assessment" | Manual test |
| All tests pass | CI pipeline |
| Coverage ≥ 80% for new code | Coverage report |

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Triage assessments with vitals | > 80% | Query DB for non-null vital fields |
| Correct category assignments | > 90% | Audit: category matches calculated category |
| Critical patient detection | 100% | No missed RED patients (retrospective review) |
| Form completion time | < 5 min avg | Timestamp analysis |

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Backend | 1.5 days | None |
| Phase 2: Frontend | 2 days | Phase 1 complete |
| Phase 3: Integration & Tests | 1 day | Phase 2 complete |
| **Total** | **4-5 days** | |

---

## Checklist Summary

### Backend
- [ ] Add vitals fields to TriageAssessment model
- [ ] Create migration
- [ ] Update serializer with vitals + validation
- [ ] Add signal to copy vitals to Encounter
- [ ] Add vitals_source tracking to Encounter
- [ ] Write backend tests (6 test cases)

### Frontend
- [ ] Update TypeScript types for vitals
- [ ] Add vitals to form schema (Zod)
- [ ] Create VitalsInputSection component
- [ ] Wire up calculate-category with vitals
- [ ] Add visual indicators for critical values
- [ ] Write unit tests
- [ ] Add E2E test

### Documentation
- [ ] Update API documentation
- [ ] Update triage workflow docs

---

## References

- [KETA (Kenya Emergency Triage Assessment) Guidelines](https://www.health.go.ke)
- [WHO ETAT Protocol](https://www.who.int/publications/i/item/9789241506328)
- [encounters-consultation-queue-plan.md](./encounters-consultation-queue-plan.md) - Triage requirement matrix
- [sprint-1.5-1.6-track-e-triage-deliverables.md](./sprint-1.5-1.6-track-e-triage-deliverables.md) - Original triage implementation

---

**Last Updated**: January 5, 2026  
**Author**: Engineering Team
