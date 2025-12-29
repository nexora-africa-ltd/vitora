/**
 * E2E Tests for Treatment Plan Builder (Sprint 1.1-1.2)
 *
 * TDD: These tests assert the builder UI exists and key interactions work:
 * - Dynamic medication rows add/remove
 * - Follow-up presets set date
 * - Referral checkbox toggles referral fields
 */

const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

let electronApp;
let window;

async function login(win) {
  await win.waitForSelector('#login-container', { timeout: 10000 });
  await win.locator('#login-username').fill('testuser');
  await win.locator('#login-password').fill('testpassword123');
  await win.locator('#login-btn').click();
  await win.waitForSelector('#main-container', { state: 'visible', timeout: 15000 });
}

async function registerPatient(win, firstName) {
  await win.locator('[data-tab="register"]').click();
  await win.waitForSelector('#register-tab.active', { timeout: 5000 });

  await win.locator('#first-name').fill(firstName);
  await win.locator('#last-name').fill('Patient');
  await win.locator('#date-of-birth').fill('1980-05-15');
  await win.locator('#gender').selectOption('M');

  // Required location fields
  await win.waitForTimeout(2000);
  await win.locator('#county').selectOption({ index: 1 });
  await win.waitForTimeout(500);
  await win.locator('#sub-county').selectOption({ index: 1 });

  await win.locator('#submit-btn').click();

  await expect(async () => {
    const messageClass = await win.locator('#message').getAttribute('class');
    expect(messageClass).toContain('success');
  }).toPass({ timeout: 15000 });
}

async function openEncounterForPatient(win, patientName) {
  await win.locator('[data-tab="encounter"]').click();
  await win.waitForSelector('#encounter-tab.active', { timeout: 5000 });

  await win.locator('#patient-search').fill(patientName);
  await win.locator('#patient-search-btn').click();
  await win.waitForSelector('.patient-search-item', { state: 'visible', timeout: 10000 });
  await win.locator('.patient-search-item').first().click();

  await win.waitForSelector('#encounter-form', { state: 'visible', timeout: 5000 });
}

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../src/main/index.js')],
    timeout: 60000,
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(5000);

  await login(window);
});

test.afterAll(async () => {
  try {
    const proc = electronApp?.process?.();
    if (proc && !proc.killed) {
      proc.kill('SIGKILL');
    }
  } catch {
    // ignore
  }
});

test.describe('Treatment Plan Builder UI', () => {
  test('shows treatment plan section and core controls', async () => {
    const patientName = `TPB${Date.now()}`;
    await registerPatient(window, patientName);
    await openEncounterForPatient(window, patientName);

    await expect(window.locator('#treatment-template-select')).toBeVisible();
    await expect(window.locator('#apply-template-btn')).toBeVisible();
    await expect(window.locator('table.medication-table')).toBeVisible();
    await expect(window.locator('#add-medication-row-btn')).toBeVisible();
    await expect(window.locator('#follow-up-date')).toBeVisible();
    await expect(window.locator('#patient-instructions-editor')).toBeVisible();
    await expect(window.locator('#referral-needed')).toBeVisible();
  });

  test('adds and removes medication rows', async () => {
    const patientName = `TPBMed${Date.now()}`;
    await registerPatient(window, patientName);
    await openEncounterForPatient(window, patientName);

    const rows = window.locator('#medication-rows tr');
    const initialCount = await rows.count();

    await window.locator('#add-medication-row-btn').click();
    await expect(rows).toHaveCount(initialCount + 1);

    await window.locator('#medication-rows tr').last().locator('button.remove-medication-row-btn').click();
    await expect(rows).toHaveCount(initialCount);
  });

  test('follow-up presets set follow-up date', async () => {
    const patientName = `TPBFollow${Date.now()}`;
    await registerPatient(window, patientName);
    await openEncounterForPatient(window, patientName);

    await window.locator('#follow-up-preset-7').click();
    const dateValue = await window.locator('#follow-up-date').inputValue();
    expect(dateValue).toBeTruthy();
  });

  test('referral checkbox toggles referral fields', async () => {
    const patientName = `TPBRef${Date.now()}`;
    await registerPatient(window, patientName);
    await openEncounterForPatient(window, patientName);

    await expect(window.locator('#referral-fields')).toBeHidden();

    await window.locator('#referral-needed').check();
    await expect(window.locator('#referral-fields')).toBeVisible();

    await window.locator('#referral-needed').uncheck();
    await expect(window.locator('#referral-fields')).toBeHidden();
  });
});
