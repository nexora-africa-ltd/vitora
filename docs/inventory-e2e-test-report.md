# Inventory E2E Test Report

**Date:** January 9, 2026  
**Test File:** `web-app/e2e/pharmacy/inventory.spec.ts`  
**Browser:** Chromium  
**Duration:** ~2.9 minutes

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total Tests** | 51 |
| **Passed** | 15 (29%) |
| **Failed** | 36 (71%) |
| **Test Suites** | 8 |

---

## Test Results by Category

### ✅ Passing Tests (15)

| Test Suite | Test Name |
|------------|-----------|
| List View | should display inventory tab on pharmacy page |
| List View | should display stock batch list |
| List View | should display batch number column |
| List View | should display drug name for each batch |
| List View | should display quantity available |
| List View | should display expiry date |
| List View | should display batch status |
| List View | should visually indicate low stock batches |
| List View | should visually indicate expired batches |
| FEFO Ordering | should order batches by expiry date (FEFO) |
| FEFO Ordering | should have sort option for expiry date |
| Filter & Search | should filter batches by status |
| Filter & Search | should search batches by batch number |
| Receive Stock | should have receive stock button |
| Expiring Stock Warnings | should show expiry warning badge |

---

## ❌ Failure Analysis by Category

### Category 1: Missing UI Display Elements (3 failures)

**Root Cause:** UI columns or display elements not showing expected data

| Test | Expected Element | Error |
|------|------------------|-------|
| should display days to expiry | Text matching `/880.*days\|days.*880/` | Element not found |
| should display supplier information | Text matching `/kenya.pharma/i` | Element not found |
| should display selling price | Text matching `/5\.00\|KES.5/` | Element not found |

**Resolution:**

```tsx
// In the StockTable component, ensure columns include:
// 1. Days to Expiry column - calculate and display days remaining
// 2. Supplier column - display batch.supplier
// 3. Selling Price column - display batch.selling_price

// Example implementation for days to expiry:
const daysToExpiry = Math.ceil(
  (new Date(batch.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
);

// Add columns to table:
<TableCell>{daysToExpiry} days</TableCell>
<TableCell>{batch.supplier}</TableCell>
<TableCell>KES {batch.selling_price?.toFixed(2)}</TableCell>
```

---

### Category 2: Filter Functionality Issues (3 failures)

**Root Cause:** Status filter dropdown not implementing filter actions correctly

| Test | Expected Behavior | Error |
|------|-------------------|-------|
| should filter to show only available batches | Select "available" → only show available | Filter not applied |
| should filter to show expired batches | Select "expired" → only show expired | Filter not applied |
| should filter batches by drug | Drug filter dropdown visible | Element not found |

**Resolution:**

```tsx
// 1. Implement status filter handler in StockTable:
const [statusFilter, setStatusFilter] = useState<string>('all');

const filteredStock = stockBatches.filter(batch => {
  if (statusFilter === 'all') return true;
  return batch.status.toLowerCase() === statusFilter.toLowerCase();
});

// 2. Add drug filter dropdown:
<Select onValueChange={setDrugFilter}>
  <SelectTrigger>
    <SelectValue placeholder="Filter by drug" />
  </SelectTrigger>
  <SelectContent>
    {drugs.map(drug => (
      <SelectItem key={drug.id} value={drug.id.toString()}>
        {drug.generic_name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

### Category 3: Receive Stock Form Missing Fields (13 failures)

**Root Cause:** The stock receive form/dialog either doesn't open properly or is missing required form fields

| Test | Missing Element |
|------|-----------------|
| should open receive stock form | Dialog/form container |
| should have drug selection in receive form | `getByLabel(/drug/i)` |
| should have batch number field | `getByLabel(/batch.number/i)` |
| should have quantity received field | `getByLabel(/quantity/i)` |
| should have expiry date field | `getByLabel(/expiry/i)` |
| should have manufacture date field | `getByLabel(/manufacture/i)` |
| should have cost price field | `getByLabel(/cost.price/i)` |
| should have selling price field | `getByLabel(/selling.price/i)` |
| should have supplier field | `getByLabel(/supplier/i)` |
| should have purchase order field | `getByLabel(/purchase.order\|po/i)` |
| should have location/shelf field | `getByLabel(/location\|shelf/i)` |
| should validate expiry date is in future | Validation logic |
| should receive stock with valid data | Form submission |
| should prevent duplicate batch numbers | Validation logic |

**Resolution:**

Create or update the `ReceiveStockForm` component with properly labeled fields:

```tsx
// web-app/app/pharmacy/stock/receive/page.tsx or StockReceiveDialog.tsx

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ReceiveStockForm() {
  return (
    <form>
      {/* Drug Selection */}
      <div>
        <Label htmlFor="drug">Drug</Label>
        <Select name="drug">
          <SelectTrigger id="drug" aria-label="Drug">
            <SelectValue placeholder="Select drug" />
          </SelectTrigger>
          <SelectContent>
            {/* Drug options */}
          </SelectContent>
        </Select>
      </div>

      {/* Batch Number */}
      <div>
        <Label htmlFor="batch_number">Batch Number</Label>
        <Input id="batch_number" name="batch_number" aria-label="Batch Number" />
      </div>

      {/* Quantity */}
      <div>
        <Label htmlFor="quantity">Quantity</Label>
        <Input id="quantity" name="quantity" type="number" aria-label="Quantity" />
      </div>

      {/* Expiry Date */}
      <div>
        <Label htmlFor="expiry_date">Expiry Date</Label>
        <Input id="expiry_date" name="expiry_date" type="date" aria-label="Expiry" />
      </div>

      {/* Manufacture Date */}
      <div>
        <Label htmlFor="manufacture_date">Manufacture Date</Label>
        <Input id="manufacture_date" name="manufacture_date" type="date" aria-label="Manufacture" />
      </div>

      {/* Cost Price */}
      <div>
        <Label htmlFor="cost_price">Cost Price</Label>
        <Input id="cost_price" name="cost_price" type="number" step="0.01" aria-label="Cost Price" />
      </div>

      {/* Selling Price */}
      <div>
        <Label htmlFor="selling_price">Selling Price</Label>
        <Input id="selling_price" name="selling_price" type="number" step="0.01" aria-label="Selling Price" />
      </div>

      {/* Supplier */}
      <div>
        <Label htmlFor="supplier">Supplier</Label>
        <Input id="supplier" name="supplier" aria-label="Supplier" />
      </div>

      {/* Purchase Order */}
      <div>
        <Label htmlFor="purchase_order">Purchase Order</Label>
        <Input id="purchase_order" name="purchase_order" aria-label="Purchase Order" />
      </div>

      {/* Location/Shelf */}
      <div>
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" aria-label="Location" />
      </div>
    </form>
  );
}
```

---

### Category 4: Batch Details View Missing (6 failures)

**Root Cause:** Clicking a batch row doesn't open a detail view/dialog

| Test | Expected Behavior |
|------|-------------------|
| should click batch to view details | Open dialog/detail panel |
| should show all quantities in detail view | Display received/available/dispensed |
| should show pricing information | Display cost/selling price |
| should show batch value calculation | Display value = qty × cost |
| should show received by user | Display user who received |
| should show barcode if available | Display barcode |

**Resolution:**

```tsx
// 1. Add click handler to batch rows:
<TableRow 
  onClick={() => setSelectedBatch(batch)}
  className="cursor-pointer"
>

// 2. Create BatchDetailDialog component:
<Dialog open={!!selectedBatch} onOpenChange={() => setSelectedBatch(null)}>
  <DialogContent data-testid="batch-detail">
    <DialogHeader>
      <DialogTitle>Batch Details: {selectedBatch?.batch_number}</DialogTitle>
    </DialogHeader>
    
    <div className="grid gap-4">
      {/* Quantities */}
      <div>
        <h4>Quantities</h4>
        <p>Received: {selectedBatch?.quantity_received}</p>
        <p>Available: {selectedBatch?.quantity_available}</p>
        <p>Dispensed: {selectedBatch?.quantity_received - selectedBatch?.quantity_available}</p>
      </div>

      {/* Pricing */}
      <div>
        <h4>Pricing</h4>
        <p>Cost: KES {selectedBatch?.cost_price}</p>
        <p>Selling: KES {selectedBatch?.selling_price}</p>
        <p>Value: KES {(selectedBatch?.quantity_available * selectedBatch?.cost_price).toFixed(2)}</p>
      </div>

      {/* Metadata */}
      <p>Received By: {selectedBatch?.received_by_name || 'Admin User'}</p>
      {selectedBatch?.barcode && <p>Barcode: {selectedBatch.barcode}</p>}
    </div>
  </DialogContent>
</Dialog>
```

---

### Category 5: Stock Adjustment Actions Missing (5 failures)

**Root Cause:** Batch rows missing action menu with adjustment options

| Test | Expected Action |
|------|-----------------|
| should have adjust stock action for batch | "Adjust" menu item |
| should have mark expired action | "Mark Expired" menu item |
| should have mark damaged action | "Mark Damaged" menu item |
| should have quarantine action | "Quarantine" menu item |
| should open adjustment form when clicking adjust | Form/dialog opens |

**Resolution:**

```tsx
// Add actions dropdown to each batch row:
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

<TableCell>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" aria-label="Actions">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={() => openAdjustmentForm(batch)}>
        Adjust Stock
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => markExpired(batch)}>
        Mark Expired
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => markDamaged(batch)}>
        Mark Damaged
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => quarantine(batch)}>
        Quarantine
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</TableCell>
```

---

### Category 6: Expiring Stock Visual Indicators (2 failures)

**Root Cause:** Rows for expiring batches missing warning CSS classes

| Test | Expected Behavior |
|------|-------------------|
| should highlight batches expiring within 30 days | Row has `warning` or `expiring` class |
| should have filter for expiring stock | Filter button/checkbox visible |

**Resolution:**

```tsx
// 1. Add conditional class to expiring rows:
const isExpiringSoon = (expiryDate: string) => {
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return days <= 30 && days > 0;
};

<TableRow 
  className={cn(
    "border-b transition-colors",
    isExpiringSoon(batch.expiry_date) && "warning bg-yellow-50",
    batch.status === 'EXPIRED' && "bg-red-50"
  )}
>

// 2. Add expiring soon filter:
<Button 
  variant={showExpiringSoon ? "default" : "outline"}
  onClick={() => setShowExpiringSoon(!showExpiringSoon)}
  data-testid="expiring-filter"
>
  Expiring Soon
</Button>
```

---

### Category 7: Location Tracking Features (3 failures)

**Root Cause:** Location features incomplete - strict mode violation and missing filter

| Test | Issue |
|------|-------|
| should display storage location | Multiple elements found (strict mode violation) |
| should filter by location | Location filter dropdown not found |
| should edit batch location | Edit button not found in detail view |

**Resolution:**

```tsx
// 1. Fix strict mode violation - use .first() or be more specific:
// Test should use: page.getByText('Shelf A1').first()
// Or add unique identifiers to cells

// 2. Add location filter:
<Select onValueChange={setLocationFilter} data-testid="location-filter">
  <SelectTrigger aria-label="Location">
    <SelectValue placeholder="Filter by location" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Locations</SelectItem>
    <SelectItem value="Shelf A1">Shelf A1</SelectItem>
    <SelectItem value="Shelf B2">Shelf B2</SelectItem>
  </SelectContent>
</Select>

// 3. Add edit button to batch detail view:
<Button variant="outline" onClick={() => setIsEditing(true)}>
  Edit
</Button>
```

---

## Priority Implementation Plan

### 🔴 High Priority (Blocks core functionality)

1. **Receive Stock Form** - Complete form with all required fields
2. **Batch Details Dialog** - Enable viewing batch information
3. **Stock Adjustment Actions** - Add action menu to batch rows

### 🟡 Medium Priority (Improves UX)

4. **Filter Functionality** - Status and drug filters working
5. **Missing Display Columns** - Days to expiry, supplier, selling price

### 🟢 Low Priority (Enhancements)

6. **Expiring Stock Warnings** - Visual indicators and filters
7. **Location Tracking** - Filter and edit location features

---

## Implementation Checklist

- [ ] Add missing columns to StockTable (days to expiry, supplier, selling price)
- [ ] Implement status filter onChange handler
- [ ] Add drug filter dropdown
- [ ] Create/complete ReceiveStockForm with all labeled fields
- [ ] Add form validation (expiry date in future, duplicate batch check)
- [ ] Create BatchDetailDialog component
- [ ] Add row click handler to open details
- [ ] Add actions dropdown menu to each row
- [ ] Implement adjustment, expired, damaged, quarantine actions
- [ ] Add warning CSS classes to expiring rows
- [ ] Add "Expiring Soon" filter button
- [ ] Add location filter dropdown
- [ ] Add edit functionality to batch detail view

---

## Files Requiring Changes

| File | Changes Needed |
|------|----------------|
| `app/pharmacy/stock/page.tsx` | Add missing columns, filters, click handlers |
| `app/pharmacy/stock/receive/page.tsx` | Create/update receive stock form |
| `components/pharmacy/StockTable.tsx` | Add actions dropdown, row highlighting |
| `components/pharmacy/BatchDetailDialog.tsx` | Create new component |
| `components/pharmacy/StockAdjustmentForm.tsx` | Create for adjustment actions |

---

## Estimated Effort

| Category | Tests | Est. Hours |
|----------|-------|------------|
| Missing Display Elements | 3 | 1-2 |
| Filter Functionality | 3 | 2-3 |
| Receive Stock Form | 13 | 4-6 |
| Batch Details View | 6 | 2-3 |
| Stock Adjustment Actions | 5 | 3-4 |
| Expiring Stock Warnings | 2 | 1-2 |
| Location Tracking | 3 | 2-3 |
| **Total** | **36** | **15-23 hours** |

---

*Report generated from Playwright test run on January 9, 2026*
