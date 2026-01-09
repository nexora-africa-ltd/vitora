/**
 * Pharmacy Reports E2E Tests
 * 
 * End-to-end tests for pharmacy reporting functionality.
 * Tests should identify missing UI implementations.
 * 
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Backend API Endpoints Tested:
 * - GET /api/pharmacy/reports/stock-summary/ - Current inventory levels by drug
 * - GET /api/pharmacy/reports/expiry-report/?days=90 - Batches expiring soon
 * - GET /api/pharmacy/reports/dispensing/?start_date=&end_date= - Dispensing history
 * - GET /api/pharmacy/reports/movement/?start_date=&end_date= - All stock movements
 */
import { test, expect } from '@playwright/test';
import {
  setupPharmacyMocks,
  loginAndGoToPharmacy,
  mockStockSummaryReport,
  mockExpiryReport,
  mockDispensingReport,
  mockStockMovementReport,
} from './fixtures';

// =============================================================================
// REPORTS - NAVIGATION
// =============================================================================

test.describe('Pharmacy Reports - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
  });

  test('should have reports section in pharmacy', async ({ page }) => {
    // Reports link/section in pharmacy module
    const reportsLink = page.getByRole('link', { name: /reports/i }).or(
      page.getByRole('button', { name: /reports/i })
    ).or(
      page.getByTestId('pharmacy-reports')
    );
    
    await expect(reportsLink).toBeVisible();
  });

  test('should navigate to pharmacy reports page', async ({ page }) => {
    await page.getByRole('link', { name: /reports/i }).first().click();
    
    // Should be on reports page
    await expect(page.getByText(/pharmacy.reports|inventory.reports/i)).toBeVisible();
  });

  test('should show available report types', async ({ page }) => {
    await page.goto('/pharmacy/reports');
    
    // Report type options
    await expect(page.getByText(/stock.summary/i)).toBeVisible();
    await expect(page.getByText(/expiry.report/i)).toBeVisible();
    await expect(page.getByText(/dispensing.report/i)).toBeVisible();
    await expect(page.getByText(/stock.movement/i)).toBeVisible();
  });
});

// =============================================================================
// REPORTS - STOCK SUMMARY
// =============================================================================

test.describe('Pharmacy Reports - Stock Summary', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await page.goto('/login');
    await page.getByLabel(/username/i).fill('testuser');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    await page.goto('/pharmacy/reports');
  });

  test('should access stock summary report', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).or(
      page.getByRole('link', { name: /stock.summary/i })
    ).click();
    
    await expect(page.getByText(/stock.summary.report|current.inventory/i)).toBeVisible();
  });

  test('should display drug list with stock levels', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    
    // Drug names and stock
    await expect(page.getByText(/paracetamol/i)).toBeVisible();
    await expect(page.getByText(/500/)).toBeVisible(); // Total quantity
  });

  test('should show reorder level for each drug', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    
    await expect(page.getByText(/reorder.level|min.stock/i)).toBeVisible();
    await expect(page.getByText('100')).toBeVisible();
  });

  test('should highlight drugs below reorder level', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    
    // Drugs below reorder should be highlighted
    const lowStockRow = page.locator('tr').filter({ hasText: /metformin/i });
    await expect(lowStockRow).toHaveClass(/warning|low.stock|below.reorder/i);
  });

  test('should show batch breakdown per drug', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    
    // Expandable batch details
    await page.getByText(/paracetamol/i).click();
    
    await expect(page.getByText('BATCH-2026-001')).toBeVisible();
    await expect(page.getByText('BATCH-2025-010')).toBeVisible();
  });

  test('should show batch expiry dates in summary', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    await page.getByText(/paracetamol/i).click();
    
    await expect(page.getByText(/2028-06-01/)).toBeVisible();
    await expect(page.getByText(/2026-02-15/)).toBeVisible();
  });

  test('should show days to expiry for batches', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    await page.getByText(/paracetamol/i).click();
    
    await expect(page.getByText(/880.*days|37.*days/i)).toBeVisible();
  });

  test('should have export to CSV option', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    
    const exportButton = page.getByRole('button', { name: /export|csv|download/i });
    await expect(exportButton).toBeVisible();
  });

  test('should have print option', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    
    const printButton = page.getByRole('button', { name: /print/i });
    await expect(printButton).toBeVisible();
  });

  test('should filter by category', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    
    const categoryFilter = page.getByLabel(/category/i).or(
      page.getByTestId('category-filter')
    );
    await expect(categoryFilter).toBeVisible();
  });

  test('should filter to show only below reorder', async ({ page }) => {
    await page.getByRole('button', { name: /stock.summary/i }).click();
    
    const belowReorderFilter = page.getByRole('checkbox', { name: /below.reorder|low.stock/i }).or(
      page.getByTestId('low-stock-only')
    );
    await expect(belowReorderFilter).toBeVisible();
  });
});

// =============================================================================
// REPORTS - EXPIRY REPORT
// =============================================================================

test.describe('Pharmacy Reports - Expiry Report', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await page.goto('/login');
    await page.getByLabel(/username/i).fill('testuser');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    await page.goto('/pharmacy/reports');
  });

  test('should access expiry report', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).or(
      page.getByRole('link', { name: /expiry/i })
    ).click();
    
    await expect(page.getByText(/expiry.report|expiring.batches/i)).toBeVisible();
  });

  test('should have days threshold selector', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    // Select days (30, 60, 90, etc.)
    const daysSelector = page.getByLabel(/days/i).or(
      page.getByRole('combobox', { name: /days/i })
    );
    await expect(daysSelector).toBeVisible();
  });

  test('should default to 90 days', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    // 90 days should be default
    await expect(page.getByText(/90.days|within.90/i)).toBeVisible();
  });

  test('should display expiring batches', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    // Batches expiring within threshold
    await expect(page.getByText('BATCH-2025-010')).toBeVisible();
  });

  test('should show drug name for expiring batch', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    await expect(page.getByText(/paracetamol/i)).toBeVisible();
  });

  test('should show expiry date', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    await expect(page.getByText('2026-02-15')).toBeVisible();
  });

  test('should show days to expiry', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    await expect(page.getByText(/37.*days|days.*37/i)).toBeVisible();
  });

  test('should show quantity available in expiring batch', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    await expect(page.getByText('50')).toBeVisible();
  });

  test('should color-code by urgency', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    // Critical (<30 days) should be red
    // Warning (30-60 days) should be yellow/orange
    const urgentBatch = page.locator('tr').filter({ hasText: '37' });
    await expect(urgentBatch).toHaveClass(/warning|urgent/i);
  });

  test('should have action to mark batch for disposal', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    const disposeButton = page.getByRole('button', { name: /dispose|mark.expired/i }).first();
    await expect(disposeButton).toBeVisible();
  });

  test('should have action to transfer/return to supplier', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    const returnButton = page.getByRole('button', { name: /return|transfer/i }).first();
    await expect(returnButton).toBeVisible();
  });

  test('should export expiry report', async ({ page }) => {
    await page.getByRole('button', { name: /expiry.report/i }).click();
    
    const exportButton = page.getByRole('button', { name: /export|csv/i });
    await expect(exportButton).toBeVisible();
  });
});

// =============================================================================
// REPORTS - DISPENSING REPORT
// =============================================================================

test.describe('Pharmacy Reports - Dispensing Report', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await page.goto('/login');
    await page.getByLabel(/username/i).fill('testuser');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    await page.goto('/pharmacy/reports');
  });

  test('should access dispensing report', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).or(
      page.getByRole('link', { name: /dispensing/i })
    ).click();
    
    await expect(page.getByText(/dispensing.report|dispensing.history/i)).toBeVisible();
  });

  test('should have date range selector', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    await expect(page.getByLabel(/from|start.date/i)).toBeVisible();
    await expect(page.getByLabel(/to|end.date/i)).toBeVisible();
  });

  test('should have quick date presets', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    // Today, This Week, This Month, etc.
    await expect(page.getByRole('button', { name: /today/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /this.week|week/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /this.month|month/i })).toBeVisible();
  });

  test('should display dispensing records', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    await expect(page.getByText(/paracetamol/i)).toBeVisible();
    await expect(page.getByText('Jane Doe')).toBeVisible();
  });

  test('should show quantity dispensed', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    await expect(page.getByText('30')).toBeVisible();
  });

  test('should show dispensing date', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    await expect(page.getByText(/2026-01-09/)).toBeVisible();
  });

  test('should show dispensed by user', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    await expect(page.getByText(/pharmacist.user/i)).toBeVisible();
  });

  test('should show batch number', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    await expect(page.getByText('BATCH-2026-001')).toBeVisible();
  });

  test('should show total cost', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    await expect(page.getByText(/150\.00/)).toBeVisible();
  });

  test('should show summary totals', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    // Summary section
    await expect(page.getByText(/total.dispensed|total.value/i)).toBeVisible();
  });

  test('should filter by drug', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    const drugFilter = page.getByLabel(/drug/i).or(page.getByTestId('drug-filter'));
    await expect(drugFilter).toBeVisible();
  });

  test('should filter by patient', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    const patientFilter = page.getByLabel(/patient/i).or(page.getByTestId('patient-filter'));
    await expect(patientFilter).toBeVisible();
  });

  test('should export dispensing report', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    const exportButton = page.getByRole('button', { name: /export|csv/i });
    await expect(exportButton).toBeVisible();
  });

  test('should group by drug option', async ({ page }) => {
    await page.getByRole('button', { name: /dispensing.report/i }).click();
    
    const groupByDrug = page.getByRole('radio', { name: /group.by.drug/i }).or(
      page.getByRole('checkbox', { name: /group.by.drug/i })
    );
    await expect(groupByDrug).toBeVisible();
  });
});

// =============================================================================
// REPORTS - STOCK MOVEMENT REPORT
// =============================================================================

test.describe('Pharmacy Reports - Stock Movement Report', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await page.goto('/login');
    await page.getByLabel(/username/i).fill('testuser');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    await page.goto('/pharmacy/reports');
  });

  test('should access stock movement report', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).or(
      page.getByRole('link', { name: /movement/i })
    ).click();
    
    await expect(page.getByText(/stock.movement.report|inventory.movement/i)).toBeVisible();
  });

  test('should have date range selector', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    await expect(page.getByLabel(/from|start.date/i)).toBeVisible();
    await expect(page.getByLabel(/to|end.date/i)).toBeVisible();
  });

  test('should display received stock entries', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    await expect(page.getByText(/received/i)).toBeVisible();
    await expect(page.getByText('500')).toBeVisible();
  });

  test('should display dispensed entries', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    await expect(page.getByText(/dispensed/i)).toBeVisible();
    await expect(page.getByText('-30').or(page.getByText('(30)'))).toBeVisible(); // Negative for outflow
  });

  test('should display adjustment entries', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    await expect(page.getByText(/adjusted|adjustment/i)).toBeVisible();
    await expect(page.getByText('-100').or(page.getByText('(100)'))).toBeVisible();
  });

  test('should show movement type', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    await expect(page.getByText(/received|dispensed|adjusted/i)).toBeVisible();
  });

  test('should show drug name', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    await expect(page.getByText(/paracetamol/i)).toBeVisible();
  });

  test('should show movement date', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    await expect(page.getByText(/2026-01-0/i).first()).toBeVisible();
  });

  test('should show reference information', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    await expect(page.getByText(/batch|dispensing|expired/i).first()).toBeVisible();
  });

  test('should show user who made movement', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    await expect(page.getByText(/admin.user|pharmacist.user/i).first()).toBeVisible();
  });

  test('should filter by movement type', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    const typeFilter = page.getByLabel(/type/i).or(page.getByTestId('movement-type-filter'));
    await expect(typeFilter).toBeVisible();
  });

  test('should filter by drug', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    const drugFilter = page.getByLabel(/drug/i).or(page.getByTestId('drug-filter'));
    await expect(drugFilter).toBeVisible();
  });

  test('should show net movement summary', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    // Summary of in vs out
    await expect(page.getByText(/total.in|received.total/i)).toBeVisible();
    await expect(page.getByText(/total.out|dispensed.total/i)).toBeVisible();
    await expect(page.getByText(/net.movement/i)).toBeVisible();
  });

  test('should export stock movement report', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    const exportButton = page.getByRole('button', { name: /export|csv/i });
    await expect(exportButton).toBeVisible();
  });

  test('should sort by date descending by default', async ({ page }) => {
    await page.getByRole('button', { name: /stock.movement/i }).click();
    
    // Most recent first
    const rows = page.locator('tbody tr');
    const firstRow = rows.first();
    
    // Latest date should be first
    await expect(firstRow).toBeVisible();
  });
});

// =============================================================================
// REPORTS - DASHBOARD WIDGETS
// =============================================================================

test.describe('Pharmacy Reports - Dashboard Widgets', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
  });

  test('should show stock level summary widget', async ({ page }) => {
    const stockWidget = page.locator('[data-testid="stock-summary-widget"]').or(
      page.locator('.stock-summary')
    );
    
    await expect(stockWidget).toBeVisible();
  });

  test('should show low stock count on dashboard', async ({ page }) => {
    await expect(page.getByText(/\d+.*low.stock|low.stock.*\d+/i)).toBeVisible();
  });

  test('should show expiring soon count on dashboard', async ({ page }) => {
    await expect(page.getByText(/\d+.*expiring|expiring.*\d+/i)).toBeVisible();
  });

  test('should show today dispensing count', async ({ page }) => {
    await expect(page.getByText(/today.*dispensed|\d+.*dispensed.today/i)).toBeVisible();
  });

  test('should show pending prescriptions count', async ({ page }) => {
    await expect(page.getByText(/\d+.*pending|pending.*\d+/i)).toBeVisible();
  });

  test('should link from widget to full report', async ({ page }) => {
    const viewReportLink = page.getByRole('link', { name: /view.report|see.all/i }).first();
    await expect(viewReportLink).toBeVisible();
  });
});
