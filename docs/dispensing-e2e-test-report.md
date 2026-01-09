# Dispensing E2E Test Report

**Date:** January 9, 2026  
**Test File:** `web-app/e2e/pharmacy/dispensing.spec.ts`  
**Browser:** Chromium  
**Duration:** ~4.5 minutes

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total Tests** | 55 |
| **Passed** | 0 (0%) |
| **Failed** | 55 (100%) |
| **Test Suites** | 8 |

---

## Test Results by Category

### ✅ Passing Tests (0)

No tests passed. The entire dispensing module UI is missing or incomplete.

---

## ❌ Failure Analysis by Category

### Category 1: Prescription-Based Dispensing (16 failures)

**Root Cause:** Clicking prescription row and then "Dispense" button - the Dispense button is not found in the prescription detail view.

| Test | Expected Element | Error |
|------|------------------|-------|
| should open dispensing interface from prescription | Dialog or `[data-testid="dispensing-form"]` | Dispense button not found |
| should display prescription items to dispense | Drug name "paracetamol", quantity "30" | Dispense button not found |
| should show available batches for drug (FEFO order) | Batch information, "BATCH-2026-001" | Dispense button not found |
| should auto-select batch with earliest expiry (FEFO) | Batch select or "auto selected" | Dispense button not found |
| should show batch expiry date | Text "expiry" or "exp" | Dispense button not found |
| should show available quantity per batch | Text "450 available" | Dispense button not found |
| should allow manual batch selection | Enabled batch select | Dispense button not found |
| should have quantity to dispense input | `getByLabel(/quantity.*dispense/i)` | Dispense button not found |
| should pre-fill quantity from prescription | Input with value "30" | Dispense button not found |
| should validate quantity does not exceed available stock | Error "insufficient" | Dispense button not found |
| should validate quantity does not exceed prescribed | Error "exceed prescribed" | Dispense button not found |
| should show unit price and calculate total | Text "price", "total" | Dispense button not found |
| should have patient counseling notes field | `getByLabel(/counseling|notes/i)` | Dispense button not found |
| should complete dispensing successfully | Success message | Dispense button not found |
| should update prescription status after full dispensing | Status "DISPENSED" | Dispense button not found |
| should update prescription status after partial dispensing | Status "PARTIAL" | Dispense button not found |

**Resolution:**

1. **Add Dispense button to prescription detail view:**

```tsx
// In PrescriptionDetailDialog or prescription detail page:
{prescription.status === 'PENDING' && (
  <Button onClick={() => openDispensingForm(prescription)}>
    <Pill className="h-4 w-4 mr-2" />
    Dispense
  </Button>
)}

{prescription.status === 'PARTIAL' && (
  <Button onClick={() => openDispensingForm(prescription)}>
    Continue Dispensing
  </Button>
)}
```

2. **Create DispensingForm component:**

```tsx
// components/pharmacy/dispensing-form.tsx
export function DispensingForm({ prescription }: Props) {
  return (
    <div data-testid="dispensing-form">
      <h2>Dispense Items</h2>
      
      {prescription.items.map((item) => (
        <div key={item.id} className="border p-4 rounded mb-4">
          {/* Drug info */}
          <p className="font-medium">{item.drug_name}</p>
          <p>Prescribed: {item.quantity_prescribed}</p>
          <p>Remaining: {item.remaining_quantity}</p>
          
          {/* Batch selection (FEFO - earliest expiry first) */}
          <div>
            <Label htmlFor={`batch-${item.id}`}>Batch</Label>
            <Select defaultValue={autoSelectedBatch?.id}>
              <SelectTrigger data-testid="batch-select">
                <SelectValue placeholder="Auto-selected (earliest expiry)" />
              </SelectTrigger>
              <SelectContent>
                {availableBatches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id.toString()}>
                    {batch.batch_number} - {batch.quantity_available} available 
                    (Exp: {batch.expiry_date})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Quantity to dispense */}
          <div>
            <Label htmlFor={`qty-${item.id}`}>Quantity to Dispense</Label>
            <Input 
              id={`qty-${item.id}`}
              type="number"
              aria-label="Quantity to Dispense"
              defaultValue={item.remaining_quantity}
              max={Math.min(item.remaining_quantity, batchAvailable)}
            />
          </div>
          
          {/* Price info */}
          <div>
            <p>Unit Price: KES {batch.selling_price}</p>
            <p>Total: KES {quantity * batch.selling_price}</p>
          </div>
        </div>
      ))}
      
      {/* Counseling notes */}
      <div>
        <Label htmlFor="counseling">Counseling Notes</Label>
        <Textarea 
          id="counseling"
          aria-label="Counseling Notes"
          placeholder="Patient advice and instructions..."
        />
      </div>
      
      <Button onClick={handleDispense}>
        Confirm Dispense
      </Button>
    </div>
  );
}
```

---

### Category 2: Controlled Drugs Verification (5 failures)

**Root Cause:** No controlled drug verification workflow implemented

| Test | Expected Behavior |
|------|-------------------|
| should require verification for controlled drugs | Show verification required message |
| should show pending verification indicator | `[data-testid="verification-pending"]` |
| should have verify action for second pharmacist | Verify button visible |
| should show who verified the dispensing | Verifier name displayed |
| should not allow self-verification | Block same user from verifying |

**Resolution:**

```tsx
// Controlled drug dispensing workflow:

// 1. Detect controlled drug
const isControlledDrug = drug.is_controlled || drug.schedule === 'CD';

// 2. Show verification requirement
{isControlledDrug && (
  <Alert>
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>
      This is a controlled drug. Second pharmacist verification required.
    </AlertDescription>
  </Alert>
)}

// 3. Pending verification indicator
{dispensing.status === 'PENDING_VERIFICATION' && (
  <Badge data-testid="verification-pending" variant="warning">
    Pending Verification
  </Badge>
)}

// 4. Verify button (only for different user)
{canVerify && currentUser.id !== dispensing.dispensed_by && (
  <Button onClick={handleVerify}>
    Verify Dispensing
  </Button>
)}

// 5. Show verifier info
{dispensing.verified_by && (
  <p>Verified by: {dispensing.verified_by_name}</p>
)}
```

---

### Category 3: Direct Dispensing OTC/Emergency (7 failures)

**Root Cause:** No direct dispensing option available - tests cannot find the button/link

| Test | Expected Element |
|------|------------------|
| should have direct dispensing option | Button "Direct Dispense" or "OTC Sale" |
| should open direct dispensing form | Form or dialog container |
| should require patient selection for direct dispensing | Patient selection field |
| should allow drug selection in direct dispensing | Drug selection field |
| should only allow OTC drugs without prescription | Warning for non-OTC |
| should complete direct dispensing | Success message |

**Resolution:**

```tsx
// 1. Add Direct Dispense button to pharmacy page:
<Button 
  variant="outline"
  onClick={() => router.push('/pharmacy/dispense/direct')}
  data-testid="direct-dispense-button"
>
  <ShoppingCart className="h-4 w-4 mr-2" />
  Direct Dispense / OTC
</Button>

// 2. Create DirectDispensingForm:
export function DirectDispensingForm() {
  return (
    <form data-testid="direct-dispensing-form">
      {/* Patient (optional for OTC) */}
      <div>
        <Label htmlFor="patient">Patient</Label>
        <PatientSearch id="patient" aria-label="Patient" />
      </div>
      
      {/* Drug selection */}
      <div>
        <Label htmlFor="drug">Drug</Label>
        <DrugSelect 
          id="drug" 
          aria-label="Drug"
          filter={(drug) => drug.schedule === 'OTC' || hasValidPrescription}
        />
      </div>
      
      {/* Warning for prescription drugs */}
      {selectedDrug?.requires_prescription && !hasValidPrescription && (
        <Alert variant="destructive">
          This drug requires a valid prescription.
        </Alert>
      )}
      
      {/* Quantity & batch selection */}
      <div>
        <Label htmlFor="quantity">Quantity</Label>
        <Input id="quantity" type="number" aria-label="Quantity" />
      </div>
      
      <Button type="submit">Complete Sale</Button>
    </form>
  );
}
```

---

### Category 4: Dispensing History (10 failures)

**Root Cause:** No "History" or "Dispensing" tab exists in the pharmacy page

| Test | Expected Element |
|------|------------------|
| should have dispensing history view | Tab "History" or "Dispensing" |
| should display dispensing records | Drug names in records |
| should show dispensed quantity | Quantity displayed |
| should show dispensing date/time | Date displayed |
| should show dispensed by user | Pharmacist name |
| should show batch number used | Batch number |
| should show total cost | Price/cost displayed |
| should filter by patient | Patient filter |
| should filter by date range | Date filter |
| should filter by drug | Drug filter |

**Resolution:**

```tsx
// 1. Add Dispensing History tab to pharmacy page:
<TabsTrigger value="history" className="gap-2">
  <History className="h-4 w-4" />
  Dispensing History
</TabsTrigger>

<TabsContent value="history">
  <DispensingHistoryTable
    dispensings={dispensingsData?.results ?? []}
    isLoading={dispensingsLoading}
    onPatientFilter={setPatientFilter}
    onDrugFilter={setDrugFilter}
    onDateFilter={setDateFilter}
  />
</TabsContent>

// 2. Create DispensingHistoryTable component:
export function DispensingHistoryTable({ dispensings, filters, ... }) {
  return (
    <div>
      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div>
          <Label htmlFor="patient-filter">Patient</Label>
          <PatientSearch 
            id="patient-filter"
            data-testid="patient-filter"
            onSelect={onPatientFilter}
          />
        </div>
        
        <div>
          <Label htmlFor="drug-filter">Drug</Label>
          <DrugSelect 
            id="drug-filter"
            data-testid="drug-filter"
            onSelect={onDrugFilter}
          />
        </div>
        
        <div>
          <Label htmlFor="date-filter">From</Label>
          <Input 
            id="date-filter"
            type="date"
            data-testid="date-filter"
            onChange={onDateFilter}
          />
        </div>
      </div>
      
      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date/Time</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Drug</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Dispensed By</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dispensings.map((d) => (
            <TableRow key={d.id}>
              <TableCell>{format(new Date(d.dispensed_at), 'MMM d, yyyy HH:mm')}</TableCell>
              <TableCell>{d.patient_name}</TableCell>
              <TableCell>{d.drug_name}</TableCell>
              <TableCell>{d.batch_number}</TableCell>
              <TableCell>{d.quantity}</TableCell>
              <TableCell>KES {d.total_price.toFixed(2)}</TableCell>
              <TableCell>{d.dispensed_by_name}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm">
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Return
                </Button>
                <Button variant="ghost" size="sm">
                  <Printer className="h-4 w-4 mr-1" />
                  Label
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

### Category 5: Returns Processing (8 failures)

**Root Cause:** Dispensing History tab not found, blocking beforeEach hook. Return functionality not implemented.

| Test | Expected Behavior |
|------|-------------------|
| should have return action for dispensing | Return button on dispensing record |
| should open return form | Return dialog opens |
| should have quantity to return input | Quantity input field |
| should validate return quantity | Cannot exceed dispensed |
| should require return reason | Reason field required |
| should process return successfully | Success message |
| should restore stock after return | Stock quantity increases |
| should update prescription status after full return | Status reverts |

**Resolution:**

```tsx
// 1. Add Return button to dispensing history rows (shown above)

// 2. Create ReturnStockDialog:
export function ReturnStockDialog({ dispensing, open, onOpenChange }) {
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('');
  
  const maxReturnQty = dispensing.quantity - (dispensing.returned_quantity || 0);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return Stock</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p>Drug: {dispensing.drug_name}</p>
          <p>Originally dispensed: {dispensing.quantity}</p>
          <p>Already returned: {dispensing.returned_quantity || 0}</p>
          <p>Maximum returnable: {maxReturnQty}</p>
          
          {/* Quantity */}
          <div>
            <Label htmlFor="return-qty">Quantity to Return</Label>
            <Input 
              id="return-qty"
              type="number"
              aria-label="Quantity to Return"
              value={quantity}
              onChange={(e) => setQuantity(+e.target.value)}
              max={maxReturnQty}
            />
            {quantity > maxReturnQty && (
              <p className="text-red-500 text-sm">Cannot exceed {maxReturnQty}</p>
            )}
          </div>
          
          {/* Reason (required) */}
          <div>
            <Label htmlFor="return-reason">Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Return Reason">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WRONG_DRUG">Wrong drug dispensed</SelectItem>
                <SelectItem value="WRONG_QUANTITY">Wrong quantity</SelectItem>
                <SelectItem value="PATIENT_REFUSED">Patient refused</SelectItem>
                <SelectItem value="ADVERSE_REACTION">Adverse reaction</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleReturn}
            disabled={!quantity || !reason || quantity > maxReturnQty}
          >
            Process Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

### Category 6: Multi-Batch FEFO Dispensing (4 failures)

**Root Cause:** Dispense button not found in prescription detail view

| Test | Expected Behavior |
|------|-------------------|
| should split across batches when quantity exceeds single batch | Multiple batch allocation |
| should show batch breakdown for large quantities | `[data-testid="batch-breakdown"]` |
| should prioritize earliest expiry batches | First batch has earliest expiry |
| should exclude expired and quarantined batches | BATCH-2025-005 not shown |

**Resolution:**

```tsx
// In DispensingForm, implement FEFO batch allocation:

function allocateBatchesFEFO(drug_id: number, quantity: number) {
  // Get available batches sorted by expiry (earliest first)
  const batches = availableBatches
    .filter(b => b.drug === drug_id)
    .filter(b => b.status === 'AVAILABLE' && !b.is_expired)
    .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
  
  const allocations: BatchAllocation[] = [];
  let remaining = quantity;
  
  for (const batch of batches) {
    if (remaining <= 0) break;
    
    const allocate = Math.min(remaining, batch.quantity_available);
    allocations.push({
      batch_id: batch.id,
      batch_number: batch.batch_number,
      quantity: allocate,
      expiry_date: batch.expiry_date,
    });
    remaining -= allocate;
  }
  
  return allocations;
}

// Display batch breakdown:
<div data-testid="batch-breakdown">
  <h4>Batch Allocation (FEFO)</h4>
  {allocations.map((alloc, idx) => (
    <div key={idx} data-testid="batch-item">
      <p>{alloc.batch_number}: {alloc.quantity} units</p>
      <p className="text-sm text-muted-foreground">
        Expires: {format(new Date(alloc.expiry_date), 'MMM d, yyyy')}
      </p>
    </div>
  ))}
</div>
```

---

### Category 7: Dispensing Labels (5 failures)

**Root Cause:** Dispensing History tab not found, blocking beforeEach hook

| Test | Expected Element |
|------|------------------|
| should have print label action | Print Label button |
| should generate label with patient name | Patient name on label |
| should generate label with drug name and dosage | Drug info on label |
| should generate label with instructions | Instructions on label |
| should generate label with dispensing date | Date on label |
| should generate label with expiry warning | Expiry warning on label |

**Resolution:**

```tsx
// 1. Add Print Label button to dispensing history (shown in table above)

// 2. Create label preview/print component:
export function DispensingLabel({ dispensing }) {
  return (
    <div className="p-4 border rounded print:border-none" id="dispensing-label">
      <div className="text-center mb-4">
        <h3 className="font-bold">Sample Health Facility</h3>
        <p className="text-sm">Pharmacy Department</p>
      </div>
      
      {/* Patient */}
      <div className="mb-2">
        <p className="font-semibold">{dispensing.patient_name}</p>
      </div>
      
      {/* Drug */}
      <div className="mb-2">
        <p className="font-bold text-lg">{dispensing.drug_name}</p>
        <p>{dispensing.dosage}</p>
      </div>
      
      {/* Instructions */}
      <div className="mb-2 p-2 bg-gray-100 rounded">
        <p className="font-semibold">Instructions:</p>
        <p>{dispensing.instructions || 'Take as directed'}</p>
      </div>
      
      {/* Dates */}
      <div className="text-sm mt-4">
        <p>Dispensed: {format(new Date(dispensing.dispensed_at), 'MMM d, yyyy')}</p>
        <p className="text-amber-600 font-semibold">
          ⚠️ Batch expires: {format(new Date(dispensing.batch_expiry), 'MMM d, yyyy')}
        </p>
      </div>
      
      {/* Dispensed by */}
      <div className="text-xs mt-2 border-t pt-2">
        <p>Dispensed by: {dispensing.dispensed_by_name}</p>
      </div>
    </div>
  );
}
```

---

## Priority Implementation Plan

### 🔴 High Priority (Core Workflow)

1. **Prescription-Based Dispensing** (16 tests) - Primary pharmacy workflow
2. **Dispensing History Tab** (10 tests) - Needed for returns, labels, audit trail
3. **Multi-Batch FEFO** (4 tests) - Critical for inventory management

### 🟡 Medium Priority (Important Features)

4. **Returns Processing** (8 tests) - Error correction workflow
5. **Direct Dispensing OTC** (7 tests) - Over-the-counter sales
6. **Dispensing Labels** (5 tests) - Patient safety requirement

### 🟢 Lower Priority (Compliance)

7. **Controlled Drugs Verification** (5 tests) - Regulatory requirement

---

## Implementation Checklist

### Core Dispensing Workflow
- [ ] Add "Dispense" button to prescription detail view
- [ ] Create `DispensingForm` component
- [ ] Implement batch selection (FEFO - earliest expiry first)
- [ ] Add quantity input with validation
- [ ] Show unit price and calculate total
- [ ] Add counseling notes field
- [ ] Handle full/partial dispensing status updates
- [ ] Implement API call to POST `/api/pharmacy/dispensings/dispense/`

### Dispensing History
- [ ] Add "Dispensing History" tab to pharmacy page
- [ ] Create `DispensingHistoryTable` component
- [ ] Add filters (patient, drug, date range)
- [ ] Display all dispensing record fields
- [ ] Add Return and Print Label actions

### Multi-Batch FEFO
- [ ] Implement `allocateBatchesFEFO()` function
- [ ] Show batch breakdown with `data-testid="batch-breakdown"`
- [ ] Exclude expired and quarantined batches
- [ ] Support splitting across multiple batches

### Returns Processing
- [ ] Create `ReturnStockDialog` component
- [ ] Add quantity validation
- [ ] Add reason selection (required)
- [ ] Call POST `/api/pharmacy/dispensings/{id}/return_stock/`
- [ ] Update prescription status if full return

### Direct Dispensing
- [ ] Add "Direct Dispense" button to pharmacy page
- [ ] Create `DirectDispensingForm` component
- [ ] Filter drugs to OTC unless prescription available
- [ ] Show warning for prescription-only drugs

### Controlled Drugs
- [ ] Detect controlled drugs (is_controlled, schedule='CD')
- [ ] Show verification requirement message
- [ ] Add pending verification indicator
- [ ] Add verify action (different user only)
- [ ] Track verifier information

### Labels
- [ ] Create `DispensingLabel` component
- [ ] Include all required fields
- [ ] Implement print functionality

---

## Files Requiring Changes

| File | Changes Needed |
|------|----------------|
| `app/(dashboard)/pharmacy/page.tsx` | Add Dispensing History tab, Direct Dispense button |
| `components/pharmacy/prescriptions-table.tsx` | Add Dispense button to prescription rows |
| `components/pharmacy/dispensing-form.tsx` | Create new - main dispensing form |
| `components/pharmacy/dispensing-history-table.tsx` | Create new - history with filters |
| `components/pharmacy/direct-dispensing-form.tsx` | Create new - OTC/emergency sales |
| `components/pharmacy/return-stock-dialog.tsx` | Create new - return workflow |
| `components/pharmacy/dispensing-label.tsx` | Create new - print labels |
| `components/pharmacy/index.ts` | Export new components |
| `lib/hooks/use-pharmacy.ts` | Add `useDispensings`, `useDispense` hooks |

---

## Estimated Effort

| Category | Tests | Est. Hours |
|----------|-------|------------|
| Prescription-Based Dispensing | 16 | 8-12 |
| Dispensing History | 10 | 4-6 |
| Multi-Batch FEFO | 4 | 3-4 |
| Returns Processing | 8 | 4-5 |
| Direct Dispensing | 7 | 4-5 |
| Controlled Drugs | 5 | 3-4 |
| Labels | 5 | 2-3 |
| **Total** | **55** | **28-39 hours** |

---

## API Endpoints Required

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/pharmacy/dispensings/` | GET | List dispensing history |
| `/api/pharmacy/dispensings/` | POST | Create direct dispensing |
| `/api/pharmacy/dispensings/dispense/` | POST | Dispense from prescription (FEFO) |
| `/api/pharmacy/dispensings/{id}/` | GET | Get dispensing details |
| `/api/pharmacy/dispensings/{id}/return_stock/` | POST | Process return |
| `/api/pharmacy/dispensings/{id}/verify/` | POST | Second pharmacist verification |
| `/api/pharmacy/stock/by_drug/?drug_id={id}` | GET | Get batches for FEFO selection |

---

*Report generated from Playwright test run on January 9, 2026*
