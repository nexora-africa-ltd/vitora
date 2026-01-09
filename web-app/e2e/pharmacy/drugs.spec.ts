/**
 * Drug Catalog E2E Tests
 * 
 * End-to-end tests for drug catalog management.
 * Tests should identify missing UI implementations.
 * 
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Backend API Endpoints Tested:
 * - GET /api/pharmacy/drugs/ - List drugs with search and filtering
 * - GET /api/pharmacy/drugs/{id}/ - Get drug details
 * - POST /api/pharmacy/drugs/ - Create drug
 * - PATCH /api/pharmacy/drugs/{id}/ - Update drug
 * - DELETE /api/pharmacy/drugs/{id}/ - Delete drug
 */
import { test, expect } from '@playwright/test';
import {
  setupPharmacyMocks,
  loginAndGoToPharmacy,
  mockDrug,
  mockDrugsData,
} from './fixtures';

// =============================================================================
// DRUG CATALOG - LIST VIEW
// =============================================================================

test.describe('Drug Catalog - List View', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
  });

  test('should display drugs tab on pharmacy page', async ({ page }) => {
    // Verify drugs tab exists and is accessible
    const drugsTab = page.getByRole('tab', { name: /drugs/i });
    await expect(drugsTab).toBeVisible();
  });

  test('should display drug list with essential columns', async ({ page }) => {
    // Click drugs tab if not already active
    await page.getByRole('tab', { name: /drugs/i }).click();
    
    // Wait for drug table to load
    await page.waitForSelector('[data-testid="drug-table"], table', { timeout: 10000 });

    // Verify essential drug information is displayed
    // These tests will FAIL if the UI doesn't show these columns
    await expect(page.getByText('Paracetamol')).toBeVisible();
    await expect(page.getByText('DRG-001')).toBeVisible();
    await expect(page.getByText('500mg')).toBeVisible();
    await expect(page.getByText(/tablet/i)).toBeVisible();
  });

  test('should display drug categories', async ({ page }) => {
    await page.getByRole('tab', { name: /drugs/i }).click();
    
    // Should show drug categories
    await expect(page.getByText(/analgesic/i)).toBeVisible();
    await expect(page.getByText(/antibiotic/i)).toBeVisible();
  });

  test('should display drug schedules (OTC, POM, P, CD)', async ({ page }) => {
    await page.getByRole('tab', { name: /drugs/i }).click();
    
    // Should show schedule badges/labels
    // OTC = Over The Counter, POM = Prescription Only Medicine, CD = Controlled Drug
    await expect(page.getByText('OTC').or(page.getByText(/over.the.counter/i))).toBeVisible();
  });

  test('should display current stock levels', async ({ page }) => {
    await page.getByRole('tab', { name: /drugs/i }).click();
    
    // Stock column should show current quantities
    // Will FAIL if stock level display not implemented
    await expect(page.getByText('450').or(page.getByText(/in.stock/i))).toBeVisible();
  });

  test('should indicate out-of-stock drugs', async ({ page }) => {
    await page.getByRole('tab', { name: /drugs/i }).click();
    
    // Metformin has 0 stock - should show out of stock indicator
    await expect(
      page.getByText(/metformin/i).locator('..').getByText(/out.of.stock|0/i)
    ).toBeVisible();
  });

  test('should indicate essential medicines (KEML)', async ({ page }) => {
    await page.getByRole('tab', { name: /drugs/i }).click();
    
    // Essential medicines should have indicator (KEML = Kenya Essential Medicines List)
    await expect(page.getByText(/essential|keml/i).first()).toBeVisible();
  });

  test('should indicate controlled drugs', async ({ page }) => {
    await page.getByRole('tab', { name: /drugs/i }).click();
    
    // Morphine is controlled - should have special indicator
    await expect(page.getByText(/morphine/i)).toBeVisible();
    // Should show controlled drug indicator
    await expect(page.getByText('CD').or(page.getByText(/controlled/i))).toBeVisible();
  });
});

// =============================================================================
// DRUG CATALOG - SEARCH & FILTER
// =============================================================================

test.describe('Drug Catalog - Search & Filter', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /drugs/i }).click();
  });

  test('should have search input for drugs', async ({ page }) => {
    // Search functionality should exist
    const searchInput = page.getByPlaceholder(/search|find/i).or(
      page.getByRole('searchbox')
    ).or(
      page.getByLabel(/search/i)
    );
    await expect(searchInput).toBeVisible();
  });

  test('should search drugs by generic name', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search|find/i).or(
      page.getByRole('searchbox')
    ).first();
    
    await searchInput.fill('Paracetamol');
    await page.waitForTimeout(500); // Debounce
    
    // Should filter to show only matching drugs
    await expect(page.getByText('Paracetamol')).toBeVisible();
  });

  test('should search drugs by brand name', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search|find/i).first();
    
    await searchInput.fill('Panadol');
    await page.waitForTimeout(500);
    
    // Panadol is a brand name for Paracetamol
    await expect(page.getByText('Paracetamol')).toBeVisible();
  });

  test('should search drugs by code', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search|find/i).first();
    
    await searchInput.fill('DRG-002');
    await page.waitForTimeout(500);
    
    // Should find Amoxicillin
    await expect(page.getByText('Amoxicillin')).toBeVisible();
  });

  test('should filter drugs by category', async ({ page }) => {
    // Category filter dropdown should exist
    const categoryFilter = page.getByRole('combobox', { name: /category/i }).or(
      page.getByLabel(/category/i)
    ).or(
      page.getByTestId('category-filter')
    );
    
    await expect(categoryFilter).toBeVisible();
  });

  test('should filter drugs by form', async ({ page }) => {
    // Form filter (tablet, capsule, etc.)
    const formFilter = page.getByRole('combobox', { name: /form/i }).or(
      page.getByLabel(/form/i)
    ).or(
      page.getByTestId('form-filter')
    );
    
    await expect(formFilter).toBeVisible();
  });

  test('should filter drugs by schedule', async ({ page }) => {
    // Schedule filter (OTC, POM, P, CD)
    const scheduleFilter = page.getByRole('combobox', { name: /schedule/i }).or(
      page.getByLabel(/schedule/i)
    ).or(
      page.getByTestId('schedule-filter')
    );
    
    await expect(scheduleFilter).toBeVisible();
  });

  test('should filter to show only essential medicines', async ({ page }) => {
    // Toggle or checkbox for essential medicines
    const essentialFilter = page.getByRole('checkbox', { name: /essential/i }).or(
      page.getByLabel(/essential|keml/i)
    ).or(
      page.getByTestId('essential-filter')
    );
    
    await expect(essentialFilter).toBeVisible();
  });

  test('should filter to show only active drugs', async ({ page }) => {
    // Active/inactive filter
    const activeFilter = page.getByRole('checkbox', { name: /active/i }).or(
      page.getByLabel(/active/i)
    ).or(
      page.getByTestId('active-filter')
    );
    
    await expect(activeFilter).toBeVisible();
  });
});

// =============================================================================
// DRUG CATALOG - PAGINATION
// =============================================================================

test.describe('Drug Catalog - Pagination', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /drugs/i }).click();
  });

  test('should display pagination controls', async ({ page }) => {
    // Pagination should exist
    const pagination = page.getByRole('navigation', { name: /pagination/i }).or(
      page.getByTestId('pagination')
    ).or(
      page.locator('[class*="pagination"]')
    );
    
    await expect(pagination).toBeVisible();
  });

  test('should show total drug count', async ({ page }) => {
    // Should display total number of drugs
    await expect(page.getByText(/5.*(drugs|items|results)/i).or(
      page.getByText(/showing.*of.*5/i)
    )).toBeVisible();
  });
});

// =============================================================================
// DRUG CATALOG - CREATE DRUG
// =============================================================================

test.describe('Drug Catalog - Create Drug', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /drugs/i }).click();
  });

  test('should have add drug button', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).or(
      page.getByTestId('add-drug-button')
    );
    
    await expect(addButton).toBeVisible();
  });

  test('should open drug creation form/dialog', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // Should open form/modal
    await expect(
      page.getByRole('dialog').or(
        page.getByRole('form')
      ).or(
        page.locator('[data-testid="drug-form"]')
      )
    ).toBeVisible();
  });

  test('should have required fields in drug form', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // Required fields
    await expect(page.getByLabel(/generic.name/i)).toBeVisible();
    await expect(page.getByLabel(/code/i)).toBeVisible();
    await expect(page.getByLabel(/category/i)).toBeVisible();
    await expect(page.getByLabel(/form/i)).toBeVisible();
    await expect(page.getByLabel(/strength/i)).toBeVisible();
    await expect(page.getByLabel(/unit/i)).toBeVisible();
  });

  test('should have drug schedule selection', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // Schedule field (OTC, POM, P, CD)
    await expect(page.getByLabel(/schedule/i)).toBeVisible();
  });

  test('should have KEML fields for Kenya compliance', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // Kenya Essential Medicines List code
    await expect(page.getByLabel(/keml/i).or(page.getByLabel(/essential.*code/i))).toBeVisible();
    
    // Is essential checkbox
    await expect(page.getByRole('checkbox', { name: /essential/i })).toBeVisible();
  });

  test('should have NHIF code field', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // NHIF (now SHA) code for insurance claims
    await expect(page.getByLabel(/nhif/i).or(page.getByLabel(/sha/i))).toBeVisible();
  });

  test('should have inventory settings fields', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // Reorder level
    await expect(page.getByLabel(/reorder.level/i)).toBeVisible();
    
    // Reorder quantity
    await expect(page.getByLabel(/reorder.quantity/i)).toBeVisible();
  });

  test('should have brand names input (multiple)', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // Brand names (should support multiple)
    await expect(page.getByLabel(/brand/i)).toBeVisible();
  });

  test('should have controlled drug checkbox', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // Controlled substance checkbox
    await expect(page.getByRole('checkbox', { name: /controlled/i })).toBeVisible();
  });

  test('should create drug with valid data', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // Fill form
    await page.getByLabel(/generic.name/i).fill('Test Drug');
    await page.getByLabel(/code/i).fill('DRG-TEST');
    await page.getByLabel(/strength/i).fill('100mg');
    await page.getByLabel(/unit/i).fill('tablet');
    
    // Select category
    await page.getByLabel(/category/i).click();
    await page.getByRole('option', { name: /analgesic/i }).click();
    
    // Select form
    await page.getByLabel(/form/i).click();
    await page.getByRole('option', { name: /tablet/i }).click();
    
    // Submit
    const submitButton = page.getByRole('button', { name: /save|create|submit/i });
    await submitButton.click();
    
    // Should show success
    await expect(page.getByText(/success|created|saved/i)).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add.drug|new.drug|create/i }).first();
    await addButton.click();
    
    // Try to submit without filling required fields
    const submitButton = page.getByRole('button', { name: /save|create|submit/i });
    await submitButton.click();
    
    // Should show validation errors
    await expect(page.getByText(/required|mandatory/i)).toBeVisible();
  });
});

// =============================================================================
// DRUG CATALOG - VIEW DRUG DETAILS
// =============================================================================

test.describe('Drug Catalog - View Drug Details', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /drugs/i }).click();
  });

  test('should be able to click on drug to view details', async ({ page }) => {
    // Click on drug row
    await page.getByText('Paracetamol').click();
    
    // Should navigate to detail view or open modal
    await expect(
      page.getByRole('dialog').or(
        page.locator('[data-testid="drug-detail"]')
      ).or(
        page.getByText(/drug.details/i)
      )
    ).toBeVisible();
  });

  test('should display drug detail information', async ({ page }) => {
    await page.getByText('Paracetamol').click();
    
    // Should show full drug details
    await expect(page.getByText('DRG-001')).toBeVisible();
    await expect(page.getByText('500mg')).toBeVisible();
    await expect(page.getByText(/panadol/i)).toBeVisible(); // Brand name
  });

  test('should show current stock in detail view', async ({ page }) => {
    await page.getByText('Paracetamol').click();
    
    // Should show stock level
    await expect(page.getByText(/stock|quantity|available/i)).toBeVisible();
    await expect(page.getByText('450').or(page.getByText(/450.*units/i))).toBeVisible();
  });

  test('should show storage requirements', async ({ page }) => {
    await page.getByText('Paracetamol').click();
    
    // Should show storage info
    await expect(page.getByText(/store below 25/i).or(page.getByText(/storage/i))).toBeVisible();
  });

  test('should have edit button in detail view', async ({ page }) => {
    await page.getByText('Paracetamol').click();
    
    const editButton = page.getByRole('button', { name: /edit/i });
    await expect(editButton).toBeVisible();
  });

  test('should have link to view stock batches', async ({ page }) => {
    await page.getByText('Paracetamol').click();
    
    // Should be able to see related batches
    await expect(
      page.getByRole('link', { name: /batch|inventory/i }).or(
        page.getByRole('button', { name: /batch|inventory/i })
      ).or(
        page.getByText(/view.batches/i)
      )
    ).toBeVisible();
  });
});

// =============================================================================
// DRUG CATALOG - EDIT DRUG
// =============================================================================

test.describe('Drug Catalog - Edit Drug', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /drugs/i }).click();
  });

  test('should have edit action in drug row', async ({ page }) => {
    // Row should have edit button/menu
    const editButton = page.locator('tr').filter({ hasText: 'Paracetamol' }).getByRole('button', { name: /edit/i }).or(
      page.locator('tr').filter({ hasText: 'Paracetamol' }).getByTestId('edit-drug')
    );
    
    await expect(editButton).toBeVisible();
  });

  test('should open edit form with pre-filled data', async ({ page }) => {
    // Click edit
    await page.getByText('Paracetamol').click();
    await page.getByRole('button', { name: /edit/i }).click();
    
    // Form should be pre-filled
    await expect(page.getByLabel(/generic.name/i)).toHaveValue('Paracetamol');
    await expect(page.getByLabel(/strength/i)).toHaveValue('500mg');
  });

  test('should save edited drug', async ({ page }) => {
    await page.getByText('Paracetamol').click();
    await page.getByRole('button', { name: /edit/i }).click();
    
    // Edit a field
    await page.getByLabel(/reorder.level/i).fill('150');
    
    // Save
    await page.getByRole('button', { name: /save|update/i }).click();
    
    // Should show success
    await expect(page.getByText(/success|updated|saved/i)).toBeVisible();
  });
});

// =============================================================================
// DRUG CATALOG - DELETE DRUG
// =============================================================================

test.describe('Drug Catalog - Delete Drug', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /drugs/i }).click();
  });

  test('should have delete action', async ({ page }) => {
    // Row should have delete option
    const deleteButton = page.locator('tr').filter({ hasText: 'Paracetamol' }).getByRole('button', { name: /delete|remove/i }).or(
      page.locator('tr').filter({ hasText: 'Paracetamol' }).getByTestId('delete-drug')
    );
    
    // Note: Delete might be in a dropdown menu
    await expect(deleteButton.or(page.getByRole('menuitem', { name: /delete/i }))).toBeVisible();
  });

  test('should show confirmation before delete', async ({ page }) => {
    // Find and click delete
    const row = page.locator('tr').filter({ hasText: 'Paracetamol' });
    await row.getByRole('button', { name: /more|actions|menu/i }).first().click();
    await page.getByRole('menuitem', { name: /delete/i }).click();
    
    // Should show confirmation dialog
    await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toBeVisible();
    await expect(page.getByText(/confirm|sure|delete/i)).toBeVisible();
  });

  test('should not allow deleting drugs with stock', async ({ page }) => {
    // Try to delete drug with stock
    const row = page.locator('tr').filter({ hasText: 'Paracetamol' });
    await row.getByRole('button', { name: /more|actions|menu/i }).first().click();
    await page.getByRole('menuitem', { name: /delete/i }).click();
    
    // If confirmed, should show error because drug has stock
    await page.getByRole('button', { name: /confirm|yes|delete/i }).click();
    
    // Should show error or warning
    await expect(page.getByText(/cannot.delete|has.stock|error/i)).toBeVisible();
  });
});
