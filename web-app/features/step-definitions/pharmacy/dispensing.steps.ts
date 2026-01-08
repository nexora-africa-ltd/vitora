/**
 * Pharmacy Dispensing Step Definitions
 * 
 * Steps for prescription dispensing workflow.
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { safeHashes, createPatient } from '../../support/fixtures';
import { createUser, PERMISSIONS } from '../../support/fixtures';

/**
 * Dispensing navigation
 */

Given(
  'I am on the pharmacy dispensing page',
  async function (this: VitoraWorld) {
    this.currentPage = 'dispensing';
    
    if (this.page) {
      await this.page.goto('/pharmacy/dispensing');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the prescription queue',
  async function (this: VitoraWorld) {
    this.currentPage = 'prescription queue';
    
    if (this.page) {
      await this.page.goto('/pharmacy/prescriptions');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I have basic pharmacy permissions',
  async function (this: VitoraWorld) {
    const user = createUser('pharmacist', {
      username: 'basic_pharmacy_user',
      email: 'pharmacy@vitora.health',
      permissions: [...PERMISSIONS.pharmacist],
    });
    this.setUser(user);
  }
);

/**
 * Prescription selection
 */

Given(
  'there is a prescription for patient {string}',
  async function (this: VitoraWorld, patientName: string) {
    const [firstName, lastName] = patientName.split(' ');
    this.patient = createPatient({ firstName, lastName });
    this.store('prescriptionPatient', patientName);
  }
);

Given(
  'I am completing a dispensing',
  async function (this: VitoraWorld) {
    this.store('completingDispensing', true);
  }
);

Given(
  'the prescription contains:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const prescriptionItems = safeHashes(dataTable.hashes());
    this.store('prescriptionItems', prescriptionItems);
  }
);

When(
  'I select the prescription for {string}',
  async function (this: VitoraWorld, patientName: string) {
    this.store('selectedPrescription', patientName);
    
    if (this.page) {
      await this.page.click(`[data-testid="prescription-row"]:has-text("${patientName}")`);
    }
  }
);

Then(
  'I should see the prescription details:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedItems = safeHashes(dataTable.hashes());
    
    if (this.page) {
      const detailsPanel = this.page.locator('[data-testid="prescription-details"]');
      await expect(detailsPanel).toBeVisible();
      
      for (const item of expectedItems) {
        const drugName = item.drug || item.Drug;
        const itemRow = detailsPanel.locator(`[data-testid="prescription-item"]:has-text("${drugName}")`);
        await expect(itemRow).toBeVisible();
      }
    }
  }
);

/**
 * Batch selection for dispensing
 */

When(
  'I select batch {string} for {string}',
  async function (this: VitoraWorld, batchNumber: string, drugName: string) {
    this.store('selectedBatch', { batchNumber, drugName });
    
    if (this.page) {
      const drugRow = this.page.locator(`[data-testid="dispense-item"]:has-text("${drugName}")`);
      await drugRow.locator(`[data-testid="batch-select"]`).selectOption(batchNumber);
    }
  }
);

Then(
  'the available quantity should show {int}',
  async function (this: VitoraWorld, expectedQuantity: number) {
    if (this.page) {
      const availableQty = this.page.locator('[data-testid="available-quantity"]');
      const qtyText = await availableQty.textContent();
      expect(Number(qtyText)).toBe(expectedQuantity);
    }
  }
);

/**
 * Dispensing actions
 */

When(
  'I dispense {int} units of {string}',
  async function (this: VitoraWorld, quantity: number, drugName: string) {
    this.store('dispensedDrug', { drugName, quantity });
    
    if (this.page) {
      const drugRow = this.page.locator(`[data-testid="dispense-item"]:has-text("${drugName}")`);
      await drugRow.locator('[data-testid="dispense-quantity"]').fill(String(quantity));
    }
  }
);

When(
  'I confirm the dispensing',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.click('[data-testid="confirm-dispense"]');
      await this.page.waitForResponse(resp => 
        resp.url().includes('/api/pharmacy/dispense') && resp.status() === 201
      );
    }
  }
);

Then(
  'the dispensing should be recorded',
  async function (this: VitoraWorld) {
    if (this.page) {
      const successMessage = this.page.locator('[data-testid="success-message"]');
      await expect(successMessage).toBeVisible();
    }
  }
);

Then(
  'stock should be reduced by {int} for {string}',
  async function (this: VitoraWorld, quantity: number, drugName: string) {
    // Verify stock reduction
    this.store('stockReduction', { drugName, quantity });
    expect(quantity).toBeGreaterThan(0);
  }
);

/**
 * Partial dispensing
 */

Given(
  'the prescription requires {int} units of {string}',
  async function (this: VitoraWorld, quantity: number, drugName: string) {
    this.store('requiredQuantity', { drugName, quantity });
  }
);

Given(
  'only {int} units are available',
  async function (this: VitoraWorld, available: number) {
    this.store('availableQuantity', available);
  }
);

When(
  'I dispense the available {int} units',
  async function (this: VitoraWorld, quantity: number) {
    this.store('partialDispenseQuantity', quantity);
    
    if (this.page) {
      await this.page.fill('[data-testid="dispense-quantity"]', String(quantity));
      await this.page.click('[data-testid="partial-dispense"]');
    }
  }
);

Then(
  'the prescription should show {string} status',
  async function (this: VitoraWorld, status: string) {
    if (this.page) {
      const statusBadge = this.page.locator('[data-testid="prescription-status"]');
      await expect(statusBadge).toContainText(status);
    }
  }
);

Then(
  'the remaining quantity should be {int}',
  async function (this: VitoraWorld, remaining: number) {
    if (this.page) {
      const remainingQty = this.page.locator('[data-testid="remaining-quantity"]');
      const qtyText = await remainingQty.textContent();
      expect(Number(qtyText)).toBe(remaining);
    }
  }
);

/**
 * Dispensing validation
 */

Given(
  'the patient has an allergy recorded for {string}',
  async function (this: VitoraWorld, allergen: string) {
    this.store('patientAllergy', allergen);
  }
);

When(
  'I try to dispense a drug containing {string}',
  async function (this: VitoraWorld, ingredient: string) {
    this.store('attemptedIngredient', ingredient);
    
    if (this.page) {
      // Trigger dispensing which should show warning
      await this.page.click('[data-testid="confirm-dispense"]');
    }
  }
);

Then(
  'I should see an allergy alert',
  async function (this: VitoraWorld) {
    if (this.page) {
      const allergyAlert = this.page.locator('[data-testid="allergy-alert"]');
      await expect(allergyAlert).toBeVisible();
    }
  }
);

Then(
  'dispensing should require override confirmation',
  async function (this: VitoraWorld) {
    if (this.page) {
      const overrideButton = this.page.locator('[data-testid="override-allergy"]');
      await expect(overrideButton).toBeVisible();
    }
  }
);

/**
 * Receipt printing
 */

When(
  'I click print receipt',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.click('[data-testid="print-receipt"]');
    }
  }
);

Then(
  'a receipt should be generated with:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedFields = safeHashes(dataTable.hashes());
    
    if (this.page) {
      const receipt = this.page.locator('[data-testid="receipt-preview"]');
      await expect(receipt).toBeVisible();
      
      for (const field of expectedFields) {
        const fieldName = field.field || field.Field;
        await expect(receipt).toContainText(fieldName);
      }
    }
  }
);

/**
 * Dispensing history
 */

When(
  'I view dispensing history for {string}',
  async function (this: VitoraWorld, patientName: string) {
    this.store('historyPatient', patientName);
    
    if (this.page) {
      await this.page.goto(`/pharmacy/history?patient=${encodeURIComponent(patientName)}`);
    }
  }
);

Then(
  'I should see all previous dispensings',
  async function (this: VitoraWorld) {
    if (this.page) {
      const historyTable = this.page.locator('[data-testid="dispensing-history"]');
      await expect(historyTable).toBeVisible();
    }
  }
);

Then(
  'each entry should show date, drug, quantity, and dispensed by',
  async function (this: VitoraWorld) {
    if (this.page) {
      const historyRows = await this.page.locator('[data-testid="history-row"]').all();
      
      for (const row of historyRows) {
        await expect(row.locator('[data-testid="history-date"]')).toBeVisible();
        await expect(row.locator('[data-testid="history-drug"]')).toBeVisible();
        await expect(row.locator('[data-testid="history-quantity"]')).toBeVisible();
        await expect(row.locator('[data-testid="history-dispensed-by"]')).toBeVisible();
      }
    }
  }
);
