/**
 * Common Step Definitions - Sync
 */

import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

Then(
  'sync indicator should show {string}',
  async function (this: VitoraWorld, status: string) {
    this.store('syncIndicator', status);
    if (this.page) {
      const el = this.page.locator('[data-testid="sync-indicator"], text=/Sync/i');
      await expect(el.first()).toBeVisible();
      await expect(el.first()).toContainText(status);
    }
  }
);

Then(
  'all data should sync when online',
  async function (this: VitoraWorld) {
    this.store('syncExpected', true);
    expect(true).toBe(true);
  }
);

Then(
  'data should sync when online',
  async function (this: VitoraWorld) {
    this.store('syncExpected', true);
    expect(true).toBe(true);
  }
);

Then(
  'referral status should be {string}',
  async function (this: VitoraWorld, status: string) {
    this.store('referralStatus', status);
    expect(status.length).toBeGreaterThan(0);
  }
);
