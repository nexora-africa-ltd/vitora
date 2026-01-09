/**
 * Dispensing E2E Tests
 * 
 * End-to-end tests for drug dispensing workflows.
 * Tests should identify missing UI implementations.
 * 
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Backend API Endpoints Tested:
 * - GET /api/pharmacy/dispensings/ - List dispensings
 * - GET /api/pharmacy/dispensings/{id}/ - Get dispensing details
 * - POST /api/pharmacy/dispensings/ - Create dispensing (manual)
 * - POST /api/pharmacy/dispensings/dispense/ - Dispense using FEFO
 * - POST /api/pharmacy/dispensings/{id}/return_stock/ - Process return
 * - POST /api/pharmacy/dispensings/{id}/verify/ - Verify controlled drug
 */
import { test, expect } from '@playwright/test';
import {
  setupPharmacyMocks,
  loginAndGoToPharmacy,
  mockDispensing,
  mockDispensingData,
  mockPrescription,
} from './fixtures';

// =============================================================================
// DISPENSING - FROM PRESCRIPTION
// =============================================================================

test.describe('Dispensing - From Prescription', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /prescription/i }).click();
  });

  test('should open dispensing interface from prescription', async ({ page }) => {
    // Click dispense on a prescription
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Should show dispensing interface
    await expect(
      page.getByRole('dialog').or(
        page.locator('[data-testid="dispensing-form"]')
      ).or(
        page.getByText(/dispense.*items/i)
      )
    ).toBeVisible();
  });

  test('should display prescription items to dispense', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Should show items from prescription
    await expect(page.getByText(/paracetamol/i)).toBeVisible();
    await expect(page.getByText(/30/)).toBeVisible(); // Quantity prescribed
  });

  test('should show available batches for drug (FEFO order)', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Should show available batches ordered by expiry (FEFO)
    await expect(page.getByText(/batch/i)).toBeVisible();
    await expect(page.getByText('BATCH-2026-001').or(page.getByText(/available.*batch/i))).toBeVisible();
  });

  test('should auto-select batch with earliest expiry (FEFO)', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // FEFO - First Expiry First Out - should auto-select earliest expiry batch
    const batchSelect = page.getByLabel(/batch/i).or(page.getByTestId('batch-select'));
    
    // The batch with earliest expiry should be selected or highlighted
    await expect(batchSelect.or(page.getByText(/auto.selected|earliest.expiry/i))).toBeVisible();
  });

  test('should show batch expiry date', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Expiry dates should be visible
    await expect(page.getByText(/expiry|exp/i)).toBeVisible();
  });

  test('should show available quantity per batch', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Available quantity should be shown
    await expect(page.getByText(/450.*available|available.*450/i)).toBeVisible();
  });

  test('should allow manual batch selection', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Should be able to change batch
    const batchSelect = page.getByLabel(/batch/i).or(page.getByTestId('batch-select'));
    await expect(batchSelect).toBeEnabled();
  });

  test('should have quantity to dispense input', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    await expect(page.getByLabel(/quantity.*dispense|dispense.*quantity/i)).toBeVisible();
  });

  test('should pre-fill quantity from prescription', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Should pre-fill with remaining quantity (30)
    const quantityInput = page.getByLabel(/quantity/i).first();
    await expect(quantityInput).toHaveValue('30');
  });

  test('should validate quantity does not exceed available stock', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Try to dispense more than available
    const quantityInput = page.getByLabel(/quantity/i).first();
    await quantityInput.fill('9999');
    await page.getByRole('button', { name: /confirm|dispense|submit/i }).click();
    
    // Should show error
    await expect(page.getByText(/insufficient|not.enough|exceed/i)).toBeVisible();
  });

  test('should validate quantity does not exceed prescribed', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Try to dispense more than prescribed
    const quantityInput = page.getByLabel(/quantity/i).first();
    await quantityInput.fill('50'); // Prescribed is 30
    await page.getByRole('button', { name: /confirm|dispense|submit/i }).click();
    
    // Should show warning or error
    await expect(page.getByText(/exceed.*prescribed|more.than.prescribed/i)).toBeVisible();
  });

  test('should show unit price and calculate total', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Price information
    await expect(page.getByText(/price|cost/i)).toBeVisible();
    await expect(page.getByText(/total/i)).toBeVisible();
  });

  test('should have patient counseling notes field', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Counseling notes for patient
    await expect(page.getByLabel(/counseling|notes|advice/i)).toBeVisible();
  });

  test('should complete dispensing successfully', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Fill counseling notes
    await page.getByLabel(/counseling|notes/i).fill('Take with food');
    
    // Confirm dispensing
    await page.getByRole('button', { name: /confirm|dispense|submit/i }).click();
    
    // Should show success
    await expect(page.getByText(/success|dispensed/i)).toBeVisible();
  });

  test('should update prescription status after full dispensing', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Dispense full quantity
    await page.getByRole('button', { name: /confirm|dispense/i }).click();
    
    // Prescription should update to DISPENSED
    await expect(page.getByText(/dispensed/i)).toBeVisible();
  });

  test('should update prescription status after partial dispensing', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Dispense partial quantity
    const quantityInput = page.getByLabel(/quantity/i).first();
    await quantityInput.fill('10'); // Only 10 of 30
    await page.getByRole('button', { name: /confirm|dispense/i }).click();
    
    // Prescription should update to PARTIAL
    await expect(page.getByText(/partial/i)).toBeVisible();
  });
});

// =============================================================================
// DISPENSING - CONTROLLED DRUGS
// =============================================================================

test.describe('Dispensing - Controlled Drugs', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
  });

  test('should require verification for controlled drugs', async ({ page }) => {
    // Navigate to dispensing for a controlled drug prescription
    await page.goto('/pharmacy');
    await page.getByRole('tab', { name: /prescription/i }).click();
    
    // Morphine is controlled (CD schedule)
    // Controlled drug dispensing should require second pharmacist verification
    await expect(page.getByText(/verification.required|second.pharmacist/i)).toBeVisible();
  });

  test('should show pending verification indicator', async ({ page }) => {
    // After dispensing controlled drug, should show pending verification
    await expect(
      page.getByText(/pending.verification|awaiting.verification/i).or(
        page.locator('[data-testid="verification-pending"]')
      )
    ).toBeVisible();
  });

  test('should have verify action for second pharmacist', async ({ page }) => {
    // Verify button for second pharmacist
    const verifyButton = page.getByRole('button', { name: /verify/i });
    await expect(verifyButton).toBeVisible();
  });

  test('should show who verified the dispensing', async ({ page }) => {
    // After verification, should show verifier
    await expect(page.getByText(/verified.by/i)).toBeVisible();
  });

  test('should not allow self-verification', async ({ page }) => {
    // Cannot verify your own dispensing
    await expect(page.getByText(/cannot.verify.own|different.pharmacist/i)).toBeVisible();
  });
});

// =============================================================================
// DISPENSING - DIRECT (OTC/EMERGENCY)
// =============================================================================

test.describe('Dispensing - Direct (OTC/Emergency)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
  });

  test('should have direct dispensing option', async ({ page }) => {
    // For OTC drugs or emergency dispensing without prescription
    const directDispenseButton = page.getByRole('button', { name: /direct.dispense|otc|quick.dispense/i }).or(
      page.getByTestId('direct-dispense-button')
    );
    
    await expect(directDispenseButton).toBeVisible();
  });

  test('should open direct dispensing form', async ({ page }) => {
    await page.getByRole('button', { name: /direct.dispense|otc/i }).first().click();
    
    // Should show form without prescription
    await expect(
      page.getByRole('dialog').or(
        page.locator('[data-testid="direct-dispense-form"]')
      )
    ).toBeVisible();
  });

  test('should require patient selection for direct dispensing', async ({ page }) => {
    await page.getByRole('button', { name: /direct.dispense|otc/i }).first().click();
    
    await expect(page.getByLabel(/patient/i)).toBeVisible();
  });

  test('should allow drug selection in direct dispensing', async ({ page }) => {
    await page.getByRole('button', { name: /direct.dispense|otc/i }).first().click();
    
    await expect(page.getByLabel(/drug/i)).toBeVisible();
  });

  test('should only allow OTC drugs without prescription', async ({ page }) => {
    await page.getByRole('button', { name: /direct.dispense|otc/i }).first().click();
    
    await page.getByLabel(/drug/i).click();
    
    // Only OTC drugs should be available
    await expect(page.getByRole('option', { name: /paracetamol/i })).toBeVisible();
    
    // POM drugs should not be available without prescription
    await expect(page.getByRole('option', { name: /amoxicillin/i })).not.toBeVisible();
  });

  test('should complete direct dispensing', async ({ page }) => {
    await page.getByRole('button', { name: /direct.dispense|otc/i }).first().click();
    
    // Select patient
    await page.getByLabel(/patient/i).click();
    await page.getByRole('option', { name: /jane.doe/i }).click();
    
    // Select drug
    await page.getByLabel(/drug/i).click();
    await page.getByRole('option', { name: /paracetamol/i }).click();
    
    // Enter quantity
    await page.getByLabel(/quantity/i).fill('10');
    
    // Submit
    await page.getByRole('button', { name: /dispense|submit/i }).click();
    
    // Success
    await expect(page.getByText(/success|dispensed/i)).toBeVisible();
  });
});

// =============================================================================
// DISPENSING - HISTORY
// =============================================================================

test.describe('Dispensing - History', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
  });

  test('should have dispensing history view', async ({ page }) => {
    // Navigate to dispensing history
    const historyTab = page.getByRole('tab', { name: /history|dispens/i }).or(
      page.getByRole('link', { name: /dispensing.history/i })
    );
    
    await expect(historyTab).toBeVisible();
  });

  test('should display dispensing records', async ({ page }) => {
    await page.getByRole('tab', { name: /history|dispens/i }).click();
    
    // Should show dispensing records
    await expect(page.getByText(/paracetamol/i)).toBeVisible();
    await expect(page.getByText(/jane.doe/i)).toBeVisible();
  });

  test('should show dispensed quantity', async ({ page }) => {
    await page.getByRole('tab', { name: /history|dispens/i }).click();
    
    await expect(page.getByText('30')).toBeVisible();
  });

  test('should show dispensing date/time', async ({ page }) => {
    await page.getByRole('tab', { name: /history|dispens/i }).click();
    
    await expect(page.getByText(/2026-01-09|jan.*9/i).first()).toBeVisible();
  });

  test('should show dispensed by user', async ({ page }) => {
    await page.getByRole('tab', { name: /history|dispens/i }).click();
    
    await expect(page.getByText(/pharmacist.user/i)).toBeVisible();
  });

  test('should show batch number used', async ({ page }) => {
    await page.getByRole('tab', { name: /history|dispens/i }).click();
    
    await expect(page.getByText('BATCH-2026-001')).toBeVisible();
  });

  test('should show total cost', async ({ page }) => {
    await page.getByRole('tab', { name: /history|dispens/i }).click();
    
    await expect(page.getByText(/150\.00|ksh.*150/i)).toBeVisible();
  });

  test('should filter by patient', async ({ page }) => {
    await page.getByRole('tab', { name: /history|dispens/i }).click();
    
    const patientFilter = page.getByLabel(/patient/i).or(page.getByTestId('patient-filter'));
    await expect(patientFilter).toBeVisible();
  });

  test('should filter by date range', async ({ page }) => {
    await page.getByRole('tab', { name: /history|dispens/i }).click();
    
    const dateFilter = page.getByLabel(/from|start.date/i).or(page.getByTestId('date-filter'));
    await expect(dateFilter).toBeVisible();
  });

  test('should filter by drug', async ({ page }) => {
    await page.getByRole('tab', { name: /history|dispens/i }).click();
    
    const drugFilter = page.getByLabel(/drug/i).or(page.getByTestId('drug-filter'));
    await expect(drugFilter).toBeVisible();
  });
});

// =============================================================================
// DISPENSING - RETURNS
// =============================================================================

test.describe('Dispensing - Returns', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /history|dispens/i }).click();
  });

  test('should have return action for dispensing', async ({ page }) => {
    const returnButton = page.getByRole('button', { name: /return/i }).first().or(
      page.getByTestId('return-button')
    );
    
    await expect(returnButton).toBeVisible();
  });

  test('should open return form', async ({ page }) => {
    await page.getByRole('button', { name: /return/i }).first().click();
    
    await expect(
      page.getByRole('dialog').or(
        page.locator('[data-testid="return-form"]')
      )
    ).toBeVisible();
  });

  test('should have quantity to return input', async ({ page }) => {
    await page.getByRole('button', { name: /return/i }).first().click();
    
    await expect(page.getByLabel(/quantity/i)).toBeVisible();
  });

  test('should validate return quantity', async ({ page }) => {
    await page.getByRole('button', { name: /return/i }).first().click();
    
    // Try to return more than dispensed
    await page.getByLabel(/quantity/i).fill('999');
    await page.getByRole('button', { name: /confirm|submit/i }).click();
    
    await expect(page.getByText(/exceed|more.than.dispensed/i)).toBeVisible();
  });

  test('should require return reason', async ({ page }) => {
    await page.getByRole('button', { name: /return/i }).first().click();
    
    await expect(page.getByLabel(/reason/i)).toBeVisible();
  });

  test('should process return successfully', async ({ page }) => {
    await page.getByRole('button', { name: /return/i }).first().click();
    
    await page.getByLabel(/quantity/i).fill('5');
    await page.getByLabel(/reason/i).fill('Patient adverse reaction');
    await page.getByRole('button', { name: /confirm|submit/i }).click();
    
    await expect(page.getByText(/success|returned/i)).toBeVisible();
  });

  test('should restore stock after return', async ({ page }) => {
    // After return, batch stock should increase
    await page.getByRole('button', { name: /return/i }).first().click();
    await page.getByLabel(/quantity/i).fill('5');
    await page.getByLabel(/reason/i).fill('Return');
    await page.getByRole('button', { name: /confirm|submit/i }).click();
    
    // Stock should be updated
    await expect(page.getByText(/stock.restored|returned/i)).toBeVisible();
  });

  test('should update prescription status after full return', async ({ page }) => {
    // If full quantity returned, prescription should go back to pending
    await page.getByRole('button', { name: /return/i }).first().click();
    await page.getByLabel(/quantity/i).fill('30'); // Full amount
    await page.getByLabel(/reason/i).fill('Full return');
    await page.getByRole('button', { name: /confirm|submit/i }).click();
    
    // Check prescription status update
    await expect(page.getByText(/pending|status.updated/i)).toBeVisible();
  });
});

// =============================================================================
// DISPENSING - MULTI-BATCH (FEFO)
// =============================================================================

test.describe('Dispensing - Multi-Batch FEFO', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /prescription/i }).click();
  });

  test('should split across batches when quantity exceeds single batch', async ({ page }) => {
    // When dispensing quantity larger than single batch available
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Should show multiple batch allocations if needed
    await expect(
      page.getByText(/batch.allocation|multiple.batches|split/i).or(
        page.locator('[data-testid="batch-allocation"]')
      )
    ).toBeVisible();
  });

  test('should show batch breakdown for large quantities', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Should show which batches will be used
    const batchBreakdown = page.locator('[data-testid="batch-breakdown"]');
    await expect(batchBreakdown).toBeVisible();
  });

  test('should prioritize earliest expiry batches', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // First batch listed should have earliest expiry
    const firstBatch = page.locator('[data-testid="batch-item"]').first();
    await expect(firstBatch.getByText(/earliest|first.expiry/i)).toBeVisible();
  });

  test('should exclude expired and quarantined batches', async ({ page }) => {
    await page.getByText('RX-20260109-0001').click();
    await page.getByRole('button', { name: /dispense/i }).click();
    
    // Expired batches should not be selectable
    await expect(page.getByText('BATCH-2025-005')).not.toBeVisible(); // Expired batch
  });
});

// =============================================================================
// DISPENSING - LABELS
// =============================================================================

test.describe('Dispensing - Labels', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /history|dispens/i }).click();
  });

  test('should have print label action', async ({ page }) => {
    const printLabelButton = page.getByRole('button', { name: /print.label|label/i }).first();
    await expect(printLabelButton).toBeVisible();
  });

  test('should generate label with patient name', async ({ page }) => {
    await page.getByRole('button', { name: /print.label|label/i }).first().click();
    
    // Label preview should show patient name
    await expect(page.getByText('Jane Doe')).toBeVisible();
  });

  test('should generate label with drug name and dosage', async ({ page }) => {
    await page.getByRole('button', { name: /print.label|label/i }).first().click();
    
    // Label should have drug info
    await expect(page.getByText(/paracetamol/i)).toBeVisible();
  });

  test('should generate label with instructions', async ({ page }) => {
    await page.getByRole('button', { name: /print.label|label/i }).first().click();
    
    // Label should have dosage instructions
    await expect(page.getByText(/2.tablets|three.times.daily/i)).toBeVisible();
  });

  test('should generate label with dispensing date', async ({ page }) => {
    await page.getByRole('button', { name: /print.label|label/i }).first().click();
    
    // Dispensing date on label
    await expect(page.getByText(/2026-01-09|jan.*9/i)).toBeVisible();
  });

  test('should generate label with expiry warning', async ({ page }) => {
    await page.getByRole('button', { name: /print.label|label/i }).first().click();
    
    // Expiry information
    await expect(page.getByText(/exp|expiry/i)).toBeVisible();
  });
});
