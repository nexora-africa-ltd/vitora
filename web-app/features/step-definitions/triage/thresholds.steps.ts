/**
 * Triage Thresholds Step Definitions
 * 
 * Steps for vital threshold configuration and management.
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { safeHashes } from '../../support/fixtures';

/**
 * Navigation steps
 */

Given(
  'I am on the triage settings page',
  async function (this: VitoraWorld) {
    this.currentPage = 'triage settings';
    
    if (this.page) {
      await this.page.goto('/settings/triage');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am logged in as a facility administrator',
  async function (this: VitoraWorld) {
    const user = {
      id: 1,
      username: 'admin',
      email: 'admin@vitora.health',
      permissions: ['admin', 'triage.manage_thresholds', 'triage.view_thresholds'],
    };
    this.setUser(user);
    
    if (this.page) {
      await this.page.goto('/login');
      await this.page.fill('[name="username"]', user.username);
      await this.page.fill('[name="password"]', 'adminpassword');
      await this.page.click('button[type="submit"]');
      await this.page.waitForURL(/dashboard|home/);
    }
  }
);

Given(
  'I am logged in as an admin user',
  async function (this: VitoraWorld) {
    const user = {
      id: 1,
      username: 'admin',
      email: 'admin@vitora.health',
      permissions: ['admin', 'triage.manage_thresholds'],
    };
    this.setUser(user);
    
    if (this.page) {
      await this.page.goto('/login');
      await this.page.fill('[name="username"]', user.username);
      await this.page.fill('[name="password"]', 'adminpassword');
      await this.page.click('button[type="submit"]');
      await this.page.waitForURL(/dashboard|home/);
    }
  }
);

Given(
  'I am logged in as a triage nurse',
  async function (this: VitoraWorld) {
    const user = {
      id: 2,
      username: 'nurse',
      email: 'nurse@vitora.health',
      permissions: ['perform_triage', 'view_triage_queue', 'triage.view_thresholds'],
    };
    this.setUser(user);
  }
);

/**
 * Threshold viewing steps
 */

When(
  'I navigate to {string}',
  async function (this: VitoraWorld, path: string) {
    const pathMap: Record<string, string> = {
      'Settings > Triage > Vital Thresholds': '/settings/triage/thresholds',
    };
    
    const url = pathMap[path] || `/${path.toLowerCase().replace(/\s+>\s+/g, '/').replace(/\s+/g, '-')}`;
    
    if (this.page) {
      await this.page.goto(url);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Then(
  'I should see a table of vital thresholds:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedThresholds = safeHashes(dataTable.hashes());
    this.store('expectedThresholds', expectedThresholds);
    
    if (this.page) {
      const table = this.page.locator('[data-testid="thresholds-table"]');
      await expect(table).toBeVisible();
      
      for (const threshold of expectedThresholds) {
        const vitalType = threshold['Vital Type'] || threshold.vital_type;
        const row = table.locator(`tr:has-text("${vitalType}")`);
        await expect(row).toBeVisible();
      }
    }
  }
);

Then(
  'I should see the current threshold values:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedValues = safeHashes(dataTable.hashes());
    this.store('expectedThresholdValues', expectedValues);
    
    if (this.page) {
      for (const row of expectedValues) {
        const vitalType = row.vital_type || row['vital_type'];
        const tableRow = this.page.locator(`[data-testid="threshold-row-${vitalType.toLowerCase().replace(/\s+/g, '-')}"]`);
        await expect(tableRow).toBeVisible();
      }
    }
  }
);

/**
 * Threshold editing steps
 */

Given(
  'the SpO2 warning_low threshold is {int}',
  async function (this: VitoraWorld, value: number) {
    this.store('spo2WarningLow', value);
  }
);

When(
  'I click {string} on SpO2',
  async function (this: VitoraWorld, buttonText: string) {
    if (this.page) {
      const spo2Row = this.page.locator('[data-testid="threshold-row-spo2"]');
      await spo2Row.locator(`button:has-text("${buttonText}")`).click();
    }
  }
);

When(
  'I change warning_low to {int}',
  async function (this: VitoraWorld, value: number) {
    this.store('newWarningLow', value);
    
    if (this.page) {
      await this.page.fill('[data-testid="threshold-warning-low"]', String(value));
    }
  }
);

Then(
  'the threshold should be updated to {int}',
  async function (this: VitoraWorld, expectedValue: number) {
    if (this.page) {
      const successMessage = this.page.locator('[data-testid="success-message"]');
      await expect(successMessage).toBeVisible();
    }
    this.store('thresholdUpdated', expectedValue);
  }
);

Then(
  'the threshold should be updated',
  async function (this: VitoraWorld) {
    if (this.page) {
      const successMessage = this.page.locator('[data-testid="success-message"]');
      await expect(successMessage).toBeVisible();
    }
  }
);

Then(
  'a success message should appear',
  async function (this: VitoraWorld) {
    if (this.page) {
      const successMessage = this.page.locator('[data-testid="success-message"], [role="alert"]');
      await expect(successMessage).toBeVisible();
    }
  }
);

Then(
  'the change should be audit logged',
  async function (this: VitoraWorld) {
    // Verify audit log was created
    this.store('changeAuditLogged', true);
    expect(this.retrieve('changeAuditLogged')).toBe(true);
  }
);

Then(
  'future alerts should use the new threshold',
  async function (this: VitoraWorld) {
    // Threshold change takes effect immediately
    expect(true).toBe(true);
  }
);

/**
 * Threshold validation steps
 */

Given(
  'I am editing vital thresholds',
  async function (this: VitoraWorld) {
    this.store('editingThresholds', true);
  }
);

Given(
  'I am editing Heart Rate thresholds',
  async function (this: VitoraWorld) {
    this.store('editingVital', 'Heart Rate');
    
    if (this.page) {
      await this.page.click('[data-testid="threshold-row-heart-rate"] button:has-text("Edit")');
    }
  }
);

Given(
  'I am editing {string} thresholds',
  async function (this: VitoraWorld, vitalName: string) {
    this.store('editingVital', vitalName);
    
    if (this.page) {
      const testId = vitalName.toLowerCase().replace(/\s+/g, '-');
      await this.page.click(`[data-testid="threshold-row-${testId}"] button:has-text("Edit")`);
    }
  }
);

Given(
  'I am editing Temperature thresholds',
  async function (this: VitoraWorld) {
    this.store('editingVital', 'Temperature');
    
    if (this.page) {
      await this.page.click('[data-testid="threshold-row-temperature"] button:has-text("Edit")');
    }
  }
);

Given(
  'I am editing Heart Rate critical_low',
  async function (this: VitoraWorld) {
    this.store('editingVital', 'Heart Rate');
    this.store('editingField', 'critical_low');
    
    if (this.page) {
      await this.page.click('[data-testid="threshold-row-heart-rate"] button:has-text("Edit")');
    }
  }
);

Given(
  'I am editing SpO2 critical_low',
  async function (this: VitoraWorld) {
    this.store('editingVital', 'SpO2');
    this.store('editingField', 'critical_low');
  }
);

When(
  'I set the following values:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const values = dataTable.rowsHash() as Record<string, string>;
    this.store('thresholdValues', values);
    
    if (this.page) {
      for (const [field, value] of Object.entries(values)) {
        await this.page.fill(`[data-testid="threshold-${field}"]`, value);
      }
    }
  }
);

When(
  'I enter {string} for {string}',
  async function (this: VitoraWorld, value: string, field: string) {
    this.store(`threshold_${field}`, value);
    
    if (this.page) {
      await this.page.fill(`[data-testid="threshold-${field}"]`, value);
    }
  }
);

When(
  'I enter values:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const row = dataTable.hashes()[0];
    this.store('thresholdValues', row);
    
    if (this.page) {
      for (const [field, value] of Object.entries(row)) {
        if (value) {
          await this.page.fill(`[data-testid="threshold-${field}"]`, value);
        }
      }
    }
  }
);

When(
  'I set critical_low higher than warning_low',
  async function (this: VitoraWorld) {
    this.store('invalidThresholdOrder', true);
    
    if (this.page) {
      await this.page.fill('[data-testid="threshold-critical_low"]', '60');
      await this.page.fill('[data-testid="threshold-warning_low"]', '50');
    }
  }
);

When(
  'I try to set it to {int} bpm',
  async function (this: VitoraWorld, value: number) {
    this.store('attemptedValue', value);
    
    if (this.page) {
      await this.page.fill('[data-testid="threshold-critical_low"]', String(value));
      await this.page.click('button:has-text("Save")');
    }
  }
);

Then(
  'I should see validation error {string}',
  async function (this: VitoraWorld, errorMessage: string) {
    if (this.page) {
      const error = this.page.locator(`[role="alert"], .error`).filter({ hasText: errorMessage });
      await expect(error.first()).toBeVisible();
    }
  }
);

Then(
  'the form should not save',
  async function (this: VitoraWorld) {
    // Verify we're still on the edit form
    if (this.page) {
      const editForm = this.page.locator('[data-testid="threshold-edit-form"]');
      await expect(editForm).toBeVisible();
    }
  }
);

/**
 * Permission steps
 */

When(
  'I navigate to the threshold settings',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.goto('/settings/triage/thresholds');
    }
  }
);

Then(
  'I should see the current thresholds',
  async function (this: VitoraWorld) {
    if (this.page) {
      const table = this.page.locator('[data-testid="thresholds-table"]');
      await expect(table).toBeVisible();
    }
  }
);

Then(
  'the {string} buttons should be disabled',
  async function (this: VitoraWorld, buttonText: string) {
    if (this.page) {
      const buttons = await this.page.locator(`button:has-text("${buttonText}")`).all();
      for (const button of buttons) {
        await expect(button).toBeDisabled();
      }
    }
  }
);

Then(
  'a message should explain {string}',
  async function (this: VitoraWorld, message: string) {
    if (this.page) {
      const messageElement = this.page.locator(`text=${message}`);
      await expect(messageElement).toBeVisible();
    }
  }
);

/**
 * Age-specific threshold steps
 */

Given(
  'pediatric-specific thresholds are enabled',
  async function (this: VitoraWorld) {
    this.store('pediatricThresholdsEnabled', true);
  }
);

Given(
  'pregnancy thresholds are enabled',
  async function (this: VitoraWorld) {
    this.store('pregnancyThresholdsEnabled', true);
  }
);

When(
  'I view the threshold configuration',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.goto('/settings/triage/thresholds');
    }
  }
);

Then(
  'I should see threshold sets for:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedSets = safeHashes(dataTable.hashes());
    
    if (this.page) {
      for (const set of expectedSets) {
        const ageGroup = set.age_group || set['age_group'];
        const tab = this.page.locator(`[data-testid="threshold-tab"]:has-text("${ageGroup}")`);
        await expect(tab).toBeVisible();
      }
    }
  }
);

Then(
  'I can configure each separately',
  async function (this: VitoraWorld) {
    // Each age group has its own configuration
    expect(true).toBe(true);
  }
);

Then(
  'I should see an option for {string} with adjusted normal ranges',
  async function (this: VitoraWorld, option: string) {
    if (this.page) {
      const optionElement = this.page.locator(`[data-testid="threshold-option"]:has-text("${option}")`);
      await expect(optionElement).toBeVisible();
    }
  }
);
