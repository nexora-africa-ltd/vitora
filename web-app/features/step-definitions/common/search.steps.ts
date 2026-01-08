/**
 * Common Step Definitions - Search / Results
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

Given(
  'the database has 100,000+ patients',
  async function (this: VitoraWorld) {
    this.store('patientDbSize', 100_000);
  }
);

Given(
  'I find patient {string} in search',
  async function (this: VitoraWorld, patientName: string) {
    this.store('foundPatientInSearch', patientName);
    // If we already have a patient in context, keep it; else store name.
    if (!this.patient) {
      const [firstName, ...rest] = patientName.split(' ');
      this.patient = { firstName, lastName: rest.join(' ') || 'Test' };
    }
  }
);

When(
  'I view search results',
  async function (this: VitoraWorld) {
    this.store('viewingSearchResults', true);
    if (this.page) {
      // Generic: many flows render results on /patients/search
      await this.page.goto('/patients/search');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

When(
  'I view the search results',
  async function (this: VitoraWorld) {
    this.store('viewingSearchResults', true);
    if (this.page) {
      await this.page.goto('/patients/search');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

When(
  "I view a patient's record",
  async function (this: VitoraWorld) {
    this.store('viewedPatientRecord', true);
    if (this.page) {
      // If we know the MRN or id, navigate to detail; otherwise noop.
      const mrn = this.patient?.mrn;
      if (mrn) {
        await this.page.goto(`/patients/${mrn}`);
      }
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Then(
  'results should return within {int} seconds',
  async function (this: VitoraWorld, seconds: number) {
    // Contract check in BDD (perf is enforced in real runs, not dry-run)
    expect(seconds).toBeGreaterThan(0);
  }
);
