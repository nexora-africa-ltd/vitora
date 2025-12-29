/**
 * E2E Tests for Sprint 0.7 Features - Clinician Feedback Implementation
 *
 * Following TDD principles: these tests validate the new features added in Sprint 0.7:
 * a) Emergency Contact (name, phone, relationship)
 * b) Medical History (allergies, conditions, medications, surgeries, family/social)
 * c) Kenya Location Hierarchy (County → Sub-County → Ward → Village)
 * d) DOB Validation (no future dates)
 * e) Toast Notifications (success/error feedback)
 * f) Referral Source tracking
 * g) Registered By tracking
 * h) SpO2 vital sign in encounters
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
  await win.waitForSelector('#login-container', { timeout: 10000 });
  await win.locator('#login-username').fill('testuser');
  await win.locator('#login-password').fill('testpassword123');
  await win.locator('#login-btn').click();
  await win.waitForSelector('#main-container', { state: 'visible', timeout: 15000 });
}

/**
 * Helper to navigate to a tab
 */
async function navigateToTab(win, tabName) {
  await win.locator(`[data-tab="${tabName}"]`).click();
  await win.waitForTimeout(500);
}

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../src/main/index.js')],
    timeout: 60000
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(5000);
  await login(window);
});

test.afterAll(async () => {
  await electronApp.close();
});

// ============================================================================
// Kenya Location Hierarchy Tests (Item c)
// ============================================================================

test.describe('Kenya Location Hierarchy', () => {
  test.beforeEach(async () => {
    await navigateToTab(window, 'register');
    await window.waitForTimeout(500);
  });

  test('should display location section with County, Sub-County, Ward, Village fields', async () => {
    await expect(window.locator('#county')).toBeVisible();
    await expect(window.locator('#sub-county')).toBeVisible();
    await expect(window.locator('#ward')).toBeVisible();
    await expect(window.locator('#village')).toBeVisible();
  });

  test('should mark County and Sub-County as required', async () => {
    await expect(window.locator('label[for="county"]')).toContainText('*');
    await expect(window.locator('label[for="sub-county"]')).toContainText('*');
  });

  test('should load counties on page load', async () => {
    await window.waitForTimeout(1000); // Wait for counties to load
    const countyOptions = await window.locator('#county option').count();
    expect(countyOptions).toBeGreaterThan(1); // More than just "Select County..."
  });

  test('should have Sub-County disabled initially', async () => {
    await expect(window.locator('#sub-county')).toBeDisabled();
  });

  test('should enable Sub-County when County is selected', async () => {
    await window.waitForTimeout(1000);
    await window.locator('#county').selectOption({ index: 1 }); // Select first county
    await window.waitForTimeout(1000);
    await expect(window.locator('#sub-county')).toBeEnabled();
  });

  test('should load sub-counties for selected county', async () => {
    await window.waitForTimeout(1000);
    await window.locator('#county').selectOption({ index: 1 });
    await window.waitForTimeout(1000);
    const subCountyOptions = await window.locator('#sub-county option').count();
    expect(subCountyOptions).toBeGreaterThan(1);
  });

  test('should enable Ward when Sub-County is selected', async () => {
    await window.waitForTimeout(1000);
    await window.locator('#county').selectOption({ index: 1 });
    await window.waitForTimeout(1000);
    await window.locator('#sub-county').selectOption({ index: 1 });
    await window.waitForTimeout(1000);
    await expect(window.locator('#ward')).toBeEnabled();
  });

  test('should allow free text entry in Village field', async () => {
    await window.locator('#village').fill('Kibera Estate');
    await expect(window.locator('#village')).toHaveValue('Kibera Estate');
  });

  test('should reset Sub-County and Ward when County changes', async () => {
    // Select a county first
    await window.waitForTimeout(1000);
    await window.locator('#county').selectOption({ index: 1 });
    await window.waitForTimeout(1000);

    // Select a sub-county
    await window.locator('#sub-county').selectOption({ index: 1 });
    await window.waitForTimeout(500);

    // Change county - sub-county should reset
    await window.locator('#county').selectOption({ index: 2 });
    await window.waitForTimeout(1000);

    const subCountyValue = await window.locator('#sub-county').inputValue();
    expect(subCountyValue).toBe('');
  });
});

// ============================================================================
// Emergency Contact Tests (Item a)
// ============================================================================

test.describe('Emergency Contact Section', () => {
  test.beforeEach(async () => {
    await navigateToTab(window, 'register');
  });

  test('should display emergency contact section', async () => {
    await expect(window.locator('#emergency-contact-section')).toBeVisible();
  });

  test('should have fields for name, phone, and relationship', async () => {
    await expect(window.locator('#emergency-contact-name')).toBeVisible();
    await expect(window.locator('#emergency-contact-phone')).toBeVisible();
    await expect(window.locator('#emergency-contact-relationship')).toBeVisible();
  });

  test('should have relationship dropdown with correct options', async () => {
    const options = ['', 'spouse', 'parent', 'sibling', 'child', 'friend', 'other'];
    for (const option of options) {
      await expect(window.locator(`#emergency-contact-relationship option[value="${option}"]`)).toBeAttached();
    }
  });

  test('should accept emergency contact details', async () => {
    await window.locator('#emergency-contact-name').fill('Jane Doe');
    await window.locator('#emergency-contact-phone').fill('+254722334455');
    await window.locator('#emergency-contact-relationship').selectOption('spouse');

    await expect(window.locator('#emergency-contact-name')).toHaveValue('Jane Doe');
    await expect(window.locator('#emergency-contact-phone')).toHaveValue('+254722334455');
    await expect(window.locator('#emergency-contact-relationship')).toHaveValue('spouse');
  });
});

// ============================================================================
// Medical History Section Tests (Item b) - Note: In Encounter form
// ============================================================================

test.describe('Medical History Section in Patient Form', () => {
  test.beforeEach(async () => {
    await navigateToTab(window, 'register');
  });

  test('should display medical history section', async () => {
    await expect(window.locator('#medical-history-section')).toBeVisible();
  });

  test('should have collapsible medical history section', async () => {
    await expect(window.locator('#medical-history-toggle')).toBeVisible();
  });

  test('should have all medical history fields', async () => {
    // Expand section if collapsed
    const section = window.locator('#medical-history-section');
    if (await section.evaluate(el => el.classList.contains('collapsed'))) {
      await window.locator('#medical-history-toggle').click();
    }

    await expect(window.locator('#allergies')).toBeVisible();
    await expect(window.locator('#chronic-conditions')).toBeVisible();
    await expect(window.locator('#current-medications')).toBeVisible();
    await expect(window.locator('#past-surgeries')).toBeVisible();
    await expect(window.locator('#family-history')).toBeVisible();
    await expect(window.locator('#social-history')).toBeVisible();
  });

  test('should accept medical history data', async () => {
    // Expand section if collapsed
    const section = window.locator('#medical-history-section');
    if (await section.evaluate(el => el.classList.contains('collapsed'))) {
      await window.locator('#medical-history-toggle').click();
    }

    await window.locator('#allergies').fill('Penicillin, Peanuts');
    await window.locator('#chronic-conditions').fill('Type 2 Diabetes, Hypertension');

    await expect(window.locator('#allergies')).toHaveValue('Penicillin, Peanuts');
    await expect(window.locator('#chronic-conditions')).toHaveValue('Type 2 Diabetes, Hypertension');
  });
});

// ============================================================================
// Referral Source Tests (Item f)
// ============================================================================

test.describe('Referral Source Section', () => {
  test.beforeEach(async () => {
    await navigateToTab(window, 'register');
  });

  test('should display referral source dropdown', async () => {
    await expect(window.locator('#referral-source')).toBeVisible();
  });

  test('should have correct referral source options', async () => {
    await expect(window.locator('#referral-source option[value="self"]')).toBeAttached();
    await expect(window.locator('#referral-source option[value="clinic"]')).toBeAttached();
    await expect(window.locator('#referral-source option[value="other_facility"]')).toBeAttached();
  });

  test('should default to "self"', async () => {
    await expect(window.locator('#referral-source')).toHaveValue('self');
  });

  test('should hide "Referred From" field by default', async () => {
    await expect(window.locator('#referred-from-facility-group')).toBeHidden();
  });

  test('should show "Referred From" field when "other_facility" is selected', async () => {
    await window.locator('#referral-source').selectOption('other_facility');
    await expect(window.locator('#referred-from-facility-group')).toBeVisible();
  });

  test('should hide "Referred From" field when switching back to "self"', async () => {
    await window.locator('#referral-source').selectOption('other_facility');
    await expect(window.locator('#referred-from-facility-group')).toBeVisible();

    await window.locator('#referral-source').selectOption('self');
    await expect(window.locator('#referred-from-facility-group')).toBeHidden();
  });
});

// ============================================================================
// DOB Validation Tests (Item d)
// ============================================================================

test.describe('Date of Birth Validation', () => {
  test.beforeEach(async () => {
    await navigateToTab(window, 'register');
  });

  test('should have date input for DOB', async () => {
    await expect(window.locator('#date-of-birth')).toBeVisible();
    await expect(window.locator('#date-of-birth')).toHaveAttribute('type', 'date');
  });

  test('should not allow future date selection', async () => {
    // Set DOB to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    await window.locator('#date-of-birth').fill(tomorrowStr);

    // Fill in minimum required fields
    await window.locator('#first-name').fill('Test');
    await window.locator('#last-name').fill('Patient');
    await window.locator('#gender').selectOption('M');

    // Wait for counties to load and select location
    await window.waitForTimeout(1000);
    await window.locator('#county').selectOption({ index: 1 });
    await window.waitForTimeout(1000);
    await window.locator('#sub-county').selectOption({ index: 1 });

    // Submit form
    await window.locator('#submit-btn').click();

    // Should show error message about DOB
    await window.waitForTimeout(1000);
    const message = await window.locator('#message');
    await expect(message).toBeVisible();
    const messageText = await message.textContent();
    expect(messageText.toLowerCase()).toContain('date');
  });
});

// ============================================================================
// SpO2 Vital Sign Tests (Item h)
// ============================================================================

test.describe('SpO2 Vital Sign in Encounter Form', () => {
  test.beforeEach(async () => {
    await navigateToTab(window, 'encounter');
  });

  test('should display SpO2 field in encounter form', async () => {
    await expect(window.locator('#spo2')).toBeVisible();
  });

  test('should have correct SpO2 field attributes', async () => {
    await expect(window.locator('#spo2')).toHaveAttribute('type', 'number');
    await expect(window.locator('#spo2')).toHaveAttribute('min', '0');
    await expect(window.locator('#spo2')).toHaveAttribute('max', '100');
  });

  test('should have SpO2 label showing percentage', async () => {
    await expect(window.locator('label[for="spo2"]')).toContainText('%');
  });

  test('should accept valid SpO2 values', async () => {
    await window.locator('#spo2').fill('98');
    await expect(window.locator('#spo2')).toHaveValue('98');
  });
});

// ============================================================================
// Complete Patient Registration with All New Fields
// ============================================================================

test.describe('Complete Patient Registration with Sprint 0.7 Fields', () => {
  test('should successfully register patient with all new fields', async () => {
    await navigateToTab(window, 'register');
    await window.waitForTimeout(1000);

    // Personal Information
    await window.locator('#first-name').fill('Test');
    await window.locator('#middle-name').fill('Sprint07');
    await window.locator('#last-name').fill('Patient');
    await window.locator('#date-of-birth').fill('1990-05-15');
    await window.locator('#gender').selectOption('F');
    await window.locator('#phone-number').fill('+254700123456');
    await window.locator('#email').fill('test.sprint07@example.com');

    // Kenya Location
    await window.locator('#county').selectOption({ index: 1 });
    await window.waitForTimeout(1000);
    await window.locator('#sub-county').selectOption({ index: 1 });
    await window.waitForTimeout(1000);
    await window.locator('#ward').selectOption({ index: 1 });
    await window.locator('#village').fill('Kibera');

    // Referral Source
    await window.locator('#referral-source').selectOption('clinic');

    // Emergency Contact
    await window.locator('#emergency-contact-name').fill('John Emergency');
    await window.locator('#emergency-contact-phone').fill('+254711999888');
    await window.locator('#emergency-contact-relationship').selectOption('spouse');

    // Medical History (expand if collapsed)
    const section = window.locator('#medical-history-section');
    if (await section.evaluate(el => el.classList.contains('collapsed'))) {
      await window.locator('#medical-history-toggle').click();
    }
    await window.locator('#allergies').fill('None known');
    await window.locator('#chronic-conditions').fill('Asthma');

    // Submit form
    await window.locator('#submit-btn').click();

    // Wait for response
    await window.waitForTimeout(2000);

    // Check success message
    const message = window.locator('#message');
    await expect(message).toBeVisible();
    const messageText = await message.textContent();
    expect(messageText.toLowerCase()).toContain('success');
    expect(messageText).toContain('MRN:');
  });
});

// ============================================================================
// Toast Notification Tests (Item e)
// ============================================================================

test.describe('Toast Notifications', () => {
  test('should show success message after patient registration', async () => {
    await navigateToTab(window, 'register');
    await window.waitForTimeout(1000);

    // Fill minimum required fields
    await window.locator('#first-name').fill('Toast');
    await window.locator('#last-name').fill('Test');
    await window.locator('#date-of-birth').fill('1985-01-01');
    await window.locator('#gender').selectOption('M');

    // Select location
    await window.locator('#county').selectOption({ index: 1 });
    await window.waitForTimeout(1000);
    await window.locator('#sub-county').selectOption({ index: 1 });

    // Submit
    await window.locator('#submit-btn').click();
    await window.waitForTimeout(2000);

    // Check for success message
    const message = window.locator('#message');
    await expect(message).toBeVisible();
    await expect(message).toHaveClass(/success/);
  });

  test('should show error message for invalid data', async () => {
    await navigateToTab(window, 'register');

    // Submit without filling required fields - browser validation should prevent
    // But we can test for API errors
    await window.locator('#first-name').fill('Error');
    await window.locator('#last-name').fill('Test');
    await window.locator('#date-of-birth').fill('1985-01-01');
    await window.locator('#gender').selectOption('M');
    // Don't fill county/sub-county which are required

    // Remove required attribute temporarily for testing
    await window.locator('#county').evaluate(el => el.removeAttribute('required'));
    await window.locator('#sub-county').evaluate(el => el.removeAttribute('required'));

    await window.locator('#submit-btn').click();
    await window.waitForTimeout(2000);

    // Check for error message
    const message = window.locator('#message');
    await expect(message).toBeVisible();
    await expect(message).toHaveClass(/error/);
  });
});

// ============================================================================
// Form Reset Tests
// ============================================================================

test.describe('Form Reset Functionality', () => {
  test('should clear all fields including new Sprint 0.7 fields', async () => {
    await navigateToTab(window, 'register');
    await window.waitForTimeout(1000);

    // Fill some fields
    await window.locator('#first-name').fill('Reset');
    await window.locator('#last-name').fill('Test');
    await window.locator('#county').selectOption({ index: 1 });
    await window.waitForTimeout(500);
    await window.locator('#emergency-contact-name').fill('Emergency Test');
    await window.locator('#village').fill('Test Village');

    // Click clear button
    await window.locator('#clear-btn').click();
    await window.waitForTimeout(500);

    // Verify fields are cleared
    await expect(window.locator('#first-name')).toHaveValue('');
    await expect(window.locator('#last-name')).toHaveValue('');
    await expect(window.locator('#emergency-contact-name')).toHaveValue('');
    await expect(window.locator('#village')).toHaveValue('');
    await expect(window.locator('#sub-county')).toBeDisabled();
    await expect(window.locator('#ward')).toBeDisabled();
  });
});
