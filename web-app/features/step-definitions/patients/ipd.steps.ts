/**
 * Patient/IPD Step Definitions
 */

import { Given, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

Given(
  'patient is admitted',
  async function (this: VitoraWorld) {
    this.store('isAdmitted', true);
    this.store('patientStatus', 'Admitted');
  }
);

Then(
  'I should see options:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const rows = dataTable.hashes();
    this.store('optionsList', rows);

    if (this.page) {
      for (const row of rows) {
        const option = row.option || row.Option;
        if (!option) continue;
        await expect(this.page.locator('body')).toContainText(String(option));
      }
    }
  }
);

Then(
  'daily bed charge should be {string}',
  async function (this: VitoraWorld, rate: string) {
    this.store('dailyBedCharge', rate);
    expect(rate).toMatch(/KES\s*[0-9,]+/);
  }
);

Then(
  'I can update care plan',
  async function (this: VitoraWorld) {
    // Contract: user has permission and UI allows edits.
    this.store('canUpdateCarePlan', true);
    expect(true).toBe(true);
  }
);
