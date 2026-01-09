/**
 * Inventory/Stock Batch E2E Tests
 * 
 * End-to-end tests for stock batch management and inventory control.
 * Tests should identify missing UI implementations.
 * 
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Backend API Endpoints Tested:
 * - GET /api/pharmacy/stock/ - List all stock batches
 * - GET /api/pharmacy/stock/{id}/ - Get batch details
 * - POST /api/pharmacy/stock/ - Receive new stock
 * - PATCH /api/pharmacy/stock/{id}/ - Update batch
 * - GET /api/pharmacy/stock/by_drug/?drug_id={id} - Get batches for specific drug
 */
import { test, expect } from '@playwright/test';
import {
  setupPharmacyMocks,
  loginAndGoToPharmacy,
  mockStockBatch,
  mockStockBatchesData,
} from './fixtures';

// =============================================================================
// INVENTORY - LIST VIEW
// =============================================================================

test.describe('Inventory - List View', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
  });

  test('should display inventory tab on pharmacy page', async ({ page }) => {
    const inventoryTab = page.getByRole('tab', { name: /inventory|stock/i });
    await expect(inventoryTab).toBeVisible();
  });

  test('should display stock batch list', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Wait for table to load
    await page.waitForSelector('[data-testid="stock-table"], table', { timeout: 10000 });

    // Verify batch information displayed
    await expect(page.getByText('BATCH-2026-001')).toBeVisible();
  });

  test('should display batch number column', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Batch numbers should be visible
    await expect(page.getByText('BATCH-2026-001')).toBeVisible();
    await expect(page.getByText('BATCH-2026-002')).toBeVisible();
  });

  test('should display drug name for each batch', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Drug names should be shown
    await expect(page.getByText(/paracetamol/i).first()).toBeVisible();
    await expect(page.getByText(/amoxicillin/i)).toBeVisible();
  });

  test('should display quantity available', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Available quantities
    await expect(page.getByText('450')).toBeVisible();
    await expect(page.getByText('200')).toBeVisible();
  });

  test('should display expiry date', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Expiry dates should be visible
    await expect(page.getByText(/2028-06-01|06\/2028|Jun.*2028/i)).toBeVisible();
  });

  test('should display days to expiry', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Days to expiry should be shown
    await expect(page.getByText(/880.*days|days.*880/i).or(page.getByText('880'))).toBeVisible();
  });

  test('should display batch status', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Status badges
    await expect(page.getByText(/available/i).first()).toBeVisible();
    await expect(page.getByText(/low/i)).toBeVisible();
    await expect(page.getByText(/expired/i)).toBeVisible();
  });

  test('should visually indicate low stock batches', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Low stock batch should have warning styling
    const lowStockRow = page.locator('tr').filter({ hasText: 'LOW' });
    await expect(lowStockRow).toBeVisible();
    
    // Should have warning color/badge
    await expect(lowStockRow.getByText(/low/i)).toHaveClass(/warning|yellow|orange/i);
  });

  test('should visually indicate expired batches', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Expired batch should have error styling
    const expiredRow = page.locator('tr').filter({ hasText: 'EXPIRED' });
    await expect(expiredRow).toBeVisible();
    
    // Should have error color/badge
    await expect(expiredRow.getByText(/expired/i)).toHaveClass(/error|red|destructive/i);
  });

  test('should display supplier information', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Supplier column
    await expect(page.getByText(/kenya.pharma/i)).toBeVisible();
  });

  test('should display selling price', async ({ page }) => {
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
    
    // Price information
    await expect(page.getByText(/5\.00|KES.5/i).first()).toBeVisible();
  });
});

// =============================================================================
// INVENTORY - FEFO ORDERING (First Expiry First Out)
// =============================================================================

test.describe('Inventory - FEFO Ordering', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
  });

  test('should order batches by expiry date (FEFO)', async ({ page }) => {
    // Default ordering should be by expiry date
    const rows = page.locator('tbody tr');
    
    // First batch should be the one expiring soonest (or expired)
    // BATCH-2025-005 is expired, should appear first or be filtered
    await expect(rows.first()).toBeVisible();
  });

  test('should have sort option for expiry date', async ({ page }) => {
    // Should be able to sort by expiry
    const expiryHeader = page.getByRole('columnheader', { name: /expiry/i });
    await expect(expiryHeader).toBeVisible();
    
    // Click to sort
    await expiryHeader.click();
  });
});

// =============================================================================
// INVENTORY - FILTER & SEARCH
// =============================================================================

test.describe('Inventory - Filter & Search', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
  });

  test('should filter batches by status', async ({ page }) => {
    const statusFilter = page.getByRole('combobox', { name: /status/i }).or(
      page.getByLabel(/status/i)
    ).or(
      page.getByTestId('status-filter')
    );
    
    await expect(statusFilter).toBeVisible();
  });

  test('should filter to show only available batches', async ({ page }) => {
    const statusFilter = page.getByRole('combobox', { name: /status/i }).first();
    await statusFilter.click();
    await page.getByRole('option', { name: /available/i }).click();
    
    // Should only show available batches
    await expect(page.getByText('BATCH-2026-001')).toBeVisible();
    await expect(page.getByText('EXPIRED')).not.toBeVisible();
  });

  test('should filter to show expired batches', async ({ page }) => {
    const statusFilter = page.getByRole('combobox', { name: /status/i }).first();
    await statusFilter.click();
    await page.getByRole('option', { name: /expired/i }).click();
    
    // Should only show expired batches
    await expect(page.getByText('BATCH-2025-005')).toBeVisible();
  });

  test('should filter batches by drug', async ({ page }) => {
    const drugFilter = page.getByRole('combobox', { name: /drug/i }).or(
      page.getByLabel(/drug/i)
    ).or(
      page.getByTestId('drug-filter')
    );
    
    await expect(drugFilter).toBeVisible();
  });

  test('should search batches by batch number', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search|find|batch/i).first();
    
    await searchInput.fill('BATCH-2026-001');
    await page.waitForTimeout(500);
    
    await expect(page.getByText('BATCH-2026-001')).toBeVisible();
  });
});

// =============================================================================
// INVENTORY - RECEIVE STOCK
// =============================================================================

test.describe('Inventory - Receive Stock', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
  });

  test('should have receive stock button', async ({ page }) => {
    const receiveButton = page.getByRole('button', { name: /receive|add.stock|new.batch/i }).or(
      page.getByTestId('receive-stock-button')
    );
    
    await expect(receiveButton).toBeVisible();
  });

  test('should open receive stock form', async ({ page }) => {
    const receiveButton = page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first();
    await receiveButton.click();
    
    // Should open form/dialog
    await expect(
      page.getByRole('dialog').or(
        page.getByRole('form')
      ).or(
        page.locator('[data-testid="stock-receive-form"]')
      )
    ).toBeVisible();
  });

  test('should have drug selection in receive form', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    // Drug selection field
    await expect(page.getByLabel(/drug/i)).toBeVisible();
  });

  test('should have batch number field', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    await expect(page.getByLabel(/batch.number/i)).toBeVisible();
  });

  test('should have quantity received field', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    await expect(page.getByLabel(/quantity/i)).toBeVisible();
  });

  test('should have expiry date field', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    await expect(page.getByLabel(/expiry/i)).toBeVisible();
  });

  test('should have manufacture date field', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    await expect(page.getByLabel(/manufacture/i)).toBeVisible();
  });

  test('should have cost price field', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    await expect(page.getByLabel(/cost.price/i)).toBeVisible();
  });

  test('should have selling price field', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    await expect(page.getByLabel(/selling.price/i)).toBeVisible();
  });

  test('should have supplier field', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    await expect(page.getByLabel(/supplier/i)).toBeVisible();
  });

  test('should have purchase order field', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    await expect(page.getByLabel(/purchase.order|po/i)).toBeVisible();
  });

  test('should have location/shelf field', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    await expect(page.getByLabel(/location|shelf/i)).toBeVisible();
  });

  test('should validate expiry date is in future', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    // Try to enter past expiry date
    await page.getByLabel(/expiry/i).fill('2025-01-01');
    await page.getByRole('button', { name: /save|receive|submit/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/expiry.*past|invalid.*date|future/i)).toBeVisible();
  });

  test('should receive stock with valid data', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    // Fill form
    await page.getByLabel(/drug/i).click();
    await page.getByRole('option', { name: /paracetamol/i }).click();
    
    await page.getByLabel(/batch.number/i).fill('BATCH-TEST-001');
    await page.getByLabel(/quantity/i).fill('100');
    await page.getByLabel(/expiry/i).fill('2028-12-31');
    await page.getByLabel(/cost.price/i).fill('3.00');
    await page.getByLabel(/selling.price/i).fill('5.00');
    
    // Submit
    await page.getByRole('button', { name: /save|receive|submit/i }).click();
    
    // Should show success
    await expect(page.getByText(/success|received|saved/i)).toBeVisible();
  });

  test('should prevent duplicate batch numbers for same drug', async ({ page }) => {
    await page.getByRole('button', { name: /receive|add.stock|new.batch/i }).first().click();
    
    // Try to create batch with existing number
    await page.getByLabel(/drug/i).click();
    await page.getByRole('option', { name: /paracetamol/i }).click();
    
    await page.getByLabel(/batch.number/i).fill('BATCH-2026-001'); // Already exists
    await page.getByLabel(/quantity/i).fill('100');
    await page.getByLabel(/expiry/i).fill('2028-12-31');
    
    await page.getByRole('button', { name: /save|receive|submit/i }).click();
    
    // Should show error about duplicate
    await expect(page.getByText(/duplicate|already.exists|unique/i)).toBeVisible();
  });
});

// =============================================================================
// INVENTORY - BATCH DETAILS
// =============================================================================

test.describe('Inventory - Batch Details', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
  });

  test('should click batch to view details', async ({ page }) => {
    await page.getByText('BATCH-2026-001').click();
    
    // Should show detail view/modal
    await expect(
      page.getByRole('dialog').or(
        page.locator('[data-testid="batch-detail"]')
      )
    ).toBeVisible();
  });

  test('should show all quantities in detail view', async ({ page }) => {
    await page.getByText('BATCH-2026-001').click();
    
    // Should show all quantity breakdowns
    await expect(page.getByText(/received.*500|500.*received/i)).toBeVisible();
    await expect(page.getByText(/available.*450|450.*available/i)).toBeVisible();
    await expect(page.getByText(/dispensed.*50|50.*dispensed/i)).toBeVisible();
  });

  test('should show pricing information', async ({ page }) => {
    await page.getByText('BATCH-2026-001').click();
    
    // Cost and selling price
    await expect(page.getByText(/cost.*3\.00|3\.00.*cost/i)).toBeVisible();
    await expect(page.getByText(/selling.*5\.00|5\.00.*selling/i)).toBeVisible();
  });

  test('should show batch value calculation', async ({ page }) => {
    await page.getByText('BATCH-2026-001').click();
    
    // Value = quantity_available × cost_price = 450 × 3 = 1350
    await expect(page.getByText(/value|worth/i)).toBeVisible();
  });

  test('should show received by user', async ({ page }) => {
    await page.getByText('BATCH-2026-001').click();
    
    await expect(page.getByText(/received.by|admin.user/i)).toBeVisible();
  });

  test('should show barcode if available', async ({ page }) => {
    await page.getByText('BATCH-2026-001').click();
    
    // Barcode field
    await expect(page.getByText(/barcode|1234567890123/i)).toBeVisible();
  });
});

// =============================================================================
// INVENTORY - STOCK ADJUSTMENT (Link to Adjustments)
// =============================================================================

test.describe('Inventory - Stock Adjustment Actions', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
  });

  test('should have adjust stock action for batch', async ({ page }) => {
    // Open batch actions
    const batchRow = page.locator('tr').filter({ hasText: 'BATCH-2026-001' });
    await batchRow.getByRole('button', { name: /more|actions|menu/i }).click();
    
    // Should have adjustment option
    await expect(page.getByRole('menuitem', { name: /adjust|adjustment/i })).toBeVisible();
  });

  test('should have mark expired action', async ({ page }) => {
    const batchRow = page.locator('tr').filter({ hasText: 'BATCH-2026-001' });
    await batchRow.getByRole('button', { name: /more|actions|menu/i }).click();
    
    await expect(page.getByRole('menuitem', { name: /expired|mark.expired/i })).toBeVisible();
  });

  test('should have mark damaged action', async ({ page }) => {
    const batchRow = page.locator('tr').filter({ hasText: 'BATCH-2026-001' });
    await batchRow.getByRole('button', { name: /more|actions|menu/i }).click();
    
    await expect(page.getByRole('menuitem', { name: /damage|mark.damaged/i })).toBeVisible();
  });

  test('should have quarantine action', async ({ page }) => {
    const batchRow = page.locator('tr').filter({ hasText: 'BATCH-2026-001' });
    await batchRow.getByRole('button', { name: /more|actions|menu/i }).click();
    
    await expect(page.getByRole('menuitem', { name: /quarantine/i })).toBeVisible();
  });

  test('should open adjustment form when clicking adjust', async ({ page }) => {
    const batchRow = page.locator('tr').filter({ hasText: 'BATCH-2026-001' });
    await batchRow.getByRole('button', { name: /more|actions|menu/i }).click();
    await page.getByRole('menuitem', { name: /adjust|adjustment/i }).click();
    
    // Should open adjustment form
    await expect(
      page.getByRole('dialog').or(
        page.locator('[data-testid="adjustment-form"]')
      )
    ).toBeVisible();
  });
});

// =============================================================================
// INVENTORY - EXPIRING STOCK HIGHLIGHT
// =============================================================================

test.describe('Inventory - Expiring Stock Warnings', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
  });

  test('should highlight batches expiring within 30 days', async ({ page }) => {
    // BATCH-2025-010 expires in 37 days
    const expiringRow = page.locator('tr').filter({ hasText: 'BATCH-2025-010' });
    
    // Should have warning indicator
    await expect(expiringRow).toHaveClass(/warning|expiring/i);
  });

  test('should show expiry warning badge', async ({ page }) => {
    const expiringRow = page.locator('tr').filter({ hasText: 'BATCH-2025-010' });
    
    // Should show "expiring soon" or similar badge
    await expect(
      expiringRow.getByText(/expiring|37.days/i).or(
        expiringRow.locator('[data-testid="expiry-warning"]')
      )
    ).toBeVisible();
  });

  test('should have filter for expiring stock', async ({ page }) => {
    const expiringSoonFilter = page.getByRole('button', { name: /expiring.soon/i }).or(
      page.getByRole('checkbox', { name: /expiring/i })
    ).or(
      page.getByTestId('expiring-filter')
    );
    
    await expect(expiringSoonFilter).toBeVisible();
  });
});

// =============================================================================
// INVENTORY - BATCH LOCATION TRACKING
// =============================================================================

test.describe('Inventory - Location Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /inventory|stock/i }).click();
  });

  test('should display storage location', async ({ page }) => {
    // Location column showing shelf/storage location
    await expect(page.getByText('Shelf A1')).toBeVisible();
  });

  test('should filter by location', async ({ page }) => {
    const locationFilter = page.getByRole('combobox', { name: /location/i }).or(
      page.getByLabel(/location/i)
    ).or(
      page.getByTestId('location-filter')
    );
    
    await expect(locationFilter).toBeVisible();
  });

  test('should edit batch location', async ({ page }) => {
    await page.getByText('BATCH-2026-001').click();
    await page.getByRole('button', { name: /edit/i }).click();
    
    const locationField = page.getByLabel(/location|shelf/i);
    await expect(locationField).toBeVisible();
    
    await locationField.fill('Shelf B2');
    await page.getByRole('button', { name: /save|update/i }).click();
    
    await expect(page.getByText(/success|updated/i)).toBeVisible();
  });
});
