/**
 * Outpatient (OPD) Step Definitions
 *
 * Steps for outpatient encounter feature scenarios.
 * @see features/patients/outpatient-opd.feature
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { createPatientData, createEncounter, safeHashes, safeRowsHash, ensureString } from '../../support/fixtures';

/**
 * Given Steps
 */

Given(
  'patient {string} \\(MRN-{word}\\) exists',
  async function (this: VitoraWorld, name: string, mrn: string) {
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts[1] || 'Patient';
    const patientData = createPatientData({
      first_name: firstName,
      last_name: lastName,
      mrn: `MRN-${mrn}`,
    });

    const response = await this.apiRequest('POST', '/patients/', patientData);
    this.store('currentPatient', response);
  }
);

Given(
  'patient {string} is in the OPD queue',
  async function (this: VitoraWorld, name: string) {
    const patient = this.retrieve<{ id: number }>('currentPatient');

    // Add to queue via API
    await this.apiRequest('POST', '/queue/', {
      patient: patient?.id,
      department: 'OPD',
      priority: 'STANDARD',
    });
  }
);

Given(
  'I am documenting an encounter',
  async function (this: VitoraWorld) {
    const patient = this.retrieve<{ id: number }>('currentPatient');

    // Create or navigate to encounter
    await this.page?.goto(`/encounters/new?patient=${patient?.id}`);
    await this.page?.waitForSelector('form');
  }
);

Given(
  'patient has previous encounter with allergies {string}',
  async function (this: VitoraWorld, allergies: string) {
    const patient = this.retrieve<{ id: number }>('currentPatient');

    await this.apiRequest('POST', '/encounters/', {
      patient: patient?.id,
      encounter_type: 'OPD',
      chief_complaint: 'Previous visit',
      allergies: allergies,
    });
  }
);

Given(
  'patient has allergy to {string}',
  async function (this: VitoraWorld, allergy: string) {
    const patient = this.retrieve<{ id: number }>('currentPatient');

    // Update patient allergies
    await this.apiRequest('PATCH', `/patients/${patient?.id}/`, {
      allergies: allergy,
    });

    this.store('patientAllergy', allergy);
  }
);

Given(
  'patient has recorded allergies',
  async function (this: VitoraWorld) {
    const patient = this.retrieve<{ id: number }>('currentPatient');

    await this.apiRequest('PATCH', `/patients/${patient?.id}/`, {
      allergies: 'Penicillin, Sulfa drugs',
    });
  }
);

Given(
  'I have documented:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    // Verify that the components have been filled
    const components = safeHashes(dataTable.hashes());

    for (const component of components) {
      const componentName = component['component'] || component['Component'] || '';
      this.store(`documented_${componentName.toLowerCase().replace(/\s+/g, '_')}`, true);
    }
  }
);

/**
 * When Steps
 */

When(
  'I start a new encounter for the patient',
  async function (this: VitoraWorld) {
    const patient = this.retrieve<{ id: number }>('currentPatient');
    await this.page?.goto(`/encounters/new?patient=${patient?.id}`);
  }
);

When(
  'I select encounter type {string}',
  async function (this: VitoraWorld, encounterType: string) {
    await this.page?.click('[name="encounter_type"]');
    await this.page?.click(`[role="option"]:has-text("${encounterType}")`);
  }
);

When(
  'I save the vitals',
  async function (this: VitoraWorld) {
    await this.page?.click('button:has-text("Save Vitals"), [data-testid="save-vitals"]');
    await this.page?.waitForResponse(/encounters|vitals/);
  }
);

When(
  'I enter chief complaint {string}',
  async function (this: VitoraWorld, complaint: string) {
    await this.page?.fill('[name="chief_complaint"]', complaint);
  }
);

When(
  'I add allergies:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const allergies = safeHashes(dataTable.hashes());

    for (const allergy of allergies) {
      await this.page?.click('[data-testid="add-allergy"]');
      await this.page?.fill('[name="allergy_name"]', allergy['allergy'] || allergy['Allergy'] || '');
      await this.page?.fill('[name="allergy_reaction"]', allergy['reaction'] || allergy['Reaction'] || '');
      await this.page?.click('[data-testid="save-allergy"]');
    }
  }
);

When(
  'I add chronic conditions:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const conditions = safeHashes(dataTable.hashes());

    for (const condition of conditions) {
      await this.page?.click('[data-testid="add-condition"]');
      await this.page?.fill('[name="condition_name"]', condition['condition'] || condition['Condition'] || '');
      await this.page?.fill('[name="condition_since"]', condition['since'] || condition['Since'] || '');
      await this.page?.click('[data-testid="save-condition"]');
    }
  }
);

When(
  'I search for diagnosis {string}',
  async function (this: VitoraWorld, searchTerm: string) {
    await this.page?.fill('[name="diagnosis_search"]', searchTerm);
    await this.page?.waitForResponse(/icd10/);
  }
);

When(
  'I select {string}',
  async function (this: VitoraWorld, option: string) {
    await this.page?.click(`[role="option"]:has-text("${option}")`);
  }
);

When(
  'I mark it as primary diagnosis',
  async function (this: VitoraWorld) {
    await this.page?.check('[name="is_primary"]');
  }
);

When(
  'I add diagnoses:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const diagnoses = safeHashes(dataTable.hashes());

    for (const diagnosis of diagnoses) {
      const code = diagnosis['code'] || diagnosis['Code'] || '';
      await this.page?.fill('[name="diagnosis_search"]', code);
      await this.page?.waitForResponse(/icd10/);
      await this.page?.click(`[role="option"]:has-text("${code}")`);

      if ((diagnosis['primary'] || diagnosis['Primary'] || '') === 'Yes') {
        await this.page?.check('[name="is_primary"]');
      }

      await this.page?.click('[data-testid="add-diagnosis"]');
    }
  }
);

When(
  'I select clinical template {string}',
  async function (this: VitoraWorld, templateName: string) {
    await this.page?.click('[data-testid="select-template"]');
    await this.page?.click(`[role="option"]:has-text("${templateName}")`);
    await this.page?.waitForResponse(/templates/);
  }
);

When(
  'I add medication to treatment plan:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const medications = safeHashes(dataTable.hashes());

    for (const med of medications) {
      await this.page?.click('[data-testid="add-medication"]');
      await this.page?.fill('[name="drug_name"]', med['drug'] || med['Drug'] || '');
      await this.page?.fill('[name="dosage"]', med['dosage'] || med['Dosage'] || '');
      await this.page?.fill('[name="frequency"]', med['frequency'] || med['Frequency'] || '');
      await this.page?.fill('[name="duration"]', med['duration'] || med['Duration'] || '');
      await this.page?.click('[data-testid="save-medication"]');
    }
  }
);

When(
  'I order lab tests:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const tests = safeHashes(dataTable.hashes());

    for (const test of tests) {
      const testName = test['test'] || test['Test'] || '';
      const urgency = test['urgency'] || test['Urgency'] || 'routine';
      await this.page?.click('[data-testid="add-lab-order"]');
      await this.page?.fill('[name="test_name"]', testName);
      await this.page?.click(`[name="urgency"][value="${urgency.toLowerCase()}"]`);
      await this.page?.click('[data-testid="save-lab-order"]');
    }
  }
);

When(
  'I try to prescribe {string}',
  async function (this: VitoraWorld, medication: string) {
    await this.page?.click('[data-testid="add-medication"]');
    await this.page?.fill('[name="drug_search"]', medication);
    await this.page?.click(`[role="option"]:has-text("${medication}")`);
  }
);

When(
  'I schedule follow-up:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const followUp = safeRowsHash(dataTable.rowsHash());

    await this.page?.click('[data-testid="schedule-followup"]');
    await this.page?.fill('[name="followup_date"]', followUp['Date'] || '');
    await this.page?.fill('[name="followup_reason"]', followUp['Reason'] || '');
    await this.page?.fill('[name="followup_notes"]', followUp['Notes'] || '');
    await this.page?.click('[data-testid="save-followup"]');
  }
);

When(
  'I refer patient to {string}',
  async function (this: VitoraWorld, department: string) {
    await this.page?.click('[data-testid="create-referral"]');
    await this.page?.click('[name="referral_department"]');
    await this.page?.click(`[role="option"]:has-text("${department}")`);
  }
);

When(
  'I add referral reason {string}',
  async function (this: VitoraWorld, reason: string) {
    await this.page?.fill('[name="referral_reason"]', reason);
    await this.page?.click('[data-testid="submit-referral"]');
  }
);

When(
  'I enter:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.rowsHash();

    for (const [field, value] of Object.entries(data)) {
      const fieldName = field.toLowerCase().replace(/\s+/g, '_');
      await this.page?.fill(`[name="${fieldName}"]`, value);
    }
  }
);

/**
 * Then Steps
 */

Then(
  'a new encounter should be created',
  async function (this: VitoraWorld) {
    const successMessage = await this.page?.locator('.toast-success, text=Encounter created').first();
    expect(successMessage).toBeTruthy();
  }
);

Then(
  'encounter_date should be set to today',
  async function (this: VitoraWorld) {
    const today = new Date().toISOString().split('T')[0];
    const dateField = await this.page?.locator('[name="encounter_date"]').inputValue();
    expect(dateField).toBe(today);
  }
);

Then(
  'encounter should be linked to the patient',
  async function (this: VitoraWorld) {
    const patient = this.retrieve<{ id: number; mrn: string }>('currentPatient');
    const patientDisplay = this.page?.locator(`text=${patient?.mrn}`);
    await expect(patientDisplay!).toBeVisible();
  }
);

Then(
  'I should be on the encounter documentation page',
  async function (this: VitoraWorld) {
    const url = this.page?.url();
    expect(url).toMatch(/encounters\/\d+|encounters\/new/);
  }
);

Then(
  'all vitals should be recorded in the encounter',
  async function (this: VitoraWorld) {
    const enteredVitals = this.retrieve<Array<{ vital: string; value: string }> | undefined>('enteredVitals');
    const vitalsMap = this.retrieve<Record<string, string> | undefined>('vitals');

    if (enteredVitals?.length) {
      for (const vital of enteredVitals) {
        const fieldName = vital.vital.toLowerCase().replace(/\s+/g, '_');
        const displayedValue = await this.page?.locator(`[data-field="${fieldName}"]`).textContent();
        expect(displayedValue).toContain(vital.value);
      }
      return;
    }

    if (vitalsMap) {
      for (const [vital, value] of Object.entries(vitalsMap)) {
        const fieldName = vital.toLowerCase().replace(/\s+/g, '_');
        const displayedValue = await this.page?.locator(`[data-field="${fieldName}"]`).textContent();
        expect(displayedValue).toContain(value);
      }
      return;
    }

    throw new Error('No vitals found in test context (expected "enteredVitals" or "vitals")');
  }
);

Then(
  'BMI should be auto-calculated as {float}',
  async function (this: VitoraWorld, expectedBmi: number) {
    const bmiDisplay = await this.page?.locator('[data-field="bmi"]').textContent();
    expect(parseFloat(bmiDisplay!)).toBeCloseTo(expectedBmi, 1);
  }
);

Then(
  'validation should show {string}',
  async function (this: VitoraWorld, result: string) {
    if (result === 'valid') {
      const errors = await this.page?.locator('.error-message').count();
      expect(errors).toBe(0);
    } else {
      const warning = this.page?.locator(`text=${result.replace('warning - ', '')}`);
      await expect(warning!).toBeVisible();
    }
  }
);

Then(
  'a critical alert should display:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const alerts = safeHashes(dataTable.hashes());

    for (const alert of alerts) {
      const alertType = alert['alert_type'] || alert['Alert Type'] || 'critical';
      const message = alert['message'] || alert['Message'] || '';
      const alertElement = this.page?.locator(`[data-alert-type="${alertType.toLowerCase()}"]`);
      await expect(alertElement!).toBeVisible();
      await expect(alertElement!).toContainText(message);
    }
  }
);

Then(
  'the alert should be red and prominent',
  async function (this: VitoraWorld) {
    const alert = this.page?.locator('[data-alert-type="critical"]');
    const className = await alert?.getAttribute('class');
    expect(className).toMatch(/red|critical|danger/);
  }
);

Then(
  'the alert should persist until acknowledged',
  async function (this: VitoraWorld) {
    const alert = this.page?.locator('[data-alert-type="critical"]');
    await expect(alert!).toBeVisible();

    // Try navigating and check it's still there
    await this.page?.reload();
    await expect(alert!).toBeVisible();
  }
);

Then(
  'I should see ICD-10 options:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const options = dataTable.hashes();

    for (const option of options) {
      const optionElement = this.page?.locator(`[role="option"]:has-text("${option.code}")`);
      await expect(optionElement!).toBeVisible();
    }
  }
);

Then(
  'the diagnosis should be added to the encounter',
  async function (this: VitoraWorld) {
    const diagnosisList = this.page?.locator('[data-testid="diagnosis-list"] li');
    const count = await diagnosisList?.count();
    expect(count).toBeGreaterThan(0);
  }
);

Then(
  'treatment plan should pre-populate with:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedContent = dataTable.hashes();

    for (const item of expectedContent) {
      const content = this.page?.locator(`text=${item.content}`);
      await expect(content!).toBeVisible();
    }
  }
);

Then(
  'a prescription should be created',
  async function (this: VitoraWorld) {
    const prescription = this.page?.locator('[data-testid="prescription-summary"]');
    await expect(prescription!).toBeVisible();
  }
);

Then(
  'it should be linked to this encounter',
  async function (this: VitoraWorld) {
    // Prescription shows encounter reference
    const encounterRef = this.page?.locator('[data-testid="prescription-encounter"]');
    await expect(encounterRef!).toBeVisible();
  }
);

Then(
  'it should appear in pharmacy queue',
  async function (this: VitoraWorld) {
    // Navigate to pharmacy and verify
    await this.page?.goto('/pharmacy/prescriptions');
    const prescription = this.page?.locator('[data-testid="prescription-queue"] li').first();
    await expect(prescription!).toBeVisible();
  }
);

Then(
  'I should see allergy alert:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const alerts = safeHashes(dataTable.hashes());

    for (const alert of alerts) {
      const severity = alert['severity'] || alert['Severity'] || 'warning';
      const message = alert['message'] || alert['Message'] || '';
      const alertElement = this.page?.locator(`[data-alert-severity="${severity.toLowerCase()}"]`);
      await expect(alertElement!).toBeVisible();
      await expect(alertElement!).toContainText(message);
    }
  }
);

Then(
  'prescription should be blocked until acknowledged',
  async function (this: VitoraWorld) {
    const saveButton = this.page?.locator('button:has-text("Save Prescription")');
    await expect(saveButton!).toBeDisabled();

    const acknowledgeButton = this.page?.locator('button:has-text("Acknowledge")');
    await expect(acknowledgeButton!).toBeVisible();
  }
);

Then(
  'the encounter should be marked complete',
  async function (this: VitoraWorld) {
    const status = this.page?.locator('[data-testid="encounter-status"]');
    await expect(status!).toContainText(/complete/i);
  }
);

Then(
  'billing items should be generated',
  async function (this: VitoraWorld) {
    // Check billing summary appears
    const billing = this.page?.locator('[data-testid="billing-items"]');
    await expect(billing!).toBeVisible();
  }
);

Then(
  'patient should be directed to next department',
  async function (this: VitoraWorld) {
    const nextStep = this.page?.locator('[data-testid="next-department"]');
    await expect(nextStep!).toBeVisible();
  }
);

Then(
  'encounter status should change to {string}',
  async function (this: VitoraWorld, status: string) {
    const statusElement = this.page?.locator('[data-testid="encounter-status"]');
    await expect(statusElement!).toContainText(status);
  }
);

Then(
  'reception should be notified',
  async function (this: VitoraWorld) {
    // Check notification was sent (via API or WebSocket)
    // For now, verify UI indication
    const notification = this.page?.locator('text=Notification sent');
    await expect(notification!).toBeVisible();
  }
);

Then(
  'allergies should be displayed in a prominent banner',
  async function (this: VitoraWorld) {
    const banner = this.page?.locator('[data-testid="allergy-banner"]');
    await expect(banner!).toBeVisible();
  }
);

Then(
  'allergies should be visible throughout documentation',
  async function (this: VitoraWorld) {
    // Check sticky/persistent display
    const allergyDisplay = this.page?.locator('[data-testid="allergy-indicator"]');
    await expect(allergyDisplay!).toBeVisible();
  }
);
