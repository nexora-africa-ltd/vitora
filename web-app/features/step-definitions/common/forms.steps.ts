/**
 * Common Step Definitions - Forms
 * 
 * Shared steps for form interactions.
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

/**
 * Form Interaction When Steps
 */

When(
  'I fill in the registration form:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.rowsHash();
    
    for (const [field, value] of Object.entries(data)) {
      await fillField(this, field, value);
    }
    
    // Store form data for later assertions
    this.store('formData', data);
  }
);

When(
  'I fill in {string} with {string}',
  async function (this: VitoraWorld, field: string, value: string) {
    await fillField(this, field, value);
  }
);

When(
  'I search for {string}',
  async function (this: VitoraWorld, searchTerm: string) {
    if (!this.page) {
      this.store('searchTerm', searchTerm);
      return;
    }

    const candidates = [
      '[data-testid="patient-search"]',
      '[data-testid="drug-search"]',
      '[data-testid="search"]',
      'input[type="search"]',
      'input[placeholder*="search" i]',
    ];

    const input = this.page.locator(candidates.join(', ')).first();
    await input.fill(searchTerm);

    // Some UIs search on Enter, others search on debounce.
    await input.press('Enter').catch(() => undefined);
    await this.page.waitForTimeout(300);

    this.store('searchTerm', searchTerm);
  }
);

When(
  'I enter {word} as {string}',
  async function (this: VitoraWorld, field: string, value: string) {
    await fillField(this, field, value);
  }
);

When(
  'I enter vitals:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const vitals = dataTable.rowsHash();
    
    for (const [vital, value] of Object.entries(vitals)) {
      await fillField(this, vital, value);
    }
    
    this.store('vitals', vitals);
    
    // Update encounter context
    if (this.encounter) {
      this.encounter.vitals = vitals as Record<string, number | string>;
    }
  }
);

When(
  'I select {string} from {string}',
  async function (this: VitoraWorld, option: string, dropdown: string) {
    if (this.page) {
      const selector = getFieldSelector(dropdown);
      await this.page.click(selector);
      await this.page.click(`[role="option"]:has-text("${option}")`);
    }
  }
);

When(
  'I select {word} {string}',
  async function (this: VitoraWorld, fieldType: string, value: string) {
    if (this.page) {
      const selector = getFieldSelector(fieldType);
      await this.page.click(selector);
      await this.page.click(`[role="option"]:has-text("${value}")`);
    }
  }
);

When(
  'I check {string}',
  async function (this: VitoraWorld, checkbox: string) {
    if (this.page) {
      const selector = getFieldSelector(checkbox);
      await this.page.check(selector);
    }
  }
);

When(
  'I uncheck {string}',
  async function (this: VitoraWorld, checkbox: string) {
    if (this.page) {
      const selector = getFieldSelector(checkbox);
      await this.page.uncheck(selector);
    }
  }
);

When(
  'I click {string}',
  async function (this: VitoraWorld, buttonText: string) {
    if (this.page) {
      await this.page.click(`button:has-text("${buttonText}"), [role="button"]:has-text("${buttonText}")`);
    }
  }
);

When(
  'I submit the form',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.click('button[type="submit"]');
    }
  }
);

When(
  'I try to submit the form',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.click('button[type="submit"]');
    }
  }
);

When(
  'I try to submit with missing required fields',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.click('button[type="submit"]');
    }
  }
);

When(
  'I clear the form',
  async function (this: VitoraWorld) {
    if (this.page) {
      const resetButton = this.page.locator('button[type="reset"], button:has-text("Clear")');
      if (await resetButton.isVisible()) {
        await resetButton.click();
      }
    }
  }
);

When(
  'I leave {string} empty',
  async function (this: VitoraWorld, field: string) {
    if (this.page) {
      const selector = getFieldSelector(field);
      await this.page.fill(selector, '');
    }
  }
);

When(
  'I add an emergency contact:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.rowsHash();
    
    if (this.page) {
      // Click add button if not already in add mode
      const addButton = this.page.locator('button:has-text("Add Emergency Contact")');
      if (await addButton.isVisible()) {
        await addButton.click();
      }
      
      for (const [field, value] of Object.entries(data)) {
        await fillField(this, `emergency-${field.toLowerCase()}`, value);
      }
    }
    
    this.store('emergencyContact', data);
  }
);

/**
 * Form Validation Then Steps
 */

Then(
  'I should see an error {string}',
  async function (this: VitoraWorld, errorMessage: string) {
    if (this.page) {
      const error = this.page.locator(`[role="alert"], .error, .text-destructive`).filter({ hasText: errorMessage });
      await expect(error.first()).toBeVisible();
    }
    this.addError(errorMessage);
  }
);

When(
  'I select referral source {string}',
  async function (this: VitoraWorld, source: string) {
    this.store('referralSource', source);

    if (this.page) {
      await this.page.selectOption(
        '[data-testid="referral-source"], select[name="referral_source"]',
        { label: source }
      );
    }
  }
);

Then(
  'I should see a warning {string}',
  async function (this: VitoraWorld, warningMessage: string) {
    if (this.page) {
      const warning = this.page.locator(`[role="alert"], .warning`).filter({ hasText: warningMessage });
      await expect(warning.first()).toBeVisible();
    }
  }
);

Then(
  'I should see a warning:',
  async function (this: VitoraWorld, docString: string) {
    this.store('lastWarning', docString);

    if (this.page) {
      // Try common containers first; fall back to plain text match.
      const warning = this.page.locator('[role="alert"], .warning, [data-testid="warning"]');
      await expect(warning.filter({ hasText: docString.trim().slice(0, 40) }).first()).toBeVisible();
    }
  }
);

Then(
  'I should see a success message {string}',
  async function (this: VitoraWorld, successMessage: string) {
    if (this.page) {
      const success = this.page.locator(`[role="status"], .success, .toast`).filter({ hasText: successMessage });
      await expect(success.first()).toBeVisible();
    }
  }
);

Then(
  'I must confirm to proceed',
  async function (this: VitoraWorld) {
    this.store('requiresConfirmation', true);

    if (this.page) {
      const confirm = this.page.locator(
        '[data-testid="confirm"], [data-testid="confirm-proceed"], button:has-text("Confirm"), button:has-text("Proceed")'
      );
      await expect(confirm.first()).toBeVisible();
    }
  }
);

Then(
  'I should see validation errors for:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const fields = dataTable.raw().flat();
    
    if (this.page) {
      for (const field of fields) {
        const errorSelector = `[data-field="${field.toLowerCase().replace(/\s+/g, '-')}"] .error, ` +
                             `label:has-text("${field}") ~ .error`;
        const error = this.page.locator(errorSelector);
        await expect(error.first()).toBeVisible();
      }
    }
  }
);

Then(
  'the validation should pass',
  async function (this: VitoraWorld) {
    if (this.page) {
      const errors = this.page.locator('.error, [role="alert"]');
      await expect(errors).toHaveCount(0);
    }
  }
);

Then(
  'the validation result should be {string}',
  async function (this: VitoraWorld, result: string) {
    if (this.page) {
      if (result === 'valid') {
        const errors = this.page.locator('.error, [role="alert"]');
        await expect(errors).toHaveCount(0);
      } else {
        const errors = this.page.locator('.error, [role="alert"]');
        await expect(errors.first()).toBeVisible();
      }
    }
  }
);

Then(
  'the form should be reset',
  async function (this: VitoraWorld) {
    if (this.page) {
      const inputs = await this.page.locator('input:not([type="hidden"]), textarea').all();
      for (const input of inputs) {
        const value = await input.inputValue();
        expect(value).toBe('');
      }
    }
  }
);

Then(
  'the {string} field should contain {string}',
  async function (this: VitoraWorld, field: string, expectedValue: string) {
    if (this.page) {
      const selector = getFieldSelector(field);
      const value = await this.page.inputValue(selector);
      expect(value).toContain(expectedValue);
    }
  }
);

Then(
  'the {string} field should be disabled',
  async function (this: VitoraWorld, field: string) {
    if (this.page) {
      const selector = getFieldSelector(field);
      await expect(this.page.locator(selector)).toBeDisabled();
    }
  }
);

Then(
  'the {string} field should be enabled',
  async function (this: VitoraWorld, field: string) {
    if (this.page) {
      const selector = getFieldSelector(field);
      await expect(this.page.locator(selector)).toBeEnabled();
    }
  }
);

/**
 * Helper function to fill a form field
 */
async function fillField(world: VitoraWorld, field: string, value: string): Promise<void> {
  if (!world.page) return;
  
  const selector = getFieldSelector(field);
  const element = world.page.locator(selector).first();
  
  // Check if it's a select/dropdown
  const tagName = await element.evaluate(el => el.tagName.toLowerCase());
  
  if (tagName === 'select' || await element.getAttribute('role') === 'combobox') {
    await element.click();
    await world.page.click(`[role="option"]:has-text("${value}")`);
  } else if (await element.getAttribute('type') === 'checkbox') {
    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'yes') {
      await element.check();
    } else {
      await element.uncheck();
    }
  } else {
    await element.fill(value);
  }
}

/**
 * Helper function to get field selector
 */
function getFieldSelector(field: string): string {
  const normalizedHyphen = field.toLowerCase().trim().replace(/\s+/g, '-');
  const normalizedUnderscore = normalizedHyphen.replace(/-/g, '_');

  return `[name="${normalizedHyphen}"], ` +
         `[name="${normalizedUnderscore}"], ` +
         `[data-testid="${normalizedHyphen}"], ` +
         `[data-testid="${normalizedUnderscore}"], ` +
         `#${normalizedHyphen}, ` +
         `#${normalizedUnderscore}, ` +
         `[aria-label="${field}" i], ` +
         `[aria-label="${normalizedHyphen}" i], ` +
         `[aria-label="${normalizedUnderscore}" i], ` +
         `label:has-text("${field}") + input, ` +
         `label:has-text("${field}") + select, ` +
         `label:has-text("${field}") ~ input`;
}
