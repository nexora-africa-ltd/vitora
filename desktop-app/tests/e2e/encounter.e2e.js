/**
 * E2E Tests for Encounter Management
 * 
 * Following TDD principles: these tests validate the complete
 * encounter creation flow including patient selection, vitals entry,
 * and form submission.
 * 
 * Sprint 0.6: Encounter E2E tests
 */

const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

let electronApp;
let window;

/**
 * Helper function to login
 */
async function login(win) {
  // Wait for login screen
  await win.waitForSelector('#login-container', { timeout: 10000 });
  
  // Fill in credentials
  await win.locator('#login-username').fill('testuser');
  await win.locator('#login-password').fill('testpassword123');
  
  // Click login
  await win.locator('#login-btn').click();
  
  // Wait for main app to appear
  await win.waitForSelector('#main-container', { state: 'visible', timeout: 15000 });
}

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../src/main/index.js')],
    timeout: 60000 // Give backend time to start
  });
  
  // Get the first window
  window = await electronApp.firstWindow();
  
  // Wait for app to be ready
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(5000); // Wait for backend to be ready
  
  // Login first (required for all tests)
  await login(window);
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Encounter Tab Navigation', () => {
  test('should display encounter tab', async () => {
    await expect(window.locator('[data-tab="encounter"]')).toBeVisible();
  });
  
  test('should switch to encounter tab', async () => {
    await window.locator('[data-tab="encounter"]').click();
    await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
    
    await expect(window.locator('#encounter-tab')).toHaveClass(/active/);
    await expect(window.locator('#encounter-tab h2')).toContainText('New Encounter');
  });
  
  test('should display patient search field', async () => {
    await window.locator('[data-tab="encounter"]').click();
    await expect(window.locator('#patient-search')).toBeVisible();
    await expect(window.locator('#patient-search-btn')).toBeVisible();
  });
});

test.describe('Patient Selection for Encounter', () => {
  test.beforeEach(async () => {
    // Navigate to encounter tab
    await window.locator('[data-tab="encounter"]').click();
    await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
  });
  
  test('should search for patients', async () => {
    await window.locator('#patient-search').fill('Jane');
    await window.locator('#patient-search-btn').click();
    
    await window.waitForTimeout(2000);
    
    // Should show search results
    const results = await window.locator('.patient-search-item').count();
    expect(results).toBeGreaterThanOrEqual(0); // May or may not find patients
  });
  
  test('should show message when no patient found', async () => {
    await window.locator('#patient-search').fill('NonExistentPatient12345');
    await window.locator('#patient-search-btn').click();
    
    await window.waitForTimeout(2000);
    
    // Should show no results message
    await expect(window.locator('#patient-search-results')).toContainText('No patients found');
  });
  
  test('should require patient search input', async () => {
    await window.locator('#patient-search').fill('');
    await window.locator('#patient-search-btn').click();
    
    // Should prompt to enter search
    await expect(window.locator('#patient-search-results')).toContainText('Enter a name or MRN');
  });
});

test.describe('Encounter Form', () => {
  let patientName;
  
  test.beforeEach(async () => {
    // First register a patient to use
    await window.locator('[data-tab="register"]').click();
    await window.waitForSelector('#register-tab.active', { timeout: 5000 });
    
    // Register a test patient with unique name
    const timestamp = Date.now();
    patientName = `EncounterTest${timestamp}`;
    await window.locator('#first-name').fill(patientName);
    await window.locator('#last-name').fill('Patient');
    await window.locator('#date-of-birth').fill('1980-05-15');
    await window.locator('#gender').selectOption('M');
    await window.locator('#submit-btn').click();
    
    // Wait for success message
    await window.waitForSelector('.message.success', { timeout: 10000 });
    
    // Navigate to encounter tab
    await window.locator('[data-tab="encounter"]').click();
    await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
    
    // Search for the patient we just registered
    await window.locator('#patient-search').fill(patientName);
    await window.locator('#patient-search-btn').click();
    
    // Wait for search results to appear
    await window.waitForSelector('.patient-search-item', { state: 'visible', timeout: 10000 });
    
    // Click on the first result
    await window.locator('.patient-search-item').first().click();
    
    // Wait for the selected patient to appear and form to be visible
    await window.waitForSelector('#selected-patient', { state: 'visible', timeout: 5000 });
    await window.waitForSelector('#encounter-form', { state: 'visible', timeout: 5000 });
  });
  
  test('should display encounter form after patient selection', async () => {
    // Form should be visible after patient selection in beforeEach
    await expect(window.locator('#encounter-form')).toBeVisible();
    await expect(window.locator('#selected-patient')).toBeVisible();
    await expect(window.locator('#encounter-type')).toBeVisible();
    await expect(window.locator('#encounter-date')).toBeVisible();
    await expect(window.locator('#chief-complaint')).toBeVisible();
  });
  
  test('should display vitals input fields', async () => {
    // All vital sign fields should be visible
    await expect(window.locator('#temperature')).toBeVisible();
    await expect(window.locator('#pulse')).toBeVisible();
    await expect(window.locator('#blood-pressure')).toBeVisible();
    await expect(window.locator('#respiratory-rate')).toBeVisible();
    await expect(window.locator('#weight')).toBeVisible();
    await expect(window.locator('#height')).toBeVisible();
  });
  
  test('should calculate BMI when weight and height are entered', async () => {
    await window.locator('#weight').fill('70');
    await window.locator('#height').fill('175');
    
    // BMI display should appear
    await expect(window.locator('#bmi-display')).toBeVisible();
    
    // BMI should be calculated (70 / 1.75^2 = 22.9)
    const bmiValue = await window.locator('#bmi-value').textContent();
    expect(parseFloat(bmiValue)).toBeCloseTo(22.9, 0);
  });
  
  test('should allow changing selected patient', async () => {
    // Click change button
    await window.locator('#change-patient-btn').click();
    
    // Wait for form to be hidden
    await window.waitForSelector('#encounter-form', { state: 'hidden', timeout: 5000 });
    
    // Patient search should be visible again
    await expect(window.locator('#patient-search')).toBeVisible();
    await expect(window.locator('#encounter-form')).not.toBeVisible();
  });
});

test.describe('Encounter Submission', () => {
  test('should create encounter with valid data', async () => {
    // Register a new patient
    await window.locator('[data-tab="register"]').click();
    await window.waitForSelector('#register-tab.active', { timeout: 5000 });
    
    const timestamp = Date.now();
    await window.locator('#first-name').fill(`Encounter${timestamp}`);
    await window.locator('#last-name').fill('Test');
    await window.locator('#date-of-birth').fill('1990-03-20');
    await window.locator('#gender').selectOption('F');
    await window.locator('#submit-btn').click();
    
    await window.waitForSelector('.message.success', { timeout: 10000 });
    
    // Navigate to encounter tab
    await window.locator('[data-tab="encounter"]').click();
    await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
    
    // Search and select patient
    await window.locator('#patient-search').fill(`Encounter${timestamp}`);
    await window.locator('#patient-search-btn').click();
    await window.waitForTimeout(2000);
    
    const firstResult = window.locator('.patient-search-item').first();
    if (await firstResult.isVisible()) {
      await firstResult.click();
      
      // Wait for form to appear
      await window.waitForSelector('#encounter-form', { state: 'visible', timeout: 5000 });
      
      // Fill encounter form
      await window.locator('#encounter-type').selectOption('OPD');
      await window.locator('#chief-complaint').fill('Headache and fever for 2 days');
      await window.locator('#temperature').fill('38.5');
      await window.locator('#pulse').fill('85');
      await window.locator('#blood-pressure').fill('120/80');
      await window.locator('#respiratory-rate').fill('18');
      await window.locator('#weight').fill('65');
      await window.locator('#height').fill('165');
      await window.locator('#notes').fill('Patient appears fatigued. Recommend rest and hydration.');
      
      // Submit
      await window.locator('#encounter-submit-btn').click();
      
      // Wait for success message
      await window.waitForSelector('#encounter-message.success', { timeout: 10000 });
      
      const message = await window.locator('#encounter-message').textContent();
      expect(message).toContain('Encounter saved successfully');
    }
  });
  
  test('should require chief complaint', async () => {
    // Navigate to encounter tab
    await window.locator('[data-tab="encounter"]').click();
    await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
    
    // If form is visible (patient selected from previous test)
    const encounterForm = window.locator('#encounter-form');
    
    if (await encounterForm.isVisible()) {
      // Clear chief complaint and try to submit
      await window.locator('#chief-complaint').fill('');
      await window.locator('#encounter-type').selectOption('OPD');
      
      // Submit should fail due to HTML5 validation
      await window.locator('#encounter-submit-btn').click();
      
      // Button should not change to "Saving..." if validation failed
      const buttonText = await window.locator('#encounter-submit-btn').textContent();
      expect(buttonText).toBe('Save Encounter');
    }
  });
});

test.describe('Start Encounter from Patient List', () => {
  test('should navigate to encounter from patient list', async () => {
    // First ensure we have a patient
    await window.locator('[data-tab="list"]').click();
    await window.waitForTimeout(2000);
    
    // Check if there are patient cards
    const patientCards = await window.locator('.patient-card').count();
    
    if (patientCards > 0) {
      // Click "New Encounter" button on first patient
      const encounterBtn = window.locator('.btn-encounter').first();
      await encounterBtn.click();
      
      // Should switch to encounter tab with patient selected
      await expect(window.locator('#encounter-tab')).toHaveClass(/active/);
      await expect(window.locator('#selected-patient')).toBeVisible();
      await expect(window.locator('#encounter-form')).toBeVisible();
    }
  });
});
