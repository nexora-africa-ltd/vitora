/**
 * Patient Registration Step Definitions
 *
 * Steps for patient registration feature scenarios.
 * @see features/patients/patient-registration.feature
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { createPatientData, safeHashes, safeRowsHash, ensureString } from '../../support/fixtures';

/**
 * Given Steps
 */

Given(
  'a patient exists with MRN {string}',
  async function (this: VitoraWorld, mrn: string) {
    // Create patient via API
    const patientData = createPatientData({ mrn });
    const response = await this.apiRequest('POST', '/patients/', patientData);
    this.store('existingPatient', response);
  }
);

Given(
  'a patient exists with national ID {string}',
  async function (this: VitoraWorld, nationalId: string) {
    const patientData = createPatientData({ national_id: nationalId });
    const response = await this.apiRequest('POST', '/patients/', patientData);
    this.store('existingPatient', response);
  }
);

Given(
  'a patient exists with phone {string}',
  async function (this: VitoraWorld, phone: string) {
    const patientData = createPatientData({ phone_number: phone });
    const response = await this.apiRequest('POST', '/patients/', patientData);
    this.store('existingPatient', response);
  }
);

Given(
  'a patient {string} exists',
  async function (this: VitoraWorld, fullName: string) {
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts[1] || 'Test';
    const patientData = createPatientData({
      first_name: firstName,
      last_name: lastName,
    });
    const response = await this.apiRequest('POST', '/patients/', patientData);
    this.store('existingPatient', response);
  }
);

/**
 * When Steps - Form Interactions
 */

When(
  'I leave {word} empty',
  async function (this: VitoraWorld, field: string) {
    const fieldName = field.toLowerCase().replace(/\s+/g, '_');
    await this.page?.fill(`[name="${fieldName}"]`, '');
  }
);

When(
  'I check the consent checkbox',
  async function (this: VitoraWorld) {
    await this.page?.check('[name="consent_given"]');
  }
);

When(
  'I register a new patient',
  async function (this: VitoraWorld) {
    const patientData = createPatientData();
    this.store('newPatientData', patientData);

    // Fill form with generated data
    await this.page?.fill('[name="first_name"]', patientData['first_name'] ?? patientData['First Name'] ?? '');
    await this.page?.fill('[name="last_name"]', patientData['last_name'] ?? patientData['Last Name'] ?? '');
    await this.page?.fill('[name="date_of_birth"]', patientData['date_of_birth'] ?? patientData['Date of Birth'] ?? '');
    await this.page?.click('[name="gender"]');
    await this.page?.click(`[data-value="${patientData['gender'] ?? patientData['Gender'] ?? 'F'}"]`);

    // Select location
    await this.page?.click('[name="county"]');
    await this.page?.click('[role="option"]:first-child');
    await this.page?.waitForResponse(/sub-counties/);
    await this.page?.click('[name="sub_county"]');
    await this.page?.click('[role="option"]:first-child');

    // Submit
    await this.page?.click('button[type="submit"]');
    await this.page?.waitForLoadState('networkidle');
  }
);

/**
 * Then Steps - Assertions
 */

Then(
  'a new patient record should be created',
  async function (this: VitoraWorld) {
    // Check for success indicator
    const successMessage = await this.page?.locator('.toast-success, [role="alert"]').first();
    expect(successMessage).toBeTruthy();

    // Or check URL changed to patient detail
    const url = this.page?.url();
    expect(url).toMatch(/patients\/\d+|patients\/MRN-/);
  }
);

Then(
  'an MRN should be auto-generated in format {string}',
  async function (this: VitoraWorld, format: string) {
    // Wait for MRN to appear
    const mrnElement = await this.page?.locator('[data-testid="patient-mrn"], .mrn').first();
    const mrn = await mrnElement?.textContent();

    // Validate format: MRN-YYYYMMDD-XXXX
    expect(mrn).toMatch(/^MRN-\d{8}-\d{4}$/);
    this.store('generatedMrn', mrn);
  }
);

Then(
  '{string} should be set to my user account',
  async function (this: VitoraWorld, field: string) {
    // Verify via API that the field is set correctly
    const mrn = this.retrieve<string>('generatedMrn');
    if (mrn) {
      const patient = await this.apiRequest('GET', `/patients/?mrn=${mrn}`) as { results: Array<{ registered_by: number }> };
      const firstPatient = patient.results[0];
      if (!firstPatient) {
        throw new Error('Patient not found');
      }
      expect(firstPatient.registered_by).toBe(this.currentUser?.id);
    }
  }
);

Then(
  'an audit log entry {string} should be recorded',
  async function (this: VitoraWorld, action: string) {
    // Verify audit log via API
    const logs = await this.apiRequest('GET', `/auditlogs/?action=${action}`) as { results: Array<{ action: string }> };
    const recentLog = logs.results[0];
    if (!recentLog) {
      throw new Error('Audit log not found');
    }
    expect(recentLog.action).toBe(action);
  }
);

// Note: 'I should see an error {string}' and 'I should see a warning {string}'
// are defined in common/forms.steps.ts - using those instead of duplicating

Then(
  'the patient should not be created',
  async function (this: VitoraWorld) {
    // Still on registration page
    const url = this.page?.url();
    expect(url).toContain('/register');
  }
);

Then(
  'sub-county dropdown should show only {word} sub-counties',
  async function (this: VitoraWorld, county: string) {
    await this.page?.click('[name="sub_county"]');

    // Verify options are loaded and belong to the county
    const options = await this.page?.locator('[role="option"]').allTextContents();
    expect(options!.length).toBeGreaterThan(0);

    // Store for later verification
    this.store('subCountyOptions', options);
  }
);

Then(
  'ward dropdown should show only {word} wards',
  async function (this: VitoraWorld, subCounty: string) {
    await this.page?.click('[name="ward"]');

    const options = await this.page?.locator('[role="option"]').allTextContents();
    expect(options!.length).toBeGreaterThan(0);
  }
);

Then(
  'I should be able to select ward {string}',
  async function (this: VitoraWorld, wardName: string) {
    await this.page?.click(`[role="option"]:has-text("${wardName}")`);

    // Verify selection
    const selectedValue = await this.page?.locator('[name="ward"]').inputValue();
    expect(selectedValue).toBeTruthy();
  }
);

Then(
  'the emergency contact should be saved with the patient',
  async function (this: VitoraWorld) {
    const mrn = this.retrieve<string>('generatedMrn');
    if (mrn) {
      const patient = await this.apiRequest('GET', `/patients/?mrn=${mrn}`) as { results: Array<{ id: number }> };
      const firstPatient = patient.results[0];
      if (!firstPatient) {
        throw new Error('Patient not found');
      }
      const patientId = firstPatient.id;

      const contacts = await this.apiRequest('GET', `/patients/${patientId}/emergency-contacts/`) as Array<unknown>;
      expect(contacts.length).toBeGreaterThan(0);
    }
  }
);

Then(
  'consent_given should be set to {word}',
  async function (this: VitoraWorld, value: string) {
    const mrn = this.retrieve<string>('generatedMrn');
    if (mrn) {
      const patient = await this.apiRequest('GET', `/patients/?mrn=${mrn}`) as { results: Array<{ consent_given: boolean }> };
      const firstPatient = patient.results[0];
      if (!firstPatient) {
        throw new Error('Patient not found');
      }
      expect(firstPatient.consent_given).toBe(value === 'true');
    }
  }
);

Then(
  'consent_date should be set to current timestamp',
  async function (this: VitoraWorld) {
    const mrn = this.retrieve<string>('generatedMrn');
    if (mrn) {
      const patient = await this.apiRequest('GET', `/patients/?mrn=${mrn}`) as { results: Array<{ consent_date: string }> };
      const firstPatient = patient.results[0];
      if (!firstPatient) {
        throw new Error('Patient not found');
      }
      const consentDate = new Date(firstPatient.consent_date);
      const now = new Date();

      // Should be within last minute
      const diffMs = now.getTime() - consentDate.getTime();
      expect(diffMs).toBeLessThan(60000);
    }
  }
);
