# E2E Test Failures - Implementation Plan

> **Generated**: January 14, 2026  
> **Test File**: `web-app/e2e/inpatient.spec.ts`  
> **Current Status**: 13 passed, 18 failed (31 total)

---

## Summary

The inpatient E2E tests are failing primarily due to:
1. **Missing UI components** - Tests expect elements that don't exist in the current pages
2. **API mocking issues** - Mock data not being applied correctly to some pages
3. **Strict mode violations** - Multiple elements matching selectors (need `.first()`)
4. **Missing pages/routes** - Some routes referenced in tests don't exist yet

---

## ✅ Passing Tests (13)

| Test | Category |
|------|----------|
| should display ward list with occupancy rates | Ward Management |
| should filter wards by type | Ward Management |
| should show ward details with bed list | Ward Management |
| should display bed status with color coding | Bed Management ✅ FIXED |
| should filter beds by status | Bed Management ✅ FIXED |
| should change bed status to maintenance | Bed Management ✅ FIXED |
| should display pending admission recommendations | Admission Workflow ✅ FIXED |
| should approve admission recommendation and assign bed | Admission Workflow ✅ FIXED |
| should display active admissions list | Admission Workflow ✅ FIXED |
| should show admission details with patient info | Admission Workflow ✅ FIXED |
| should decline admission recommendation with reason | Admission Workflow ✅ NEW |
| should create new admission from form | Admission Workflow ✅ NEW |

---

## ❌ Failing Tests by Category

### ~~1. Bed Management (2 failures)~~ ✅ FIXED

All Bed Management tests now pass after:
- Fixed API mock for ward beds endpoint (`/api/inpatient/wards/*/beds/`)
- Added `data-testid="bed-card"` to BedCard component
- Added BedStatusDialog component for changing bed status
- Updated test selectors to match actual Radix UI component behavior

---

### ~~2. Admission Workflow (4 failures)~~ ✅ FIXED

All Admission Workflow tests now pass after:
- Fixed function name typo (`handleAcceptRecommendationConfirm` → `handleApproveConfirm`)
- Added `data-testid="approve-button"` to recommendation cards
- Updated test selectors to use `.first()` for strict mode compliance
- Used `{ exact: true }` for "PENDING" badge text matching
- Fixed dialog interaction selectors for Radix UI components

---

### 3. Ward Round Documentation (3 failures)

#### 3.1 `should display ward round history for admission`
- **Route**: `/admissions/1/ward-round`
- **Error**: `getByText('2026-01-04')` not found
- **Root Cause**: Ward round page not displaying mock data OR API route mismatch
- **Fix Required**:
  - Verify ward round page exists and renders history
  - Check API mock route pattern matches actual fetch
  - Ensure date format matches what page renders

#### 3.2 `should create new ward round entry`
- **Route**: `/admissions/1/ward-round/new`
- **Error**: `getByLabel(/clinical notes/i)` not found (timeout)
- **Root Cause**: Ward round form missing OR route `/ward-round/new` doesn't exist
- **Fix Required**:
  - Create `/admissions/[id]/ward-round/new/page.tsx` if missing
  - Add form with labeled inputs: clinical notes, temperature, pulse, BP, etc.

#### 3.3 `should display vital signs trend in ward rounds`
- **Route**: `/admissions/1/ward-round`
- **Error**: `getByText(/37\.0/)` not found
- **Root Cause**: Vital signs not being rendered from mock data
- **Fix Required**:
  - Ensure ward round page displays vitals in history
  - May need vitals chart/table component

---

### 4. Nursing Kardex (4 failures)

#### 4.1 `should display patient kardex with care plan`
- **Route**: `/admissions/1/kardex`
- **Error**: `getByText(/penicillin/i)` not found
- **Root Cause**: Kardex page not rendering mock data (allergies section)
- **Fix Required**:
  - Verify kardex page fetches and renders:
    - Allergies section
    - Diet orders
    - Nursing diagnoses
  - Check API mock route for kardex data

#### 4.2 `should display risk assessments`
- **Route**: `/admissions/1/kardex`
- **Error**: `getByText(/fall risk/i)` not found
- **Root Cause**: Risk assessment section missing from kardex page
- **Fix Required**:
  - Add risk assessment cards/section to kardex page:
    - Fall risk score
    - Pressure sore risk (Braden scale)
    - Risk level badges (Low/Medium/High)

#### 4.3 `should add shift note to kardex`
- **Route**: `/admissions/1/kardex`
- **Error**: `getByRole('button', { name: /add.*note/i })` not found
- **Root Cause**: No "Add Note" button on kardex page
- **Fix Required**:
  - Add "Add Shift Note" button
  - Implement shift note modal/form:
    - Shift selector (Day/Evening/Night)
    - Notes textarea
    - Submit action

#### 4.4 `should display shift notes history`
- **Route**: `/admissions/1/kardex`
- **Error**: `getByText('Nurse Mary')` not found
- **Root Cause**: Shift notes history section not rendering
- **Fix Required**:
  - Add shift notes timeline/list to kardex page
  - Display: author name, shift, timestamp, notes content

---

### 5. Patient Transfer (2 failures)

#### 5.1 `should initiate patient transfer`
- **Route**: `/admissions/1`
- **Error**: `getByRole('button', { name: /transfer/i })` not found (timeout)
- **Root Cause**: No "Transfer" button on admission detail page
- **Fix Required**:
  - Add "Transfer Patient" button to admission detail page header/actions
  - Link to `/admissions/[id]/transfer` OR open transfer modal

#### 5.2 `should display transfer history`
- **Route**: `/admissions/1/transfer`
- **Error**: `getByText('Medical Ward A')` not found
- **Root Cause**: Transfer page not rendering history OR API mock not applied
- **Fix Required**:
  - Verify transfer page exists and fetches transfer history
  - Display: from ward, to ward, reason, date, transferred by

---

### 6. Discharge Workflow (4 failures)

#### 6.1 `should initiate discharge process`
- **Route**: `/admissions/1`
- **Error**: `getByRole('button', { name: /discharge/i })` not found (timeout)
- **Root Cause**: No "Discharge" button on admission detail page
- **Fix Required**:
  - Add "Discharge Patient" button to admission detail page
  - Link to `/admissions/[id]/discharge`

#### 6.2 `should complete discharge with summary`
- **Route**: `/admissions/1/discharge`
- **Error**: `getByRole('combobox', { name: /discharge type/i })` not found
- **Root Cause**: Discharge form missing required fields
- **Fix Required**:
  - Add discharge form with:
    - Discharge type selector (Routine, AMA, Transfer, Death)
    - Discharge diagnosis textarea
    - Discharge medications list
    - Follow-up instructions
    - Submit button

#### 6.3 `should display length of stay calculation`
- **Route**: `/admissions/1/discharge`
- **Error**: `getByText(/7.*days/i)` not found
- **Root Cause**: LOS not being calculated/displayed
- **Fix Required**:
  - Calculate LOS from admission date to current date
  - Display prominently on discharge page: "Length of Stay: X days"

#### 6.4 `should require clearances before discharge`
- **Route**: `/admissions/1/discharge`
- **Error**: `getByLabel(/billing.*clearance/i)` not found
- **Root Cause**: Clearance checkboxes missing from discharge form
- **Fix Required**:
  - Add clearance section with checkboxes:
    - [ ] Billing Clearance
    - [ ] Pharmacy Clearance  
    - [ ] Nursing Clearance
  - Disable submit until all clearances checked

---

### 7. Bed Occupancy Dashboard (4 failures)

#### 7.1 `should display overall occupancy summary`
- **Route**: `/wards`
- **Error**: `getByText(/100.*total/i)` not found
- **Root Cause**: Mock data shows different numbers than test expects
- **Fix Required**:
  - Update test to match actual mock data totals
  - OR update mock to have 100 total beds

#### 7.2 `should display occupancy by ward type`
- **Route**: `/wards`
- **Error**: Strict mode - `getByText(/medical/i)` resolved to 4 elements
- **Root Cause**: "Medical" appears in multiple places (ward name, badges)
- **Fix Required**:
  - Update test selector to be more specific
  - Use `.first()` or target specific element type

#### 7.3 `should highlight wards with high occupancy`
- **Route**: `/wards`
- **Error**: `getByRole('row', { name: /icu/i })` not found
- **Root Cause**: Page uses cards, not table rows
- **Fix Required**:
  - Update test to look for ICU card instead of row
  - OR add occupancy warning styling to high-occupancy ward cards

#### 7.4 `should refresh occupancy data`
- **Route**: `/wards`
- **Error**: `getByRole('button', { name: /refresh/i })` not found
- **Root Cause**: No refresh button on wards page
- **Fix Required**:
  - Add "Refresh" button to wards page header
  - Implement data refetch on click

---

### 8. Shift Handover (2 failures)

#### 8.1 `should create shift handover report`
- **Route**: `/admissions/handover/new`
- **Error**: `getByRole('combobox', { name: /ward/i })` not found (timeout)
- **Root Cause**: Route `/admissions/handover/new` doesn't exist
- **Fix Required**:
  - Create `/admissions/handover/new/page.tsx`
  - Add handover form with:
    - Ward selector
    - Outgoing shift selector
    - Patient summary section
    - Notes/concerns textarea
    - Submit button

#### 8.2 `should display pending handovers for incoming shift`
- **Route**: `/admissions/handover`
- **Error**: `getByText(/pending.*handover/i)` not found
- **Root Cause**: Route `/admissions/handover` doesn't exist
- **Fix Required**:
  - Create `/admissions/handover/page.tsx`
  - Display list of pending handovers awaiting acknowledgment
  - Filter by ward/shift

---

## Implementation Priority

### High Priority (Core Workflows)
1. **Admission Workflow** - Fix selectors + add approve button
2. **Discharge Workflow** - Add discharge button + complete form
3. **Patient Transfer** - Add transfer button + history display

### Medium Priority (Documentation)
4. **Ward Round Documentation** - Create new ward round page + form
5. **Nursing Kardex** - Add shift notes + risk assessments

### Low Priority (Dashboard/Reports)
6. **Bed Occupancy Dashboard** - Fix selectors + add refresh
7. **Shift Handover** - Create handover pages (new feature)
8. **Bed Management** - Fix tab selectors + bed status change

---

## Quick Wins (Selector Fixes Only)

These tests can pass with simple selector updates:

| Test | Current Selector | Fixed Selector |
|------|------------------|----------------|
| should display active admissions list | `getByText('Medical Ward A')` | `getByText('Medical Ward A').first()` |
| should show admission details | `getByText('Jane Doe')` | `getByText('Jane Doe').first()` |
| should display occupancy by ward type | `getByText(/medical/i)` | `getByText(/medical/i).first()` |
| should filter beds by status | `getByRole('tab', { name: /beds/i })` | `getByRole('tab', { name: /bed layout/i })` |

---

## Missing Pages to Create

| Route | Purpose | Priority |
|-------|---------|----------|
| `/admissions/[id]/ward-round/new` | New ward round entry form | High |
| `/admissions/handover` | Pending handovers list | Medium |
| `/admissions/handover/new` | Create shift handover | Medium |

---

## Missing UI Components

| Component | Page | Purpose |
|-----------|------|---------|
| "Approve" button | `/admissions/recommendations` | Approve admission recommendation |
| "Transfer" button | `/admissions/[id]` | Initiate patient transfer |
| "Discharge" button | `/admissions/[id]` | Initiate discharge process |
| "Add Note" button | `/admissions/[id]/kardex` | Add shift note |
| "Refresh" button | `/wards` | Refresh occupancy data |
| Risk assessment cards | `/admissions/[id]/kardex` | Display fall/pressure risk |
| Clearance checkboxes | `/admissions/[id]/discharge` | Billing/Pharmacy/Nursing clearance |
| LOS display | `/admissions/[id]/discharge` | Show length of stay |

---

## Next Steps

1. Fix quick-win selector issues (4 tests)
2. Add missing action buttons to existing pages (5 tests)
3. Create missing page routes (2 pages)
4. Implement missing form fields and sections (remaining tests)
5. Re-run E2E tests to verify fixes
