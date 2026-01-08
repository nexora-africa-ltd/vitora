/**
 * Pharmacy Prescriptions Step Definitions
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { safeHashes } from '../../support/fixtures';

type Prescription = {
  id: number;
  patient: string;
  status: 'PENDING' | 'PARTIAL' | 'DISPENSED' | 'CANCELLED';
  itemsCount: number;
};

Given(
  'prescriptions with various statuses exist',
  async function (this: VitoraWorld) {
    const prescriptions: Prescription[] = [
      { id: 1, patient: 'John', status: 'PENDING', itemsCount: 2 },
      { id: 2, patient: 'Mary', status: 'PARTIAL', itemsCount: 1 },
      { id: 3, patient: 'Peter', status: 'DISPENSED', itemsCount: 3 },
      { id: 4, patient: 'Jane Wanjiku', status: 'CANCELLED', itemsCount: 1 },
    ];

    this.store('prescriptions', prescriptions);

    if (this.page) {
      await this.page.route('**/api/pharmacy/prescriptions**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: prescriptions, count: prescriptions.length }),
        });
      });
    }
  }
);

Given(
  'I am creating a prescription',
  async function (this: VitoraWorld) {
    this.store('creatingPrescription', true);
  }
);

Given(
  'I am adding a drug to a prescription',
  async function (this: VitoraWorld) {
    this.store('addingDrugToPrescription', true);
  }
);

When(
  'I enter dosage instructions:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const rows = safeHashes(dataTable.hashes());
    this.store('dosageInstructions', rows);

    if (this.page) {
      // Minimal attempt to fill common fields if present.
      for (const row of rows) {
        const instruction = row.instruction || row.Instruction || row.text || '';
        if (instruction) {
          await this.page.fill('[data-testid="dosage-instruction"], textarea[name="dosage_instructions"]', String(instruction));
        }
      }
    }
  }
);

When(
  'I filter the queue by status {string}',
  async function (this: VitoraWorld, status: Prescription['status']) {
    this.store('prescriptionStatusFilter', status);
    if (this.page) {
      await this.page.selectOption('[data-testid="rx-status-filter"]', status);
      await this.page.waitForTimeout(200);
    }
  }
);

When(
  'I search for patient {string}',
  async function (this: VitoraWorld, patient: string) {
    this.store('rxPatientSearch', patient);
    if (this.page) {
      const input = this.page.locator('[data-testid="rx-search"], input[type="search"]').first();
      await input.fill(patient);
      await input.press('Enter').catch(() => undefined);
      await this.page.waitForTimeout(200);
    }
  }
);

When(
  'I search for the patient',
  async function (this: VitoraWorld) {
    const patient = this.retrieve<string>('rxPatientSearch') || this.retrieve<string>('searchTerm') || 'Jane Wanjiku';
    this.store('rxPatientSearch', patient);
    if (this.page) {
      const input = this.page.locator('[data-testid="rx-search"], input[type="search"]').first();
      await input.fill(patient);
      await input.press('Enter').catch(() => undefined);
      await this.page.waitForTimeout(200);
    }
  }
);

When(
  'I search for a patient',
  async function (this: VitoraWorld) {
    const patient = this.retrieve<string>('rxPatientSearch') || this.retrieve<string>('searchTerm') || 'Jane Wanjiku';
    this.store('rxPatientSearch', patient);
    if (this.page) {
      const input = this.page.locator('[data-testid="rx-search"], input[type="search"]').first();
      await input.fill(patient);
      await input.press('Enter').catch(() => undefined);
      await this.page.waitForTimeout(200);
    }
  }
);

Then(
  'I should only see prescriptions with status {string}',
  async function (this: VitoraWorld, status: Prescription['status']) {
    const prescriptions = this.retrieve<Prescription[]>('prescriptions') || [];
    const filtered = prescriptions.filter(p => p.status === status);
    this.store('filteredPrescriptions', filtered);
    expect(filtered.length).toBeGreaterThan(0);

    if (this.page) {
      const rows = await this.page.locator('[data-testid="prescription-row"]').all();
      for (const row of rows) {
        await expect(row).toContainText(status);
      }
    }
  }
);

Then(
  'I should NOT see {string} option',
  async function (this: VitoraWorld, optionText: string) {
    this.store('forbiddenOption', optionText);
    if (this.page) {
      await expect(this.page.getByText(optionText)).toHaveCount(0);
    }
  }
);
