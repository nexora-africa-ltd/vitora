# Dispensing E2E Test Report

**Date**: January 9, 2026  
**Status**: Implementation Required  
**Sprint**: 1.3-1.4 Track A - Pharmacy Module  

## Executive Summary

End-to-end tests for the dispensing workflow have been created and are currently **failing** as expected. This document provides a comprehensive analysis of the test results and outlines the implementation requirements needed to make the tests pass.

**Current State**: 0/55 tests passing (100% failure rate)  
**Root Cause**: Missing UI components and functionality for dispensing workflow

## Test Categories & Status

### 1. Dispensing - From Prescription (17 tests)
**Status**: ❌ All Failing

#### Required Functionality:
1. **Dispense Button on Prescription Items** ✘
   - Tests: `should open dispensing interface from prescription`
   - **Missing**: "Dispense" button on prescription items in PrescriptionsTable component
   - **Location**: `web-app/components/pharmacy/prescriptions-table.tsx`

2. **Dispensing Dialog/Form Component** ✘  
   - Tests: Multiple tests expecting dispensing interface
   - **Missing**: Entire dispensing dialog component
   - **Expected**: Dialog/modal or dedicated form view for dispensing
   - **Required Props**: prescription, prescriptionItem, onSuccess, onCancel

3. **Batch Selection with FEFO** ✘
   - Tests: `should show available batches for drug (FEFO order)`, `should auto-select batch with earliest expiry`
   - **Missing**: Batch selector dropdown showing available batches
   - **Required Logic**: 
     - Query batches for specific drug
     - Filter out expired/quarantined batches  
     - Sort by expiry date (FEFO - First Expiry First Out)
     - Auto-select earliest expiring batch
     - Display: batch number, expiry date, available quantity

4. **Quantity Input with Validation** ✘
   - Tests: `should have quantity to dispense input`, `should pre-fill quantity from prescription`
   - **Missing**: Quantity input field
   - **Required**: 
     - Pre-fill with remaining quantity from prescription item
     - Validate: cannot exceed available stock
     - Validate: warning if exceeds prescribed quantity
     - Real-time validation feedback

5. **Pricing Display** ✘
   - Tests: `should show unit price and calculate total`
   - **Missing**: Price calculation and display
   - **Required**:
     - Show unit price from selected batch
     - Calculate and show total = quantity × unit_price
     - Update in real-time as quantity changes

6. **Counseling Notes Field** ✘
   - Tests: `should have patient counseling notes field`
   - **Missing**: Textarea for pharmacist counseling notes
   - **Required**: Multi-line text input for instructions given to patient

7. **Dispensing Submission** ✘
   - Tests: `should complete dispensing successfully`
   - **Missing**: Submit button and POST to `/api/pharmacy/dispensings/dispense/`
   - **Expected Behavior**:
     - Call FEFO dispense API endpoint
     - Handle success (show toast, close dialog, refresh prescription list)
     - Handle errors (insufficient stock, validation failures)

8. **Prescription Status Update** ✘
   - Tests: `should update prescription status after full dispensing`, `should update prescription status after partial dispensing`
   - **Missing**: UI feedback showing updated prescription status
   - **Expected**:
     - PENDING → DISPENSED (if all items fully dispensed)
     - PENDING → PARTIAL (if some items dispensed)
     - Update prescription badge in table

### 2. Dispensing - Controlled Drugs (5 tests)
**Status**: ❌ All Failing

#### Required Functionality:
1. **Controlled Drug Indicator** ✘
   - Tests: `should require verification for controlled drugs`
   - **Missing**: Visual indicator for controlled drugs requiring verification
   - **Required**: Badge/warning showing "Requires Verification"

2. **Verification Workflow** ✘
   - Tests: `should show pending verification indicator`, `should have verify action for second pharmacist`
   - **Missing**: 
     - Post-dispensing verification UI
     - "Verify" action button for controlled drug dispensings
     - Verification status indicator
   - **Backend Support**: Already exists (`Dispensing.verified_by`, `verified_at`)

3. **Self-Verification Prevention** ✘
   - Tests: `should not allow self-verification`
   - **Missing**: Check to prevent same user from dispensing and verifying
   - **Expected**: Error message if attempting self-verification

4. **Verifier Display** ✘
   - Tests: `should show who verified the dispensing`
   - **Missing**: Display verified_by user name and timestamp
   - **Location**: Dispensing history view

### 3. Dispensing - Direct (OTC/Emergency) (7 tests)
**Status**: ❌ All Failing

#### Required Functionality:
1. **Direct Dispense Button** ✘
   - Tests: `should have direct dispensing option`
   - **Missing**: "Direct Dispense" or "OTC" button in pharmacy page
   - **Location**: Header actions on pharmacy page

2. **Direct Dispense Form** ✘
   - Tests: `should open direct dispensing form`
   - **Missing**: Separate form/dialog for dispensing without prescription
   - **Required Fields**:
     - Patient selector (autocomplete/dropdown)
     - Drug selector (filtered to OTC only)
     - Batch selector (FEFO)
     - Quantity input
     - Counseling notes

3. **OTC Drug Filtering** ✘
   - Tests: `should only allow OTC drugs without prescription`
   - **Missing**: Filter logic to show only OTC drugs (schedule='OTC')
   - **Expected**: POM drugs should not appear in dropdown

4. **Direct Dispense Submission** ✘
   - Tests: `should complete direct dispensing`
   - **Missing**: POST to `/api/pharmacy/dispensings/` (manual dispensing)
   - **Payload**: `{ patient, drug, batch, quantity, counseling_notes }`

### 4. Dispensing - History (11 tests)
**Status**: ❌ All Failing

#### Required Functionality:
1. **Dispensing History Tab/View** ✘
   - Tests: `should have dispensing history view`
   - **Missing**: "Dispensing" or "History" tab in pharmacy page
   - **Alternative**: Could be subtab under "Prescriptions"

2. **Dispensing Records Table** ✘
   - Tests: Multiple display tests
   - **Missing**: Table component showing dispensing records
   - **Required Columns**:
     - Drug name
     - Patient name
     - Quantity dispensed
     - Batch number
     - Dispensed by (user)
     - Dispensed date/time
     - Total cost

3. **Filters** ✘
   - Tests: `should filter by patient`, `should filter by date range`, `should filter by drug`
   - **Missing**: Filter controls
   - **Required Filters**:
     - Patient (dropdown/autocomplete)
     - Date range (from/to date pickers)
     - Drug (dropdown/autocomplete)

4. **Pagination** ✘
   - **Missing**: Pagination controls for dispensing history
   - **Required**: Page navigation (Next/Previous, page numbers)

### 5. Dispensing - Returns (7 tests)
**Status**: ❌ All Failing

#### Required Functionality:
1. **Return Action** ✘
   - Tests: `should have return action for dispensing`
   - **Missing**: "Return" button on dispensing records in history
   - **Required**: Action button in dispensing history table

2. **Return Form** ✘
   - Tests: `should open return form`
   - **Missing**: Return dialog/form
   - **Required Fields**:
     - Quantity to return (input)
     - Return reason (textarea)
     - Max quantity validation

3. **Return Processing** ✘
   - Tests: `should process return successfully`
   - **Missing**: POST to `/api/pharmacy/dispensings/{id}/return_stock/`
   - **Expected**: 
     - Restore stock to batch
     - Update dispensing record
     - Update prescription status if applicable

4. **Prescription Status Rollback** ✘
   - Tests: `should update prescription status after full return`
   - **Missing**: Logic to update prescription status
   - **Expected**: DISPENSED → PENDING (if full return)

### 6. Dispensing - Multi-Batch FEFO (4 tests)
**Status**: ❌ All Failing

#### Required Functionality:
1. **Multi-Batch Allocation** ✘
   - Tests: `should split across batches when quantity exceeds single batch`
   - **Missing**: Logic and UI to handle dispensing from multiple batches
   - **Backend**: Already supported by FEFO API endpoint
   - **UI Required**: Show batch breakdown when multiple batches used

2. **Batch Breakdown Display** ✘
   - Tests: `should show batch breakdown for large quantities`
   - **Missing**: Table/list showing allocation across batches
   - **Format**: "Batch X: Y units, Batch Z: W units"

3. **Expiry Priority** ✘
   - Tests: `should prioritize earliest expiry batches`
   - **Missing**: Visual indication of FEFO ordering
   - **Expected**: Batches listed with earliest expiry first

4. **Expired Batch Exclusion** ✘
   - Tests: `should exclude expired and quarantined batches`
   - **Backend**: Already implemented
   - **UI**: Should not display expired/quarantined batches

### 7. Dispensing - Labels (6 tests)
**Status**: ❌ All Failing

#### Required Functionality:
1. **Print Label Action** ✘
   - Tests: `should have print label action`
   - **Missing**: "Print Label" button on dispensing records
   - **Location**: Dispensing history table actions

2. **Label Preview/Generator** ✘
   - Tests: Multiple label content tests
   - **Missing**: Label preview dialog/modal
   - **Required Content**:
     - Patient name
     - Drug name and dosage
     - Instructions (from prescription)
     - Dispensing date
     - Expiry date warning
   - **Format**: Standard pharmacy label format

3. **Print Functionality** ✘
   - **Missing**: Browser print dialog trigger
   - **Implementation**: Use `window.print()` with print-specific CSS

## Backend API Status

### ✅ Already Implemented:
- `GET /api/pharmacy/dispensings/` - List dispensings
- `GET /api/pharmacy/dispensings/{id}/` - Get dispensing detail
- `POST /api/pharmacy/dispensings/` - Create manual dispensing
- `POST /api/pharmacy/dispensings/dispense/` - Dispense using FEFO
- `POST /api/pharmacy/dispensings/{id}/return_stock/` - Process return
- `POST /api/pharmacy/dispensings/{id}/verify/` - Verify controlled drug

### ✅ Backend Models:
- `Dispensing` model with all required fields
- `Prescription` and `PrescriptionItem` with dispensing tracking
- `StockBatch` with FEFO ordering and quantity tracking
- Validation logic for stock availability

## Implementation Priority

### Phase 1: Core Dispensing (HIGH PRIORITY)
**Goal**: Enable basic prescription dispensing

1. **DispenseDialog Component** (Priority 1)
   - Location: `web-app/components/pharmacy/dispense-dialog.tsx`
   - Props: `{ prescription, prescriptionItem, isOpen, onClose, onSuccess }`
   - Features:
     - Batch selector (FEFO sorted)
     - Quantity input (pre-filled, validated)
     - Counseling notes textarea
     - Price display
     - Submit button

2. **Add Dispense Button to PrescriptionsTable** (Priority 1)
   - Location: `web-app/components/pharmacy/prescriptions-table.tsx`
   - Action: Opens DispenseDialog
   - Condition: Only show for PENDING/PARTIAL prescriptions

3. **Dispensing API Integration** (Priority 1)
   - Hook: `useDispense()` in `web-app/lib/hooks/use-pharmacy.ts`
   - Endpoint: POST `/api/pharmacy/dispensings/dispense/`
   - Handle success/error states

### Phase 2: Dispensing History (MEDIUM PRIORITY)
**Goal**: View and manage dispensing records

4. **DispensingHistoryTable Component** (Priority 2)
   - Location: `web-app/components/pharmacy/dispensing-history-table.tsx`
   - Features: Display all dispensing records with filters
   - Columns: All required fields from tests

5. **Add Dispensing Tab** (Priority 2)
   - Location: `web-app/app/(dashboard)/pharmacy/page.tsx`
   - Add "Dispensing" tab to pharmacy page tabs

6. **Dispensing Filters** (Priority 2)
   - Patient filter
   - Date range filter
   - Drug filter

### Phase 3: Direct Dispensing (MEDIUM PRIORITY)
**Goal**: Enable OTC and emergency dispensing

7. **DirectDispenseDialog Component** (Priority 3)
   - Location: `web-app/components/pharmacy/direct-dispense-dialog.tsx`
   - Features: Patient selector, OTC drug selector, batch selector, quantity

8. **Add Direct Dispense Button** (Priority 3)
   - Location: `web-app/app/(dashboard)/pharmacy/page.tsx`
   - Action: Opens DirectDispenseDialog

### Phase 4: Advanced Features (LOW PRIORITY)
**Goal**: Complete feature set

9. **ReturnDialog Component** (Priority 4)
   - Location: `web-app/components/pharmacy/return-dialog.tsx`
   - Features: Quantity input, reason textarea

10. **Controlled Drug Verification UI** (Priority 4)
    - Verification indicator
    - Verify button (for different user)
    - Self-verification prevention

11. **Label Generation** (Priority 4)
    - PrintLabelDialog component
    - Label preview
    - Print functionality

12. **Multi-Batch Breakdown Display** (Priority 4)
    - Show when FEFO uses multiple batches
    - Batch allocation table

## Component Structure (Recommended)

```
web-app/components/pharmacy/
├── dispensing/
│   ├── dispense-dialog.tsx          # Main dispensing form (from prescription)
│   ├── direct-dispense-dialog.tsx   # Direct dispensing form (OTC)
│   ├── return-dialog.tsx            # Return processing form
│   ├── verify-dialog.tsx            # Controlled drug verification
│   ├── print-label-dialog.tsx       # Label generator
│   ├── batch-selector.tsx           # Reusable batch selection component
│   └── batch-breakdown-view.tsx     # Multi-batch allocation display
├── dispensing-history-table.tsx     # Dispensing records table
└── index.ts                         # Exports
```

## API Hooks Required

```typescript
// web-app/lib/hooks/use-pharmacy.ts

// Dispensing
export function useDispense() // POST /api/pharmacy/dispensings/dispense/
export function useDirectDispense() // POST /api/pharmacy/dispensings/
export function useDispensings(filters) // GET /api/pharmacy/dispensings/

// Batch selection
export function useBatchesForDrug(drugId) // GET /api/pharmacy/stock/?drug={drugId}&status=AVAILABLE

// Returns
export function useReturnStock(dispensingId) // POST /api/pharmacy/dispensings/{id}/return_stock/

// Verification
export function useVerifyDispensing(dispensingId) // POST /api/pharmacy/dispensings/{id}/verify/
```

## Testing Strategy

### Unit Tests (Jest + React Testing Library)
**Location**: `web-app/__tests__/components/pharmacy/`

- ✅ Test each dialog component in isolation
- ✅ Test form validation logic
- ✅ Test API integration with mocks
- ✅ Test state management (opening/closing dialogs)

### Integration Tests
**Location**: `web-app/__tests__/integration/pharmacy/`

- ✅ Test full dispensing workflow
- ✅ Test multi-batch scenarios
- ✅ Test return processing
- ✅ Test controlled drug verification

### E2E Tests (Playwright)
**Location**: `web-app/e2e/pharmacy/dispensing.spec.ts`

- ✅ Already written (55 tests)
- ❌ Currently failing - will pass after implementation
- ✅ Run after each component completion to verify

## Success Criteria

**Definition of Done**:
1. ✅ All 55 E2E tests passing
2. ✅ Unit tests for all new components (80%+ coverage)
3. ✅ No console errors or warnings
4. ✅ Proper error handling and user feedback
5. ✅ Responsive design (mobile + desktop)
6. ✅ Accessibility (ARIA labels, keyboard navigation)
7. ✅ Loading states and optimistic updates
8. ✅ Toast notifications for success/error

## Estimated Effort

| Phase | Components | Story Points | Time Estimate |
|-------|-----------|--------------|---------------|
| Phase 1 | Core Dispensing | 13 | 2-3 days |
| Phase 2 | History | 8 | 1-2 days |
| Phase 3 | Direct Dispensing | 5 | 1 day |
| Phase 4 | Advanced Features | 8 | 1-2 days |
| **Total** | **12 components** | **34** | **5-8 days** |

## Dependencies

### External Libraries (Already Available):
- ✅ `@radix-ui/react-dialog` - For modals
- ✅ `@radix-ui/react-select` - For dropdowns
- ✅ `react-hook-form` + `zod` - For form validation
- ✅ `@tanstack/react-query` - For API calls
- ✅ `date-fns` - For date formatting

### Backend:
- ✅ All required API endpoints implemented
- ✅ FEFO logic working
- ✅ Batch allocation logic working
- ✅ Stock tracking working

## Risks & Mitigation

### Risk 1: Multi-Batch Complexity
**Mitigation**: Use backend FEFO endpoint which handles allocation logic. UI only displays the result.

### Risk 2: Controlled Drug Verification
**Mitigation**: Backend already prevents self-verification. UI just needs to check `request.user.id !== dispensing.dispensed_by.id`.

### Risk 3: Real-time Stock Updates
**Mitigation**: Use React Query's cache invalidation after dispensing to refetch stock levels.

### Risk 4: Print Label Browser Compatibility
**Mitigation**: Use standard `window.print()` with `@media print` CSS. Test on Chrome, Firefox, Safari.

## Next Steps

1. **Immediate**: Implement Phase 1 (Core Dispensing)
   - Start with `dispense-dialog.tsx`
   - Add dispense button to prescriptions table
   - Integrate with API

2. **Short-term**: Implement Phase 2 (History)
   - Build dispensing history table
   - Add tab to pharmacy page

3. **Medium-term**: Implement Phase 3 (Direct Dispensing)
   - Build direct dispense dialog
   - Add button to pharmacy page

4. **Long-term**: Implement Phase 4 (Advanced Features)
   - Returns, verification, labels, multi-batch display

## Appendix: Sample API Payloads

### Dispense from Prescription (FEFO)
```json
POST /api/pharmacy/dispensings/dispense/
{
  "prescription_item_id": 1,
  "quantity": 30,
  "counseling_notes": "Take with food. Avoid alcohol."
}

Response: [
  {
    "id": 123,
    "batch": 1,
    "batch_number": "BATCH-2026-001",
    "quantity_dispensed": 30,
    "unit_price": "5.00",
    "total_price": "150.00",
    ...
  }
]
```

### Direct Dispense (Manual)
```json
POST /api/pharmacy/dispensings/
{
  "patient": 1,
  "drug": 1,
  "batch": 1,
  "quantity_dispensed": 10,
  "unit_price": "5.00",
  "total_price": "50.00",
  "instructions_given": "Take as needed for pain",
  "patient_counseled": true
}
```

### Return Stock
```json
POST /api/pharmacy/dispensings/123/return_stock/
{
  "quantity": 5,
  "reason": "Patient adverse reaction - doctor advised to stop"
}
```

### Verify Controlled Drug
```json
POST /api/pharmacy/dispensings/123/verify/
{}

Response: {
  "id": 123,
  "verified_by": 2,
  "verified_by_name": "Dr. Verifier",
  "verified_at": "2026-01-09T15:30:00Z",
  ...
}
```

---

**Report Generated**: January 9, 2026  
**Author**: Test Analysis Tool  
**Version**: 1.0
