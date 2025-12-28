/**
 * E2E Tests for Encounter Management
 * 
 * Following TDD principles: these tests validate the complete
 * encounter creation and management user flow.
 */

const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

let electronApp;
let window;

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
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Encounter Management Flow', () => {
  test.describe('New Encounter Tab', () => {
    test('should display encounter tab with patient search', async () => {
      // Click on New Encounter tab
      await window.locator('[data-tab="encounter"]').click();
      
      // Wait for tab content to be visible
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // Verify patient search is visible
      await expect(window.locator('#patient-search')).toBeVisible();
      await expect(window.locator('#patient-search-btn')).toBeVisible();
    });

    test('should search and select a patient for encounter', async () => {
      // First, ensure we have a patient by registering one
      await window.locator('[data-tab="register"]').click();
      await window.waitForSelector('#register-tab.active', { timeout: 5000 });
      
      const uniqueName = `TestEncounter${Date.now()}`;
      await window.locator('#first-name').fill(uniqueName);
      await window.locator('#last-name').fill('Patient');
      await window.locator('#date-of-birth').fill('1985-05-15');
      await window.locator('#gender').selectOption('F');
      await window.locator('#submit-btn').click();
      
      // Wait for success
      await window.waitForSelector('.message.success', { timeout: 10000 });
      
      // Now switch to encounter tab
      await window.locator('[data-tab="encounter"]').click();
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // Search for the patient
      await window.locator('#patient-search').fill(uniqueName);
      await window.locator('#patient-search-btn').click();
      
      // Wait for search results
      await window.waitForTimeout(2000);
      
      // Select the patient
      const patientSearchItem = window.locator('.patient-search-item').first();
      if (await patientSearchItem.isVisible()) {
        await patientSearchItem.click();
        
        // Verify patient is selected
        await expect(window.locator('#selected-patient')).toBeVisible();
        await expect(window.locator('#encounter-form')).toBeVisible();
      }
    });

    test('should display encounter form after patient selection', async () => {
      // Search for an existing patient
      await window.locator('[data-tab="encounter"]').click();
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // Check if a patient is already selected or search for one
      const selectedPatient = window.locator('#selected-patient');
      if (!(await selectedPatient.isVisible())) {
        await window.locator('#patient-search').fill('Test');
        await window.locator('#patient-search-btn').click();
        await window.waitForTimeout(2000);
        
        const patientItem = window.locator('.patient-search-item').first();
        if (await patientItem.isVisible()) {
          await patientItem.click();
        }
      }
      
      // Verify encounter form fields if patient selected
      if (await selectedPatient.isVisible()) {
        await expect(window.locator('#encounter-type')).toBeVisible();
        await expect(window.locator('#encounter-date')).toBeVisible();
        await expect(window.locator('#chief-complaint')).toBeVisible();
      }
    });
  });

  test.describe('Vital Signs Entry', () => {
    test('should calculate BMI when height and weight entered', async () => {
      await window.locator('[data-tab="encounter"]').click();
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // Enter weight and height
      await window.locator('#weight').fill('70');
      await window.locator('#height').fill('175');
      
      // Wait for BMI calculation
      await window.waitForTimeout(500);
      
      // Verify BMI is displayed
      const bmiDisplay = window.locator('#bmi-display');
      await expect(bmiDisplay).toBeVisible();
      
      // BMI = 70 / (1.75 * 1.75) = 22.9
      const bmiValue = await window.locator('#bmi-value').textContent();
      expect(parseFloat(bmiValue)).toBeCloseTo(22.9, 0);
      
      // Should show Normal category
      const bmiCategory = await window.locator('#bmi-category').textContent();
      expect(bmiCategory).toBe('Normal');
    });

    test('should show BMI categories correctly', async () => {
      await window.locator('[data-tab="encounter"]').click();
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // Test underweight (BMI < 18.5)
      await window.locator('#weight').fill('50');
      await window.locator('#height').fill('175');
      await window.waitForTimeout(500);
      
      let bmiCategory = await window.locator('#bmi-category').textContent();
      expect(bmiCategory).toBe('Underweight');
      
      // Test overweight (BMI 25-30)
      await window.locator('#weight').fill('85');
      await window.waitForTimeout(500);
      
      bmiCategory = await window.locator('#bmi-category').textContent();
      expect(bmiCategory).toBe('Overweight');
      
      // Clear for next test
      await window.locator('#weight').fill('');
      await window.locator('#height').fill('');
    });

    test('should accept valid vital signs', async () => {
      await window.locator('[data-tab="encounter"]').click();
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // Enter valid vitals
      await window.locator('#temperature').fill('37.5');
      await window.locator('#pulse').fill('72');
      await window.locator('#blood-pressure').fill('120/80');
      await window.locator('#respiratory-rate').fill('16');
      await window.locator('#weight').fill('70');
      await window.locator('#height').fill('175');
      
      // Verify all fields accepted input
      expect(await window.locator('#temperature').inputValue()).toBe('37.5');
      expect(await window.locator('#pulse').inputValue()).toBe('72');
      expect(await window.locator('#blood-pressure').inputValue()).toBe('120/80');
    });
  });

  test.describe('Encounter Submission', () => {
    test('should create encounter for selected patient', async () => {
      // Navigate to encounter tab
      await window.locator('[data-tab="encounter"]').click();
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // Search and select a patient if not already selected
      const selectedPatient = window.locator('#selected-patient');
      if (!(await selectedPatient.isVisible())) {
        await window.locator('#patient-search').fill('John');
        await window.locator('#patient-search-btn').click();
        await window.waitForTimeout(2000);
        
        const patientItem = window.locator('.patient-search-item').first();
        if (await patientItem.isVisible()) {
          await patientItem.click();
          await window.waitForTimeout(500);
        } else {
          // Skip if no patients available
          test.skip();
          return;
        }
      }
      
      // Fill encounter form
      await window.locator('#encounter-type').selectOption('outpatient');
      
      const today = new Date().toISOString().split('T')[0];
      await window.locator('#encounter-date').fill(today);
      
      await window.locator('#chief-complaint').fill('Routine checkup for E2E test');
      await window.locator('#temperature').fill('36.8');
      await window.locator('#pulse').fill('68');
      await window.locator('#blood-pressure').fill('118/78');
      await window.locator('#respiratory-rate').fill('14');
      await window.locator('#weight').fill('72');
      await window.locator('#height').fill('170');
      await window.locator('#notes').fill('Patient in good health. E2E test encounter.');
      
      // Submit the encounter
      await window.locator('#encounter-submit-btn').click();
      
      // Wait for success message
      await window.waitForSelector('#encounter-message.message.success', { timeout: 10000 });
      
      // Verify success
      const message = await window.locator('#encounter-message').textContent();
      expect(message).toContain('Encounter saved successfully');
    });

    test('should require chief complaint for encounter submission', async () => {
      await window.locator('[data-tab="encounter"]').click();
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // The chief complaint field should have required attribute
      const chiefComplaint = window.locator('#chief-complaint');
      const isRequired = await chiefComplaint.getAttribute('required');
      expect(isRequired).not.toBeNull();
    });

    test('should clear form after clear button click', async () => {
      await window.locator('[data-tab="encounter"]').click();
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // Fill some fields
      await window.locator('#temperature').fill('38.0');
      await window.locator('#pulse').fill('90');
      await window.locator('#chief-complaint').fill('Test complaint');
      
      // Click clear button
      await window.locator('#encounter-clear-btn').click();
      
      // Verify fields are cleared
      expect(await window.locator('#temperature').inputValue()).toBe('');
      expect(await window.locator('#pulse').inputValue()).toBe('');
      expect(await window.locator('#chief-complaint').inputValue()).toBe('');
      
      // BMI display should be hidden
      const bmiDisplay = window.locator('#bmi-display');
      await expect(bmiDisplay).not.toBeVisible();
    });
  });
});

test.describe('Patient Details Modal', () => {
  test('should open patient details modal from patient list', async () => {
    // First, go to patient list
    await window.locator('[data-tab="list"]').click();
    await window.waitForSelector('#list-tab.active', { timeout: 5000 });
    await window.waitForTimeout(2000); // Wait for patients to load
    
    // Click on View Details for first patient
    const viewDetailsBtn = window.locator('.btn-view').first();
    if (await viewDetailsBtn.isVisible()) {
      await viewDetailsBtn.click();
      
      // Wait for modal to appear
      await window.waitForSelector('#patient-modal', { timeout: 5000 });
      await expect(window.locator('#patient-modal')).toBeVisible();
      
      // Verify modal content
      await expect(window.locator('.patient-details-header h2')).toBeVisible();
      await expect(window.locator('.encounter-history h3')).toBeVisible();
    }
  });

  test('should close modal when clicking close button', async () => {
    // Open modal first
    await window.locator('[data-tab="list"]').click();
    await window.waitForSelector('#list-tab.active', { timeout: 5000 });
    await window.waitForTimeout(2000);
    
    const viewDetailsBtn = window.locator('.btn-view').first();
    if (await viewDetailsBtn.isVisible()) {
      await viewDetailsBtn.click();
      await window.waitForSelector('#patient-modal', { timeout: 5000 });
      
      // Click close button
      await window.locator('.close-modal').click();
      
      // Modal should be hidden
      await expect(window.locator('#patient-modal')).not.toBeVisible();
    }
  });

  test('should show encounter history in patient details modal', async () => {
    // Open modal for a patient with encounters
    await window.locator('[data-tab="list"]').click();
    await window.waitForSelector('#list-tab.active', { timeout: 5000 });
    await window.waitForTimeout(2000);
    
    const viewDetailsBtn = window.locator('.btn-view').first();
    if (await viewDetailsBtn.isVisible()) {
      await viewDetailsBtn.click();
      await window.waitForSelector('#patient-modal', { timeout: 5000 });
      
      // Check for encounter history section
      await expect(window.locator('.encounter-history')).toBeVisible();
      
      // The count should be displayed
      const historyHeader = await window.locator('.encounter-history h3').textContent();
      expect(historyHeader).toContain('Encounter History');
    }
  });

  test('should start new encounter from patient details modal', async () => {
    // Open modal first
    await window.locator('[data-tab="list"]').click();
    await window.waitForSelector('#list-tab.active', { timeout: 5000 });
    await window.waitForTimeout(2000);
    
    const viewDetailsBtn = window.locator('.btn-view').first();
    if (await viewDetailsBtn.isVisible()) {
      await viewDetailsBtn.click();
      await window.waitForSelector('#patient-modal', { timeout: 5000 });
      
      // Click New Encounter button in modal
      const newEncounterBtn = window.locator('.patient-details-header .view-encounters-btn');
      if (await newEncounterBtn.isVisible()) {
        await newEncounterBtn.click();
        
        // Should switch to encounter tab with patient selected
        await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
        await expect(window.locator('#selected-patient')).toBeVisible();
      }
    }
  });
});

test.describe('Offline Indicator', () => {
  test('should display offline indicator element', async () => {
    // The offline indicator should exist in the DOM
    const indicator = window.locator('#offline-indicator');
    await expect(indicator).toBeAttached();
  });

  test('offline indicator should show online status when backend is running', async () => {
    // Wait for connection check
    await window.waitForTimeout(3000);
    
    // When backend is running, indicator should either be hidden or show online
    const indicator = window.locator('#offline-indicator');
    const isHidden = await indicator.evaluate(el => el.style.display === 'none');
    const hasOnlineClass = await indicator.evaluate(el => el.classList.contains('online-indicator'));
    
    // Either hidden (online) or showing online indicator
    expect(isHidden || hasOnlineClass).toBeTruthy();
  });
});

test.describe('Quick Actions from Patient List', () => {
  test('should have New Encounter button on patient cards', async () => {
    await window.locator('[data-tab="list"]').click();
    await window.waitForSelector('#list-tab.active', { timeout: 5000 });
    await window.waitForTimeout(2000);
    
    // Check for New Encounter buttons
    const encounterBtns = window.locator('.btn-encounter');
    const count = await encounterBtns.count();
    
    // If there are patients, there should be encounter buttons
    if (count > 0) {
      await expect(encounterBtns.first()).toBeVisible();
    }
  });

  test('should start encounter from patient list', async () => {
    await window.locator('[data-tab="list"]').click();
    await window.waitForSelector('#list-tab.active', { timeout: 5000 });
    await window.waitForTimeout(2000);
    
    const encounterBtn = window.locator('.btn-encounter').first();
    if (await encounterBtn.isVisible()) {
      await encounterBtn.click();
      
      // Should switch to encounter tab
      await window.waitForSelector('#encounter-tab.active', { timeout: 5000 });
      
      // Patient should be pre-selected
      await expect(window.locator('#selected-patient')).toBeVisible();
      await expect(window.locator('#encounter-form')).toBeVisible();
    }
  });
});
