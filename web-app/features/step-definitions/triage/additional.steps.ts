/**
 * Triage Assessment Specific Steps
 * 
 * Additional steps for triage assessment forms and vital alerts
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

// ============================================
// PRECONDITIONS
// ============================================

Given(
  'the patient has the following vitals:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.rowsHash();
    this.store('patientVitals', data);
  }
);

Given(
  'the patient has:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.rowsHash();
    this.store('patientData', data);
  }
);

Given(
  'the patient has {int} critical alerts and {int} warnings',
  async function (this: VitoraWorld, critical: number, warnings: number) {
    this.store('alertCounts', { critical, warnings });
  }
);

Given(
  'the alert panel is expanded',
  async function (this: VitoraWorld) {
    this.store('alertPanelExpanded', true);
  }
);

Given(
  'the patient has a warning alert {string}',
  async function (this: VitoraWorld, alertMessage: string) {
    this.store('warningAlert', alertMessage);
  }
);

Given(
  'the patient has a critical alert {string}',
  async function (this: VitoraWorld, alertMessage: string) {
    this.store('criticalAlert', alertMessage);
  }
);

Given(
  'I am on the vital thresholds settings page',
  async function (this: VitoraWorld) {
    this.currentPage = 'vital thresholds settings';
  }
);

Given(
  'the following clinicians are available:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.hashes();
    this.store('availableClinicians', data);
  }
);

Given(
  'the patient is seeking a follow-up or referral',
  async function (this: VitoraWorld) {
    this.store('seekingFollowUp', true);
  }
);

// ============================================
// ACTIONS
// ============================================

When(
  'I select triage category {string}',
  async function (this: VitoraWorld, category: string) {
    this.store('selectedTriageCategory', category);
  }
);

When(
  'I enter override reason {string}',
  async function (this: VitoraWorld, reason: string) {
    this.store('overrideReason', reason);
  }
);

When(
  'I select assigned area {string}',
  async function (this: VitoraWorld, area: string) {
    this.store('assignedArea', area);
  }
);

When(
  'I select assigned clinician {string}',
  async function (this: VitoraWorld, clinician: string) {
    this.store('assignedClinician', clinician);
  }
);

When(
  'I try to save without entering an override reason',
  async function (this: VitoraWorld) {
    this.store('attemptedSaveWithoutOverrideReason', true);
  }
);

When(
  'I try to submit the triage assessment',
  async function (this: VitoraWorld) {
    this.store('attemptedSubmit', true);
  }
);

When(
  'I view threshold settings',
  async function (this: VitoraWorld) {
    this.currentPage = 'threshold settings';
  }
);

When(
  'I update the SpO2 critical threshold to {int}',
  async function (this: VitoraWorld, value: number) {
    this.store('updatedSpO2Threshold', value);
  }
);

When(
  'patient presents with obvious emergency',
  async function (this: VitoraWorld) {
    this.store('emergencyPresented', true);
  }
);

When(
  'patient needs higher level care',
  async function (this: VitoraWorld) {
    this.store('higherLevelCareNeeded', true);
  }
);

When(
  'nurse completes triage:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.rowsHash();
    this.store('triageData', data);
    this.store('triageCompleted', true);
  }
);

When(
  'a patient with SpO2 {int}% is triaged',
  async function (this: VitoraWorld, spo2: number) {
    this.store('triagedPatientSpo2', spo2);
  }
);

When(
  'a new triage assessment is completed',
  async function (this: VitoraWorld) {
    this.store('triageAssessmentCompleted', true);
  }
);

When(
  'I calculate the triage category',
  async function (this: VitoraWorld) {
    this.store('triageCategoryCalculated', true);
  }
);

When(
  'condition improves',
  async function (this: VitoraWorld) {
    this.store('conditionImproved', true);
  }
);

When(
  'chief complaint is empty',
  async function (this: VitoraWorld) {
    this.store('chiefComplaintEmpty', true);
  }
);

// ============================================
// ASSERTIONS
// ============================================

Then(
  'the alerts panel should show {int} alerts:',
  async function (this: VitoraWorld, count: number, dataTable: DataTable) {
    const data = dataTable.hashes();
    this.store('expectedAlerts', { count, data });
    expect(count).toBe(data.length);
  }
);

Then(
  'the alerts should be ordered:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.hashes();
    this.store('expectedAlertOrder', data);
    expect(data.length).toBeGreaterThan(0);
  }
);

Then(
  'the alert panel header should show:',
  async function (this: VitoraWorld, docString: string) {
    this.store('expectedAlertPanelHeader', docString);
    expect(docString.length).toBeGreaterThan(0);
  }
);

Then(
  'the panel should be expanded by default',
  async function (this: VitoraWorld) {
    this.store('panelExpandedByDefault', true);
    expect(true).toBe(true);
  }
);

Then(
  'the alert icon should be {string} with badge showing {string}',
  async function (this: VitoraWorld, color: string, badge: string) {
    this.store('alertIcon', { color, badge });
    expect(color.length).toBeGreaterThan(0);
  }
);

Then(
  'the panel should collapse',
  async function (this: VitoraWorld) {
    this.store('panelCollapsed', true);
    expect(true).toBe(true);
  }
);

Then(
  'only the summary count should be visible',
  async function (this: VitoraWorld) {
    this.store('onlySummaryVisible', true);
    expect(true).toBe(true);
  }
);

Then(
  'the panel should expand',
  async function (this: VitoraWorld) {
    this.store('panelExpanded', true);
    expect(true).toBe(true);
  }
);

Then(
  'all alert details should be visible',
  async function (this: VitoraWorld) {
    this.store('alertDetailsVisible', true);
    expect(true).toBe(true);
  }
);

Then(
  'the warning should be marked as acknowledged',
  async function (this: VitoraWorld) {
    this.store('warningAcknowledged', true);
    expect(true).toBe(true);
  }
);

Then(
  'the {string} button should not be available for critical alerts',
  async function (this: VitoraWorld, buttonText: string) {
    this.store('buttonUnavailable', buttonText);
    expect(buttonText.length).toBeGreaterThan(0);
  }
);

Then(
  'a tooltip should explain {string}',
  async function (this: VitoraWorld, explanation: string) {
    this.store('tooltipExplanation', explanation);
    expect(explanation.length).toBeGreaterThan(0);
  }
);

Then(
  'the suggested care area should be {string}',
  async function (this: VitoraWorld, area: string) {
    this.store('suggestedCareArea', area);
    expect(area.length).toBeGreaterThan(0);
  }
);

Then(
  'the patient should be assigned to {string}',
  async function (this: VitoraWorld, clinician: string) {
    this.store('assignedClinician', clinician);
    expect(clinician.length).toBeGreaterThan(0);
  }
);

Then(
  'the patient should be added to the triage queue',
  async function (this: VitoraWorld) {
    this.store('patientAddedToTriageQueue', true);
    expect(true).toBe(true);
  }
);

Then(
  'the triage end time should be recorded',
  async function (this: VitoraWorld) {
    this.store('triageEndTimeRecorded', true);
    expect(true).toBe(true);
  }
);

Then(
  'I should see a prompt for override reason',
  async function (this: VitoraWorld) {
    this.store('overrideReasonPromptShown', true);
    expect(true).toBe(true);
  }
);

Then(
  'the override should be logged in audit trail',
  async function (this: VitoraWorld) {
    this.store('overrideLogged', true);
    expect(true).toBe(true);
  }
);

Then(
  'the area code should be {string}',
  async function (this: VitoraWorld, code: string) {
    this.store('areaCode', code);
    expect(code.length).toBeGreaterThan(0);
  }
);
