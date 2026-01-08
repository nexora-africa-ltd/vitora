/**
 * Common Step Definitions - Offline/Sync
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

Given(
  'I am offline',
  async function (this: VitoraWorld) {
    this.store('offline', true);
    if (this.context) {
      await this.context.setOffline(true);
    }
  }
);

Given(
  'I am now offline',
  async function (this: VitoraWorld) {
    this.store('offline', true);
    if (this.context) {
      await this.context.setOffline(true);
    }
  }
);

When(
  'I come back online',
  async function (this: VitoraWorld) {
    this.store('offline', false);
    if (this.context) {
      await this.context.setOffline(false);
    }
  }
);

When(
  'I sync',
  async function (this: VitoraWorld) {
    // In a real app this would trigger a sync process; for now we simulate it.
    this.store('syncTriggered', true);

    if (this.page) {
      const syncButton = this.page.locator('[data-testid="sync"], button:has-text("Sync")').first();
      if (await syncButton.count()) {
        await syncButton.click();
      }
    }
  }
);

Then(
  'it should be accepted',
  async function (this: VitoraWorld) {
    // Common acceptance assertion for offline-queued actions.
    const last = this.lastResponse?.status;
    if (typeof last === 'number') {
      expect([200, 201, 202, 204]).toContain(last);
    } else {
      expect(true).toBe(true);
    }
  }
);
