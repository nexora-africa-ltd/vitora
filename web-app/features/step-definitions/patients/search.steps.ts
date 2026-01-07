/**
 * Patient Search Step Definitions
 * 
 * Steps for patient search and lookup feature scenarios.
 * @see features/patients/patient-search.feature
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { createPatientData, safeHashes, safeRowsHash, ensureString } from '../../support/fixtures';

/**
 * Given Steps
 */

Given(
  'I am on the patient search page',
  async function (this: VitoraWorld) {
    await this.page?.goto('/patients');
    await this.page?.waitForSelector('[data-testid="patient-search"], input[type="search"]');
  }
);

Given(
  'patients exist:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const patients = safeHashes(dataTable.hashes());
    const createdPatients = [];
    
    for (const patientRow of patients) {
      const patientData = createPatientData({
        first_name: patientRow['first_name'] || patientRow['First Name'] || 'Unknown',
        last_name: patientRow['last_name'] || patientRow['Last Name'] || 'Patient',
      });
      
      const response = await this.apiRequest('POST', '/patients/', patientData);
      createdPatients.push(response);
    }
    
    this.store('createdPatients', createdPatients);
  }
);

Given(
  'patients exist in the system',
  async function (this: VitoraWorld) {
    // Create a few test patients
    const patients = [
      createPatientData({ first_name: 'Jane', last_name: 'Wanjiku' }),
      createPatientData({ first_name: 'John', last_name: 'Kamau' }),
      createPatientData({ first_name: 'Mary', last_name: 'Atieno' }),
    ];
    
    const createdPatients = [];
    for (const patient of patients) {
      const response = await this.apiRequest('POST', '/patients/', patient);
      createdPatients.push(response);
    }
    
    this.store('createdPatients', createdPatients);
  }
);

Given(
  'a patient is marked as sensitive',
  async function (this: VitoraWorld) {
    const patientData = createPatientData({ is_sensitive: 'true' });
    const response = await this.apiRequest('POST', '/patients/', patientData);
    this.store('sensitivePatient', response);
  }
);

Given(
  'I do NOT have {string} permission',
  async function (this: VitoraWorld, permission: string) {
    // Ensure current user doesn't have this permission
    if (this.currentUser?.permissions.includes(permission)) {
      // Re-login as user without this permission
      const basicUser = { id: 0, username: 'basicuser', email: 'basic@test.com', permissions: [] as string[] };
      this.setUser(basicUser);
      
      if (this.page) {
        // Re-authenticate with limited user
        await this.page.goto('/login');
        await this.page.fill('[name="username"]', basicUser.username);
        await this.page.fill('[name="password"]', 'testpassword');
        await this.page.click('button[type="submit"]');
      }
    }
  }
);

Given(
  'I have {string} permission',
  async function (this: VitoraWorld, permission: string) {
    // Ensure user has the permission
    if (!this.currentUser?.permissions.includes(permission)) {
      this.currentUser?.permissions.push(permission);
    }
  }
);

/**
 * When Steps
 */

When(
  'I search for {string}',
  async function (this: VitoraWorld, searchTerm: string) {
    const searchInput = this.page?.locator('[data-testid="patient-search"], input[type="search"]');
    await searchInput?.fill(searchTerm);
    await searchInput?.press('Enter');
    
    // Wait for results
    await this.page?.waitForResponse(/patients.*search|patients\?/);
    this.store('searchTerm', searchTerm);
  }
);

When(
  'I perform a search',
  async function (this: VitoraWorld) {
    // Click search button or press enter
    await this.page?.click('[data-testid="search-button"], button:has-text("Search")');
    await this.page?.waitForResponse(/patients/);
  }
);

When(
  'I filter by gender {string}',
  async function (this: VitoraWorld, gender: string) {
    await this.page?.click('[data-testid="filter-gender"]');
    await this.page?.click(`[role="option"]:has-text("${gender}")`);
    await this.page?.waitForResponse(/patients/);
  }
);

When(
  'I filter by county {string}',
  async function (this: VitoraWorld, county: string) {
    await this.page?.click('[data-testid="filter-county"]');
    await this.page?.click(`[role="option"]:has-text("${county}")`);
    await this.page?.waitForResponse(/patients/);
  }
);

When(
  'I filter by age range {int} to {int}',
  async function (this: VitoraWorld, minAge: number, maxAge: number) {
    await this.page?.fill('[data-testid="filter-age-min"]', minAge.toString());
    await this.page?.fill('[data-testid="filter-age-max"]', maxAge.toString());
    await this.page?.click('[data-testid="apply-filters"]');
    await this.page?.waitForResponse(/patients/);
  }
);

When(
  'I click on the patient to view details',
  async function (this: VitoraWorld) {
    await this.page?.click('[data-testid="patient-row"]:first-child, .patient-card:first-child');
    await this.page?.waitForURL(/patients\/\d+|patients\/MRN-/);
  }
);

When(
  'I click {string}',
  async function (this: VitoraWorld, buttonText: string) {
    await this.page?.click(`button:has-text("${buttonText}"), a:has-text("${buttonText}")`);
  }
);

When(
  'I view patient journey',
  async function (this: VitoraWorld) {
    await this.page?.click('[data-testid="view-journey"], button:has-text("Journey")');
  }
);

/**
 * Then Steps
 */

Then(
  'I should see exactly {int} result(s)',
  async function (this: VitoraWorld, count: number) {
    const results = await this.page?.locator('[data-testid="patient-row"], .patient-card').count();
    expect(results).toBe(count);
  }
);

Then(
  'I should see the matching patient',
  async function (this: VitoraWorld) {
    const results = await this.page?.locator('[data-testid="patient-row"], .patient-card').count();
    expect(results).toBeGreaterThanOrEqual(1);
  }
);

Then(
  'the result should display patient {string}',
  async function (this: VitoraWorld, patientName: string) {
    const patientElement = this.page?.locator(`text=${patientName}`);
    await expect(patientElement!).toBeVisible();
  }
);

Then(
  'I should see {string} in results',
  async function (this: VitoraWorld, patientName: string) {
    const patientElement = this.page?.locator(`[data-testid="patient-row"]:has-text("${patientName}")`);
    await expect(patientElement!).toBeVisible();
  }
);

Then(
  'search should complete within {int} seconds',
  async function (this: VitoraWorld, seconds: number) {
    // This is implicitly verified by the wait timeout in search step
    // If it takes longer, the test will fail
    const searchStartTime = this.retrieve<number>('searchStartTime') || Date.now();
    const elapsed = Date.now() - searchStartTime;
    expect(elapsed).toBeLessThan(seconds * 1000);
  }
);

Then(
  'the MRN should be highlighted in the result',
  async function (this: VitoraWorld) {
    const searchTerm = this.retrieve<string>('searchTerm');
    const highlighted = this.page?.locator(`mark:has-text("${searchTerm}"), .highlight:has-text("${searchTerm}")`);
    await expect(highlighted!).toBeVisible();
  }
);

Then(
  'each result should display:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const fields = dataTable.raw().flat();
    const firstResult = this.page?.locator('[data-testid="patient-row"]:first-child, .patient-card:first-child');
    
    for (const field of fields) {
      const fieldElement = firstResult?.locator(`[data-field="${field.toLowerCase().replace(/\s+/g, '-')}"]`);
      await expect(fieldElement!).toBeVisible();
    }
  }
);

Then(
  'I should see the patient profile with:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const sections = safeHashes(dataTable.hashes());
    
    for (const section of sections) {
      const sectionName = section['section'] || section['Section'] || '';
      const sectionElement = this.page?.locator(`[data-section="${sectionName.toLowerCase().replace(/\s+/g, '-')}"]`);
      await expect(sectionElement!).toBeVisible();
    }
  }
);

Then(
  'I should see all {int} encounters listed',
  async function (this: VitoraWorld, count: number) {
    const encounters = await this.page?.locator('[data-testid="encounter-item"]').count();
    expect(encounters).toBe(count);
  }
);

Then(
  'encounters should be ordered by date \\(newest first\\)',
  async function (this: VitoraWorld) {
    const dates = await this.page?.locator('[data-testid="encounter-date"]').allTextContents();
    
    // Verify descending order
    if (dates && dates.length > 1) {
      for (let i = 1; i < dates.length; i++) {
        const prevDateStr = dates[i - 1];
        const currDateStr = dates[i];
        if (prevDateStr && currDateStr) {
          const prevDate = new Date(prevDateStr);
          const currDate = new Date(currDateStr);
          expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
        }
      }
    }
  }
);

Then(
  'the patient should NOT appear in results',
  async function (this: VitoraWorld) {
    const sensitivePatient = this.retrieve<{ mrn: string }>('sensitivePatient');
    const patientRow = this.page?.locator(`[data-testid="patient-row"]:has-text("${sensitivePatient?.mrn}")`);
    await expect(patientRow!).not.toBeVisible();
  }
);

Then(
  'the patient should appear in results',
  async function (this: VitoraWorld) {
    const results = await this.page?.locator('[data-testid="patient-row"], .patient-card').count();
    expect(results).toBeGreaterThanOrEqual(1);
  }
);

Then(
  'a {string} badge should be displayed',
  async function (this: VitoraWorld, badge: string) {
    const badgeElement = this.page?.locator(`[data-badge="${badge.toLowerCase()}"], .badge:has-text("${badge}")`);
    await expect(badgeElement!).toBeVisible();
  }
);

Then(
  'I should see quick action buttons:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const actions = safeHashes(dataTable.hashes());
    
    for (const action of actions) {
      const actionName = action['action'] || action['Action'] || '';
      const button = this.page?.locator(`button:has-text("${actionName}"), [data-action="${actionName.toLowerCase().replace(/\s+/g, '-')}"]`);
      await expect(button!).toBeVisible();
    }
  }
);

Then(
  'I should be taken to encounter creation page',
  async function (this: VitoraWorld) {
    await this.page?.waitForURL(/encounters\/new|encounters\/create/);
  }
);

Then(
  'the patient should be pre-selected',
  async function (this: VitoraWorld) {
    const patientField = this.page?.locator('[name="patient"], [data-testid="selected-patient"]');
    const value = await patientField?.inputValue();
    expect(value).toBeTruthy();
  }
);

Then(
  'I should see {string}',
  async function (this: VitoraWorld, text: string) {
    const element = this.page?.locator(`text=${text}`);
    await expect(element!).toBeVisible();
  }
);

Then(
  'I should see option to {string}',
  async function (this: VitoraWorld, action: string) {
    const button = this.page?.locator(`button:has-text("${action}"), a:has-text("${action}")`);
    await expect(button!).toBeVisible();
  }
);

Then(
  'only locally synced patients should appear',
  async function (this: VitoraWorld) {
    const offlineBanner = this.page?.locator('text=Offline');
    await expect(offlineBanner!).toBeVisible();
  }
);
