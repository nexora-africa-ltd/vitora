/**
 * E2E Tests for Sprint 0.7 UI Enhancements
 *
 * Following TDD principles: Write tests FIRST, then implement.
 *
 * Tests cover:
 * - Kenya Location Hierarchy (County → Sub-county → Ward → Village)
 * - Emergency Contact fields
 * - Referral Source fields
 * - Medical History section
 * - SpO2 vital sign
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

// ====================
// Kenya Location Hierarchy Tests
// ====================
test.describe('Kenya Location Hierarchy', () => {
  test('should display county dropdown', async () => {
    // Navigate to register tab
    await window.locator('.tab[data-tab="register"]').click();

    // Check county dropdown exists
    await expect(window.locator('#county')).toBeVisible();
    await expect(window.locator('label[for="county"]')).toContainText('County');
  });

  test('should display sub-county dropdown', async () => {
    await expect(window.locator('#sub-county')).toBeVisible();
    await expect(window.locator('label[for="sub-county"]')).toContainText('Sub-County');
  });

  test('should display ward dropdown (optional)', async () => {
    await expect(window.locator('#ward')).toBeVisible();
    await expect(window.locator('label[for="ward"]')).toContainText('Ward');
  });

  test('should display village/estate text field (optional)', async () => {
    await expect(window.locator('#village')).toBeVisible();
    await expect(window.locator('label[for="village"]')).toContainText('Village');
  });

  test('should load counties on form load', async () => {
    // Wait for counties to load
    await window.waitForTimeout(1000);

    // Check that county dropdown has options
    const countyOptions = await window.locator('#county option').count();
    expect(countyOptions).toBeGreaterThan(1); // More than just placeholder
  });

  test('should filter sub-counties when county is selected', async () => {
    // Select a county (Mombasa - code 1)
    await window.locator('#county').selectOption({ label: 'Mombasa' });

    // Wait for sub-counties to load
    await window.waitForTimeout(500);

    // Check that sub-county dropdown has options
    const subCountyOptions = await window.locator('#sub-county option').count();
    expect(subCountyOptions).toBeGreaterThan(1);

    // Verify sub-counties belong to Mombasa (e.g., Changamwe, Jomvu)
    const html = await window.locator('#sub-county').innerHTML();
    expect(html).toMatch(/Changamwe|Jomvu|Kisauni/);
  });

  test('should filter wards when sub-county is selected', async () => {
    // Ensure county is selected first
    await window.locator('#county').selectOption({ label: 'Mombasa' });
    await window.waitForTimeout(500);

    // Select a sub-county
    await window.locator('#sub-county').selectOption({ label: 'Changamwe' });

    // Wait for wards to load
    await window.waitForTimeout(500);

    // Check that ward dropdown has options
    const wardOptions = await window.locator('#ward option').count();
    expect(wardOptions).toBeGreaterThan(1);
  });

  test('should allow typing in village field', async () => {
    const village = 'Mikindani Estate';
    await window.locator('#village').fill(village);

    const value = await window.locator('#village').inputValue();
    expect(value).toBe(village);
  });

  test('county and sub-county should be marked as required', async () => {
    // Check required attribute
    const countyRequired = await window.locator('#county').getAttribute('required');
    const subCountyRequired = await window.locator('#sub-county').getAttribute('required');

    expect(countyRequired).not.toBeNull();
    expect(subCountyRequired).not.toBeNull();
  });

  test('ward and village should be optional', async () => {
    // Check that ward and village don't have required attribute
    const wardRequired = await window.locator('#ward').getAttribute('required');
    const villageRequired = await window.locator('#village').getAttribute('required');

    expect(wardRequired).toBeNull();
    expect(villageRequired).toBeNull();
  });
});

// ====================
// Emergency Contact Tests
// ====================
test.describe('Emergency Contact Fields', () => {
  test('should display emergency contact section', async () => {
    await window.locator('.tab[data-tab="register"]').click();

    // Check section exists
    await expect(window.locator('#emergency-contact-section')).toBeVisible();
  });

  test('should display emergency contact name field', async () => {
    await expect(window.locator('#emergency-contact-name')).toBeVisible();
    await expect(window.locator('label[for="emergency-contact-name"]')).toContainText('Contact Name');
  });

  test('should display emergency contact phone field', async () => {
    await expect(window.locator('#emergency-contact-phone')).toBeVisible();
    await expect(window.locator('label[for="emergency-contact-phone"]')).toContainText('Contact Phone');
  });

  test('should display emergency contact relationship dropdown', async () => {
    await expect(window.locator('#emergency-contact-relationship')).toBeVisible();
    await expect(window.locator('label[for="emergency-contact-relationship"]')).toContainText('Relationship');
  });

  test('should have relationship options', async () => {
    const options = await window.locator('#emergency-contact-relationship option').allTextContents();

    expect(options).toContain('Spouse');
    expect(options).toContain('Parent');
    expect(options).toContain('Sibling');
    expect(options).toContain('Child');
    expect(options).toContain('Other');
  });

  test('emergency contact fields should be optional', async () => {
    // All emergency contact fields should be optional
    const nameRequired = await window.locator('#emergency-contact-name').getAttribute('required');
    const phoneRequired = await window.locator('#emergency-contact-phone').getAttribute('required');
    const relationRequired = await window.locator('#emergency-contact-relationship').getAttribute('required');

    expect(nameRequired).toBeNull();
    expect(phoneRequired).toBeNull();
    expect(relationRequired).toBeNull();
  });
});

// ====================
// Referral Source Tests
// ====================
test.describe('Referral Source Fields', () => {
  test('should display referral source dropdown', async () => {
    await window.locator('.tab[data-tab="register"]').click();

    await expect(window.locator('#referral-source')).toBeVisible();
    await expect(window.locator('label[for="referral-source"]')).toContainText('Referral Source');
  });

  test('should have referral source options', async () => {
    const options = await window.locator('#referral-source option').allTextContents();

    expect(options).toContain('Self');
    expect(options).toContain('Clinic');
    expect(options).toContain('Other Facility');
  });

  test('should display referred from facility field', async () => {
    await expect(window.locator('#referred-from-facility')).toBeVisible();
    await expect(window.locator('label[for="referred-from-facility"]')).toContainText('Referred From');
  });

  test('referred from facility should be hidden when referral source is self', async () => {
    await window.locator('#referral-source').selectOption('self');

    // Field should be hidden or disabled
    const facilityGroup = window.locator('#referred-from-facility-group');
    await expect(facilityGroup).toHaveClass(/hidden|disabled/);
  });

  test('referred from facility should be visible when referral source is other_facility', async () => {
    await window.locator('#referral-source').selectOption('other_facility');

    // Field should be visible
    const facilityGroup = window.locator('#referred-from-facility-group');
    await expect(facilityGroup).not.toHaveClass(/hidden/);
    await expect(window.locator('#referred-from-facility')).toBeVisible();
  });
});

// ====================
// Medical History Tests
// ====================
test.describe('Medical History Section', () => {
  test('should display medical history section', async () => {
    await window.locator('.tab[data-tab="register"]').click();

    await expect(window.locator('#medical-history-section')).toBeVisible();
  });

  test('should display allergies field', async () => {
    await expect(window.locator('#allergies')).toBeVisible();
    await expect(window.locator('label[for="allergies"]')).toContainText('Allergies');
  });

  test('should display chronic conditions field', async () => {
    await expect(window.locator('#chronic-conditions')).toBeVisible();
    await expect(window.locator('label[for="chronic-conditions"]')).toContainText('Chronic Conditions');
  });

  test('should display current medications field', async () => {
    await expect(window.locator('#current-medications')).toBeVisible();
    await expect(window.locator('label[for="current-medications"]')).toContainText('Current Medications');
  });

  test('should display past surgeries field', async () => {
    await expect(window.locator('#past-surgeries')).toBeVisible();
    await expect(window.locator('label[for="past-surgeries"]')).toContainText('Past Surgeries');
  });

  test('should display family history field', async () => {
    await expect(window.locator('#family-history')).toBeVisible();
    await expect(window.locator('label[for="family-history"]')).toContainText('Family History');
  });

  test('should display social history field', async () => {
    await expect(window.locator('#social-history')).toBeVisible();
    await expect(window.locator('label[for="social-history"]')).toContainText('Social History');
  });

  test('medical history fields should be optional', async () => {
    const fields = ['#allergies', '#chronic-conditions', '#current-medications',
                    '#past-surgeries', '#family-history', '#social-history'];

    for (const field of fields) {
      const required = await window.locator(field).getAttribute('required');
      expect(required).toBeNull();
    }
  });

  test('should be able to toggle medical history section', async () => {
    // Check for collapsible section
    const toggleBtn = window.locator('#medical-history-toggle');

    if (await toggleBtn.isVisible()) {
      // Click to collapse
      await toggleBtn.click();
      await expect(window.locator('#medical-history-fields')).toBeHidden();

      // Click to expand
      await toggleBtn.click();
      await expect(window.locator('#medical-history-fields')).toBeVisible();
    }
  });
});

// ====================
// SpO2 Vital Sign Tests (Encounter Form)
// ====================
test.describe('SpO2 Vital Sign', () => {
  test('should display SpO2 field in encounter form', async () => {
    // Navigate to encounter tab
    await window.locator('.tab[data-tab="encounter"]').click();

    // Search and select a patient first
    await window.locator('#patient-search').fill('John');
    await window.locator('#patient-search-btn').click();
    await window.waitForTimeout(1000);

    // Select first patient
    const firstResult = window.locator('.patient-search-item').first();
    if (await firstResult.isVisible()) {
      await firstResult.click();
    }

    // Check SpO2 field exists
    await expect(window.locator('#spo2')).toBeVisible();
    await expect(window.locator('label[for="spo2"]')).toContainText('SpO2');
  });

  test('SpO2 should have percentage unit indicator', async () => {
    // Check for % indicator
    const label = await window.locator('label[for="spo2"]').textContent();
    expect(label).toMatch(/%/);
  });

  test('SpO2 should have valid range (0-100)', async () => {
    const minAttr = await window.locator('#spo2').getAttribute('min');
    const maxAttr = await window.locator('#spo2').getAttribute('max');

    expect(parseInt(minAttr)).toBe(0);
    expect(parseInt(maxAttr)).toBe(100);
  });

  test('should accept valid SpO2 value', async () => {
    await window.locator('#spo2').fill('98');

    const value = await window.locator('#spo2').inputValue();
    expect(value).toBe('98');
  });
});

// ====================
// Full Registration Flow with New Fields
// ====================
test.describe('Complete Patient Registration with New Fields', () => {
  test('should register patient with location and referral info', async () => {
    await window.locator('.tab[data-tab="register"]').click();

    // Clear form first
    await window.locator('#clear-btn').click();

    // Basic info
    await window.locator('#first-name').fill('Alice');
    await window.locator('#last-name').fill('Wanjiku');
    await window.locator('#date-of-birth').fill('1988-05-15');
    await window.locator('#gender').selectOption('F');
    await window.locator('#phone-number').fill('+254722123456');

    // Location - wait for dropdowns to load
    await window.locator('#county').selectOption({ label: 'Mombasa' });
    await window.waitForTimeout(500);
    await window.locator('#sub-county').selectOption({ label: 'Changamwe' });
    await window.waitForTimeout(500);

    // Ward is optional, but let's select one
    const wardOptions = await window.locator('#ward option').count();
    if (wardOptions > 1) {
      await window.locator('#ward').selectOption({ index: 1 });
    }

    await window.locator('#village').fill('Mikindani');

    // Referral source
    await window.locator('#referral-source').selectOption('clinic');

    // Submit
    await window.locator('#submit-btn').click();

    // Wait for success
    await window.waitForSelector('.message.success', { timeout: 10000 });

    const message = await window.locator('.message.success').textContent();
    expect(message).toContain('Patient registered successfully');
  });

  test('should show error when county is missing', async () => {
    await window.locator('#clear-btn').click();

    // Fill only required basic fields, skip county
    await window.locator('#first-name').fill('Test');
    await window.locator('#last-name').fill('Patient');
    await window.locator('#date-of-birth').fill('1990-01-01');
    await window.locator('#gender').selectOption('M');

    // Don't select county or sub-county

    // Try to submit
    await window.locator('#submit-btn').click();

    // Should show validation error
    await window.waitForTimeout(1000);

    // Check for error message or validation state
    const countyInvalid = await window.locator('#county:invalid').count();
    expect(countyInvalid).toBeGreaterThan(0);
  });
});
