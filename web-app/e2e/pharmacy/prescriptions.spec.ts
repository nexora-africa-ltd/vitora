/**
 * Prescriptions E2E Tests
 * 
 * End-to-end tests for prescription management.
 * Tests should identify missing UI implementations.
 * 
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Backend API Endpoints Tested:
 * - GET /api/pharmacy/prescriptions/ - List prescriptions
 * - GET /api/pharmacy/prescriptions/{id}/ - Get prescription details
 * - POST /api/pharmacy/prescriptions/ - Create prescription with items
 * - PATCH /api/pharmacy/prescriptions/{id}/ - Update prescription
 * - POST /api/pharmacy/prescriptions/{id}/cancel/ - Cancel prescription
 * - GET /api/pharmacy/prescriptions/by_patient/?patient_id={id} - Get prescriptions for patient
 */
import { test, expect } from '@playwright/test';
import {
  setupPharmacyMocks,
  loginAndGoToPharmacy,
  mockPrescription,
  mockPrescriptionsData,
  mockPrescriptionItem,
} from './fixtures';

// =============================================================================
// PRESCRIPTIONS - LIST VIEW
// =============================================================================

test.describe('Prescriptions - List View', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
  });

  test('should display prescriptions tab on pharmacy page', async ({ page }) => {
    const rxTab = page.getByRole('tab', { name: /prescription/i });
    await expect(rxTab).toBeVisible();
  });

  test('should show pending prescription count badge', async ({ page }) => {
    // Tab should show pending count
    const rxTab = page.getByRole('tab', { name: /prescription/i });
    
    await expect(
      rxTab.getByText(/\d+/).or(
        rxTab.locator('[data-testid="pending-count"]')
      )
    ).toBeVisible();
  });

  test('should display prescription list', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Wait for table to load
    await page.waitForSelector('[data-testid="prescriptions-table"], table', { timeout: 10000 });

    // Should show prescriptions
    await expect(page.getByText('RX-20260109-0001')).toBeVisible();
  });

  test('should display prescription number', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Prescription numbers
    await expect(page.getByText('RX-20260109-0001')).toBeVisible();
    await expect(page.getByText('RX-20260109-0002')).toBeVisible();
  });

  test('should display patient name', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Patient names
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('John Kamau')).toBeVisible();
  });

  test('should display patient MRN', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // MRN numbers
    await expect(page.getByText('MRN-20260101-0001')).toBeVisible();
  });

  test('should display prescription status', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Status badges
    await expect(page.getByText(/pending/i).first()).toBeVisible();
    await expect(page.getByText(/partial/i)).toBeVisible();
    await expect(page.getByText(/dispensed/i)).toBeVisible();
  });

  test('should color-code status badges', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Pending should be warning color
    const pendingBadge = page.locator('[data-testid="status-badge"]').filter({ hasText: /pending/i }).first();
    await expect(pendingBadge).toHaveClass(/pending|warning|yellow/i);
    
    // Dispensed should be success color
    const dispensedBadge = page.locator('[data-testid="status-badge"]').filter({ hasText: /dispensed/i });
    await expect(dispensedBadge).toHaveClass(/success|green/i);
  });

  test('should display prescriber name', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Prescriber
    await expect(page.getByText(/dr\..*test|test.*user/i)).toBeVisible();
  });

  test('should display prescription date', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Date
    await expect(page.getByText(/2026-01-09|jan.*9|09.*jan/i).first()).toBeVisible();
  });

  test('should display valid until date', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Validity - 30 day default
    await expect(page.getByText(/2026-02-08|feb.*8|08.*feb/i)).toBeVisible();
  });

  test('should indicate expired prescriptions', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Expired prescriptions should have indicator
    const expiredRx = page.locator('tr').filter({ hasText: /expired/i });
    await expect(expiredRx).toHaveClass(/expired|error/i);
  });

  test('should show item count for prescriptions', async ({ page }) => {
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Number of items in prescription
    await expect(page.getByText(/1.item|item.*1/i).or(page.getByText('1'))).toBeVisible();
  });
});

// =============================================================================
// PRESCRIPTIONS - FILTERING
// =============================================================================

test.describe('Prescriptions - Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /prescription/i }).click();
  });

  test('should filter by status', async ({ page }) => {
    const statusFilter = page.getByRole('combobox', { name: /status/i }).or(
      page.getByLabel(/status/i)
    ).or(
      page.getByTestId('status-filter')
    );
    
    await expect(statusFilter).toBeVisible();
  });

  test('should filter to show pending only', async ({ page }) => {
    const statusFilter = page.getByRole('combobox', { name: /status/i }).first();
    await statusFilter.click();
    await page.getByRole('option', { name: /pending/i }).click();
    
    // Should only show pending prescriptions
    await expect(page.getByText(/pending/i)).toBeVisible();
    await expect(page.getByText(/dispensed/i)).not.toBeVisible();
  });

  test('should search by patient name or MRN', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search|patient|mrn/i).first();
    
    await searchInput.fill('Jane Doe');
    await page.waitForTimeout(500);
    
    await expect(page.getByText('Jane Doe')).toBeVisible();
  });

  test('should filter by date range', async ({ page }) => {
    const startDate = page.getByLabel(/from|start.date/i).or(
      page.getByTestId('date-from')
    );
    const endDate = page.getByLabel(/to|end.date/i).or(
      page.getByTestId('date-to')
    );
    
    await expect(startDate).toBeVisible();
    await expect(endDate).toBeVisible();
  });

  test('should have quick filter for today prescriptions', async ({ page }) => {
    const todayFilter = page.getByRole('button', { name: /today/i }).or(
      page.getByTestId('today-filter')
    );
    
    await expect(todayFilter).toBeVisible();
  });
});

// =============================================================================
// PRESCRIPTIONS - DETAIL VIEW
// =============================================================================

test.describe('Prescriptions - Detail View', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /prescription/i }).click();
  });

  test('should click prescription to view details', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    // Should show detail view
    await expect(
      page.getByRole('dialog').or(
        page.locator('[data-testid="prescription-detail"]')
      )
    ).toBeVisible();
  });

  test('should display patient information', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    // Patient details
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('MRN-20260101-0001')).toBeVisible();
  });

  test('should display clinical notes', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    // Clinical notes from prescriber
    await expect(page.getByText(/headache.*fever|clinical.notes/i)).toBeVisible();
  });

  test('should display prescription items', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    // Items list
    await expect(page.getByText(/paracetamol/i)).toBeVisible();
    await expect(page.getByText(/2.tablets/i)).toBeVisible();
    await expect(page.getByText(/three.times.daily/i)).toBeVisible();
  });

  test('should show quantity prescribed vs dispensed', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    // Quantities
    await expect(page.getByText(/30.*prescribed|prescribed.*30/i)).toBeVisible();
    await expect(page.getByText(/0.*dispensed|dispensed.*0/i)).toBeVisible();
  });

  test('should show remaining quantity', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    // Remaining
    await expect(page.getByText(/30.*remaining|remaining.*30/i)).toBeVisible();
  });

  test('should display dosage instructions', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    // Full dosage info
    await expect(page.getByText(/2.tablets/i)).toBeVisible();
    await expect(page.getByText(/three.times.daily|TID|3x/i)).toBeVisible();
    await expect(page.getByText(/5.days/i)).toBeVisible();
    await expect(page.getByText(/oral/i)).toBeVisible();
    await expect(page.getByText(/after.meals/i)).toBeVisible();
  });

  test('should indicate substitutable items', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    // Substitution allowed indicator
    await expect(page.getByText(/substitut/i)).toBeVisible();
  });

  test('should show validity status', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    // Is valid indicator
    await expect(page.getByText(/valid|expires/i)).toBeVisible();
  });
});

// =============================================================================
// PRESCRIPTIONS - CREATE
// =============================================================================

test.describe('Prescriptions - Create', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /prescription/i }).click();
  });

  test('should have create prescription button', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /new.prescription|create|add/i }).or(
      page.getByTestId('create-prescription-button')
    );
    
    await expect(createButton).toBeVisible();
  });

  test('should open prescription creation form', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    
    // Should show form/page
    await expect(
      page.getByRole('dialog').or(
        page.locator('[data-testid="prescription-form"]')
      ).or(
        page.getByText(/new.prescription|create.prescription/i)
      )
    ).toBeVisible();
  });

  test('should have patient selection', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    
    // Patient search/select
    await expect(page.getByLabel(/patient/i)).toBeVisible();
  });

  test('should search patient by MRN', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    
    const patientField = page.getByLabel(/patient/i).first();
    await patientField.fill('MRN-20260101-0001');
    
    // Should show matching patient
    await expect(page.getByText('Jane Doe')).toBeVisible();
  });

  test('should have clinical notes field', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    
    await expect(page.getByLabel(/clinical.notes|notes/i)).toBeVisible();
  });

  test('should have add item section', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    
    // Items section
    await expect(page.getByText(/items|medications/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /add.item|add.drug|add.medication/i })).toBeVisible();
  });

  test('should add prescription item with drug selection', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    // Drug selection
    await expect(page.getByLabel(/drug|medication/i)).toBeVisible();
  });

  test('should have quantity field for item', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    await expect(page.getByLabel(/quantity/i)).toBeVisible();
  });

  test('should have dosage field for item', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    await expect(page.getByLabel(/dosage/i)).toBeVisible();
  });

  test('should have frequency field for item', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    await expect(page.getByLabel(/frequency/i)).toBeVisible();
  });

  test('should have duration field for item', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    await expect(page.getByLabel(/duration/i)).toBeVisible();
  });

  test('should have route field for item', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    await expect(page.getByLabel(/route/i)).toBeVisible();
  });

  test('should have instructions field for item', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    await expect(page.getByLabel(/instructions/i)).toBeVisible();
  });

  test('should have substitutable checkbox', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    await expect(page.getByRole('checkbox', { name: /substitut/i })).toBeVisible();
  });

  test('should add multiple items', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    
    // Add first item
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    await page.getByLabel(/drug/i).first().click();
    await page.getByRole('option', { name: /paracetamol/i }).click();
    await page.getByLabel(/quantity/i).fill('30');
    
    // Add second item
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    // Should have multiple item rows
    const itemRows = page.locator('[data-testid="prescription-item"]');
    await expect(itemRows).toHaveCount(2);
  });

  test('should remove item from prescription', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    
    // Remove button
    const removeButton = page.getByRole('button', { name: /remove|delete/i }).first();
    await removeButton.click();
    
    // Item should be removed
    const itemRows = page.locator('[data-testid="prescription-item"]');
    await expect(itemRows).toHaveCount(0);
  });

  test('should create prescription with valid data', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    
    // Select patient
    await page.getByLabel(/patient/i).click();
    await page.getByRole('option', { name: /jane.doe/i }).click();
    
    // Add clinical notes
    await page.getByLabel(/clinical.notes/i).fill('Patient with headache');
    
    // Add item
    await page.getByRole('button', { name: /add.item|add.drug/i }).click();
    await page.getByLabel(/drug/i).first().click();
    await page.getByRole('option', { name: /paracetamol/i }).click();
    await page.getByLabel(/quantity/i).fill('30');
    await page.getByLabel(/dosage/i).fill('2 tablets');
    await page.getByLabel(/frequency/i).fill('Three times daily');
    await page.getByLabel(/duration/i).fill('5 days');
    
    // Submit
    await page.getByRole('button', { name: /save|create|submit/i }).click();
    
    // Should show success
    await expect(page.getByText(/success|created|saved/i)).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    
    // Try to submit without required fields
    await page.getByRole('button', { name: /save|create|submit/i }).click();
    
    // Should show validation errors
    await expect(page.getByText(/required|patient.required/i)).toBeVisible();
  });

  test('should require at least one item', async ({ page }) => {
    await page.getByRole('button', { name: /new.prescription|create|add/i }).first().click();
    
    // Select patient but no items
    await page.getByLabel(/patient/i).click();
    await page.getByRole('option', { name: /jane.doe/i }).click();
    
    await page.getByRole('button', { name: /save|create|submit/i }).click();
    
    // Should show error about items
    await expect(page.getByText(/at.least.one|items.required|add.item/i)).toBeVisible();
  });
});

// =============================================================================
// PRESCRIPTIONS - CANCEL
// =============================================================================

test.describe('Prescriptions - Cancel', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /prescription/i }).click();
  });

  test('should have cancel action for pending prescriptions', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ hasText: /pending/i }).first();
    
    const cancelButton = pendingRow.getByRole('button', { name: /cancel/i }).or(
      pendingRow.getByTestId('cancel-prescription')
    );
    
    await expect(cancelButton).toBeVisible();
  });

  test('should prompt for cancellation reason', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /cancel/i }).click();
    
    // Should show reason dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/reason/i)).toBeVisible();
  });

  test('should cancel prescription with reason', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /cancel/i }).click();
    
    await page.getByLabel(/reason/i).fill('Patient requested cancellation');
    await page.getByRole('button', { name: /confirm|cancel.prescription/i }).click();
    
    // Should show success and update status
    await expect(page.getByText(/cancelled|success/i)).toBeVisible();
  });

  test('should not allow cancelling dispensed prescriptions', async ({ page }) => {
    // Dispensed prescription
    const dispensedRow = page.locator('tr').filter({ hasText: /dispensed/i });
    
    // Cancel should not be available or should be disabled
    const cancelButton = dispensedRow.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).not.toBeVisible();
  });
});

// =============================================================================
// PRESCRIPTIONS - DISPENSE LINK
// =============================================================================

test.describe('Prescriptions - Dispense Actions', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /prescription/i }).click();
  });

  test('should have dispense action for pending prescriptions', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ hasText: /pending/i }).first();
    
    const dispenseButton = pendingRow.getByRole('button', { name: /dispense/i }).or(
      pendingRow.getByRole('link', { name: /dispense/i })
    );
    
    await expect(dispenseButton).toBeVisible();
  });

  test('should navigate to dispensing with prescription context', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Should navigate to dispensing page/dialog with prescription pre-selected
    await expect(
      page.getByText(/dispense.*rx-20260109-0001|dispensing/i)
    ).toBeVisible();
  });

  test('should show continue dispensing for partial prescriptions', async ({ page }) => {
    const partialRow = page.locator('tr').filter({ hasText: /partial/i });
    
    const continueButton = partialRow.getByRole('button', { name: /continue|dispense/i });
    
    await expect(continueButton).toBeVisible();
  });

  test('should show view dispensing history for dispensed prescriptions', async ({ page }) => {
    const dispensedRow = page.locator('tr').filter({ hasText: /dispensed/i });
    
    const historyButton = dispensedRow.getByRole('button', { name: /history|view/i }).or(
      dispensedRow.getByRole('link', { name: /history/i })
    );
    
    await expect(historyButton).toBeVisible();
  });
});

// =============================================================================
// PRESCRIPTIONS - PRINT
// =============================================================================

test.describe('Prescriptions - Print', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /prescription/i }).click();
  });

  test('should have print prescription action', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    const printButton = page.getByRole('button', { name: /print/i }).or(
      page.getByTestId('print-prescription')
    );
    
    await expect(printButton).toBeVisible();
  });

  test('should have prescription label print option', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    
    const labelButton = page.getByRole('button', { name: /label|print.label/i }).or(
      page.getByTestId('print-label')
    );
    
    await expect(labelButton).toBeVisible();
  });
});
