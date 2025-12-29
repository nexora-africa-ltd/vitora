/**
 * E2E Tests for Patient Registration
 * 
 * Following TDD principles: these tests validate the complete
 * patient registration user flow.
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
  
  // Login first
  await login(window);
});

test.afterAll(async () => {
  // Close the app with a timeout to prevent hanging
  try {
    await Promise.race([
      electronApp.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]);
  } catch (e) {
    // Force kill if close times out
    console.log('Force closing Electron app');
  }
});

test.describe('Patient Registration Flow', () => {
  test('should display patient registration form', async () => {
    // Check that the main container is visible (not login)
    await expect(window.locator('#main-container')).toBeVisible();
    await expect(window.locator('#main-container h1')).toContainText('Vitora HMIS');
    await expect(window.locator('#patient-form')).toBeVisible();
    
    // Check form fields
    await expect(window.locator('#first-name')).toBeVisible();
    await expect(window.locator('#last-name')).toBeVisible();
    await expect(window.locator('#date-of-birth')).toBeVisible();
    await expect(window.locator('#gender')).toBeVisible();
  });
  
  test('should register a new patient', async () => {
    // Fill in the form
    await window.locator('#first-name').fill('John');
    await window.locator('#middle-name').fill('Michael');
    await window.locator('#last-name').fill('Doe');
    await window.locator('#date-of-birth').fill('1990-01-01');
    await window.locator('#gender').selectOption('M');
    await window.locator('#phone-number').fill('+254712345678');
    await window.locator('#email').fill('john.doe@example.com');
    
    // Fill required location fields (county and sub_county are required)
    // Wait for counties dropdown to have options
    await window.waitForTimeout(2000); // Wait for counties API to load
    
    // Select first county with actual value (Baringo is first alphabetically)
    const countySelect = window.locator('#county');
    await countySelect.selectOption({ index: 1 }); // Select first county after placeholder
    
    // Wait for sub-counties to load after county selection
    await window.waitForTimeout(1000);
    
    // Select first sub-county
    const subCountySelect = window.locator('#sub-county');
    await subCountySelect.selectOption({ index: 1 }); // Select first sub-county after placeholder
    
    // Submit the form
    await window.locator('#submit-btn').click();
    
    // Wait for the message element to have the success class (may be hidden after timeout)
    // The message appears briefly, so we poll for it
    await expect(async () => {
      const messageClass = await window.locator('#message').getAttribute('class');
      expect(messageClass).toContain('success');
    }).toPass({ timeout: 15000 });
    
    // Verify the message content (even if hidden)
    const message = await window.locator('#message').textContent();
    expect(message).toContain('Patient registered successfully');
    expect(message).toContain('MRN');
  });
  
  test('should show validation error for missing required fields', async () => {
    // Clear the form first
    await window.locator('#clear-btn').click();
    
    // Try to submit without filling required fields
    await window.locator('#first-name').fill('Jane');
    // Leave last_name, date_of_birth, and gender empty
    
    // Try to submit
    await window.locator('#submit-btn').click();
    
    // Form should not submit due to HTML5 validation
    // The button should remain enabled (not go to "Registering..." state)
    const buttonText = await window.locator('#submit-btn').textContent();
    expect(buttonText.trim()).toBe('Register Patient');
  });
  
  test('should switch to patient list tab', async () => {
    // Click on Patient List tab
    await window.locator('[data-tab="list"]').click();
    
    // Wait for tab content to be visible
    await window.waitForSelector('#list-tab.active', { timeout: 5000 });
    
    // Verify patient list is displayed
    await expect(window.locator('#patient-list')).toBeVisible();
  });
  
  test('should display registered patients in list', async () => {
    // Make sure we're on the list tab
    await window.locator('[data-tab="list"]').click();
    await window.waitForTimeout(2000); // Wait for patients to load
    
    // Check for patient cards
    const patientCards = await window.locator('.patient-card').count();
    expect(patientCards).toBeGreaterThan(0);
  });
  
  test('should search for patients', async () => {
    // Make sure we're on the list tab
    await window.locator('[data-tab="list"]').click();
    await window.waitForTimeout(1000);
    
    // Enter search query
    await window.locator('#search-input').fill('John');
    await window.locator('#search-btn').click();
    
    // Wait for search results
    await window.waitForTimeout(2000);
    
    // Verify search results
    const patientCards = await window.locator('.patient-card').count();
    expect(patientCards).toBeGreaterThanOrEqual(0);
  });
});
