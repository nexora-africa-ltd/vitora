# Pharmacy Module E2E Test Report

**Date**: January 9, 2026
**Sprint**: 1.3-1.4 Track A
**Test File**: `e2e/pharmacy/drugs.spec.ts`
**Browser**: Chromium
**Duration**: 2.2 minutes

---

## Summary

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Passed | 8 | 19% |
| ❌ Failed | 34 | 81% |
| **Total** | 42 | 100% |

> **Note**: These are RED-phase TDD tests. Failures indicate missing UI features that need implementation, not bugs.

---

## Passing Tests ✅

These tests confirm the foundational pharmacy UI is working:

| Test | Description |
|------|-------------|
| `should display pharmacy page with tabs` | Pharmacy page loads with tab navigation |
| `should display drugs tab` | Drugs tab exists and is clickable |
| `should display drug list` | Drug table renders with API data |
| `should display drug code column` | Drug codes (DRG-001, etc.) visible |
| `should display generic name column` | Generic names (Paracetamol, etc.) visible |
| `should display form column` | Drug forms (tablet, capsule) visible |
| `should display strength column` | Drug strengths (500mg, etc.) visible |
| `should display stock quantity column` | Stock quantities displayed |

---

## Failed Tests by Category

### Category 1: Missing Filter Components (6 tests)

**Root Cause**: The drugs list page lacks filter dropdowns and checkboxes for refining the drug catalog.

| Test | Missing Element |
|------|-----------------|
| `should filter drugs by category` | Category dropdown filter |
| `should filter drugs by form` | Form dropdown filter |
| `should filter drugs by schedule` | Schedule dropdown filter |
| `should filter to show only essential medicines` | KEML/Essential checkbox |
| `should filter to show only active drugs` | Active status checkbox |
| `should have search input for drugs` | Search input field |

**Resolution**:

```tsx
// Add to pharmacy/drugs page
<div className="flex gap-4 mb-4">
  <Input
    placeholder="Search drugs..."
    data-testid="drug-search"
  />
  <Select data-testid="category-filter">
    <SelectTrigger>
      <SelectValue placeholder="Category" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="analgesics">Analgesics</SelectItem>
      <SelectItem value="antibiotics">Antibiotics</SelectItem>
      {/* ... */}
    </SelectContent>
  </Select>
  <Select data-testid="form-filter">
    <SelectTrigger>
      <SelectValue placeholder="Form" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="tablet">Tablet</SelectItem>
      <SelectItem value="capsule">Capsule</SelectItem>
      {/* ... */}
    </SelectContent>
  </Select>
  <Select data-testid="schedule-filter">
    <SelectTrigger>
      <SelectValue placeholder="Schedule" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="OTC">OTC</SelectItem>
      <SelectItem value="POM">POM</SelectItem>
      <SelectItem value="P">P</SelectItem>
      <SelectItem value="CD">CD</SelectItem>
    </SelectContent>
  </Select>
  <Checkbox id="essential" data-testid="essential-filter" />
  <Label htmlFor="essential">Essential (KEML)</Label>
  <Checkbox id="active" data-testid="active-filter" />
  <Label htmlFor="active">Active Only</Label>
</div>
```

**Files to Create/Modify**:
- `app/pharmacy/drugs/components/drug-filters.tsx` (new)
- `app/pharmacy/drugs/page.tsx` (integrate filters)

---

### Category 2: Missing Drug Status Indicators (3 tests)

**Root Cause**: The drug table doesn't show visual badges for out-of-stock, essential medicines (KEML), or controlled drugs.

| Test | Missing Element |
|------|-----------------|
| `should indicate out-of-stock drugs` | Out-of-stock badge/warning |
| `should indicate essential medicines (KEML)` | KEML badge |
| `should indicate controlled drugs` | Controlled drug indicator |

**Resolution**:

```tsx
// In drug table row component
<TableCell>
  {drug.stock_quantity === 0 && (
    <Badge variant="destructive">Out of Stock</Badge>
  )}
  {drug.is_essential && (
    <Badge variant="secondary" className="bg-green-100">KEML</Badge>
  )}
  {drug.is_controlled && (
    <Badge variant="outline" className="border-red-500">CD</Badge>
  )}
</TableCell>
```

**Files to Modify**:
- `app/pharmacy/drugs/components/drug-table.tsx`

---

### Category 3: Missing Pagination (2 tests)

**Root Cause**: The drug list doesn't have pagination controls or item count display.

| Test | Missing Element |
|------|-----------------|
| `should display pagination controls` | Pagination component |
| `should show total drug count` | "Showing X of Y" text |

**Resolution**:

```tsx
// Add pagination component
<div className="flex items-center justify-between">
  <p>Showing {startIndex}-{endIndex} of {totalCount} drugs</p>
  <Pagination data-testid="pagination">
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink>1</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationNext />
      </PaginationItem>
    </PaginationContent>
  </Pagination>
</div>
```

**Files to Create/Modify**:
- `app/pharmacy/drugs/components/drug-pagination.tsx` (new)
- `app/pharmacy/drugs/page.tsx` (integrate pagination)

---

### Category 4: Missing Drug Create Form (10 tests)

**Root Cause**: The `/pharmacy/drugs/new` page either doesn't exist or lacks the required form fields.

| Test | Missing Element |
|------|-----------------|
| `should open drug creation form/dialog` | Drug form component |
| `should have required fields in drug form` | Generic name, code, strength, unit, form, category |
| `should have drug schedule selection` | Schedule dropdown (OTC/POM/P/CD) |
| `should have KEML fields for Kenya compliance` | KEML code field, Essential checkbox |
| `should have NHIF code field` | NHIF/SHA code field |
| `should have inventory settings fields` | Reorder level, reorder quantity |
| `should have brand names input (multiple)` | Brand names multi-input |
| `should have controlled drug checkbox` | Controlled substance checkbox |
| `should create drug with valid data` | Form submission working |
| `should validate required fields` | Validation messages |

**Resolution**:

Create a comprehensive drug form:

```tsx
// app/pharmacy/drugs/new/page.tsx
export default function NewDrugPage() {
  return (
    <form data-testid="drug-form">
      {/* Basic Info */}
      <Input label="Generic Name" name="generic_name" required />
      <Input label="Drug Code" name="code" required />
      <Input label="Strength" name="strength" required />
      <Input label="Unit" name="unit" required />

      <Select name="form" label="Form">
        <SelectItem value="tablet">Tablet</SelectItem>
        <SelectItem value="capsule">Capsule</SelectItem>
        <SelectItem value="syrup">Syrup</SelectItem>
        {/* ... */}
      </Select>

      <Select name="category" label="Category">
        <SelectItem value="analgesics">Analgesics</SelectItem>
        <SelectItem value="antibiotics">Antibiotics</SelectItem>
        {/* ... */}
      </Select>

      <Select name="schedule" label="Schedule">
        <SelectItem value="OTC">OTC - Over The Counter</SelectItem>
        <SelectItem value="POM">POM - Prescription Only</SelectItem>
        <SelectItem value="P">P - Pharmacy Only</SelectItem>
        <SelectItem value="CD">CD - Controlled Drug</SelectItem>
      </Select>

      {/* Kenya Compliance */}
      <Input label="KEML Code" name="keml_code" />
      <Checkbox name="is_essential" label="Essential Medicine (KEML)" />
      <Input label="NHIF/SHA Code" name="nhif_code" />

      {/* Inventory Settings */}
      <Input label="Reorder Level" name="reorder_level" type="number" />
      <Input label="Reorder Quantity" name="reorder_quantity" type="number" />

      {/* Additional */}
      <MultiInput label="Brand Names" name="brand_names" />
      <Checkbox name="is_controlled" label="Controlled Substance" />
      <Textarea label="Storage Requirements" name="storage_requirements" />

      <Button type="submit">Create Drug</Button>
    </form>
  );
}
```

**Files to Create**:
- `app/pharmacy/drugs/new/page.tsx`
- `app/pharmacy/drugs/components/drug-form.tsx`

---

### Category 5: Missing Drug Detail View (6 tests)

**Root Cause**: Clicking on a drug doesn't open a detail view/dialog with full drug information.

| Test | Missing Element |
|------|-----------------|
| `should be able to click on drug to view details` | Click handler + detail dialog |
| `should display drug detail information` | Full drug info display |
| `should show current stock in detail view` | Stock quantity in detail |
| `should show storage requirements` | Storage info section |
| `should have edit button in detail view` | Edit action button |
| `should have link to view stock batches` | Navigate to inventory tab |

**Resolution**:

```tsx
// app/pharmacy/drugs/components/drug-detail-dialog.tsx
export function DrugDetailDialog({ drug, open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="drug-detail">
        <DialogHeader>
          <DialogTitle>Drug Details</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label>Generic Name</Label>
            <p>{drug.generic_name}</p>
          </div>
          <div>
            <Label>Code</Label>
            <p>{drug.code}</p>
          </div>
          <div>
            <Label>Strength</Label>
            <p>{drug.strength}</p>
          </div>
          <div>
            <Label>Brand Names</Label>
            <p>{drug.brand_names?.join(', ')}</p>
          </div>
          <div>
            <Label>Current Stock</Label>
            <p data-testid="drug-stock">{drug.stock_quantity} {drug.unit}s</p>
          </div>
          <div>
            <Label>Storage Requirements</Label>
            <p>{drug.storage_requirements || 'Standard storage'}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" asChild>
            <Link href={`/pharmacy/inventory?drug=${drug.id}`}>
              View Batches
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/pharmacy/drugs/${drug.id}/edit`}>
              Edit
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Files to Create**:
- `app/pharmacy/drugs/components/drug-detail-dialog.tsx`
- `app/pharmacy/drugs/[id]/page.tsx`

---

### Category 6: Missing Edit/Delete Actions (7 tests)

**Root Cause**: Drug table rows lack action buttons for editing and deleting drugs.

| Test | Missing Element |
|------|-----------------|
| `should have edit action in drug row` | Edit button in row |
| `should open edit form with pre-filled data` | Pre-filled edit form |
| `should save edited drug` | PUT/PATCH API call |
| `should have delete action` | Delete button in row |
| `should show confirmation before delete` | Delete confirmation dialog |
| `should not allow deleting drugs with stock` | Validation preventing delete |

**Resolution**:

```tsx
// In drug table row
<TableCell>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={() => onEdit(drug)}>
        <Pencil className="mr-2 h-4 w-4" />
        Edit
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onDelete(drug)}
        className="text-destructive"
        data-testid="delete-drug"
      >
        <Trash className="mr-2 h-4 w-4" />
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</TableCell>

// Delete confirmation dialog
<AlertDialog open={deleteDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Drug?</AlertDialogTitle>
      <AlertDialogDescription>
        {drugToDelete?.stock_quantity > 0
          ? "Cannot delete drug with existing stock. Please adjust inventory first."
          : "This action cannot be undone."}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        disabled={drugToDelete?.stock_quantity > 0}
        onClick={confirmDelete}
      >
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Files to Modify**:
- `app/pharmacy/drugs/components/drug-table.tsx`
- `app/pharmacy/drugs/[id]/edit/page.tsx` (new)

---

## Implementation Priority

| Priority | Category | Effort | Business Value |
|----------|----------|--------|----------------|
| 🔴 High | Drug Create Form | Medium | Core functionality |
| 🔴 High | Drug Status Indicators | Low | Kenya compliance (KEML) |
| 🟡 Medium | Filter Components | Medium | Usability |
| 🟡 Medium | Edit/Delete Actions | Medium | CRUD operations |
| 🟢 Low | Drug Detail View | Low | Nice to have |
| 🟢 Low | Pagination | Low | Scalability |

---

## Recommended Implementation Order

### Phase 1: Core Drug Management (Days 1-2)
1. Create drug form with all required fields
2. Add Kenya compliance fields (KEML, NHIF)
3. Add status indicators to drug table
4. Implement create drug API integration

### Phase 2: CRUD Operations (Days 3-4)
5. Add row action menu (edit/delete)
6. Create edit form with pre-filled data
7. Implement delete with confirmation
8. Add validation for deleting drugs with stock

### Phase 3: Enhanced UX (Days 5-6)
9. Add filter components
10. Implement search functionality
11. Add pagination
12. Create drug detail dialog

---

## Files to Create

| File Path | Description |
|-----------|-------------|
| `app/pharmacy/drugs/new/page.tsx` | Create drug page |
| `app/pharmacy/drugs/[id]/page.tsx` | Drug detail page |
| `app/pharmacy/drugs/[id]/edit/page.tsx` | Edit drug page |
| `app/pharmacy/drugs/components/drug-form.tsx` | Reusable drug form |
| `app/pharmacy/drugs/components/drug-filters.tsx` | Filter controls |
| `app/pharmacy/drugs/components/drug-detail-dialog.tsx` | Detail popup |
| `app/pharmacy/drugs/components/drug-pagination.tsx` | Pagination |

---

## Re-running Tests

After implementing fixes:

```bash
# Run only drug catalog tests
npx playwright test e2e/pharmacy/drugs.spec.ts --project=chromium

# Run with UI mode for debugging
npx playwright test e2e/pharmacy/drugs.spec.ts --project=chromium --ui

# Run specific test
npx playwright test e2e/pharmacy/drugs.spec.ts -g "should filter drugs by category" --project=chromium
```

---

## Appendix: Test File Reference

- **Test Location**: `web-app/e2e/pharmacy/drugs.spec.ts`
- **Fixtures**: `web-app/e2e/pharmacy/fixtures.ts`
- **API Mocks**: Defined in fixtures for `/api/pharmacy/drugs/`
